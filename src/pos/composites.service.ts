// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/composites.service.ts — composite products (bouquets, tech cards).
//
// A composite variant is assembled from other variants. Where its stock comes
// from is `pos_products.stock_mode`:
//   'own'     — assembled in advance and counted on its own `pos_stock` row.
//               Selling it must NOT touch the components: the production
//               document already wrote them off.
//   'derived' — assembled when it sells. It has no stock of its own; its
//               availability is the components', and selling it writes them off.
//
// The one rule that keeps this auditable: what a sale consumed is SNAPSHOTTED
// into `pos_sale_item_components` at checkout, and a void/refund reverses that
// snapshot rather than re-deriving from the (editable) catalogue composition.
// The snapshot's existence is also the signal — a reversal never needs to look
// up the mode, so write-off and reversal cannot drift apart.

import { pool } from '../db.js';
import { applyStockDelta } from './stock.service.js';
import type { StockReason } from './types.js';

type DbClient = { query: typeof pool.query };

/** One line of a composite's composition, as the admin edits it. */
export interface ComponentInput {
  component_variant_id: number;
  /** In the component variant's own unit. INTEGER, like every other quantity. */
  quantity: number;
}

/** One line of a composition, resolved for display. */
export interface ComponentRow extends ComponentInput {
  id: number;
  sort_order: number;
  product_name: string;
  label: string;
  unit: string;
}

export class CompositeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositeError';
  }
}

/** A derived composite with nothing in it would sell goods out of thin air. */
export class EmptyCompositionError extends CompositeError {
  constructor(public readonly variantId: number) {
    super(`Composite variant ${variantId} has no composition`);
    this.name = 'EmptyCompositionError';
  }
}

interface StockShape {
  kind: 'simple' | 'composite';
  stock_mode: 'own' | 'derived';
}

