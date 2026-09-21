// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/bills.service.ts — the open bill on a table (phase К4b; migration
// 052, TechDocs/POS_TABLES.md §8.2–8.3).
//
// What lives here: opening a table, editing the DRAFT, moving a bill to
// another table, cancelling one. Firing a round — which is what locks the
// price, moves stock and wakes the kitchen — is К4c, and paying is К4d.
//
// Four things are easy to get backwards:
//
// 1. **Opening a table is idempotent in two different ways.** Two waiters tap
//    table 5 at the same moment and both must land on the SAME bill: the one
//    already open is returned rather than refused, because tapping an
//    occupied table means «show me it», not «start a second one». On top of
//    that a `client_uuid` replay (one waiter, flaky Wi-Fi, two requests)
//    returns the row the first one made. The partial unique index
//    `(store_id, table_id) WHERE status='open'` is the backstop under both.
// 2. **A draft line has no price.** `unit_price_cents` stays null until the
//    round is fired (§4.3): a bill that lives three hours must not be
//    silently repriced mid-dinner by a menu edit. What `getBill` reports for
//    a draft is therefore a PREVIEW at today's card price — indicative, and
//    named so — while a fired line reports the money that was locked.
// 3. **The draft merges on the server's own key**, `(variant, sorted modifier
//    ids, note)` — the very string `completeSale` uses — so «ще одну таку
//    саму» becomes ×2 rather than a second line. A line carrying its own
//    composition never merges: two assembled plates are two plates.
// 4. **Only a draft is editable.** A line with a `round_id` is in the
//    kitchen's hands; changing it here would mean the paper ticket and the
//    bill disagree. It is refused in words, and К4c's «скасувати раунд» is
//    the way back.

import { pool } from '../db.js';
import { validateComponents } from './composites.service.js';
import type { ComponentInput } from './composites.service.js';
import { dailyCounterKey, nextCounterValue } from './core/counters.js';
import { storeClock } from './core/storeClock.js';
import * as modifiers from './modifiers.service.js';
import type { LineModifierSnapshot } from './modifiers.service.js';

export class BillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillError';
  }
}

/** The bill, table or line is not this store's, or does not exist at all. */
export class BillNotFound extends BillError {
  constructor(message: string) {
    super(message);
    this.name = 'BillNotFound';
  }
}

