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
//
// A recipe may contain a recipe (a café's latte holds a syrup, TechDocs/
// POS_CAFE.md §9), as deep as the store's vertical allows
// (`maxCompositionDepth`: 1 for flowers, 3 for a café). Nobody downstream
// recurses for it: `pos_product_components` stays the AUTHORED recipe, and
// `pos_product_components_flat` (migration 045) holds the same recipe expanded
// to the shelves it takes from — a derived composite inside it folded in, an
// own one left as a leaf. Availability, write-off and production read the flat
// table; the editor, the bench and the catalog read the authored one; and
// `recomputeFlat` rewrites the flat one from the authored one, for the whole
// store, after every recipe write.

import { pool } from '../db.js';
import { applyStockDelta } from './stock.service.js';
import type { StockReason } from './types.js';
import { loadStoreVertical } from './verticals/index.js';

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
 * Check a composition and return it in canonical form.
 *
 * Shared by the catalogue editor and the till's ad-hoc assembly, so a bouquet
 * composed at the counter obeys exactly the rules a catalogue one does.
 *
 * Whether a component may itself be a composite is the store's vertical's
 * call (`maxCompositionDepth`). At 1 — flowers, clothing — the one-level rule
 * holds exactly as it always has, and cycles are impossible without any
 * graph walk. Above 1 the authored graph is walked: no cycle, through any
 * number of recipes and whatever their stock mode, and no ancestor deeper
 * than the vertical allows — the depth of a composite is 1 + its deepest
 * composite component, so editing an inner recipe can push an outer one over
 * the limit, and that outer one is the one refused.
 */
