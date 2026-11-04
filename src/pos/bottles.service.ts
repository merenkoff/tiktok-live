// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/bottles.service.ts
//
// Open bottles (track ДК, ДК5, TechDocs/POS_DUAL_REGISTER.md §4.4, migration
// 093). A variant with `bottle_ml` is poured by the millilitre out of the
// bottle the bar has open, and that bottle's excise stamp goes on the receipt
// of the FIRST sale from it — once (ДПС ІПК № 3349 of 06.09.2021, З2).
//
// Stock is untouched here: `consumeStockForLine` moves it exactly as before
// (Д3), and this file only counts what each bottle gave. The rules that are
// easy to get backwards:
//
//   * A bottle closes by itself when its count reaches its size, and the next
//     pour always needs a new stamp (Д19) — a pour on the boundary takes the
//     rest of the old bottle and the start of the new one.
//   * The stamp is carried by the earliest STANDING pour: the first pour from
//     a new bottle carries it, and if that sale is voided (or returned whole)
//     the next pour from the same bottle carries it instead.
//   * At the till a missing stamp refuses the sale (Д4: `bottle_needed`, with
//     every bottle the sale would open, so the till asks once). A table's round
//     and an offline replay never wait: what does not fit waits for the bar to
//     scan the next stamp (`bottle_id` NULL, Д18), and opening a bottle fills
//     those waiting pours first, oldest first.
//   * A bottle sold whole (`excise_per_unit`, Д7) never pours: it has its own
//     stamp, and the open bottle is not touched.
//   * A refund never pours back: what was poured is gone. A void does — at the
//     till it comes straight after a refused payment, before anything is
//     poured.

import { pool } from '../db.js';
import { ExciseError, readExciseLabels } from './excise.js';
import { writeOffPostedTx } from './stock.service.js';

type DbClient = { query: typeof pool.query };

/** One stamped bottle a unit of something pours from. */
export interface BottleSource {
  variant_id: number;
  product_id: number;
  product_name: string;
  fiscal_register: number | null;
  fiscal_uktzed: string | null;
}

/**
 * For each variant asked about, the stamped bottles one unit of it pours from:
 * itself, when it is one, or the leaves of its recipe when it is assembled as
 * it sells (a `derived` composite). An `own` composite took its components
 * when it was made, and a bottle sold whole (`excise_per_unit`) has a stamp of
 * its own — neither pours.
 */
