// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/serving.service.ts — «Роздача»: waiters mark what of a kitchen
// round they carried to the guest (migration 115, TechDocs/POS_PASS.md).
//
// A round goes to the kitchen whole and comes out in parts: the borscht now,
// the varenyky in ten minutes, carried by whoever is free. Each tap «Несу» is
// one row in `pos_bill_item_serves`; how much of a line is carried is the sum
// of its live rows (`servedQuantitySql`), never a number kept beside them.
//
// Rules that are easy to get backwards:
//
// 1. **A waiter may carry from a round the kitchen has not called «Готово».**
//    Dishes leave the pass one by one long before the whole round is ready —
//    that is the point of the screen. When the LAST unit of a round goes, the
//    round becomes `served` by itself, and its `ready_at` stays as it was:
//    undoing that last tap must know whether the kitchen ever said «Готово».
// 2. **The kitchen's «Видано» on a partly carried round carries the rest**, as
//    rows of its own (`source` `kitchen`), so «Винесено» lists every plate and
//    the sum stays the one truth. Its «Видано» from `new` is still refused, in
//    the kitchen's own words.
// 3. **Every writer locks bill → round → lines, by id.** That is the order
//    `fireRoundTx`, `cancelRound` and the bill's own writes take, so two
//    waiters, the kitchen and a cancel can never wait on each other in a ring;
//    the round lock is what makes «two waiters, one last borscht» answer one
//    of them 200 and the other a 409 naming who took it.
// 4. **A paid bill still takes a tap.** Paying races carrying all evening (the
//    guest pays while the dessert is on its way); refusing the tap there would
//    only make the waiter's screen lie. A cancelled bill or round refuses.
// 5. **«Повернути» is for a mistake, not for a return:** ten minutes, the
//    waiter's own tap (or the owner), never the kitchen's rows and never once
//    the kitchen handed over the rest of that round.

import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { authorName } from './guest-author.js';
import { STATIONS_SQL, explainPrepRefusal, prepRowOf } from './kitchen.service.js';
import type { PrepStatusRow } from './kitchen.service.js';
import { parseLineModifierSnapshot } from './modifiers.service.js';
import { servedQuantitySql } from './served.js';
import type { TagStation } from './tags.service.js';

export { servedQuantitySql };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A tray, not a banquet: more lines than this in one tap is a broken client. */
const MAX_ITEMS = 50;
/** How long a waiter's own tap can be taken back. */
export const UNDO_MINUTES = 10;

export class ServingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServingError';
  }
}

export class ServingNotFound extends ServingError {
  constructor(message: string) {
    super(message);
    this.name = 'ServingNotFound';
  }
}

/** The state of the bill disagrees with the tap; `code` and `detail` say how. */
export class ServingConflict extends ServingError {
  constructor(
    message: string,
    readonly code: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ServingConflict';
  }
}

export interface ServingLine {
  id: number;
  product_name: string;
  /** «M · вівсяне» — the caption the round locked. */
  caption: string;
  note: string;
  modifiers: Array<{ group_name: string; name: string }>;
  quantity: number;
  served_quantity: number;
  stations: TagStation[];
}

export interface ServingRound {
  id: number;
  seq: number;
  fired_at: string;
  fired_by_name: string;
  prep_status: 'new' | 'ready';
  ready_at: string | null;
  items: ServingLine[];
}

export interface ServingTable {
  table_id: number;
  table_name: string;
  hall_name: string;
  bill_id: number;
  bill_no: number;
  opened_by_name: string;
  /** Plates still on their way to this table, over every live round. */
  to_serve: number;
  rounds: ServingRound[];
}

export interface ServingHistoryRow {
  id: number;
  client_uuid: string | null;
  bill_item_id: number;
  round_id: number;
  round_seq: number;
  product_name: string;
  caption: string;
  quantity: number;
  source: 'waiter' | 'kitchen';
  served_by: number | null;
  served_by_name: string;
  served_at: string;
  undone_at: string | null;
  /** The asker may take it back right now. */
  undoable: boolean;
  /** Until when it may be taken back at all; null for the kitchen's rows. */
  undo_until: string | null;
}