export async function validateComponents(
  client: DbClient,
  storeId: number,
  variantId: number,
  components: ComponentInput[]
): Promise<ComponentInput[]> {
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
       WHERE v.store_id = $1 AND v.id = ANY($2::bigint[]) AND v.is_active = TRUE`,
      [storeId, ids]
    );
    const found = new Map<number, string>(
      check.rows.map((row: { id: string | number; kind: string }) => [Number(row.id), row.kind])
    );
    for (const id of ids) {
      if (!found.has(id)) throw new CompositeError(`Component variant ${id} not found`);
    }
    const compositeIds = ids.filter((id) => found.get(id) === 'composite');
    if (compositeIds.length > 0) {
      const vertical = await loadStoreVertical(client, storeId);
      if (vertical.maxCompositionDepth <= 1) {
        throw new CompositeError(`Component variant ${compositeIds[0]} is itself composite`);
      }
      await assertRecipeGraph(client, storeId, variantId, rows, vertical.maxCompositionDepth);
    }
  }

  return rows;
}

/**
 * The authored recipe graph of one store with `variantId`'s recipe replaced by
 * `rows`, checked for a cycle and for depth. In memory on purpose: a store's
 * recipes are a few hundred rows, and the alternative — a recursive query per
 * rule — is harder to read than it is to run.
 */
async function assertRecipeGraph(
  client: DbClient,
  storeId: number,
  variantId: number,
  rows: ComponentInput[],
  maxDepth: number
): Promise<void> {
  const [edges, composites] = await Promise.all([
    client.query(
      `SELECT variant_id, component_variant_id FROM pos_product_components WHERE store_id = $1`,
      [storeId]
    ),
    client.query(
      `SELECT v.id FROM pos_variants v
       JOIN pos_products p ON p.id = v.product_id
       WHERE v.store_id = $1 AND p.kind = 'composite'`,
      [storeId]
    ),
  ]);
  const isComposite = new Set<number>(composites.rows.map((row) => Number(row.id)));
  // What is being composed is a composite by definition — inside the
  // transaction that just inserted its product row, or the derived card a
  // custom line is rung on.
  isComposite.add(variantId);

  const children = new Map<number, number[]>();
  const parents = new Map<number, number[]>();
  const link = (parent: number, child: number): void => {
    children.set(parent, [...(children.get(parent) ?? []), child]);
    parents.set(child, [...(parents.get(child) ?? []), parent]);
  };
  for (const row of edges.rows) {
    const parent = Number(row.variant_id);
    if (parent === variantId) continue; // replaced by `rows`
    link(parent, Number(row.component_variant_id));
  }
  for (const row of rows) link(variantId, row.component_variant_id);

  // A cycle: the variant is reachable from its own new components.
  const stack = rows.map((row) => row.component_variant_id);
  const seen = new Set<number>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === variantId) {
      throw new CompositeError('A recipe cannot contain itself, not even through another recipe');
    }
    if (seen.has(node)) continue;
    seen.add(node);
    for (const child of children.get(node) ?? []) stack.push(child);
  }

  // Depth: 1 + the deepest composite component; a simple component adds
  // nothing. Checked for the variant AND every recipe that (transitively)
  // contains it — those are the ones this edit can push over the limit.
  const memo = new Map<number, number>();
  const depthOf = (node: number): number => {
    if (!isComposite.has(node)) return 0;
    const known = memo.get(node);
    if (known !== undefined) return known;
    let deepest = 0;
    for (const child of children.get(node) ?? []) deepest = Math.max(deepest, depthOf(child));
    memo.set(node, 1 + deepest);
    return 1 + deepest;
  };
  const ancestors = [variantId];
  const visited = new Set<number>(ancestors);
  for (let i = 0; i < ancestors.length; i++) {
    for (const parent of parents.get(ancestors[i]) ?? []) {
      if (!visited.has(parent)) {
        visited.add(parent);
        ancestors.push(parent);
      }
    }
  }
  for (const node of ancestors) {
    const depth = depthOf(node);
    if (depth > maxDepth) {
      throw new CompositeError(
        node === variantId
          ? `Recipe too deep: this store allows ${maxDepth} level(s) of recipes inside a recipe`
          : `Recipe too deep: variant ${node} would be ${depth} levels deep, this store allows ${maxDepth}`
      );
    }
  }
}

/**
 * Rewrite the store's expanded recipes from its authored ones.
 *
 * The same walk as the boot-time rebuild in migration 045, scoped to one
 * store — the two are pinned against each other by `pos.composites.test.ts`.
 * Whole-store on purpose: an inner recipe's edit changes every recipe above
 * it, a store's recipes are small, and "which ancestors" is exactly the kind
 * of bookkeeping that drifts. Callers hold the store's recipe lock.
 */
export async function recomputeFlat(client: DbClient, storeId: number): Promise<void> {
  await client.query(`DELETE FROM pos_product_components_flat WHERE store_id = $1`, [storeId]);
  await client.query(
    `INSERT INTO pos_product_components_flat (store_id, variant_id, leaf_variant_id, quantity_per_unit)
     WITH RECURSIVE walk AS (
       SELECT c.store_id, c.variant_id AS root_id, c.component_variant_id AS node_id,
              c.quantity::bigint AS qty, 1 AS depth
       FROM pos_product_components c
       WHERE c.store_id = $1
       UNION ALL
       SELECT w.store_id, w.root_id, c.component_variant_id, w.qty * c.quantity, w.depth + 1
       FROM walk w
       JOIN pos_variants nv ON nv.id = w.node_id
       JOIN pos_products np ON np.id = nv.product_id
       JOIN pos_product_components c ON c.variant_id = w.node_id AND c.store_id = w.store_id
       WHERE np.kind = 'composite' AND np.stock_mode = 'derived' AND w.depth < 8
     )
     SELECT w.store_id, w.root_id, w.node_id, SUM(w.qty)::int
     FROM walk w
     JOIN pos_variants lv ON lv.id = w.node_id
     JOIN pos_products lp ON lp.id = lv.product_id
     WHERE NOT (lp.kind = 'composite' AND lp.stock_mode = 'derived')
     GROUP BY w.store_id, w.root_id, w.node_id`,
    [storeId]
  );
}

/**
 * Serialise recipe writes of one store for the rest of the transaction, so
 * two owners editing recipes at once cannot interleave their rebuilds. Also
 * taken by a product's stock-mode change, which is a recipe write in
 * disguise: an own→derived flip turns a leaf into an expansion everywhere.
 */
export async function lockRecipes(client: DbClient, storeId: number): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('pos_components'), $1::int)`, [
    storeId,
  ]);
}

/**
 * Replace a composite variant's composition wholesale — same "an update
 * replaces the bag" rule as variant attributes, so removing a component is
 * expressible. Rewrites the store's expanded recipes afterwards: this recipe
 * and every one that contains it.
 */
export async function setComponents(
  client: DbClient,
  storeId: number,
  variantId: number,
  components: ComponentInput[]
): Promise<void> {
  await lockRecipes(client, storeId);
  const rows = await validateComponents(client, storeId, variantId, components);

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
  await recomputeFlat(client, storeId);
}

/**
 * How many whole composites the leaves allow, for a derived composite.
 * An empty composition is 0 available, never "unlimited".
 */