async function loadStockShape(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<StockShape> {
  const result = await client.query(
    `SELECT p.kind, p.stock_mode
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE v.id = $1 AND v.store_id = $2`,
    [variantId, storeId]
  );
  if (result.rows.length === 0) throw new CompositeError(`Variant ${variantId} not found`);
  return {
    kind: result.rows[0].kind === 'composite' ? 'composite' : 'simple',
    stock_mode: result.rows[0].stock_mode === 'derived' ? 'derived' : 'own',
  };
}

/**
 * True when the variant's own `pos_stock` row is NOT where its quantity lives.
 * Such a variant may not be received, adjusted, written off or counted — the
 * components are what a stocktake counts.
 */
export async function isDerivedComposite(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<boolean> {
  const shape = await loadStockShape(client, storeId, variantId);
  return shape.kind === 'composite' && shape.stock_mode === 'derived';
}

/** Throws unless the variant's quantity is its own `pos_stock` row. */
export async function assertStockable(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<void> {
  if (await isDerivedComposite(client, storeId, variantId)) {
    throw new CompositeError(
      `Variant ${variantId} is a derived composite — adjust its components instead`
    );
  }
}

/**
 * Every composition in the store, keyed by the composite variant — one query
 * for the whole admin product list rather than one per bouquet.
 */
/**
 * Throws unless the variant is a composite assembled in advance — the only
 * thing a production document can make.
 */
export async function assertProducible(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<void> {
  const shape = await loadStockShape(client, storeId, variantId);
  if (shape.kind !== 'composite') {
    throw new CompositeError(`Variant ${variantId} is not a composite`);
  }
  if (shape.stock_mode !== 'own') {
    throw new CompositeError(
      `Variant ${variantId} is assembled when it sells — nothing to produce`
    );
  }
}

export async function listComponentsForStore(
  storeId: number,
  client: DbClient = pool
): Promise<Map<number, ComponentRow[]>> {
  const result = await client.query(
    `SELECT c.id, c.variant_id, c.component_variant_id, c.quantity, c.sort_order,
            p.name AS product_name, v.label, v.unit
     FROM pos_product_components c
     JOIN pos_variants v ON v.id = c.component_variant_id
     JOIN pos_products p ON p.id = v.product_id
     WHERE c.store_id = $1
     ORDER BY c.variant_id ASC, c.sort_order ASC, c.id ASC`,
    [storeId]
  );
  const byVariant = new Map<number, ComponentRow[]>();
  for (const row of result.rows) {
    const variantId = Number(row.variant_id);
    const list = byVariant.get(variantId) ?? [];
    list.push({
      id: Number(row.id),
      component_variant_id: Number(row.component_variant_id),
      quantity: Number(row.quantity),
      sort_order: Number(row.sort_order),
      product_name: row.product_name,
      label: row.label ?? '',
      unit: row.unit ?? '',
    });
    byVariant.set(variantId, list);
  }
  return byVariant;
}

/**
 * Replace a composite variant's composition wholesale — same "an update
 * replaces the bag" rule as variant attributes, so removing a component is
 * expressible.
 *
 * One level deep on purpose: a component may not itself be composite, which
 * makes cycles impossible without a recursive check. Nested semi-finished
 * products are the café phase (TechDocs/POS_VERTICALS.md §7).
 */
export async function setComponents(
  client: DbClient,
  storeId: number,
  variantId: number,
  components: ComponentInput[]
): Promise<void> {
  const seen = new Set<number>();
  const rows: ComponentInput[] = [];
  for (const raw of components) {
    const componentVariantId = Number(raw?.component_variant_id);
    const quantity = Number(raw?.quantity);
    if (!Number.isInteger(componentVariantId) || componentVariantId <= 0) {
      throw new CompositeError('component_variant_id must be a positive integer');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CompositeError('component quantity must be a positive integer');
    }
    if (componentVariantId === variantId) {
      throw new CompositeError('A composite cannot contain itself');
    }
    if (seen.has(componentVariantId)) {
      throw new CompositeError(`Component ${componentVariantId} listed twice`);
    }
    seen.add(componentVariantId);
    rows.push({ component_variant_id: componentVariantId, quantity });
  }

  if (rows.length > 0) {
    const ids = rows.map((row) => row.component_variant_id);
    const check = await client.query(
      `SELECT v.id, p.kind
       FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])`,
      [storeId, ids]
    );
    const found = new Map<number, string>(
      check.rows.map((row: { id: string | number; kind: string }) => [Number(row.id), row.kind])
    );
    for (const id of ids) {
      const kind = found.get(id);
      if (kind === undefined) throw new CompositeError(`Component variant ${id} not found`);
      if (kind === 'composite') {
        throw new CompositeError(`Component variant ${id} is itself composite`);
      }
    }
  }

  await client.query(
    `DELETE FROM pos_product_components WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  for (const [index, row] of rows.entries()) {
    await client.query(
      `INSERT INTO pos_product_components
         (store_id, variant_id, component_variant_id, quantity, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [storeId, variantId, row.component_variant_id, row.quantity, index]
    );
  }
}

/**
 * How many whole composites the components allow, for a derived composite.
 * An empty composition is 0 available, never "unlimited".
 */
export async function derivedAvailability(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<number> {
  const result = await client.query(
    `SELECT MIN(FLOOR(COALESCE(cs.quantity, 0)::numeric / c.quantity))::int AS qty
     FROM pos_product_components c
     LEFT JOIN pos_stock cs
       ON cs.variant_id = c.component_variant_id AND cs.store_id = c.store_id
     WHERE c.store_id = $1 AND c.variant_id = $2`,
    [storeId, variantId]
  );
  const qty = result.rows[0]?.qty;
  return qty == null ? 0 : Number(qty);
}

/**
 * Write off stock for one completed sale line.
 *
 * `own` (and every simple product) moves its own stock row exactly as before.
 * `derived` snapshots the composition onto the sale line and moves the
 * components instead — same reason and reference as a plain sale, so the
 * movement report still totals stems sold whether they left loose or in a
 * bouquet.
 */
export async function consumeStockForSaleItem(
  client: DbClient,
  params: {
    storeId: number;
    saleId: number;
    saleItemId: number;
    variantId: number;
    quantity: number;
    staffId: number;
  }
): Promise<void> {
  const shape = await loadStockShape(client, params.storeId, params.variantId);
  if (!(shape.kind === 'composite' && shape.stock_mode === 'derived')) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: -params.quantity,
      reason: 'sale',
      staffId: params.staffId,
      referenceType: 'sale',
      referenceId: params.saleId,
    });
    return;
  }

  const composition = await client.query(
    `SELECT component_variant_id, quantity, sort_order
     FROM pos_product_components
     WHERE store_id = $1 AND variant_id = $2
     ORDER BY sort_order ASC, id ASC`,
    [params.storeId, params.variantId]
  );
  if (composition.rows.length === 0) throw new EmptyCompositionError(params.variantId);

  for (const [index, row] of composition.rows.entries()) {
    const componentVariantId = Number(row.component_variant_id);
    const perUnit = Number(row.quantity);
    await client.query(
      `INSERT INTO pos_sale_item_components
         (store_id, sale_item_id, component_variant_id, quantity_per_unit, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.storeId, params.saleItemId, componentVariantId, perUnit, index]
    );
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: componentVariantId,
      delta: -perUnit * params.quantity,
      reason: 'sale',
      staffId: params.staffId,
      referenceType: 'sale',
      referenceId: params.saleId,
      note: `Складник: варіант ${params.variantId}`,
    });
  }
}

/**
 * Give back what a sale line took, for a void or a refund.
 *
 * Driven entirely by the checkout snapshot: rows present means the line took
 * components, none means it took the variant's own stock. A composition edited
 * between the sale and the refund therefore cannot return stems the customer
 * never got.
 */
export async function returnStockForSaleItem(
  client: DbClient,
  params: {
    storeId: number;
    saleItemId: number;
    variantId: number;
    quantity: number;
    reason: Extract<StockReason, 'void' | 'refund'>;
    staffId: number;
    referenceType: string;
    referenceId: number;
  }
): Promise<void> {
  const snapshot = await client.query(
    `SELECT component_variant_id, quantity_per_unit
     FROM pos_sale_item_components
     WHERE store_id = $1 AND sale_item_id = $2
     ORDER BY sort_order ASC, id ASC`,
    [params.storeId, params.saleItemId]
  );

  if (snapshot.rows.length === 0) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: params.quantity,
      reason: params.reason,
      staffId: params.staffId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    });
    return;
  }

  for (const row of snapshot.rows) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: Number(row.component_variant_id),
      delta: Number(row.quantity_per_unit) * params.quantity,
      reason: params.reason,
      staffId: params.staffId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: `Складник: варіант ${params.variantId}`,
    });
  }
}

/**
 * Assemble `quantity` of a composite from its components.
 *
 * The other half of `stock_mode: 'own'`: the production document takes the
 * stems off the shelf and puts assembled bouquets on it, so that selling one
 * later is a plain stock move that must NOT touch the components again.
 *
 * Returns the assembled unit cost, summed from the components — a bouquet's
 * cost is its stems', and nobody should have to type it in.
 */
export async function produceComposite(
  client: DbClient,
  params: {
    storeId: number;
    variantId: number;
    quantity: number;
    staffId: number;
    referenceType: string;
    referenceId: number;
    note?: string | null;
    occurredAt?: Date | string;
  }
): Promise<{ unitCostCents: number }> {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new CompositeError('Production quantity must be a positive integer');
  }
  // A derived composite is assembled by the sale itself; producing one would
  // write off the stems into a stock row nobody ever reads.
  await assertProducible(client, params.storeId, params.variantId);

  const composition = await client.query(
    `SELECT c.component_variant_id, c.quantity, v.cost_cents
     FROM pos_product_components c
     JOIN pos_variants v ON v.id = c.component_variant_id
     WHERE c.store_id = $1 AND c.variant_id = $2
     ORDER BY c.sort_order ASC, c.id ASC`,
    [params.storeId, params.variantId]
  );
  if (composition.rows.length === 0) throw new EmptyCompositionError(params.variantId);

  let unitCostCents = 0;
  for (const row of composition.rows) {
    const perUnit = Number(row.quantity);
    unitCostCents += perUnit * Number(row.cost_cents);
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: Number(row.component_variant_id),
      delta: -perUnit * params.quantity,
      reason: 'writeoff',
      staffId: params.staffId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: params.note ?? undefined,
      occurredAt: params.occurredAt,
    });
  }

  await applyStockDelta(client, {
    storeId: params.storeId,
    variantId: params.variantId,
    delta: params.quantity,
    reason: 'receipt',
    staffId: params.staffId,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    note: params.note ?? undefined,
    unitCostCents,
    occurredAt: params.occurredAt,
  });

  return { unitCostCents };
}