export async function bottleSourcesOf(
  client: DbClient,
  storeId: number,
  variantIds: readonly number[]
): Promise<Map<number, BottleSource[]>> {
  const out = new Map<number, BottleSource[]>();
  const ids = [...new Set(variantIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const result = await client.query(
    `SELECT a.id AS asked, b.id AS variant_id, bp.id AS product_id, bp.name AS product_name,
            bp.fiscal_register, bp.fiscal_uktzed
       FROM pos_variants a
       JOIN pos_products ap ON ap.id = a.product_id
       JOIN LATERAL (
         SELECT a.id AS leaf
         UNION
         SELECT f.leaf_variant_id
           FROM pos_product_components_flat f
          WHERE f.store_id = a.store_id AND f.variant_id = a.id
            AND ap.kind = 'composite' AND ap.stock_mode = 'derived'
       ) l ON TRUE
       JOIN pos_variants b ON b.id = l.leaf AND b.bottle_ml IS NOT NULL
       JOIN pos_products bp ON bp.id = b.product_id
      WHERE a.store_id = $1 AND a.id = ANY($2::bigint[]) AND NOT ap.excise_per_unit
      ORDER BY a.id, b.id`,
    [storeId, ids]
  );
  for (const row of result.rows) {
    const asked = Number(row.asked);
    const list = out.get(asked) ?? [];
    list.push({
      variant_id: Number(row.variant_id),
      product_id: Number(row.product_id),
      product_name: String(row.product_name),
      fiscal_register: row.fiscal_register == null ? null : Number(row.fiscal_register),
      fiscal_uktzed: (row.fiscal_uktzed as string | null) ?? null,
    });
    out.set(asked, list);
  }
  return out;
}

/** What each modifier answer writes off, when it writes off anything. */
async function modifierComponents(
  client: DbClient,
  storeId: number,
  modifierIds: readonly number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(modifierIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const result = await client.query(
    `SELECT m.id, m.component_variant_id
       FROM pos_modifiers m
      WHERE m.store_id = $1 AND m.id = ANY($2::bigint[]) AND m.component_variant_id IS NOT NULL`,
    [storeId, ids]
  );
  for (const row of result.rows) out.set(Number(row.id), Number(row.component_variant_id));
  return out;
}

/** A sale or bill line, as far as which bottles it pours from goes. */
export interface PouringLine {
  variant_id: number;
  /** The answers it chose — a «+ коньяк 20 мл» pours too (Д20). */
  modifiers?: readonly number[];
  /** A fired bill line: what it poured is its stock snapshot, not today's recipe. */
  bill_item_id?: number;
}

/**
 * The stamped bottles each line pours from, by its recipe and its answers
 * (Д20) — or, for a fired bill line, by what its round actually took. Empty
 * for a line that pours from none. Same order as `lines`.
 */
export async function bottlesOfLines(
  client: DbClient,
  storeId: number,
  lines: readonly PouringLine[]
): Promise<BottleSource[][]> {
  const billItemIds = lines.map((l) => l.bill_item_id).filter((id): id is number => id != null);
  const fromBill = new Map<number, BottleSource[]>();
  if (billItemIds.length > 0) {
    const result = await client.query(
      `SELECT c.bill_item_id, b.id AS variant_id, bp.id AS product_id, bp.name AS product_name,
              bp.fiscal_register, bp.fiscal_uktzed
         FROM pos_bill_item_components c
         JOIN pos_bill_items bi ON bi.id = c.bill_item_id
         JOIN pos_variants lv ON lv.id = bi.variant_id
         JOIN pos_products lp ON lp.id = lv.product_id
         JOIN pos_variants b ON b.id = c.component_variant_id AND b.bottle_ml IS NOT NULL
         JOIN pos_products bp ON bp.id = b.product_id
        WHERE c.store_id = $1 AND c.bill_item_id = ANY($2::bigint[]) AND NOT lp.excise_per_unit
        ORDER BY c.bill_item_id, b.id`,
      [storeId, billItemIds]
    );
    for (const row of result.rows) {
      const id = Number(row.bill_item_id);
      const list = fromBill.get(id) ?? [];
      list.push({
        variant_id: Number(row.variant_id),
        product_id: Number(row.product_id),
        product_name: String(row.product_name),
        fiscal_register: row.fiscal_register == null ? null : Number(row.fiscal_register),
        fiscal_uktzed: (row.fiscal_uktzed as string | null) ?? null,
      });
      fromBill.set(id, list);
    }
  }

  const live = lines.filter((l) => l.bill_item_id == null);
  const answerComponents = await modifierComponents(
    client,
    storeId,
    live.flatMap((l) => [...(l.modifiers ?? [])])
  );
  const sources = await bottleSourcesOf(client, storeId, [
    ...live.map((l) => l.variant_id),
    ...answerComponents.values(),
  ]);

  return lines.map((line) => {
    if (line.bill_item_id != null) return fromBill.get(line.bill_item_id) ?? [];
    const found = new Map<number, BottleSource>();
    for (const source of sources.get(line.variant_id) ?? []) found.set(source.variant_id, source);
    for (const modifierId of line.modifiers ?? []) {
      const component = answerComponents.get(modifierId);
      if (component == null) continue;
      for (const source of sources.get(component) ?? []) found.set(source.variant_id, source);
    }
    return [...found.values()];
  });
}

// ── Pouring ─────────────────────────────────────────────────────────────────

/** One bottle the till asked to open with this sale, by its stamp. */
export interface OpenBottleInput {
  variant_id: number;
  excise_label: string;
}

/**
 * The stamps a request names for bottles to open, by bottle variant, in the
 * order scanned. Refused in words when one is not a stamp or is named twice.
 */
export function readOpenBottles(raw: unknown): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (raw === undefined || raw === null) return out;
  if (!Array.isArray(raw)) {
    throw new ExciseError('Марки нових пляшок — це список', 'excise_label_invalid', 400);
  }
  const labels = readExciseLabels(
    raw.map((row) => (row as { excise_label?: unknown })?.excise_label),
    'Нова пляшка'
  );
  raw.forEach((row, index) => {
    const variantId = Number((row as { variant_id?: unknown })?.variant_id);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      throw new ExciseError('Нова пляшка: не вказано, яка', 'excise_label_invalid', 400);
    }
    out.set(variantId, [...(out.get(variantId) ?? []), labels[index]]);
  });
  return out;
}

/** The state of one sale's (or one round's) pouring, shared by all its lines. */
export interface PourContext {
  storeId: number;
  staffId: number | null;
  /**
   * `strict` — the till (Д4): a bottle that would have to be opened without
   * a stamp is counted, and `assertNoShortfall` refuses the sale afterwards.
   * `queue` — a table's round (Д18) or an offline replay: the rest waits for
   * the bar.
   */
  mode: 'strict' | 'queue';
  /** Stamps scanned for bottles to open, by bottle variant, still unused. */
  labels: Map<number, string[]>;
  /** Strict mode: how many bottles of each variant this sale lacks a stamp for. */
  shortfall: Map<number, number>;
  /** Strict mode: what is left in the bottles counted as missing, so the next pour counts on. */
  phantomRoom: Map<number, number>;
}

export function newPourContext(params: {
  storeId: number;
  staffId: number | null;
  mode: 'strict' | 'queue';
  labels?: Map<number, string[]>;
}): PourContext {
  return {
    storeId: params.storeId,
    staffId: params.staffId,
    mode: params.mode,
    labels: new Map([...(params.labels ?? new Map<number, string[]>()).entries()].map(([k, v]) => [k, [...v]])),
    shortfall: new Map(),
    phantomRoom: new Map(),
  };
}

/** Where a pour is written down. */
export type PourTarget = { saleItemId: number; billItemId?: never } | { billItemId: number; saleItemId?: never };

/**
 * Pour one line: every stamped bottle among what it consumed — its own
 * variant when it moved its own stock, and the leaves it took — for `quantity`
 * units. Called by `consumeStockForLine` after the stock moved.
 */
export async function pourLine(
  client: DbClient,
  ctx: PourContext,
  params: {
    target: PourTarget;
    variantId: number;
    quantity: number;
    self: boolean;
    leaves: ReadonlyArray<{ component_variant_id: number; quantity: number }>;
  }
): Promise<void> {
  const candidates = new Map<number, number>();
  if (params.self) candidates.set(params.variantId, params.quantity);
  for (const leaf of params.leaves) {
    candidates.set(
      leaf.component_variant_id,
      (candidates.get(leaf.component_variant_id) ?? 0) + leaf.quantity * params.quantity
    );
  }
  if (candidates.size === 0) return;
  const rows = await client.query(
    `SELECT v.id, v.bottle_ml, lp.excise_per_unit AS line_whole
       FROM pos_variants v
       JOIN pos_variants lv ON lv.id = $3
       JOIN pos_products lp ON lp.id = lv.product_id
      WHERE v.store_id = $1 AND v.id = ANY($2::bigint[]) AND v.bottle_ml IS NOT NULL
      ORDER BY v.id`,
    [ctx.storeId, [...candidates.keys()], params.variantId]
  );
  for (const row of rows.rows) {
    if (row.line_whole) return;
    const variantId = Number(row.id);
    await pourVariant(client, ctx, {
      target: params.target,
      variantId,
      capacity: Number(row.bottle_ml),
      ml: candidates.get(variantId)!,
    });
  }
}

async function pourVariant(
  client: DbClient,
  ctx: PourContext,
  params: { target: PourTarget; variantId: number; capacity: number; ml: number }
): Promise<void> {
  let left = params.ml;
  while (left > 0) {
    // Counting on into a bottle this sale already lacks a stamp for.
    const phantom = ctx.phantomRoom.get(params.variantId) ?? 0;
    if (phantom > 0) {
      const take = Math.min(phantom, left);
      ctx.phantomRoom.set(params.variantId, phantom - take);
      left -= take;
      continue;
    }

    const open = await client.query(
      `SELECT id, capacity_ml, poured_ml, label_pending
         FROM pos_open_bottles
        WHERE store_id = $1 AND variant_id = $2 AND closed_at IS NULL
        FOR UPDATE`,
      [ctx.storeId, params.variantId]
    );
    const bottle = open.rows[0];
    if (bottle) {
      const room = Number(bottle.capacity_ml) - Number(bottle.poured_ml);
      if (room > 0) {
        const take = Math.min(room, left);
        await recordPour(client, ctx, {
          target: params.target,
          variantId: params.variantId,
          bottleId: Number(bottle.id),
          ml: take,
          carries: bottle.label_pending === true,
        });
        await client.query(
          `UPDATE pos_open_bottles
              SET poured_ml = poured_ml + $2,
                  label_pending = FALSE,
                  closed_at = CASE WHEN poured_ml + $2 >= capacity_ml THEN NOW() ELSE NULL END,
                  close_reason = CASE WHEN poured_ml + $2 >= capacity_ml THEN 'empty' ELSE NULL END,
                  closed_by = CASE WHEN poured_ml + $2 >= capacity_ml THEN $3::bigint ELSE NULL END
            WHERE id = $1`,
          [Number(bottle.id), take, ctx.staffId]
        );
        left -= take;
        continue;
      }
      // A full bottle left open (never by this code): close it before the next.
      await client.query(
        `UPDATE pos_open_bottles SET closed_at = NOW(), close_reason = 'empty', closed_by = $2 WHERE id = $1`,
        [Number(bottle.id), ctx.staffId]
      );
    }

    // The bottle is finished: the next one opens by its stamp.
    const label = ctx.labels.get(params.variantId)?.shift();
    if (label) {
      await openBottleTx(client, {
        storeId: ctx.storeId,
        staffId: ctx.staffId,
        variantId: params.variantId,
        label,
        capacity: params.capacity,
      });
      continue;
    }
    if (ctx.mode === 'strict') {
      ctx.shortfall.set(params.variantId, (ctx.shortfall.get(params.variantId) ?? 0) + 1);
      ctx.phantomRoom.set(params.variantId, params.capacity);
      continue;
    }
    // A table's round or an offline replay: the rest waits for the bar.
    await recordPour(client, ctx, {
      target: params.target,
      variantId: params.variantId,
      bottleId: null,
      ml: left,
      carries: false,
    });
    left = 0;
  }
}

async function recordPour(
  client: DbClient,
  ctx: PourContext,
  params: { target: PourTarget; variantId: number; bottleId: number | null; ml: number; carries: boolean }
): Promise<void> {
  await client.query(
    `INSERT INTO pos_bottle_pours
       (store_id, variant_id, bottle_id, sale_item_id, bill_item_id, ml, carries_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ctx.storeId,
      params.variantId,
      params.bottleId,
      params.target.saleItemId ?? null,
      params.target.billItemId ?? null,
      params.ml,
      params.carries,
    ]
  );
}

/**
 * Open a bottle by its stamp, inside the caller's transaction, and give it
 * the pours that were waiting for it, oldest first. The stamp is claimed in
 * `pos_excise_labels` so it can never also sell as a whole bottle; a stamp
 * already sold, or a bottle another till opened a moment ago, is refused in
 * words.
 */
export async function openBottleTx(
  client: DbClient,
  params: { storeId: number; staffId: number | null; variantId: number; label: string; capacity: number }
): Promise<number> {
  let bottleId: number;
  try {
    const opened = await client.query(
      `INSERT INTO pos_open_bottles (store_id, variant_id, label, capacity_ml, opened_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [params.storeId, params.variantId, params.label, params.capacity, params.staffId]
    );
    bottleId = Number(opened.rows[0].id);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ExciseError(
        'Цю пляшку щойно відкрили на іншій касі — повторіть оплату',
        'bottle_opened_elsewhere',
        409,
        { variant_id: params.variantId }
      );
    }
    throw error;
  }
  const claimed = await client.query(
    `INSERT INTO pos_excise_labels (store_id, label, open_bottle_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id, label) WHERE released_at IS NULL DO NOTHING
     RETURNING id`,
    [params.storeId, params.label, bottleId, params.staffId]
  );
  if ((claimed.rowCount ?? 0) === 0) {
    throw new ExciseError(
      `Марку ${params.label} уже використано — це інша пляшка? Скануйте марку тієї, що відкриваєте`,
      'excise_label_taken',
      409,
      { label: params.label }
    );
  }

  // The pours that waited for this bottle (a table's rounds, Д18), oldest
  // first. One that does not fit keeps its rest waiting for the next stamp.
  const waiting = await client.query(
    `SELECT id, ml FROM pos_bottle_pours
      WHERE store_id = $1 AND variant_id = $2 AND bottle_id IS NULL AND undone_at IS NULL
      ORDER BY id
      FOR UPDATE`,
    [params.storeId, params.variantId]
  );
  let room = params.capacity;
  let pending = true;
  for (const row of waiting.rows) {
    if (room <= 0) break;
    const ml = Number(row.ml);
    if (ml <= room) {
      await client.query(
        `UPDATE pos_bottle_pours SET bottle_id = $2, carries_label = $3 WHERE id = $1`,
        [Number(row.id), bottleId, pending]
      );
      room -= ml;
    } else {
      // Split: the part that fits pours from this bottle, the rest keeps waiting.
      await client.query(
        `INSERT INTO pos_bottle_pours
           (store_id, variant_id, bottle_id, sale_item_id, bill_item_id, ml, carries_label)
         SELECT store_id, variant_id, $2, sale_item_id, bill_item_id, $3, $4
           FROM pos_bottle_pours WHERE id = $1`,
        [Number(row.id), bottleId, room, pending]
      );
      await client.query(`UPDATE pos_bottle_pours SET ml = ml - $2 WHERE id = $1`, [Number(row.id), room]);
      room = 0;
    }
    pending = false;
  }
  const poured = params.capacity - room;
  if (poured > 0) {
    await client.query(
      `UPDATE pos_open_bottles
          SET poured_ml = $2, label_pending = FALSE,
              closed_at = CASE WHEN $2 >= capacity_ml THEN NOW() ELSE NULL END,
              close_reason = CASE WHEN $2 >= capacity_ml THEN 'empty' ELSE NULL END,
              closed_by = CASE WHEN $2 >= capacity_ml THEN $3::bigint ELSE NULL END
        WHERE id = $1`,
      [bottleId, poured, params.staffId]
    );
  }
  return bottleId;
}