/** The room is not set up, the table is taken, the line is already cooking. */
export class BillConflict extends BillError {
  constructor(message: string) {
    super(message);
    this.name = 'BillConflict';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_GUESTS = 99;
const MAX_NOTE = 500;
/** A bill longer than this is a data-entry accident, not a dinner. */
const MAX_LINES = 300;

type DbClient = { query: typeof pool.query };

export interface BillLine {
  id: number;
  variant_id: number;
  quantity: number;
  product_name: string;
  variant_label: string;
  unit: string;
  /**
   * The money this line locked when its round was fired. Null on a draft —
   * see `preview_unit_price_cents` below, which is not the same thing.
   */
  unit_price_cents: number | null;
  compare_at_unit_cents: number | null;
  /** Today's card price + today's deltas, for a draft only. Indicative. */
  preview_unit_price_cents: number | null;
  components: ComponentInput[] | null;
  modifiers: LineModifierSnapshot[];
  note: string;
  added_by: number;
  added_by_name: string;
  sort_order: number;
}

export interface BillRound {
  id: number;
  seq: number;
  fired_at: string;
  fired_by: number;
  fired_by_name: string;
  prep_status: 'new' | 'ready' | 'served';
  ready_at: string | null;
  served_at: string | null;
  cancelled_at: string | null;
  items: BillLine[];
  total_cents: number;
}

export interface Bill {
  id: number;
  bill_no: number;
  status: 'open' | 'paid' | 'cancelled';
  table_id: number;
  table_name: string;
  hall_id: number;
  hall_name: string;
  guests: number;
  note: string | null;
  customer_id: number | null;
  precheck_printed_at: string | null;
  opened_by: number;
  opened_by_name: string;
  opened_at: string;
  closed_at: string | null;
  rounds: BillRound[];
  /** Lines not yet fired (`round_id IS NULL`). */
  draft: BillLine[];
  /** Σ of fired lines at their locked price — the money owed so far. */
  fired_total_cents: number;
  /** Σ of the draft at today's prices. Indicative; it is not owed yet. */
  draft_preview_cents: number;
}

/** A tile on the hall map. */
export interface OpenBillSummary {
  id: number;
  bill_no: number;
  table_id: number;
  guests: number;
  opened_at: string;
  opened_by_name: string;
  precheck_printed_at: string | null;
  fired_total_cents: number;
  /** Lines waiting to be sent — the dot that says «не відправлено». */
  draft_count: number;
  /** The earliest unserved round, so the tile can show what the table waits for. */
  prep_status: 'new' | 'ready' | null;
}

export interface OpenBillInput {
  storeId: number;
  staffId: number;
  tableId: number;
  guests?: unknown;
  note?: unknown;
  customerId?: number | null;
  clientUuid?: unknown;
}

export interface DraftItemInput {
  variant_id?: unknown;
  quantity?: unknown;
  components?: ComponentInput[] | null;
  modifiers?: unknown;
  note?: unknown;
}

// ── helpers ────────────────────────────────────────────────────────────────

function intField(raw: unknown, what: string, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new BillError(`${what} має бути цілим числом від ${min} до ${max}`);
  }
  return n;
}

function cleanNote(raw: unknown): string | null {
  if (raw == null) return null;
  const note = String(raw).trim();
  if (!note) return null;
  if (note.length > MAX_NOTE) throw new BillError('Нотатка задовга');
  return note;
}

/**
 * The room has to exist before anybody can be seated in it.
 *
 * Deliberately here and not on `GET /halls`: that endpoint serves the owner
 * who is about to create the first hall, and a list refusing an empty store
 * would be a dead end (TechDocs/POS_TABLES.md §8.4).
 */
async function assertRoomExists(client: DbClient, storeId: number): Promise<void> {
  const halls = await client.query(`SELECT 1 FROM pos_halls WHERE store_id = $1 LIMIT 1`, [
    storeId,
  ]);
  if (halls.rows.length === 0) {
    throw new BillConflict('Столи не налаштовано — створіть зал у налаштуваннях');
  }
}

/** The merge key `completeSale` uses, verbatim (`sales.service.ts` plainLines). */
function lineKey(variantId: number, modifierIds: number[], note: string): string {
  return `${variantId}|${modifierIds.join(',')}|${note}`;
}

function mapLine(row: Record<string, unknown>, preview: number | null): BillLine {
  return {
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    // A fired line reads its own snapshot; a draft has none yet, so it reads
    // the catalogue as it is right now.
    product_name: String(row.product_name ?? row.live_product_name ?? ''),
    variant_label: String(row.variant_label ?? row.live_label ?? ''),
    unit: String(row.unit ?? row.live_unit ?? 'шт'),
    unit_price_cents: row.unit_price_cents == null ? null : Number(row.unit_price_cents),
    compare_at_unit_cents:
      row.compare_at_unit_cents == null ? null : Number(row.compare_at_unit_cents),
    preview_unit_price_cents: preview,
    components: (row.components as ComponentInput[] | null) ?? null,
    modifiers: modifiers.parseLineModifierSnapshot(row.modifiers),
    note: String(row.note ?? ''),
    added_by: Number(row.added_by),
    added_by_name: String(row.added_by_name ?? ''),
    sort_order: Number(row.sort_order),
  };
}

// ── opening ────────────────────────────────────────────────────────────────

/**
 * Seat a table: return the bill already open on it, or start one.
 *
 * Both halves of rule 1 in the header live here. The `FOR UPDATE` on the
 * table row is what makes the race deterministic — without it two
 * simultaneous taps both miss the open bill and the second one dies on the
 * partial unique index with a message nobody can act on.
 */
export async function openBill(input: OpenBillInput): Promise<{ bill: Bill; created: boolean }> {
  const clientUuid =
    input.clientUuid == null ? null : String(input.clientUuid).trim().toLowerCase();
  if (clientUuid !== null && !UUID_RE.test(clientUuid)) {
    throw new BillError('client_uuid має бути UUID');
  }
  const guests = input.guests === undefined ? 1 : intField(input.guests, 'Гостей', 1, MAX_GUESTS);
  const note = cleanNote(input.note);

  const client = await pool.connect();
  let billId: number;
  let created = false;
  try {
    await client.query('BEGIN');
    await assertRoomExists(client, input.storeId);

    const table = await client.query(
      `SELECT id FROM pos_tables WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [input.storeId, input.tableId]
    );
    if (table.rows.length === 0) throw new BillNotFound('Стіл не знайдено');

    // A replay of the same tap, even if that bill has since been paid: the
    // answer must be the row the first request made, never a second bill.
    if (clientUuid) {
      const replay = await client.query(
        `SELECT id FROM pos_bills WHERE store_id = $1 AND client_uuid = $2`,
        [input.storeId, clientUuid]
      );
      if (replay.rows.length > 0) {
        const replayed = Number(replay.rows[0].id);
        await client.query('COMMIT');
        client.release();
        return { bill: await getBill(input.storeId, replayed), created: false };
      }
    }

    const open = await client.query(
      `SELECT id FROM pos_bills WHERE store_id = $1 AND table_id = $2 AND status = 'open'`,
      [input.storeId, input.tableId]
    );
    if (open.rows.length > 0) {
      billId = Number(open.rows[0].id);
    } else {
      const clock = await storeClock(client, input.storeId);
      const billNo = await nextCounterValue(
        client,
        input.storeId,
        dailyCounterKey('bill', clock.today)
      );
      const inserted = await client.query(
        `INSERT INTO pos_bills
           (store_id, table_id, bill_no, guests, note, customer_id, opened_by, client_uuid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          input.storeId,
          input.tableId,
          billNo,
          guests,
          note,
          input.customerId ?? null,
          input.staffId,
          clientUuid,
        ]
      );
      billId = Number(inserted.rows[0].id);
      created = true;
    }
    await client.query('COMMIT');
    client.release();
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
  return { bill: await getBill(input.storeId, billId), created };
}

// ── reading ────────────────────────────────────────────────────────────────

/** Today's price of a draft line: card price + today's answers. Indicative. */
async function previewPrice(
  client: DbClient,
  storeId: number,
  variantId: number,
  snapshot: LineModifierSnapshot[],
  components: ComponentInput[] | null
): Promise<number | null> {
  // A line assembled at the counter is priced from its parts at fire time;
  // previewing it would mean duplicating that arithmetic here for a number
  // nobody owes yet. Say nothing instead of saying something wrong.
  if (components?.length) return null;
  const variant = await client.query(
    `SELECT price_cents FROM pos_variants WHERE id = $1 AND store_id = $2`,
    [variantId, storeId]
  );
  if (variant.rows.length === 0) return null;
  const delta = await modifiers.liveDeltaCents(client, storeId, snapshot);
  if (delta == null) return null;
  return Number(variant.rows[0].price_cents) + delta;
}

export async function getBill(storeId: number, billId: number): Promise<Bill> {
  const head = await pool.query(
    `SELECT b.*, t.name AS table_name, t.hall_id, h.name AS hall_name,
            s.display_name AS opened_by_name
       FROM pos_bills b
       JOIN pos_tables t ON t.id = b.table_id
       JOIN pos_halls h ON h.id = t.hall_id
       JOIN pos_staff s ON s.id = b.opened_by
      WHERE b.store_id = $1 AND b.id = $2`,
    [storeId, billId]
  );
  if (head.rows.length === 0) throw new BillNotFound('Рахунок не знайдено');
  const row = head.rows[0];

  const roundRows = await pool.query(
    `SELECT r.*, s.display_name AS fired_by_name
       FROM pos_bill_rounds r
       JOIN pos_staff s ON s.id = r.fired_by
      WHERE r.bill_id = $1
      ORDER BY r.seq ASC`,
    [billId]
  );
  const itemRows = await pool.query(
    `SELECT i.*, s.display_name AS added_by_name,
            p.name AS live_product_name, v.label AS live_label, v.unit AS live_unit
       FROM pos_bill_items i
       JOIN pos_staff s ON s.id = i.added_by
       JOIN pos_variants v ON v.id = i.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE i.bill_id = $1
      ORDER BY i.sort_order ASC, i.id ASC`,
    [billId]
  );

  const draft: BillLine[] = [];
  const byRound = new Map<number, BillLine[]>();
  let firedTotal = 0;
  let draftPreview = 0;
  for (const itemRow of itemRows.rows) {
    const roundId = itemRow.round_id == null ? null : Number(itemRow.round_id);
    const snapshot = modifiers.parseLineModifierSnapshot(itemRow.modifiers);
    const preview =
      roundId == null
        ? await previewPrice(
            pool,
            storeId,
            Number(itemRow.variant_id),
            snapshot,
            (itemRow.components as ComponentInput[] | null) ?? null
          )
        : null;
    const line = mapLine(itemRow, preview);
    if (roundId == null) {
      draft.push(line);
      if (preview != null) draftPreview += preview * line.quantity;
    } else {
      const lines = byRound.get(roundId) ?? [];
      lines.push(line);
      byRound.set(roundId, lines);
    }
  }

  const rounds: BillRound[] = roundRows.rows.map((r) => {
    const items = byRound.get(Number(r.id)) ?? [];
    const total = items.reduce((sum, i) => sum + (i.unit_price_cents ?? 0) * i.quantity, 0);
    // A cancelled round owes nothing: its stock went back and its plates were
    // never served. It stays on the bill so the evening reads honestly.
    if (r.cancelled_at == null) firedTotal += total;
    return {
      id: Number(r.id),
      seq: Number(r.seq),
      fired_at: new Date(r.fired_at as string).toISOString(),
      fired_by: Number(r.fired_by),
      fired_by_name: String(r.fired_by_name ?? ''),
      prep_status: r.prep_status as 'new' | 'ready' | 'served',
      ready_at: r.ready_at == null ? null : new Date(r.ready_at as string).toISOString(),
      served_at: r.served_at == null ? null : new Date(r.served_at as string).toISOString(),
      cancelled_at:
        r.cancelled_at == null ? null : new Date(r.cancelled_at as string).toISOString(),
      items,
      total_cents: total,
    };
  });

  return {
    id: Number(row.id),
    bill_no: Number(row.bill_no),
    status: row.status as 'open' | 'paid' | 'cancelled',
    table_id: Number(row.table_id),
    table_name: String(row.table_name),
    hall_id: Number(row.hall_id),
    hall_name: String(row.hall_name),
    guests: Number(row.guests),
    note: row.note == null ? null : String(row.note),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    precheck_printed_at:
      row.precheck_printed_at == null
        ? null
        : new Date(row.precheck_printed_at as string).toISOString(),
    opened_by: Number(row.opened_by),
    opened_by_name: String(row.opened_by_name ?? ''),
    opened_at: new Date(row.opened_at as string).toISOString(),
    closed_at: row.closed_at == null ? null : new Date(row.closed_at as string).toISOString(),
    rounds,
    draft,
    fired_total_cents: firedTotal,
    draft_preview_cents: draftPreview,
  };
}

/** Every open bill of the store, for the hall map. One query, no N+1. */
export async function listOpenBills(storeId: number): Promise<OpenBillSummary[]> {
  const result = await pool.query(
    `SELECT b.id, b.bill_no, b.table_id, b.guests, b.opened_at, b.precheck_printed_at,
            s.display_name AS opened_by_name,
            COALESCE(fired.total, 0) AS fired_total,
            COALESCE(draft.lines, 0) AS draft_lines,
            waiting.prep_status
       FROM pos_bills b
       JOIN pos_staff s ON s.id = b.opened_by
       LEFT JOIN LATERAL (
         SELECT SUM(i.unit_price_cents * i.quantity) AS total
           FROM pos_bill_items i
           JOIN pos_bill_rounds r ON r.id = i.round_id
          WHERE i.bill_id = b.id AND r.cancelled_at IS NULL
       ) fired ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS lines
           FROM pos_bill_items i
          WHERE i.bill_id = b.id AND i.round_id IS NULL
       ) draft ON TRUE
       LEFT JOIN LATERAL (
         SELECT r.prep_status
           FROM pos_bill_rounds r
          WHERE r.bill_id = b.id AND r.cancelled_at IS NULL
            AND r.prep_status IN ('new', 'ready')
          ORDER BY CASE r.prep_status WHEN 'new' THEN 0 ELSE 1 END, r.seq ASC
          LIMIT 1
       ) waiting ON TRUE
      WHERE b.store_id = $1 AND b.status = 'open'
      ORDER BY b.opened_at ASC`,
    [storeId]
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    bill_no: Number(row.bill_no),
    table_id: Number(row.table_id),
    guests: Number(row.guests),
    opened_at: new Date(row.opened_at as string).toISOString(),
    opened_by_name: String(row.opened_by_name ?? ''),
    precheck_printed_at:
      row.precheck_printed_at == null
        ? null
        : new Date(row.precheck_printed_at as string).toISOString(),
    fired_total_cents: Number(row.fired_total ?? 0),
    draft_count: Number(row.draft_lines ?? 0),
    prep_status: (row.prep_status as 'new' | 'ready' | null) ?? null,
  }));
}