export interface ServeAnswer {
  /** The request had already been carried out — the same rows come back. */
  replay: boolean;
  events: Array<{ id: number; bill_item_id: number; quantity: number; served_at: string }>;
  lines: Array<{ bill_item_id: number; quantity: number; served_quantity: number }>;
  rounds: Array<{ id: number; prep_status: 'new' | 'ready' | 'served'; served_at: string | null }>;
}

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

function isoOrNull(value: unknown): string | null {
  return value ? iso(value) : null;
}

function stationsOf(value: unknown): TagStation[] {
  return Array.isArray(value)
    ? (value as unknown[]).filter((x): x is TagStation => x === 'kitchen' || x === 'bar')
    : [];
}

// ── reading ────────────────────────────────────────────────────────────────

/**
 * The live rounds (not cancelled, not yet served) of the given bills, with
 * every line and how much of it is carried. Lines already carried whole stay
 * in the answer — the screen decides what to draw.
 */
async function liveRounds(storeId: number, billIds: number[]): Promise<Map<number, ServingRound[]>> {
  const byBill = new Map<number, ServingRound[]>();
  if (billIds.length === 0) return byBill;
  const heads = await pool.query(
    `SELECT r.id, r.bill_id, r.seq, r.fired_at, r.ready_at, r.prep_status,
            st.display_name AS fired_by_name, r.fired_by_guest
       FROM pos_bill_rounds r
       LEFT JOIN pos_staff st ON st.id = r.fired_by
      WHERE r.store_id = $1 AND r.bill_id = ANY($2::bigint[])
        AND r.cancelled_at IS NULL AND r.prep_status IN ('new', 'ready')
      ORDER BY r.fired_at ASC, r.id ASC`,
    [storeId, billIds]
  );
  if (heads.rows.length === 0) return byBill;
  const roundIds = heads.rows.map((row) => Number(row.id));
  const items = await pool.query(
    `SELECT i.id, i.round_id, i.product_name, i.variant_label, i.quantity, i.note, i.modifiers,
            ${servedQuantitySql('i', 'r')} AS served_quantity,
            ${STATIONS_SQL} AS stations
       FROM pos_bill_items i
       JOIN pos_bill_rounds r ON r.id = i.round_id
      WHERE i.round_id = ANY($1::bigint[])
      ORDER BY i.round_id, i.sort_order, i.id`,
    [roundIds]
  );
  const linesByRound = new Map<number, ServingLine[]>();
  for (const row of items.rows) {
    const roundId = Number(row.round_id);
    const list = linesByRound.get(roundId) ?? [];
    list.push({
      id: Number(row.id),
      product_name: String(row.product_name ?? ''),
      caption: String(row.variant_label ?? ''),
      note: typeof row.note === 'string' ? row.note : '',
      modifiers: parseLineModifierSnapshot(row.modifiers).map((m) => ({ group_name: m.group_name, name: m.name })),
      quantity: Number(row.quantity),
      served_quantity: Number(row.served_quantity),
      stations: stationsOf(row.stations),
    });
    linesByRound.set(roundId, list);
  }
  for (const row of heads.rows) {
    const billId = Number(row.bill_id);
    const list = byBill.get(billId) ?? [];
    list.push({
      id: Number(row.id),
      seq: Number(row.seq),
      fired_at: iso(row.fired_at),
      fired_by_name: authorName(row.fired_by_name, row.fired_by_guest),
      prep_status: row.prep_status === 'ready' ? 'ready' : 'new',
      ready_at: isoOrNull(row.ready_at),
      items: linesByRound.get(Number(row.id)) ?? [],
    });
    byBill.set(billId, list);
  }
  return byBill;
}

function toServe(rounds: ServingRound[]): number {
  return rounds.reduce(
    (sum, round) => sum + round.items.reduce((s, line) => s + Math.max(0, line.quantity - line.served_quantity), 0),
    0
  );
}

/**
 * Every open bill of the store — the waiter's row of tables — with what of
 * its rounds is still to be carried. A table with nothing to carry is listed
 * too (`rounds: []`): its «Винесено» is still worth opening.
 */