/**
 * Refuse a till sale that would open a bottle it has no stamp for (Д4). Every
 * bottle the sale lacks is named at once, so the till asks for all of them in
 * one sheet rather than one refusal at a time.
 */
export async function assertNoShortfall(client: DbClient, ctx: PourContext): Promise<void> {
  if (ctx.shortfall.size === 0) return;
  const names = await client.query(
    `SELECT v.id, p.name AS product_name, v.label
       FROM pos_variants v JOIN pos_products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])`,
    [ctx.storeId, [...ctx.shortfall.keys()]]
  );
  const byId = new Map(names.rows.map((row) => [Number(row.id), row]));
  const bottles = [...ctx.shortfall.entries()].map(([variantId, count]) => {
    const row = byId.get(variantId);
    const label = String(row?.label ?? '').trim();
    const name = `${row?.product_name ?? 'Пляшка'}${label ? ` · ${label}` : ''}`;
    return { variant_id: variantId, product_name: name, count };
  });
  const words = bottles
    .map((b) => (b.count > 1 ? `«${b.product_name}» — ${b.count} пляшки` : `«${b.product_name}»`))
    .join(', ');
  throw new ExciseError(
    `Відкрийте нову пляшку: ${words} — скануйте її акцизну марку`,
    'bottle_needed',
    409,
    { bottles }
  );
}