// ── the draft ──────────────────────────────────────────────────────────────

async function loadOpenBill(client: DbClient, storeId: number, billId: number): Promise<void> {
  const bill = await client.query(
    `SELECT status FROM pos_bills WHERE store_id = $1 AND id = $2 FOR UPDATE`,
    [storeId, billId]
  );
  if (bill.rows.length === 0) throw new BillNotFound('Рахунок не знайдено');
  const status = String(bill.rows[0].status);
  if (status === 'paid') throw new BillConflict('Рахунок уже оплачено');
  if (status === 'cancelled') throw new BillConflict('Рахунок скасовано');
}

/**
 * Add to the draft, merging into an existing unfired line when the server's
 * own key matches — «ще одну таку саму» is ×2, not a second line.
 *
 * What is validated here is what can be validated before a price exists: the
 * variant is this store's and on the menu, the answers satisfy the product's
 * required groups, and the dish is not on today's stop-list. Price and stock
 * are К4c's, at fire time.
 */
export async function addDraftItem(
  storeId: number,
  staffId: number,
  billId: number,
  input: DraftItemInput
): Promise<Bill> {
  const variantId = intField(input.variant_id, 'Позиція', 1, Number.MAX_SAFE_INTEGER);
  const quantity = intField(input.quantity, 'Кількість', 1, 9999);
  const modifierIds = modifiers.normalizeModifierIds(input.modifiers);
  const note = modifiers.cleanLineNote(input.note);
  if (input.components?.length && modifierIds.length > 0) {
    throw new BillError('Позиція з власним складом не приймає модифікаторів');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadOpenBill(client, storeId, billId);

    const clock = await storeClock(client, storeId);
    const variant = await client.query(
      `SELECT v.id, p.is_active, p.name, p.stop_listed_on::text AS stop_listed_on
         FROM pos_variants v
         JOIN pos_products p ON p.id = v.product_id
        WHERE v.id = $1 AND v.store_id = $2`,
      [variantId, storeId]
    );
    if (variant.rows.length === 0) throw new BillNotFound('Позицію не знайдено');
    const dish = variant.rows[0];
    if (!dish.is_active) throw new BillConflict(`«${String(dish.name)}» знято з меню`);
    // The stop-list refuses here, where the waiter is still standing at the
    // table and can offer something else — never at payment, which would
    // refuse a dish the guest has already eaten (§9).
    if (dish.stop_listed_on === clock.today) {
      throw new BillConflict(`«${String(dish.name)}» сьогодні в стоп-листі`);
    }

    const chosen = await modifiers.resolveForVariant(client, storeId, variantId, modifierIds);
    const components = input.components?.length
      ? await validateComponents(client, storeId, variantId, input.components)
      : null;

    // A line carrying its own composition never merges: two plates assembled
    // at the counter are two plates, and merging would throw one away.
    if (!components) {
      const existing = await client.query(
        `SELECT id, quantity, modifiers, note FROM pos_bill_items
          WHERE bill_id = $1 AND round_id IS NULL AND variant_id = $2 AND components IS NULL`,
        [billId, variantId]
      );
      const wanted = lineKey(variantId, modifierIds, note);
      for (const row of existing.rows) {
        const rowIds = modifiers
          .parseLineModifierSnapshot(row.modifiers)
          .map((m) => m.modifier_id)
          .filter((id): id is number => id != null)
          .sort((a, b) => a - b);
        if (lineKey(variantId, rowIds, String(row.note ?? '')) === wanted) {
          await client.query(`UPDATE pos_bill_items SET quantity = quantity + $2 WHERE id = $1`, [
            row.id,
            quantity,
          ]);
          await client.query('COMMIT');
          return await getBill(storeId, billId);
        }
      }
    }

    const count = await client.query(`SELECT COUNT(*) AS n FROM pos_bill_items WHERE bill_id = $1`, [
      billId,
    ]);
    if (Number(count.rows[0].n) >= MAX_LINES) throw new BillError('Забагато позицій у рахунку');

    const order = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM pos_bill_items WHERE bill_id = $1`,
      [billId]
    );
    await client.query(
      `INSERT INTO pos_bill_items
         (store_id, bill_id, variant_id, quantity, components, modifiers, note, added_by, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
      [
        storeId,
        billId,
        variantId,
        quantity,
        components?.length ? JSON.stringify(components) : null,
        chosen.snapshot.length ? JSON.stringify(chosen.snapshot) : null,
        note,
        staffId,
        Number(order.rows[0].next),
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBill(storeId, billId);
}

/** Retype the count on a draft line. Zero is `removeDraftItem`, not this. */
export async function setDraftQuantity(
  storeId: number,
  billId: number,
  itemId: number,
  quantity: number
): Promise<Bill> {
  const wanted = intField(quantity, 'Кількість', 1, 9999);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadOpenBill(client, storeId, billId);
    const result = await client.query(
      `UPDATE pos_bill_items SET quantity = $4
        WHERE store_id = $1 AND bill_id = $2 AND id = $3 AND round_id IS NULL
      RETURNING id`,
      [storeId, billId, itemId, wanted]
    );
    if (result.rowCount === 0) await refuseFiredLine(client, storeId, billId, itemId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBill(storeId, billId);
}

export async function removeDraftItem(
  storeId: number,
  billId: number,
  itemId: number
): Promise<Bill> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadOpenBill(client, storeId, billId);
    const result = await client.query(
      `DELETE FROM pos_bill_items
        WHERE store_id = $1 AND bill_id = $2 AND id = $3 AND round_id IS NULL
      RETURNING id`,
      [storeId, billId, itemId]
    );
    if (result.rowCount === 0) await refuseFiredLine(client, storeId, billId, itemId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBill(storeId, billId);
}

/**
 * Say which of the two it was: a line that never existed, or one the kitchen
 * already has. «Не знайдено» for a dish being cooked right now would send the
 * waiter looking for a bug that is not there.
 */
async function refuseFiredLine(
  client: DbClient,
  storeId: number,
  billId: number,
  itemId: number
): Promise<never> {
  const row = await client.query(
    `SELECT round_id FROM pos_bill_items WHERE store_id = $1 AND bill_id = $2 AND id = $3`,
    [storeId, billId, itemId]
  );
  if (row.rows.length === 0) throw new BillNotFound('Позицію не знайдено');
  throw new BillConflict('Позиція вже на кухні — скасуйте раунд, щоб її змінити');
}

// ── the bill itself ────────────────────────────────────────────────────────

export async function updateBill(
  storeId: number,
  billId: number,
  input: { guests?: unknown; note?: unknown; customer_id?: unknown }
): Promise<Bill> {
  const sets: string[] = [];
  const values: unknown[] = [storeId, billId];
  if (input.guests !== undefined) {
    values.push(intField(input.guests, 'Гостей', 1, MAX_GUESTS));
    sets.push(`guests = $${values.length}`);
  }
  if (input.note !== undefined) {
    values.push(cleanNote(input.note));
    sets.push(`note = $${values.length}`);
  }
  if (input.customer_id !== undefined) {
    values.push(input.customer_id == null ? null : Number(input.customer_id));
    sets.push(`customer_id = $${values.length}`);
  }
  if (sets.length === 0) return getBill(storeId, billId);
  sets.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE pos_bills SET ${sets.join(', ')}
      WHERE store_id = $1 AND id = $2 AND status = 'open'
    RETURNING id`,
    values
  );
  if (result.rowCount === 0) await refuseClosedBill(storeId, billId);
  return getBill(storeId, billId);
}

/**
 * Move the whole bill to another table.
 *
 * The target being free is the partial unique index's job, not a check here:
 * two waiters moving two bills onto the same empty table is exactly the race
 * a check would lose. So the write is attempted and the unique violation is
 * translated into the sentence the waiter needs.
 */
export async function moveBill(
  storeId: number,
  billId: number,
  tableId: number
): Promise<Bill> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadOpenBill(client, storeId, billId);
    const table = await client.query(
      `SELECT id FROM pos_tables WHERE store_id = $1 AND id = $2`,
      [storeId, tableId]
    );
    if (table.rows.length === 0) throw new BillNotFound('Стіл не знайдено');
    try {
      await client.query(
        `UPDATE pos_bills SET table_id = $3, updated_at = NOW()
          WHERE store_id = $1 AND id = $2`,
        [storeId, billId, tableId]
      );
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new BillConflict('Стіл зайнятий — там уже є відкритий рахунок');
      }
      throw error;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBill(storeId, billId);
}

/**
 * Close a bill nobody is going to pay: the guests left, the table was opened
 * by mistake.
 *
 * Only while nothing has been fired. A round that reached the kitchen took
 * stock with it, and giving that back is `cancelRound` — К4c. Until then the
 * honest answer is that this bill cannot be cancelled here, rather than a
 * silent close that leaves the shelf wrong.
 */
export async function cancelBill(
  storeId: number,
  staffId: number,
  billId: number
): Promise<Bill> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await loadOpenBill(client, storeId, billId);
    const fired = await client.query(
      `SELECT 1 FROM pos_bill_rounds WHERE bill_id = $1 AND cancelled_at IS NULL LIMIT 1`,
      [billId]
    );
    if (fired.rows.length > 0) {
      throw new BillConflict('Раунди вже на кухні — спершу скасуйте їх');
    }
    await client.query(`DELETE FROM pos_bill_items WHERE bill_id = $1 AND round_id IS NULL`, [
      billId,
    ]);
    await client.query(
      `UPDATE pos_bills
          SET status = 'cancelled', closed_by = $3, closed_at = NOW(), updated_at = NOW()
        WHERE store_id = $1 AND id = $2`,
      [storeId, billId, staffId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getBill(storeId, billId);
}

/** Mark that the sum has been read out loud. Never freezes anything (§4.6). */
export async function markPrecheckPrinted(storeId: number, billId: number): Promise<Bill> {
  const result = await pool.query(
    `UPDATE pos_bills SET precheck_printed_at = NOW(), updated_at = NOW()
      WHERE store_id = $1 AND id = $2 AND status = 'open'
    RETURNING id`,
    [storeId, billId]
  );
  if (result.rowCount === 0) await refuseClosedBill(storeId, billId);
  return getBill(storeId, billId);
}

async function refuseClosedBill(storeId: number, billId: number): Promise<never> {
  const row = await pool.query(`SELECT status FROM pos_bills WHERE store_id = $1 AND id = $2`, [
    storeId,
    billId,
  ]);
  if (row.rows.length === 0) throw new BillNotFound('Рахунок не знайдено');
  const status = String(row.rows[0].status);
  throw new BillConflict(status === 'paid' ? 'Рахунок уже оплачено' : 'Рахунок скасовано');
}

// ── paying (К4d) ───────────────────────────────────────────────────────────

/**
 * The lines of a bill that this receipt is about to pay for.
 *
 * Shaped exactly like a pre-order's locked line, because `completeSale` puts
 * both through the same branch: the price is the one the round fixed, the
 * answers are the promise as made, and nothing is re-derived from today's
 * menu. `FOR UPDATE` on the rows is what stops two tills splitting one bill
 * from both claiming the same plate.
 *
 * A line already paid for is skipped rather than refused: the second part of
 * a split legitimately asks for «everything still open», and a `line_ids`
 * naming a paid line is a stale screen, not a bug worth failing the receipt.
 * A line still in the draft is refused, though — nobody owes for a plate the
 * kitchen has not been told about.
 */
export async function lockedBillLines(
  client: DbClient,
  params: { storeId: number; billId: number; lineIds?: number[] }
): Promise<
  Array<{
    variant_id: number;
    quantity: number;
    unit_price_cents: number;
    components?: ComponentInput[];
    modifiers: LineModifierSnapshot[];
    note: string;
    bill_item_id: number;
  }>
> {
  const bill = await client.query(
    `SELECT status FROM pos_bills WHERE store_id = $1 AND id = $2 FOR UPDATE`,
    [params.storeId, params.billId]
  );
  if (bill.rows.length === 0) throw new BillNotFound('Рахунок не знайдено');
  if (String(bill.rows[0].status) === 'cancelled') throw new BillConflict('Рахунок скасовано');

  if (params.lineIds?.length) {
    const draft = await client.query(
      `SELECT 1 FROM pos_bill_items
        WHERE bill_id = $1 AND id = ANY($2::bigint[]) AND round_id IS NULL LIMIT 1`,
      [params.billId, params.lineIds]
    );
    if (draft.rows.length > 0) {
      throw new BillConflict('Позиція ще не відправлена на кухню — оплатити її не можна');
    }
  }

  const rows = await client.query(
    `SELECT i.id, i.variant_id, i.quantity, i.unit_price_cents, i.components,
            i.modifiers, i.note
       FROM pos_bill_items i
       JOIN pos_bill_rounds r ON r.id = i.round_id
      WHERE i.bill_id = $1
        AND i.sale_id IS NULL
        AND r.cancelled_at IS NULL
        ${params.lineIds?.length ? 'AND i.id = ANY($2::bigint[])' : ''}
      ORDER BY i.sort_order ASC, i.id ASC
      FOR UPDATE OF i`,
    params.lineIds?.length ? [params.billId, params.lineIds] : [params.billId]
  );
  return rows.rows.map((row) => ({
    variant_id: Number(row.variant_id),
    quantity: Number(row.quantity),
    unit_price_cents: Number(row.unit_price_cents ?? 0),
    ...(row.components ? { components: row.components as ComponentInput[] } : {}),
    modifiers: modifiers.parseLineModifierSnapshot(row.modifiers),
    note: String(row.note ?? ''),
    bill_item_id: Number(row.id),
  }));
}

/**
 * Tie a paid sale line back to the bill line behind it, and copy what that
 * line took off the shelf — **without moving stock**, because the round did
 * that when it fired.
 *
 * Both directions are written: `pos_sale_items.bill_item_id` so a refund can
 * find the bill line, and `pos_bill_items.sale_id` so the bill knows which
 * part of a split paid for this plate — and so «what is still open» is just
 * `sale_id IS NULL`.
 */
export async function attachPaidLine(
  client: DbClient,
  params: { storeId: number; billItemId: number; saleId: number; saleItemId: number }
): Promise<void> {
  await client.query(
    `INSERT INTO pos_sale_item_components
       (store_id, sale_item_id, component_variant_id, quantity_per_unit, sort_order)
     SELECT store_id, $3, component_variant_id, quantity_per_unit, sort_order
       FROM pos_bill_item_components
      WHERE store_id = $1 AND bill_item_id = $2
      ORDER BY sort_order ASC, id ASC`,
    [params.storeId, params.billItemId, params.saleItemId]
  );
  await client.query(
    `UPDATE pos_bill_items SET sale_id = $3 WHERE store_id = $1 AND id = $2`,
    [params.storeId, params.billItemId, params.saleId]
  );
}

/** What a bill still owes, and whether anything is left unfired. */
export async function billBalance(
  client: DbClient,
  storeId: number,
  billId: number
): Promise<{ openCents: number; openLines: number; draftLines: number }> {
  const row = await client.query(
    `SELECT
       COALESCE(SUM(i.unit_price_cents * i.quantity)
                FILTER (WHERE i.sale_id IS NULL AND i.round_id IS NOT NULL), 0) AS open_cents,
       COUNT(*) FILTER (WHERE i.sale_id IS NULL AND i.round_id IS NOT NULL) AS open_lines,
       COUNT(*) FILTER (WHERE i.round_id IS NULL) AS draft_lines
     FROM pos_bill_items i
     LEFT JOIN pos_bill_rounds r ON r.id = i.round_id
     WHERE i.bill_id = $2 AND i.store_id = $1
       AND (i.round_id IS NULL OR r.cancelled_at IS NULL)`,
    [storeId, billId]
  );
  return {
    openCents: Number(row.rows[0]?.open_cents ?? 0),
    openLines: Number(row.rows[0]?.open_lines ?? 0),
    draftLines: Number(row.rows[0]?.draft_lines ?? 0),
  };
}

/** Close a bill whose lines are all paid for. Idempotent by the status check. */
export async function closeIfSettled(
  storeId: number,
  staffId: number,
  billId: number
): Promise<boolean> {
  const balance = await billBalance(pool, storeId, billId);
  if (balance.openLines > 0 || balance.draftLines > 0) return false;
  const closed = await pool.query(
    `UPDATE pos_bills
        SET status = 'paid', closed_by = $3, closed_at = NOW(), updated_at = NOW()
      WHERE store_id = $1 AND id = $2 AND status = 'open'
    RETURNING id`,
    [storeId, billId, staffId]
  );
  return (closed.rowCount ?? 0) > 0;
}