export async function listServingFeed(storeId: number): Promise<{ now: string; tables: ServingTable[] }> {
  const bills = await pool.query(
    `SELECT b.id, b.bill_no, b.table_id, t.name AS table_name, h.name AS hall_name,
            s.display_name AS opened_by_name, b.opened_by_guest
       FROM pos_bills b
       JOIN pos_tables t ON t.id = b.table_id
       JOIN pos_halls h ON h.id = t.hall_id
       LEFT JOIN pos_staff s ON s.id = b.opened_by
      WHERE b.store_id = $1 AND b.status = 'open'
      ORDER BY b.opened_at ASC, b.id ASC`,
    [storeId]
  );
  const rounds = await liveRounds(
    storeId,
    bills.rows.map((row) => Number(row.id))
  );
  return {
    now: new Date().toISOString(),
    tables: bills.rows.map((row) => {
      const live = rounds.get(Number(row.id)) ?? [];
      return {
        table_id: Number(row.table_id),
        table_name: String(row.table_name),
        hall_name: String(row.hall_name ?? ''),
        bill_id: Number(row.id),
        bill_no: Number(row.bill_no),
        opened_by_name: authorName(row.opened_by_name, row.opened_by_guest),
        to_serve: toServe(live),
        rounds: live,
      };
    }),
  };
}

/**
 * One bill for the waiter: its live rounds and «Винесено» — every carried
 * plate, newest first, with who carried it and whether the asker may still
 * take it back.
 */
export async function getServingBill(params: {
  storeId: number;
  staffId: number;
  role: string;
  billId: number;
}): Promise<{ now: string; bill_id: number; status: string; rounds: ServingRound[]; history: ServingHistoryRow[] }> {
  const bill = await pool.query(`SELECT id, status FROM pos_bills WHERE store_id = $1 AND id = $2`, [
    params.storeId,
    params.billId,
  ]);
  if (bill.rows.length === 0) throw new ServingNotFound('Рахунок не знайдено');
  const status = String(bill.rows[0].status);
  const rounds = status === 'open' ? (await liveRounds(params.storeId, [params.billId])).get(params.billId) ?? [] : [];

  const rows = await pool.query(
    `SELECT e.id, e.client_uuid, e.bill_item_id, e.round_id, r.seq AS round_seq,
            i.product_name, i.variant_label, e.quantity, e.source, e.served_by,
            s.display_name AS served_by_name, e.served_at, e.undone_at,
            e.served_at + make_interval(mins => $3::int) AS undo_until,
            (e.served_at + make_interval(mins => $3::int) > NOW()) AS in_time,
            EXISTS (SELECT 1 FROM pos_bill_item_serves k
                     WHERE k.round_id = e.round_id AND k.source = 'kitchen' AND k.undone_at IS NULL) AS kitchen_done
       FROM pos_bill_item_serves e
       JOIN pos_bill_items i ON i.id = e.bill_item_id
       JOIN pos_bill_rounds r ON r.id = e.round_id
       LEFT JOIN pos_staff s ON s.id = e.served_by
      WHERE e.store_id = $1 AND e.bill_id = $2
      ORDER BY e.served_at DESC, e.id DESC
      LIMIT 100`,
    [params.storeId, params.billId, UNDO_MINUTES]
  );
  const history: ServingHistoryRow[] = rows.rows.map((row) => {
    const source = row.source === 'kitchen' ? 'kitchen' : 'waiter';
    const servedBy = row.served_by == null ? null : Number(row.served_by);
    const undoable =
      source === 'waiter' &&
      row.undone_at == null &&
      row.in_time === true &&
      row.kitchen_done !== true &&
      status !== 'cancelled' &&
      (servedBy === params.staffId || params.role === 'owner');
    return {
      id: Number(row.id),
      client_uuid: row.client_uuid == null ? null : String(row.client_uuid),
      bill_item_id: Number(row.bill_item_id),
      round_id: Number(row.round_id),
      round_seq: Number(row.round_seq),
      product_name: String(row.product_name ?? ''),
      caption: String(row.variant_label ?? ''),
      quantity: Number(row.quantity),
      source,
      served_by: servedBy,
      served_by_name: source === 'kitchen' ? `Кухня${row.served_by_name ? ` · ${String(row.served_by_name)}` : ''}` : String(row.served_by_name ?? ''),
      served_at: iso(row.served_at),
      undone_at: isoOrNull(row.undone_at),
      undoable,
      undo_until: source === 'waiter' ? iso(row.undo_until) : null,
    };
  });
  return { now: new Date().toISOString(), bill_id: params.billId, status, rounds, history };
}

// ── writing ────────────────────────────────────────────────────────────────