// ── Undoing ─────────────────────────────────────────────────────────────────

/**
 * A voided receipt poured nothing (a refused payment at the till comes before
 * the bartender pours): its millilitres go back into their bottles while they
 * are open, and a stamp it carried goes to the next pour from that bottle.
 */
export async function undoSalePours(client: DbClient, storeId: number, saleId: number): Promise<void> {
  const pours = await client.query(
    `UPDATE pos_bottle_pours bp SET undone_at = NOW()
       FROM pos_sale_items si
      WHERE si.id = bp.sale_item_id AND si.sale_id = $2 AND bp.store_id = $1 AND bp.undone_at IS NULL
      RETURNING bp.bottle_id, bp.ml, bp.carries_label`,
    [storeId, saleId]
  );
  await giveBack(client, pours.rows, { ml: true });
}

/**
 * A line returned whole no longer stands: the stamp it carried goes on the
 * return receipt and to the next pour from that bottle. Nothing is poured
 * back — what was poured is gone.
 */
export async function returnLinePours(
  client: DbClient,
  params: { storeId: number; saleItemId: number; refundId: number }
): Promise<void> {
  const pours = await client.query(
    `UPDATE pos_bottle_pours SET undone_at = NOW(), refund_id = CASE WHEN carries_label THEN $3::bigint END
      WHERE store_id = $1 AND sale_item_id = $2 AND undone_at IS NULL
      RETURNING bottle_id, ml, carries_label`,
    [params.storeId, params.saleItemId, params.refundId]
  );
  await giveBack(client, pours.rows, { ml: false });
}