export async function derivedAvailability(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<number> {
  const result = await client.query(
    `SELECT MIN(FLOOR(COALESCE(cs.quantity, 0)::numeric / f.quantity_per_unit))::int AS qty
     FROM pos_product_components_flat f
     LEFT JOIN pos_stock cs
       ON cs.variant_id = f.leaf_variant_id AND cs.store_id = f.store_id
     WHERE f.store_id = $1 AND f.variant_id = $2`,
    [storeId, variantId]
  );
  const qty = result.rows[0]?.qty;
  return qty == null ? 0 : Number(qty);
}

/** The expanded recipe of one composite, from the flat table. */
async function flatOf(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<ComponentInput[]> {
  const result = await client.query(
    `SELECT leaf_variant_id, quantity_per_unit
     FROM pos_product_components_flat
     WHERE store_id = $1 AND variant_id = $2
     ORDER BY leaf_variant_id ASC`,
    [storeId, variantId]
  );
  return result.rows.map((row) => ({
    component_variant_id: Number(row.leaf_variant_id),
    quantity: Number(row.quantity_per_unit),
  }));
}

/**
 * Expand a composition that is not stored anywhere — a bouquet assembled at
 * the counter, a modifier's write-off — to stock leaves, the way the flat
 * table does for a stored recipe. One lookup, no recursion: a derived
 * component's own expansion is already flat. The same leaf reached twice is
 * summed, because the sale snapshot is unique per leaf.
 */
export async function flattenComponents(
  client: DbClient,
  storeId: number,
  components: ComponentInput[]
): Promise<ComponentInput[]> {
  if (components.length === 0) return [];
  const shapes = await client.query(
    `SELECT v.id, p.kind, p.stock_mode
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])`,
    [storeId, components.map((row) => row.component_variant_id)]
  );
  const expands = new Set<number>(
    shapes.rows
      .filter((row) => row.kind === 'composite' && row.stock_mode === 'derived')
      .map((row) => Number(row.id))
  );

  const totals = new Map<number, number>();
  const add = (variantId: number, quantity: number): void => {
    totals.set(variantId, (totals.get(variantId) ?? 0) + quantity);
  };
  for (const row of components) {
    if (!expands.has(row.component_variant_id)) {
      add(row.component_variant_id, row.quantity);
      continue;
    }
    const inner = await flatOf(client, storeId, row.component_variant_id);
    if (inner.length === 0) throw new EmptyCompositionError(row.component_variant_id);
    for (const leaf of inner) add(leaf.component_variant_id, leaf.quantity * row.quantity);
  }
  return [...totals.entries()].map(([component_variant_id, quantity]) => ({
    component_variant_id,
    quantity,
  }));
}

/**
 * Which shelves one cart line actually takes from.
 *
 * `self` is the variant's own stock row: every simple product, and a
 * composite assembled in advance — selling one of those must not touch the
 * components, because the production document already took them. `leaves`
 * are the shelves a derived composite takes from instead, per one unit of
 * it, already expanded (a syrup inside a latte is its sugar and water here).
 *
 * Both at once is a line that moves its own row AND some leaves — an own
 * product rung with a modifier that writes something off (café, К1f). The
 * sale snapshot then carries a row for the variant itself, so a refund reads
 * the rows as the whole truth rather than inferring the own row from their
 * absence.
 *
 * Extracted so that **holding** stock and **consuming** it cannot disagree.
 * A parked cart reserves what ringing it will consume, and if the two resolved
 * the shape separately, a bouquet could hold stems it would not take, or —
 * worse — hold nothing and take nine roses.
 */
export interface StockDemand {
  self: boolean;
  leaves: ComponentInput[];
}

export async function resolveStockDemand(
  client: DbClient,
  params: {
    storeId: number;
    variantId: number;
    /** The line's own composition, when it carries one. Already validated. */
    components?: ComponentInput[];
  }
): Promise<StockDemand> {
  const shape = await loadStockShape(client, params.storeId, params.variantId);
  if (!(shape.kind === 'composite' && shape.stock_mode === 'derived')) {
    return { self: true, leaves: [] };
  }

  const leaves = params.components
    ? await flattenComponents(client, params.storeId, params.components)
    : await flatOf(client, params.storeId, params.variantId);

  // A derived composite with nothing in it is 0 available, never unlimited —
  // the same rule the catalog's availability sum follows.
  if (leaves.length === 0) throw new EmptyCompositionError(params.variantId);
  return { self: false, leaves };
}

/**
 * Write off stock for one completed sale line.
 *
 * An own row (every simple product, a composite made in advance) moves
 * exactly as before. Leaves are snapshotted onto the sale line and moved
 * instead — same reason and reference as a plain sale, so the movement report
 * still totals stems sold whether they left loose or in a bouquet. A line that
 * moves both gets a snapshot row for itself too (see `StockDemand`).
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
    /**
     * The composition this one line was rung with, for a bouquet the cashier
     * assembled at the counter. When absent the catalogue composition is used.
     * Already validated by the caller.
     */
    components?: ComponentInput[];
  }
): Promise<void> {
  const demand = await resolveStockDemand(client, {
    storeId: params.storeId,
    variantId: params.variantId,
    components: params.components,
  });

  if (demand.self) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: -params.quantity,
      reason: 'sale',
      staffId: params.staffId,
      referenceType: 'sale',
      referenceId: params.saleId,
    });
  }
  if (demand.leaves.length === 0) return;

  // Rows present means "these rows are everything this line took": when the
  // own row moved as well, it is written down too, so the refund does not
  // have to guess. Only then — a bouquet's snapshot stays leaves-only, which
  // the florist analytics rely on to tell a bundled stem from a loose one.
  const snapshot: ComponentInput[] = demand.self
    ? [{ component_variant_id: params.variantId, quantity: 1 }, ...demand.leaves]
    : demand.leaves;
  for (const [index, row] of snapshot.entries()) {
    await client.query(
      `INSERT INTO pos_sale_item_components
         (store_id, sale_item_id, component_variant_id, quantity_per_unit, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.storeId, params.saleItemId, row.component_variant_id, row.quantity, index]
    );
  }
  for (const row of demand.leaves) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: row.component_variant_id,
      delta: -row.quantity * params.quantity,
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
 * Driven entirely by the checkout snapshot: rows present are everything the
 * line took (a line that moved its own row as well has a row for itself),
 * none means it took the variant's own stock. A composition edited between
 * the sale and the refund therefore cannot return stems the customer never
 * got.
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

  // The expanded recipe: a derived semi-finished inside this one is taken
  // from its ingredients, one made in advance from its own shelf.
  const composition = await client.query(
    `SELECT f.leaf_variant_id, f.quantity_per_unit, v.cost_cents
     FROM pos_product_components_flat f
     JOIN pos_variants v ON v.id = f.leaf_variant_id
     WHERE f.store_id = $1 AND f.variant_id = $2
     ORDER BY f.leaf_variant_id ASC`,
    [params.storeId, params.variantId]
  );
  if (composition.rows.length === 0) throw new EmptyCompositionError(params.variantId);

  let unitCostCents = 0;
  for (const row of composition.rows) {
    const perUnit = Number(row.quantity_per_unit);
    unitCostCents += perUnit * Number(row.cost_cents);
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: Number(row.leaf_variant_id),
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

/**
 * Add the store's assembly charge to a parts sum.
 *
 * Exported and free of the database on purpose: the offline till mirrors this
 * exact arithmetic on the cached `florist_labour_bps` to price a bouquet it
 * rings with no network, and the two answers have to agree to the kopeck.
 * `Math.round` is the tie-breaker both sides use.
 */
export function withLabour(partsCents: number, labourBps: number): number {
  if (!Number.isFinite(labourBps) || labourBps <= 0) return partsCents;
  return partsCents + Math.round((partsCents * labourBps) / 10000);
}

/**
 * What a bouquet assembled at the counter costs the customer: what its stems
 * sell for, plus the shop's charge for assembling them.
 *
 * Deliberately computed, never typed in. A florist prices by the stem anyway,
 * so this is the number they would have reached; and a per-line price the
 * cashier can set freely is a hole no receipt would ever show. A genuine
 * markdown stays expressible through the ordinary line and cart discounts.
 */
export async function priceOfComposition(
  client: DbClient,
  storeId: number,
  components: ComponentInput[]
): Promise<number> {
  if (components.length === 0) throw new CompositeError('A bouquet needs at least one component');
  const result = await client.query(
    `SELECT id, price_cents FROM pos_variants
     WHERE store_id = $1 AND id = ANY($2::bigint[])`,
    [storeId, components.map((row) => row.component_variant_id)]
  );
  const priceOf = new Map<number, number>(
    result.rows.map((row: { id: string | number; price_cents: string | number }) => [
      Number(row.id),
      Number(row.price_cents),
    ])
  );
  let total = 0;
  for (const row of components) {
    const price = priceOf.get(row.component_variant_id);
    if (price == null) {
      throw new CompositeError(`Component variant ${row.component_variant_id} not found`);
    }
    total += price * row.quantity;
  }

  const store = await client.query(
    `SELECT florist_labour_bps FROM pos_stores WHERE id = $1`,
    [storeId]
  );
  return withLabour(total, Number(store.rows[0]?.florist_labour_bps ?? 0));
}