/** The current carried sums of `lineIds`, read inside the caller's transaction. */
async function linesState(
  client: PoolClient,
  lineIds: number[]
): Promise<ServeAnswer['lines']> {
  if (lineIds.length === 0) return [];
  const rows = await client.query(
    `SELECT i.id, i.quantity, ${servedQuantitySql('i', 'r')} AS served_quantity
       FROM pos_bill_items i
       JOIN pos_bill_rounds r ON r.id = i.round_id
      WHERE i.id = ANY($1::bigint[])
      ORDER BY i.id`,
    [lineIds]
  );
  return rows.rows.map((row) => ({
    bill_item_id: Number(row.id),
    quantity: Number(row.quantity),
    served_quantity: Number(row.served_quantity),
  }));
}

async function roundsState(client: PoolClient, roundIds: number[]): Promise<ServeAnswer['rounds']> {
  if (roundIds.length === 0) return [];
  const rows = await client.query(
    `SELECT id, prep_status, served_at FROM pos_bill_rounds WHERE id = ANY($1::bigint[]) ORDER BY id`,
    [roundIds]
  );
  return rows.rows.map((row) => ({
    id: Number(row.id),
    prep_status: row.prep_status === 'served' ? 'served' : row.prep_status === 'ready' ? 'ready' : 'new',
    served_at: isoOrNull(row.served_at),
  }));
}

/**
 * Make every round whose lines are all carried `served`. `ready_at` is left
 * alone on purpose (rule 1). Called with the rounds already locked.
 */
async function closeCarriedRounds(client: PoolClient, roundIds: number[]): Promise<void> {
  if (roundIds.length === 0) return;
  await client.query(
    `UPDATE pos_bill_rounds r
        SET prep_status = 'served', served_at = NOW()
      WHERE r.id = ANY($1::bigint[])
        AND r.prep_status <> 'served'
        AND r.cancelled_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pos_bill_items i
           WHERE i.round_id = r.id
             AND i.quantity > COALESCE((SELECT SUM(e.quantity) FROM pos_bill_item_serves e
                                         WHERE e.bill_item_id = i.id AND e.undone_at IS NULL), 0)
        )`,
    [roundIds]
  );
}

/** Lock the bills, in id order. Answers their statuses by id. */
async function lockBills(client: PoolClient, storeId: number, billIds: number[]): Promise<Map<number, string>> {
  const rows = await client.query(
    `SELECT id, status FROM pos_bills WHERE store_id = $1 AND id = ANY($2::bigint[]) ORDER BY id FOR UPDATE`,
    [storeId, billIds]
  );
  return new Map(rows.rows.map((row) => [Number(row.id), String(row.status)]));
}

/** The time a plate went out, on the store's clock: «19:42». */
async function storeTime(client: PoolClient, storeId: number, at: unknown): Promise<string> {
  const row = await client.query(
    `SELECT to_char($2::timestamptz AT TIME ZONE COALESCE(timezone, 'Europe/Kyiv'), 'HH24:MI') AS t
       FROM pos_stores WHERE id = $1`,
    [storeId, at]
  );
  return String(row.rows[0]?.t ?? '');
}

/**
 * «Несу»: carry `quantity` of each named line. All or nothing — one request
 * is one tray — and idempotent on `client_uuid`: a request repeated after a
 * timeout answers with the rows the first one wrote.
 */