async function giveBack(
  client: DbClient,
  rows: ReadonlyArray<Record<string, unknown>>,
  what: { ml: boolean }
): Promise<void> {
  for (const row of rows) {
    if (row.bottle_id == null) continue;
    await client.query(
      `UPDATE pos_open_bottles
          SET poured_ml = GREATEST(0, poured_ml - $2),
              label_pending = label_pending OR $3
        WHERE id = $1 AND closed_at IS NULL`,
      [Number(row.bottle_id), what.ml ? Number(row.ml) : 0, row.carries_label === true]
    );
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Per sale line: the bottles' stamps it carries (for the receipt and its
 * ПРРО document), whether it pours from a stamped bottle at all (Д20: such a
 * line is excise goods) and the УКТ ЗЕД of the one bottle it pours from.
 * `refundId` narrows the stamps to those a return gives back.
 */
export async function pourFactsOfSale(
  client: DbClient,
  storeId: number,
  saleId: number,
  refundId?: number
): Promise<Map<number, { labels: string[]; pours: boolean; uktzed: string | null }>> {
  const result = await client.query(
    `SELECT bp.sale_item_id, bp.carries_label, bp.refund_id, ob.label, p.fiscal_uktzed, bp.variant_id
       FROM pos_bottle_pours bp
       JOIN pos_sale_items si ON si.id = bp.sale_item_id
       JOIN pos_variants v ON v.id = bp.variant_id
       JOIN pos_products p ON p.id = v.product_id
       LEFT JOIN pos_open_bottles ob ON ob.id = bp.bottle_id
      WHERE si.sale_id = $1 AND bp.store_id = $2
      ORDER BY bp.id`,
    [saleId, storeId]
  );
  const out = new Map<number, { labels: string[]; pours: boolean; uktzed: string | null }>();
  const variantsOf = new Map<number, Set<number>>();
  for (const row of result.rows) {
    const id = Number(row.sale_item_id);
    const facts = out.get(id) ?? { labels: [], pours: true, uktzed: null };
    const variants = variantsOf.get(id) ?? new Set<number>();
    variants.add(Number(row.variant_id));
    variantsOf.set(id, variants);
    facts.uktzed = variants.size === 1 ? ((row.fiscal_uktzed as string | null) ?? null) : null;
    const counts = refundId == null || Number(row.refund_id) === refundId;
    if (row.carries_label && row.label && counts && !facts.labels.includes(String(row.label))) {
      facts.labels.push(String(row.label));
    }
    out.set(id, facts);
  }
  return out;
}

// ── A table's bill (ДК5-Б, Д18) ─────────────────────────────────────────────

/**
 * A cancelled round poured nothing: its millilitres go back into their
 * bottles while they are open, a stamp one of its pours carried goes to the
 * next pour, and its pours still waiting for the bar stop waiting.
 */
export async function undoRoundPours(client: DbClient, storeId: number, roundId: number): Promise<void> {
  const pours = await client.query(
    `UPDATE pos_bottle_pours bp SET undone_at = NOW()
       FROM pos_bill_items bi
      WHERE bi.id = bp.bill_item_id AND bi.round_id = $2 AND bp.store_id = $1
        AND bp.undone_at IS NULL AND bp.sale_item_id IS NULL
      RETURNING bp.bottle_id, bp.ml, bp.carries_label`,
    [storeId, roundId]
  );
  await giveBack(client, pours.rows, { ml: true });
}

/** A table's line is paid: what it poured now belongs to the receipt line that paid it. */
export async function movePoursToSale(
  client: DbClient,
  storeId: number,
  billItemId: number,
  saleItemId: number
): Promise<void> {
  await client.query(
    `UPDATE pos_bottle_pours SET sale_item_id = $3
      WHERE store_id = $1 AND bill_item_id = $2 AND sale_item_id IS NULL AND undone_at IS NULL`,
    [storeId, billItemId, saleItemId]
  );
}

/** A table's receipt is voided: its lines are owed for again, and so are their pours. */
export async function detachPoursFromSale(client: DbClient, storeId: number, saleId: number): Promise<void> {
  await client.query(
    `UPDATE pos_bottle_pours SET sale_item_id = NULL
      WHERE store_id = $1 AND bill_item_id IS NOT NULL
        AND sale_item_id IN (SELECT id FROM pos_sale_items WHERE sale_id = $2)`,
    [storeId, saleId]
  );
}

/**
 * A table's dish whose pour still waits for the bar to scan the next
 * bottle's stamp cannot be paid yet (Д18): the receipt that pays it would be
 * the first sale from that bottle, and must carry the stamp.
 */
export async function assertNoWaitingPours(
  client: DbClient,
  storeId: number,
  billItemIds: readonly number[]
): Promise<void> {
  if (billItemIds.length === 0) return;
  const waiting = await client.query(
    `SELECT bp.bill_item_id, p.name AS bottle_name
       FROM pos_bottle_pours bp
       JOIN pos_variants v ON v.id = bp.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE bp.store_id = $1 AND bp.bill_item_id = ANY($2::bigint[])
        AND bp.bottle_id IS NULL AND bp.undone_at IS NULL
      ORDER BY bp.id
      LIMIT 1`,
    [storeId, [...billItemIds]]
  );
  const row = waiting.rows[0];
  if (!row) return;
  throw new ExciseError(
    `Бар ще не відсканував марку нової пляшки «${row.bottle_name}» — оплатити можна, щойно її відкриють`,
    'bottle_pending',
    409,
    { item_id: Number(row.bill_item_id) }
  );
}

// ── The bar (ДК5-Б) ─────────────────────────────────────────────────────────

export interface OpenBottleView {
  id: number;
  variant_id: number;
  product_name: string;
  label: string;
  capacity_ml: number;
  poured_ml: number;
  opened_at: string;
}

export interface WaitingBottleView {
  variant_id: number;
  product_name: string;
  /** What waits to be poured from the next bottle. */
  ml: number;
  bottle_ml: number;
  /** The tables whose dishes wait for it. */
  tables: string[];
}

export interface ClosedBottleView extends OpenBottleView {
  closed_at: string;
  close_reason: 'empty' | 'replaced' | 'broken';
  /** Positive: less was in it than counted (written off); negative: more was left than counted. */
  discrepancy_ml: number | null;
  note: string | null;
}

function bottleView(row: Record<string, unknown>): OpenBottleView {
  return {
    id: Number(row.id),
    variant_id: Number(row.variant_id),
    product_name: String(row.product_name),
    label: String(row.label),
    capacity_ml: Number(row.capacity_ml),
    poured_ml: Number(row.poured_ml),
    opened_at: new Date(row.opened_at as string).toISOString(),
  };
}

function closedView(row: Record<string, unknown>): ClosedBottleView {
  return {
    ...bottleView(row),
    closed_at: new Date(row.closed_at as string).toISOString(),
    close_reason: row.close_reason as ClosedBottleView['close_reason'],
    discrepancy_ml: row.discrepancy_ml == null ? null : Number(row.discrepancy_ml),
    note: (row.note as string | null) ?? null,
  };
}

const BOTTLE_COLUMNS = `b.id, b.variant_id, b.label, b.capacity_ml, b.poured_ml, b.opened_at,
       b.closed_at, b.close_reason, b.discrepancy_ml, b.note,
       p.name || CASE WHEN COALESCE(v.label, '') <> '' THEN ' · ' || v.label ELSE '' END AS product_name`;

/**
 * What the bar sees: the open bottles, the pours waiting for a stamp (and
 * whose tables), and what closed since `since` (default: the last day).
 */
export async function listBottles(
  storeId: number,
  since?: Date
): Promise<{ open: OpenBottleView[]; waiting: WaitingBottleView[]; closed: ClosedBottleView[] }> {
  const open = await pool.query(
    `SELECT ${BOTTLE_COLUMNS}
       FROM pos_open_bottles b
       JOIN pos_variants v ON v.id = b.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE b.store_id = $1 AND b.closed_at IS NULL
      ORDER BY p.name, b.id`,
    [storeId]
  );
  const waiting = await pool.query(
    `SELECT bp.variant_id, v.bottle_ml,
            p.name || CASE WHEN COALESCE(v.label, '') <> '' THEN ' · ' || v.label ELSE '' END AS product_name,
            SUM(bp.ml)::int AS ml,
            array_remove(array_agg(DISTINCT t.name), NULL) AS tables
       FROM pos_bottle_pours bp
       JOIN pos_variants v ON v.id = bp.variant_id
       JOIN pos_products p ON p.id = v.product_id
       LEFT JOIN pos_bill_items bi ON bi.id = bp.bill_item_id
       LEFT JOIN pos_bills bl ON bl.id = bi.bill_id
       LEFT JOIN pos_tables t ON t.id = bl.table_id
      WHERE bp.store_id = $1 AND bp.bottle_id IS NULL AND bp.undone_at IS NULL
      GROUP BY bp.variant_id, v.bottle_ml, p.name, v.label
      ORDER BY MIN(bp.id)`,
    [storeId]
  );
  const closed = await pool.query(
    `SELECT ${BOTTLE_COLUMNS}
       FROM pos_open_bottles b
       JOIN pos_variants v ON v.id = b.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE b.store_id = $1 AND b.closed_at IS NOT NULL AND b.closed_at >= $2
      ORDER BY b.closed_at DESC
      LIMIT 200`,
    [storeId, since ?? new Date(Date.now() - 86_400_000)]
  );
  return {
    open: open.rows.map(bottleView),
    waiting: waiting.rows.map((row) => ({
      variant_id: Number(row.variant_id),
      product_name: String(row.product_name),
      ml: Number(row.ml),
      bottle_ml: Number(row.bottle_ml),
      tables: ((row.tables as unknown[] | null) ?? []).map(String).sort(),
    })),
    closed: closed.rows.map(closedView),
  };
}

/** The owner's report: closed bottles in a window and what the discrepancies came to, per drink. */
export async function bottleReport(
  storeId: number,
  from: Date,
  to: Date
): Promise<{
  closed: ClosedBottleView[];
  totals: Array<{ variant_id: number; product_name: string; bottles: number; missing_ml: number; left_ml: number }>;
}> {
  const closed = await pool.query(
    `SELECT ${BOTTLE_COLUMNS}
       FROM pos_open_bottles b
       JOIN pos_variants v ON v.id = b.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE b.store_id = $1 AND b.closed_at >= $2 AND b.closed_at < $3
      ORDER BY b.closed_at DESC
      LIMIT 1000`,
    [storeId, from, to]
  );
  const views = closed.rows.map(closedView);
  const totals = new Map<number, { variant_id: number; product_name: string; bottles: number; missing_ml: number; left_ml: number }>();
  for (const bottle of views) {
    const row = totals.get(bottle.variant_id) ?? {
      variant_id: bottle.variant_id,
      product_name: bottle.product_name,
      bottles: 0,
      missing_ml: 0,
      left_ml: 0,
    };
    row.bottles += 1;
    const d = bottle.discrepancy_ml ?? 0;
    if (d > 0) row.missing_ml += d;
    if (d < 0) row.left_ml += -d;
    totals.set(bottle.variant_id, row);
  }
  return { closed: views, totals: [...totals.values()] };
}

export class BottleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400
  ) {
    super(message);
    this.name = 'BottleError';
  }
}

async function bottleVariant(client: DbClient, storeId: number, variantId: number): Promise<number> {
  const row = await client.query(`SELECT bottle_ml FROM pos_variants WHERE store_id = $1 AND id = $2`, [
    storeId,
    variantId,
  ]);
  if (row.rows.length === 0) throw new BottleError('Товар не знайдено', 404);
  if (row.rows[0].bottle_ml == null) {
    throw new BottleError('Цей товар не відкривають за маркою — у картці не вказано «Пляшка за маркою, мл»');
  }
  return Number(row.rows[0].bottle_ml);
}

/**
 * Close the open bottle of a variant before its count is up, writing off what
 * the count says was still in it — it is not on the shelf (a bottle that ran
 * out early, a broken one).
 */
async function closeEarlyTx(
  client: DbClient,
  params: {
    storeId: number;
    staffId: number;
    bottleId: number;
    reason: 'replaced' | 'broken';
    note: string | null;
  }
): Promise<void> {
  const found = await client.query(
    `SELECT b.id, b.variant_id, b.label, b.capacity_ml, b.poured_ml, b.closed_at, p.name
       FROM pos_open_bottles b
       JOIN pos_variants v ON v.id = b.variant_id
       JOIN pos_products p ON p.id = v.product_id
      WHERE b.store_id = $1 AND b.id = $2
      FOR UPDATE OF b`,
    [params.storeId, params.bottleId]
  );
  const bottle = found.rows[0];
  if (!bottle) throw new BottleError('Пляшку не знайдено', 404);
  if (bottle.closed_at != null) throw new BottleError('Цю пляшку вже закрито', 409);
  const rest = Number(bottle.capacity_ml) - Number(bottle.poured_ml);
  await client.query(
    `UPDATE pos_open_bottles
        SET closed_at = NOW(), closed_by = $2, close_reason = $3, discrepancy_ml = $4, note = $5
      WHERE id = $1`,
    [params.bottleId, params.staffId, params.reason, rest, params.note]
  );
  if (rest > 0) {
    await writeOffPostedTx(client, {
      storeId: params.storeId,
      staffId: params.staffId,
      reasonCode: params.reason === 'broken' ? 'damaged' : 'lost',
      note: `${params.reason === 'broken' ? 'Розбилась пляшка' : 'Розбіжність розливу'}: ${bottle.name}, марка ${bottle.label}${
        params.note ? ` — ${params.note}` : ''
      }`,
      clientUuid: null,
      lines: [{ variantId: Number(bottle.variant_id), quantity: rest }],
    });
  }
}