export async function serveItems(params: {
  storeId: number;
  staffId: number;
  clientUuid: unknown;
  items: unknown;
}): Promise<ServeAnswer> {
  const clientUuid = typeof params.clientUuid === 'string' ? params.clientUuid.trim().toLowerCase() : '';
  if (!UUID_RE.test(clientUuid)) throw new ServingError('client_uuid має бути UUID');
  if (!Array.isArray(params.items) || params.items.length === 0 || params.items.length > MAX_ITEMS) {
    throw new ServingError(`Назвіть від 1 до ${MAX_ITEMS} страв`);
  }
  // The same line twice in one request is one line carried twice as much.
  const wanted = new Map<number, number>();
  for (const raw of params.items as Array<Record<string, unknown>>) {
    const id = Number(raw?.bill_item_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw new ServingError('Кожна страва — bill_item_id і кількість від 1');
    }
    wanted.set(id, (wanted.get(id) ?? 0) + quantity);
  }
  const lineIds = [...wanted.keys()].sort((a, b) => a - b);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, bill_id, round_id FROM pos_bill_items WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [params.storeId, lineIds]
    );
    if (found.rows.length !== lineIds.length) throw new ServingNotFound('Страву не знайдено');
    const billIds = [...new Set(found.rows.map((row) => Number(row.bill_id)))].sort((a, b) => a - b);

    // 1. The bills, in id order — the lock every bill writer takes first.
    const statuses = await lockBills(client, params.storeId, billIds);
    for (const billId of billIds) {
      if (statuses.get(billId) === 'cancelled') {
        throw new ServingConflict('Рахунок скасовано — виносити нічого', 'bill_cancelled');
      }
    }

    // A replay of the same tray: answered under the same locks, so two copies
    // of one request arriving together queue behind each other.
    const replay = await client.query(
      `SELECT id, bill_item_id, round_id, quantity, served_at FROM pos_bill_item_serves
        WHERE store_id = $1 AND client_uuid = $2 ORDER BY id`,
      [params.storeId, clientUuid]
    );
    if (replay.rows.length > 0) {
      const replayLines = [...new Set(replay.rows.map((row) => Number(row.bill_item_id)))];
      const replayRounds = [...new Set(replay.rows.map((row) => Number(row.round_id)))];
      const answer: ServeAnswer = {
        replay: true,
        events: replay.rows.map((row) => ({
          id: Number(row.id),
          bill_item_id: Number(row.bill_item_id),
          quantity: Number(row.quantity),
          served_at: iso(row.served_at),
        })),
        lines: await linesState(client, replayLines),
        rounds: await roundsState(client, replayRounds),
      };
      await client.query('COMMIT');
      return answer;
    }

    // 2. The rounds, in id order.
    if (found.rows.some((row) => row.round_id == null)) {
      throw new ServingConflict('Страва ще в чернетці — спершу відправте її на кухню', 'line_not_fired');
    }
    const roundIds = [...new Set(found.rows.map((row) => Number(row.round_id)))].sort((a, b) => a - b);
    const rounds = await client.query(
      `SELECT id, prep_status, cancelled_at FROM pos_bill_rounds
        WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
      [roundIds]
    );
    const roundById = new Map(rounds.rows.map((row) => [Number(row.id), row]));
    if (rounds.rows.some((row) => row.cancelled_at != null)) {
      throw new ServingConflict('Раунд скасовано — цю страву не готують', 'round_cancelled');
    }

    // 3. The lines, in id order, and what of each is carried already.
    const lines = await client.query(
      `SELECT i.id, i.bill_id, i.round_id, i.quantity, i.product_name
         FROM pos_bill_items i
        WHERE i.id = ANY($1::bigint[]) ORDER BY i.id FOR UPDATE`,
      [lineIds]
    );
    const carried = await client.query(
      `SELECT bill_item_id, SUM(quantity)::int AS served FROM pos_bill_item_serves
        WHERE bill_item_id = ANY($1::bigint[]) AND undone_at IS NULL GROUP BY bill_item_id`,
      [lineIds]
    );
    const carriedById = new Map(carried.rows.map((row) => [Number(row.bill_item_id), Number(row.served)]));

    for (const line of lines.rows) {
      const lineId = Number(line.id);
      const round = roundById.get(Number(line.round_id));
      const quantity = Number(line.quantity);
      const served = round?.prep_status === 'served' ? quantity : carriedById.get(lineId) ?? 0;
      const asked = wanted.get(lineId) ?? 0;
      if (served + asked <= quantity) continue;
      const left = Math.max(0, quantity - served);
      const last = await client.query(
        `SELECT e.served_at, e.source, s.display_name
           FROM pos_bill_item_serves e
           LEFT JOIN pos_staff s ON s.id = e.served_by
          WHERE e.bill_item_id = $1 AND e.undone_at IS NULL
          ORDER BY e.served_at DESC, e.id DESC LIMIT 1`,
        [lineId]
      );
      const by = last.rows[0];
      const who = by ? (by.source === 'kitchen' ? 'кухня' : String(by.display_name ?? '')) : 'кухня';
      const at = by ? await storeTime(client, params.storeId, by.served_at) : '';
      const name = String(line.product_name ?? '');
      const message =
        left === 0
          ? `«${name}» уже винесено${who ? ` — ${who}` : ''}${at ? ` о ${at}` : ''}`
          : `«${name}»: лишилось винести лише ${left}`;
      throw new ServingConflict(message, 'over_served', {
        bill_item_id: lineId,
        quantity,
        served_quantity: served,
        served_by_name: who || null,
        served_at: by ? iso(by.served_at) : null,
      });
    }

    const inserted = await client.query(
      `INSERT INTO pos_bill_item_serves
         (store_id, bill_id, round_id, bill_item_id, quantity, source, served_by, client_uuid)
       SELECT $1, x.bill_id, x.round_id, x.bill_item_id, x.quantity, 'waiter', $2, $3::uuid
         FROM UNNEST($4::bigint[], $5::bigint[], $6::bigint[], $7::int[])
              AS x(bill_id, round_id, bill_item_id, quantity)
       RETURNING id, bill_item_id, quantity, served_at`,
      [
        params.storeId,
        params.staffId,
        clientUuid,
        lines.rows.map((row) => Number(row.bill_id)),
        lines.rows.map((row) => Number(row.round_id)),
        lines.rows.map((row) => Number(row.id)),
        lines.rows.map((row) => wanted.get(Number(row.id)) ?? 0),
      ]
    );
    await closeCarriedRounds(client, roundIds);

    const answer: ServeAnswer = {
      replay: false,
      events: inserted.rows
        .map((row) => ({
          id: Number(row.id),
          bill_item_id: Number(row.bill_item_id),
          quantity: Number(row.quantity),
          served_at: iso(row.served_at),
        }))
        .sort((a, b) => a.id - b.id),
      lines: await linesState(client, lineIds),
      rounds: await roundsState(client, roundIds),
    };
    await client.query('COMMIT');
    return answer;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * «Повернути»: take back taps made by mistake. Already undone rows are
 * skipped, so repeating it is harmless; a round that the undone tap had
 * closed goes back to where the kitchen left it.
 */
export async function undoServes(params: {
  storeId: number;
  staffId: number;
  role: string;
  eventIds: unknown;
}): Promise<{ undone: number[]; lines: ServeAnswer['lines']; rounds: ServeAnswer['rounds'] }> {
  if (!Array.isArray(params.eventIds) || params.eventIds.length === 0 || params.eventIds.length > MAX_ITEMS) {
    throw new ServingError(`Назвіть від 1 до ${MAX_ITEMS} відміток`);
  }
  const ids = [...new Set((params.eventIds as unknown[]).map(Number))].sort((a, b) => a - b);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new ServingError('Відмітка — це номер');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, bill_id, round_id FROM pos_bill_item_serves WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [params.storeId, ids]
    );
    if (found.rows.length !== ids.length) throw new ServingNotFound('Відмітку не знайдено');
    const billIds = [...new Set(found.rows.map((row) => Number(row.bill_id)))].sort((a, b) => a - b);
    const roundIds = [...new Set(found.rows.map((row) => Number(row.round_id)))].sort((a, b) => a - b);

    const statuses = await lockBills(client, params.storeId, billIds);
    await client.query(`SELECT id FROM pos_bill_rounds WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [
      roundIds,
    ]);
    const events = await client.query(
      `SELECT e.id, e.bill_id, e.round_id, e.bill_item_id, e.source, e.served_by, e.undone_at,
              (e.served_at + make_interval(mins => $2::int) > NOW()) AS in_time,
              EXISTS (SELECT 1 FROM pos_bill_item_serves k
                       WHERE k.round_id = e.round_id AND k.source = 'kitchen' AND k.undone_at IS NULL) AS kitchen_done
         FROM pos_bill_item_serves e
        WHERE e.id = ANY($1::bigint[]) ORDER BY e.id FOR UPDATE OF e`,
      [ids, UNDO_MINUTES]
    );

    const toUndo: number[] = [];
    for (const event of events.rows) {
      if (event.undone_at != null) continue;
      if (event.source === 'kitchen') {
        throw new ServingConflict('Це видала кухня — таку відмітку не повернути', 'undo_kitchen');
      }
      if (statuses.get(Number(event.bill_id)) === 'cancelled') {
        throw new ServingConflict('Рахунок скасовано', 'bill_cancelled');
      }
      if (Number(event.served_by) !== params.staffId && params.role !== 'owner') {
        throw new ServingConflict('Повернути може той, хто виніс, або власник', 'undo_not_yours');
      }
      if (event.in_time !== true) {
        throw new ServingConflict(`Минуло понад ${UNDO_MINUTES} хвилин — відмітку вже не повернути`, 'undo_expired');
      }
      if (event.kitchen_done === true) {
        throw new ServingConflict('Кухня вже видала решту цього раунду — відмітку не повернути', 'undo_after_kitchen');
      }
      toUndo.push(Number(event.id));
    }

    if (toUndo.length > 0) {
      await client.query(
        `UPDATE pos_bill_item_serves SET undone_at = NOW(), undone_by = $2 WHERE id = ANY($1::bigint[])`,
        [toUndo, params.staffId]
      );
      // A round the last tap had closed is open again — as the kitchen left
      // it: «Готово» if it ever said so, else still cooking.
      await client.query(
        `UPDATE pos_bill_rounds
            SET prep_status = CASE WHEN ready_at IS NULL THEN 'new' ELSE 'ready' END,
                served_at = NULL
          WHERE id = ANY($1::bigint[]) AND prep_status = 'served' AND cancelled_at IS NULL`,
        [roundIds]
      );
    }

    const lineIds = [...new Set(events.rows.map((row) => Number(row.bill_item_id)))];
    const answer = {
      undone: toUndo,
      lines: await linesState(client, lineIds),
      rounds: await roundsState(client, roundIds),
    };
    await client.query('COMMIT');
    return answer;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The kitchen's «Видано» on a round (rule 2): whatever the waiters have not
 * carried yet is carried now, as the kitchen's rows, and the round is
 * `served`. The same refusals as the plain tap: not from `new`, not on a
 * cancelled round, and a re-tap of `served` is a 200 that writes nothing.
 */
export async function serveRoundByKitchen(params: {
  storeId: number;
  staffId: number | null;
  roundId: number;
}): Promise<PrepStatusRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const head = await client.query(`SELECT bill_id FROM pos_bill_rounds WHERE id = $1 AND store_id = $2`, [
      params.roundId,
      params.storeId,
    ]);
    if (head.rows.length === 0) {
      await client.query('ROLLBACK');
      return explainPrepRefusal({
        row: undefined,
        wanted: 'served',
        gone: false,
        notFoundMessage: 'Раунд не знайдено',
        goneMessage: 'Раунд скасовано',
      });
    }
    const billId = Number(head.rows[0].bill_id);
    await client.query(`SELECT id FROM pos_bills WHERE id = $1 FOR UPDATE`, [billId]);
    const round = await client.query(
      `SELECT id, prep_status, ready_at, served_at, cancelled_at FROM pos_bill_rounds WHERE id = $1 FOR UPDATE`,
      [params.roundId]
    );
    const row = round.rows[0];
    if (row.cancelled_at != null || row.prep_status !== 'ready') {
      await client.query('ROLLBACK');
      return explainPrepRefusal({
        row,
        wanted: 'served',
        gone: row.cancelled_at != null,
        notFoundMessage: 'Раунд не знайдено',
        goneMessage: 'Раунд скасовано',
      });
    }

    await client.query(`SELECT id FROM pos_bill_items WHERE round_id = $1 ORDER BY id FOR UPDATE`, [params.roundId]);
    await client.query(
      `INSERT INTO pos_bill_item_serves (store_id, bill_id, round_id, bill_item_id, quantity, source, served_by)
       SELECT $1, i.bill_id, i.round_id, i.id, i.quantity - c.served, 'kitchen', $3
         FROM pos_bill_items i
         CROSS JOIN LATERAL (
           SELECT COALESCE(SUM(e.quantity), 0)::int AS served FROM pos_bill_item_serves e
            WHERE e.bill_item_id = i.id AND e.undone_at IS NULL
         ) c
        WHERE i.round_id = $2 AND i.quantity > c.served`,
      [params.storeId, params.roundId, params.staffId]
    );
    const updated = await client.query(
      `UPDATE pos_bill_rounds SET prep_status = 'served', served_at = NOW()
        WHERE id = $1 RETURNING id, prep_status, ready_at, served_at`,
      [params.roundId]
    );
    await client.query('COMMIT');
    return prepRowOf(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