/**
 * The bar scans a new bottle's stamp. With no bottle of that drink open it
 * simply opens, filling the pours that waited for it (Д18). With one still
 * open the bar must say why it is starting another — `replace` (the old one
 * ran out before the count) closes the old one with the difference written
 * off. Scanning the stamp of the bottle already open again is a no-op.
 */
export async function openAtBar(params: {
  storeId: number;
  staffId: number;
  variantId: number;
  label: unknown;
  replace?: boolean;
  note?: string | null;
}): Promise<{ bottle_id: number; replayed: boolean }> {
  const [label] = readExciseLabels([params.label], 'Марка пляшки');
  if (!label) throw new BottleError('Скануйте акцизну марку пляшки');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const capacity = await bottleVariant(client, params.storeId, params.variantId);
    const same = await client.query(
      `SELECT b.id FROM pos_open_bottles b
        WHERE b.store_id = $1 AND b.variant_id = $2 AND b.label = $3
        ORDER BY b.id DESC LIMIT 1`,
      [params.storeId, params.variantId, label]
    );
    if (same.rows.length > 0) {
      await client.query('ROLLBACK');
      return { bottle_id: Number(same.rows[0].id), replayed: true };
    }
    const open = await client.query(
      `SELECT id FROM pos_open_bottles WHERE store_id = $1 AND variant_id = $2 AND closed_at IS NULL FOR UPDATE`,
      [params.storeId, params.variantId]
    );
    if (open.rows.length > 0) {
      if (!params.replace) {
        throw new BottleError(
          'Попередня пляшка ще відкрита — якщо в ній порожньо, натисніть «Замінити»: різницю буде списано',
          409
        );
      }
      await closeEarlyTx(client, {
        storeId: params.storeId,
        staffId: params.staffId,
        bottleId: Number(open.rows[0].id),
        reason: 'replaced',
        note: params.note?.trim() || null,
      });
    }
    const bottleId = await openBottleTx(client, {
      storeId: params.storeId,
      staffId: params.staffId,
      variantId: params.variantId,
      label,
      capacity,
    });
    await client.query('COMMIT');
    return { bottle_id: bottleId, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** A bottle broke: closed, and what the count says was in it written off as damaged. */
export async function closeBroken(params: {
  storeId: number;
  staffId: number;
  bottleId: number;
  note?: string | null;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await closeEarlyTx(client, {
      storeId: params.storeId,
      staffId: params.staffId,
      bottleId: params.bottleId,
      reason: 'broken',
      note: params.note?.trim() || null,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Something was still in a bottle the count closed as empty (Д19): written
 * down as a discrepancy for the owner, stock untouched — the count already
 * took it, and the new bottle is the one being poured.
 */
export async function recordLeftover(params: {
  storeId: number;
  staffId: number;
  bottleId: number;
  ml: unknown;
}): Promise<void> {
  const ml = Number(params.ml);
  if (!Number.isInteger(ml) || ml <= 0 || ml > 100000) throw new BottleError('Залишок — ціле число мл');
  const updated = await pool.query(
    `UPDATE pos_open_bottles SET discrepancy_ml = $3
      WHERE store_id = $1 AND id = $2 AND close_reason = 'empty' AND $3 <= capacity_ml
      RETURNING id`,
    [params.storeId, params.bottleId, -ml]
  );
  if ((updated.rowCount ?? 0) === 0) {
    throw new BottleError('Залишок записують лише для пляшки, яку лічильник закрив як порожню', 409);
  }
}
