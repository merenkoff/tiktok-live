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
import { pourLine, type PourContext } from './bottles.service.js';
import { foodCostBps, milliToCents } from './cost.js';

type DbClient = { query: typeof pool.query };

/** One line of a composite's composition, as the admin edits it. */
export interface ComponentInput {
  component_variant_id: number;
  /**
   * In the component variant's own unit. INTEGER, like every other quantity —
   * and the GROSS weight: what leaves the shelf, what stock and cost read.
   */
  quantity: number;
  /**
   * The share of that quantity that does not reach the dish — peel, bones,
   * what boils away — in basis points (2000 = 20 %; migration 104). The net
   * weight is derived from the two (`netQuantity`), never stored. Left out by
   * a client built before it: the line then KEEPS the loss it already has.
   */
  loss_bps?: number;
}

/** The largest loss a line may state: 99 %. */
export const MAX_LOSS_BPS = 9900;

/** What reaches the dish out of `quantity` taken from the shelf. */
export function netQuantity(quantity: number, lossBps: number): number {
  return Math.round((quantity * (10000 - lossBps)) / 10000);
}

/** A loss share from a request: an integer of basis points, 0…99 %. */
export function normalizeLossBps(raw: unknown): number {
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_LOSS_BPS) {
    throw new CompositeError('Втрати — від 0 до 99 %');
  }
  return value;
}

/** One line of a composition, resolved for display. */
export interface ComponentRow extends ComponentInput {
  loss_bps: number;
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
    `SELECT c.id, c.variant_id, c.component_variant_id, c.quantity, c.loss_bps, c.sort_order,
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
      loss_bps: Number(row.loss_bps ?? 0),
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
    rows.push({
      component_variant_id: componentVariantId,
      quantity,
      // Absent stays absent — `setComponents` reads that as «keep what the line has».
      ...(raw?.loss_bps === undefined || raw.loss_bps === null ? {} : { loss_bps: normalizeLossBps(raw.loss_bps) }),
    });
  }

  if (rows.length > 0) {
    const ids = rows.map((row) => row.component_variant_id);
    const check = await client.query(
      `SELECT v.id, p.kind, v.price_per
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
    // A weighed variant's price is per kilogram (migration 075), and a bouquet
    // or a tech card prices and costs its parts per unit — so a weighed one is
    // never a part (TechDocs/grocery/G4_WEIGHED.md, decision 3).
    const weighed = check.rows.find((row: { price_per: unknown }) => Number(row.price_per ?? 1) > 1);
    if (weighed) {
      throw new CompositeError(`Ваговий товар не може бути складником (варіант ${Number(weighed.id)})`);
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
 * The same walk as the boot-time rebuild in migration 116 (045's until then),
 * scoped to one store — the two are pinned against each other by
 * `pos.composites.test.ts`. Whole-store on purpose: an inner recipe's edit
 * changes every recipe above it, a store's recipes are small, and "which
 * ancestors" is exactly the kind of bookkeeping that drifts. Callers hold the
 * store's recipe lock.
 *
 * A recipe written for a batch (`pos_variants.recipe_yield`, §7u) divides on
 * the way down, so the walk carries an exact share: 2000 g of neck in a
 * 1900 g batch is 131.578947 g in a 125 g portion. `quantity_exact` keeps it;
 * `quantity_per_unit` — what selling ONE unit writes off — is it rounded,
 * never below 1, so no leaf is rounded out of the write-off. Without a yield
 * both are the same whole number they always were.
 */
export async function recomputeFlat(client: DbClient, storeId: number): Promise<void> {
  await client.query(`DELETE FROM pos_product_components_flat WHERE store_id = $1`, [storeId]);
  await client.query(
    `INSERT INTO pos_product_components_flat
       (store_id, variant_id, leaf_variant_id, quantity_per_unit, quantity_exact)
     WITH RECURSIVE walk AS (
       SELECT c.store_id, c.variant_id AS root_id, c.component_variant_id AS node_id,
              ROUND(c.quantity::numeric / COALESCE(rv.recipe_yield, 1), 12) AS qty, 1 AS depth
       FROM pos_product_components c
       JOIN pos_variants rv ON rv.id = c.variant_id
       WHERE c.store_id = $1
       UNION ALL
       SELECT w.store_id, w.root_id, c.component_variant_id,
              ROUND(w.qty * c.quantity / COALESCE(nv.recipe_yield, 1), 12), w.depth + 1
       FROM walk w
       JOIN pos_variants nv ON nv.id = w.node_id
       JOIN pos_products np ON np.id = nv.product_id
       JOIN pos_product_components c ON c.variant_id = w.node_id AND c.store_id = w.store_id
       WHERE np.kind = 'composite' AND np.stock_mode = 'derived' AND w.depth < 8
     )
     SELECT w.store_id, w.root_id, w.node_id,
            GREATEST(1, ROUND(SUM(w.qty)))::int,
            ROUND(SUM(w.qty), 10)
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
  components: ComponentInput[],
  options: { recompute?: boolean } = {}
): Promise<void> {
  await lockRecipes(client, storeId);
  const rows = await validateComponents(client, storeId, variantId, components);

  // The bag is replaced wholesale, and a client built before migration 104
  // sends lines with no loss at all: a line it kept must not lose the loss
  // the owner typed elsewhere, so an absent `loss_bps` reads the stored one.
  const stored = await client.query(
    `SELECT component_variant_id, loss_bps FROM pos_product_components
     WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  const storedLoss = new Map<number, number>(
    stored.rows.map((row: Record<string, unknown>) => [Number(row.component_variant_id), Number(row.loss_bps ?? 0)])
  );

  await client.query(
    `DELETE FROM pos_product_components WHERE store_id = $1 AND variant_id = $2`,
    [storeId, variantId]
  );
  for (const [index, row] of rows.entries()) {
    await client.query(
      `INSERT INTO pos_product_components
         (store_id, variant_id, component_variant_id, quantity, loss_bps, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        storeId,
        variantId,
        row.component_variant_id,
        row.quantity,
        row.loss_bps ?? storedLoss.get(row.component_variant_id) ?? 0,
        index,
      ]
    );
  }
  // A batch of recipes (the tech-card import) rebuilds once, after the last.
  if (options.recompute !== false) await recomputeFlat(client, storeId);
}

// ── one ingredient swapped for another, in every recipe ─────────────

export interface ReplaceIngredientInput {
  from_variant_id?: unknown;
  to_variant_id?: unknown;
  factor?: unknown;
  include_modifiers?: unknown;
}

export interface ReplaceIngredientResult {
  /** Recipes (variants) whose lines changed. */
  recipes: number;
  /** Cards those recipes belong to. */
  products: number;
  /** Modifier answers repointed. */
  modifiers: number;
}

/** A multiplier bigger than this is a typo, not a conversion. */
const MAX_REPLACE_FACTOR = 1000;

function replaceArgs(raw: ReplaceIngredientInput): { from: number; to: number; factor: number; withModifiers: boolean } {
  const from = Number(raw.from_variant_id);
  const to = Number(raw.to_variant_id);
  if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0) {
    throw new CompositeError('Вкажіть, що і на що замінити');
  }
  if (from === to) throw new CompositeError('Замінити можна лише на інший інгредієнт');
  // Never defaulted: a missing multiplier that silently became 0 or 1 is how
  // other tools empty every recipe at once.
  const factor = typeof raw.factor === 'string' ? Number(raw.factor.replace(',', '.')) : Number(raw.factor);
  if (raw.factor === undefined || raw.factor === null || raw.factor === '' || !Number.isFinite(factor) || factor <= 0) {
    throw new CompositeError('Вкажіть множник кількості — число, більше за нуль');
  }
  if (factor > MAX_REPLACE_FACTOR) throw new CompositeError(`Множник не може бути більшим за ${MAX_REPLACE_FACTOR}`);
  return { from, to, factor, withModifiers: raw.include_modifiers === true };
}

/**
 * The cards whose recipes hold an ingredient — read BEFORE a replacement, so
 * the menu journal can say what each card's recipe was.
 */
export async function productsUsingIngredient(
  storeId: number,
  variantId: number,
  client: DbClient = pool
): Promise<number[]> {
  const result = await client.query(
    `SELECT DISTINCT v.product_id
     FROM pos_product_components c
     JOIN pos_variants v ON v.id = c.variant_id
     WHERE c.store_id = $1 AND c.component_variant_id = $2
     ORDER BY v.product_id`,
    [storeId, variantId]
  );
  return result.rows.map((row: Record<string, unknown>) => Number(row.product_id));
}

/**
 * Swap one ingredient for another in every recipe of the store — the
 * supplier changed, the cream is another cream now.
 *
 * One transaction under the store's recipe lock: every recipe that holds
 * `from` gets `to` in the same place with the quantity × `factor` (rounded,
 * never below one unit); a recipe that already holds `to` has the two
 * quantities ADDED rather than the ingredient listed twice. Each rewritten
 * recipe goes through `validateComponents`, so a swap that would make a
 * recipe contain itself, or run deeper than the vertical allows, refuses the
 * whole thing — and the expanded recipes are rebuilt once, after the last.
 * Modifier answers that write `from` off follow only when asked to.
 *
 * It is its own undo: the same call the other way round, with the inverse
 * multiplier.
 */
export async function replaceIngredient(
  storeId: number,
  raw: ReplaceIngredientInput
): Promise<ReplaceIngredientResult> {
  const { from, to, factor, withModifiers } = replaceArgs(raw);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, is_active, prep_loss_bps FROM pos_variants WHERE store_id = $1 AND id = ANY($2::bigint[])`,
      [storeId, [from, to]]
    );
    const byId = new Map(found.rows.map((row: Record<string, unknown>) => [Number(row.id), Boolean(row.is_active)]));
    if (!byId.has(from)) throw new CompositeError('Інгредієнт, який замінюєте, не знайдено');
    if (!byId.get(to)) throw new CompositeError('Інгредієнт для заміни не знайдено');
    // The replacement's own usual loss, when its card states one: peeled
    // potato in place of unpeeled must not inherit the peel. Not stated — the
    // line keeps the loss it had.
    const toRow = found.rows.find((row: Record<string, unknown>) => Number(row.id) === to);
    const toLoss = toRow?.prep_loss_bps == null ? null : Number(toRow.prep_loss_bps);

    await lockRecipes(client, storeId);
    const holders = await client.query(
      `SELECT c.variant_id, v.product_id
       FROM pos_product_components c
       JOIN pos_variants v ON v.id = c.variant_id
       WHERE c.store_id = $1 AND c.component_variant_id = $2
       ORDER BY c.variant_id`,
      [storeId, from]
    );
    const variantIds = holders.rows.map((row: Record<string, unknown>) => Number(row.variant_id));
    if (variantIds.includes(to)) {
      throw new CompositeError('Заміна сама зроблена з цього інгредієнта — її рецепт посилався б на себе');
    }

    for (const variantId of variantIds) {
      const lines = await client.query(
        `SELECT component_variant_id, quantity, loss_bps FROM pos_product_components
         WHERE store_id = $1 AND variant_id = $2
         ORDER BY sort_order ASC, id ASC`,
        [storeId, variantId]
      );
      // Every line states its loss: the bag is rewritten, and `setComponents`
      // would otherwise look the new ingredient's loss up under an id the
      // recipe never held.
      const twinLoss = (lines.rows as Array<Record<string, unknown>>).find(
        (row) => Number(row.component_variant_id) === to
      );
      const next: ComponentInput[] = [];
      for (const row of lines.rows as Array<Record<string, unknown>>) {
        const id = Number(row.component_variant_id);
        const quantity = Number(row.quantity);
        const loss = Number(row.loss_bps ?? 0);
        const line: ComponentInput =
          id === from
            ? {
                component_variant_id: to,
                quantity: Math.max(1, Math.round(quantity * factor)),
                // A recipe that already holds the replacement keeps that line's loss.
                loss_bps: twinLoss ? Number(twinLoss.loss_bps ?? 0) : (toLoss ?? loss),
              }
            : { component_variant_id: id, quantity, loss_bps: loss };
        const twin = next.find((n) => n.component_variant_id === line.component_variant_id);
        if (twin) twin.quantity += line.quantity;
        else next.push(line);
      }
      await setComponents(client, storeId, variantId, next, { recompute: false });
    }
    if (variantIds.length > 0) await recomputeFlat(client, storeId);

    let modifiers = 0;
    if (withModifiers) {
      const moved = await client.query(
        `UPDATE pos_modifiers
         SET component_variant_id = $3,
             component_quantity = GREATEST(1, ROUND(component_quantity * $4::numeric))::int,
             updated_at = NOW()
         WHERE store_id = $1 AND component_variant_id = $2`,
        [storeId, from, to, factor]
      );
      modifiers = moved.rowCount ?? 0;
    }

    await client.query('COMMIT');
    return {
      recipes: variantIds.length,
      products: new Set(holders.rows.map((row: Record<string, unknown>) => Number(row.product_id))).size,
      modifiers,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
 * The exact share of each leaf in ONE unit of a stored recipe (migration 116):
 * a recipe written for a batch makes these fractions, and a caller that
 * multiplies by a quantity must multiply the fraction and round once, not
 * multiply the already-rounded per-unit write-off. Without a yield the share
 * is the same whole number as `quantity_per_unit`.
 */
async function flatSharesOf(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<Array<{ component_variant_id: number; exact: number }>> {
  const result = await client.query(
    `SELECT leaf_variant_id, COALESCE(quantity_exact, quantity_per_unit) AS exact
     FROM pos_product_components_flat
     WHERE store_id = $1 AND variant_id = $2
     ORDER BY leaf_variant_id ASC`,
    [storeId, variantId]
  );
  return result.rows.map((row) => ({
    component_variant_id: Number(row.leaf_variant_id),
    exact: Number(row.exact),
  }));
}

/**
 * A whole amount from an exact share × a quantity: rounded half up, never
 * below 1 — the same rule the flat table's `quantity_per_unit` follows, so a
 * leaf is never rounded out of a write-off. The share carries ten decimals;
 * snapping the float back to nine first keeps 0.5 from becoming 0.4999999.
 */
export function wholeShare(exact: number): number {
  return Math.max(1, Math.round(Math.round(exact * 1e9) / 1e9));
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

  // Exact shares, summed, then made whole once per leaf: 50 g of a garlic
  // sauce written for a 905 g batch takes 50 × 700 / 905 g of mayonnaise, not
  // 50 × (its per-gram write-off rounded up to 1 g).
  const totals = new Map<number, number>();
  const add = (variantId: number, quantity: number): void => {
    totals.set(variantId, (totals.get(variantId) ?? 0) + quantity);
  };
  for (const row of components) {
    if (!expands.has(row.component_variant_id)) {
      add(row.component_variant_id, row.quantity);
      continue;
    }
    const inner = await flatSharesOf(client, storeId, row.component_variant_id);
    if (inner.length === 0) throw new EmptyCompositionError(row.component_variant_id);
    for (const leaf of inner) add(leaf.component_variant_id, leaf.exact * row.quantity);
  }
  return [...totals.entries()].map(([component_variant_id, quantity]) => ({
    component_variant_id,
    quantity: wholeShare(quantity),
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
    /**
     * What the line's modifiers write off, on top of the variant's own demand
     * — «вівсяне молоко» on a latte, «ще сир» on a sandwich that has its own
     * shelf. Authored, per one unit; expanded here like everything else.
     */
    extra?: ComponentInput[];
  }
): Promise<StockDemand> {
  const shape = await loadStockShape(client, params.storeId, params.variantId);
  const extra = params.extra?.length
    ? await flattenComponents(client, params.storeId, params.extra)
    : [];
  if (!(shape.kind === 'composite' && shape.stock_mode === 'derived')) {
    return { self: true, leaves: extra };
  }

  const own = params.components
    ? await flattenComponents(client, params.storeId, params.components)
    : await flatOf(client, params.storeId, params.variantId);

  // A derived composite with nothing in it is 0 available, never unlimited —
  // the same rule the catalog's availability sum follows.
  if (own.length === 0) throw new EmptyCompositionError(params.variantId);
  return { self: false, leaves: mergeLeaves(own, extra) };
}

/** Two expanded lists into one, the same leaf summed. */
function mergeLeaves(a: ComponentInput[], b: ComponentInput[]): ComponentInput[] {
  if (b.length === 0) return a;
  const totals = new Map<number, number>();
  for (const row of [...a, ...b]) {
    totals.set(row.component_variant_id, (totals.get(row.component_variant_id) ?? 0) + row.quantity);
  }
  return [...totals.entries()].map(([component_variant_id, quantity]) => ({
    component_variant_id,
    quantity,
  }));
}

/**
 * Where a line's stock snapshot lives.
 *
 * A sale line writes it to `pos_sale_item_components`; a bill line fired to
 * the kitchen (К4c) writes the very same rows to `pos_bill_item_components`,
 * because a round moves stock at fire time and payment then copies the
 * snapshot across without moving anything again. A line given «під запис»
 * (073, grocery Г3) does exactly what a round does, into
 * `pos_debt_item_components`. Three tables, one arithmetic — and a second
 * 60-line copy of it would have drifted at the first edit.
 *
 * The table and column below are interpolated into SQL. They come from this
 * closed record keyed by a union type and never from a caller's string, so
 * there is nothing here for a value to escape into.
 */
export type LineStockTarget = 'sale' | 'bill' | 'debt' | 'remote';

const LINE_SNAPSHOT: Record<LineStockTarget, { table: string; fk: string }> = {
  sale: { table: 'pos_sale_item_components', fk: 'sale_item_id' },
  bill: { table: 'pos_bill_item_components', fk: 'bill_item_id' },
  debt: { table: 'pos_debt_item_components', fk: 'debt_item_id' },
  // A remote-kitchen line (117): written in the KITCHEN's store when the cafe
  // has been paid, and given back from here if the paid order is cancelled.
  remote: { table: 'pos_remote_order_item_components', fk: 'remote_order_item_id' },
};

/**
 * Write off stock for one line and snapshot what it actually took.
 *
 * An own row (every simple product, a composite made in advance) moves
 * exactly as before. Leaves are snapshotted onto the line and moved instead —
 * same reason and reference as a plain sale, so the movement report still
 * totals stems sold whether they left loose or in a bouquet. A line that
 * moves both gets a snapshot row for itself too (see `StockDemand`).
 */
export async function consumeStockForLine(
  client: DbClient,
  params: {
    storeId: number;
    target: LineStockTarget;
    /** `pos_sale_items.id`, `pos_bill_items.id` or `pos_debt_items.id`, per `target`. */
    lineId: number;
    /** What the movement points at: a sale, the round that fired the line, or a debt entry. */
    referenceType: string;
    referenceId: number;
    variantId: number;
    quantity: number;
    /** Null when a guest's order fired the line straight to the kitchen (QR menu Q9). */
    staffId: number | null;
    /**
     * `sale` unless the goods left «під запис» (`credit`, 073): the movement
     * report keeps what went out on credit apart from what was sold.
     */
    reason?: Extract<StockReason, 'sale' | 'credit'>;
    /**
     * The composition this one line was rung with, for a bouquet the cashier
     * assembled at the counter. When absent the catalogue composition is used.
     * Already validated by the caller.
     */
    components?: ComponentInput[];
    /** What the line's modifiers write off, per one unit (see `resolveStockDemand`). */
    extra?: ComponentInput[];
    /**
     * The sale's (or round's) open bottles (ДК5, `bottles.service.ts`): what
     * this line takes from a stamped bottle is counted against the bottle the
     * bar has open. Absent where nothing may pour — goods «під запис».
     */
    pour?: PourContext;
  }
): Promise<void> {
  const snapshotTarget = LINE_SNAPSHOT[params.target];
  const reason = params.reason ?? 'sale';
  const demand = await resolveStockDemand(client, {
    storeId: params.storeId,
    variantId: params.variantId,
    components: params.components,
    extra: params.extra,
  });

  if (demand.self) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: params.variantId,
      delta: -params.quantity,
      reason,
      staffId: params.staffId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
    });
  }
  if (params.pour && (params.target === 'sale' || params.target === 'bill')) {
    await pourLine(client, params.pour, {
      target: params.target === 'sale' ? { saleItemId: params.lineId } : { billItemId: params.lineId },
      variantId: params.variantId,
      quantity: params.quantity,
      self: demand.self,
      leaves: demand.leaves,
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
      `INSERT INTO ${snapshotTarget.table}
         (store_id, ${snapshotTarget.fk}, component_variant_id, quantity_per_unit, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.storeId, params.lineId, row.component_variant_id, row.quantity, index]
    );
  }
  for (const row of demand.leaves) {
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: row.component_variant_id,
      delta: -row.quantity * params.quantity,
      reason,
      staffId: params.staffId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: `Складник: варіант ${params.variantId}`,
    });
  }
}

/** `consumeStockForLine` for a sale line — the shape checkout has always called. */
export function consumeStockForSaleItem(
  client: DbClient,
  params: {
    storeId: number;
    saleId: number;
    saleItemId: number;
    variantId: number;
    quantity: number;
    staffId: number;
    components?: ComponentInput[];
    extra?: ComponentInput[];
    pour?: PourContext;
  }
): Promise<void> {
  return consumeStockForLine(client, {
    ...params,
    target: 'sale',
    lineId: params.saleItemId,
    referenceType: 'sale',
    referenceId: params.saleId,
  });
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
export async function returnStockForLine(
  client: DbClient,
  params: {
    storeId: number;
    target: LineStockTarget;
    lineId: number;
    variantId: number;
    quantity: number;
    /** `credit` gives back goods returned from an unpaid «під запис» line (073). */
    reason: Extract<StockReason, 'void' | 'refund' | 'credit'>;
    /** Null when nobody of this store did it (a remote order cancelled from the cafe, 117). */
    staffId: number | null;
    referenceType: string;
    referenceId: number;
  }
): Promise<void> {
  const snapshotTarget = LINE_SNAPSHOT[params.target];
  const snapshot = await client.query(
    `SELECT component_variant_id, quantity_per_unit
     FROM ${snapshotTarget.table}
     WHERE store_id = $1 AND ${snapshotTarget.fk} = $2
     ORDER BY sort_order ASC, id ASC`,
    [params.storeId, params.lineId]
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

/** `returnStockForLine` for a sale line — the shape void and refund call. */
export function returnStockForSaleItem(
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
  return returnStockForLine(client, { ...params, target: 'sale', lineId: params.saleItemId });
}

/** One shelf a composite takes from, with what that shelf last cost. */
export interface FlatLeaf {
  leafVariantId: number;
  /** Per ONE unit of the composite, in the leaf's own unit — what selling one writes off. */
  quantityPerUnit: number;
  /**
   * The exact share behind it (migration 116): equal to `quantityPerUnit`
   * unless a recipe on the way is written for a batch. Cost and production
   * read this one — a semi-finished counted per gram would otherwise cost
   * (and take) a whole gram of salt per gram.
   */
  quantityExact: number;
  /** Last purchase price of the leaf per its own unit, in thousandths of a kopeck. */
  costMilli: number;
}

/**
 * The composite's recipe as the shelves it actually takes from (migration
 * 045): a derived composite inside it is folded in, one made in advance stays
 * a leaf because its ingredients left with its production document.
 */
async function loadFlatComposition(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<FlatLeaf[]> {
  const result = await client.query(
    `SELECT f.leaf_variant_id, f.quantity_per_unit,
            COALESCE(f.quantity_exact, f.quantity_per_unit) AS quantity_exact, v.cost_milli
     FROM pos_product_components_flat f
     JOIN pos_variants v ON v.id = f.leaf_variant_id
     WHERE f.store_id = $1 AND f.variant_id = $2
     ORDER BY f.leaf_variant_id ASC`,
    [storeId, variantId]
  );
  return result.rows.map((row: Record<string, unknown>) => ({
    leafVariantId: Number(row.leaf_variant_id),
    quantityPerUnit: Number(row.quantity_per_unit),
    quantityExact: Number(row.quantity_exact),
    costMilli: Number(row.cost_milli),
  }));
}

/**
 * What one unit of a composite costs to assemble, and whether that number can
 * be trusted.
 *
 * `hasUnpricedLeaf` is the whole point of returning it. A leaf whose
 * `cost_milli` is 0 has never been received with a price, and zero there means
 * «we do not know», not «free» — a dish whose sum quietly omits its meat is a
 * food-cost figure the owner would make decisions on. The reader is expected
 * to show «—» rather than a percentage in that case.
 *
 * The cost itself is the LAST purchase price, not a weighted average: it is
 * written by posting a receipt and by production, and nothing here changes
 * that.
 *
 * The sum is exact in thousandths of a kopeck (`cost.ts`) — 18 g of sugar at
 * 35,50 ₴/кг is 63,9 kopecks, not 18 × «4 kopecks a gram» — and is rounded to
 * whole kopecks once, at the end, never line by line.
 */
export function sumUnitCost(leaves: FlatLeaf[]): {
  unitCostMilli: number;
  unitCostCents: number;
  hasUnpricedLeaf: boolean;
} {
  let exactMilli = 0;
  let hasUnpricedLeaf = false;
  for (const leaf of leaves) {
    // The exact share (§7u): a gram of a semi-finished written for a batch
    // costs its fraction of the batch, not a whole gram of every leaf.
    exactMilli += leaf.quantityExact * leaf.costMilli;
    if (leaf.costMilli <= 0) hasUnpricedLeaf = true;
  }
  // Whole thousandths of a kopeck, as `cost_milli` is stored; a positive cost
  // never rounds to 0, which would read as «not known».
  const rounded = Math.round(Math.round(exactMilli * 1e3) / 1e3);
  const unitCostMilli = exactMilli > 0 && rounded === 0 ? 1 : rounded;
  return { unitCostMilli, unitCostCents: milliToCents(unitCostMilli), hasUnpricedLeaf };
}

/**
 * Read-only: what one unit of this composite costs today. The same sum
 * `produceComposite` writes onto a production document — the production
 * document stays the only WRITER of a composite's cost, this only reads.
 */
export async function unitCostOf(
  client: DbClient,
  storeId: number,
  variantId: number
): Promise<{ unitCostMilli: number; unitCostCents: number; hasUnpricedLeaf: boolean; leafCount: number }> {
  const leaves = await loadFlatComposition(client, storeId, variantId);
  return { ...sumUnitCost(leaves), leafCount: leaves.length };
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
): Promise<{ unitCostMilli: number }> {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) {
    throw new CompositeError('Production quantity must be a positive integer');
  }
  // A derived composite is assembled by the sale itself; producing one would
  // write off the stems into a stock row nobody ever reads.
  await assertProducible(client, params.storeId, params.variantId);

  // The expanded recipe: a derived semi-finished inside this one is taken
  // from its ingredients, one made in advance from its own shelf.
  const leaves = await loadFlatComposition(client, params.storeId, params.variantId);
  if (leaves.length === 0) throw new EmptyCompositionError(params.variantId);

  // The same sum the owner reads on «Техкарти» — one definition, so a tech
  // card and the document that assembles it can never disagree.
  // Exact, in thousandths: the assembled cost is a plain sum, so nothing is
  // rounded on the way from the ingredients to the thing made of them.
  const { unitCostMilli } = sumUnitCost(leaves);
  for (const leaf of leaves) {
    // The exact share × the batch, made whole once: 1900 g of a shashlik
    // semi-finished written for 1900 g takes exactly its 2000 g of neck, not
    // 1900 × a per-gram write-off rounded to 1 g.
    await applyStockDelta(client, {
      storeId: params.storeId,
      variantId: leaf.leafVariantId,
      delta: -wholeShare(leaf.quantityExact * params.quantity),
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
    unitCostMilli,
    occurredAt: params.occurredAt,
  });

  return { unitCostMilli };
}

/** One row of the owner's «Техкарти» list. */
export interface TechCardRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  label: string;
  unit: string;
  kind: 'composite';
  stock_mode: 'own' | 'derived';
  /** What it sells for. */
  price_cents: number;
  /** What it costs to assemble, at the last purchase prices of its leaves — whole kopecks. */
  cost_cents: number;
  /** The same sum before rounding, in thousandths of a kopeck. */
  cost_milli: number;
  /** The recipe is written for this many units (a tech card's «вихід», §7u); null = for one. */
  recipe_yield: number | null;
  /**
   * What the whole batch costs, for a recipe written for one — the figure a
   * kitchen thinks in («варка 610 ₴»), where one gram of it costs a kopeck.
   * Null when the recipe is for one unit.
   */
  batch_cost_cents: number | null;
  /** How many shelves it takes from, expanded. Zero = a recipe that is empty. */
  leaf_count: number;
  /** At least one leaf has never been received with a price — see below. */
  has_unpriced_leaf: boolean;
  /**
   * Cost as a share of price, in basis points (2500 = 25 %). **Null** when it
   * cannot be told honestly: no price, no recipe, or a leaf with no cost. Zero
   * per cent on this screen would be a lie the owner would act on.
   */
  food_cost_bps: number | null;
}

/**
 * Every composite the store sells, with what it costs to assemble.
 *
 * One query for the whole store rather than `unitCostOf` per variant: a café
 * menu is a hundred cards, and a hundred round trips to draw one screen is a
 * screen nobody opens twice. The arithmetic is the same — a LEFT JOIN so a
 * composite with an EMPTY recipe still appears, because an empty recipe is
 * exactly the kind of thing this screen exists to surface.
 *
 * Costs are the LAST purchase prices of the leaves, not a weighted average, so
 * the screen has to say so out loud.
 */
export async function listTechCards(
  client: DbClient,
  storeId: number
): Promise<TechCardRow[]> {
  const result = await client.query(
    `SELECT v.id            AS variant_id,
            p.id            AS product_id,
            p.name          AS product_name,
            v.label,
            v.unit,
            p.stock_mode,
            v.price_cents,
            v.recipe_yield,
            COALESCE(SUM(COALESCE(f.quantity_exact, f.quantity_per_unit) * lv.cost_milli), 0) AS cost_exact,
            COUNT(f.leaf_variant_id)::int                                 AS leaf_count,
            COALESCE(BOOL_OR(lv.cost_milli <= 0), FALSE)                  AS has_unpriced_leaf
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN pos_product_components_flat f
       ON f.store_id = v.store_id AND f.variant_id = v.id
     LEFT JOIN pos_variants lv ON lv.id = f.leaf_variant_id
     WHERE v.store_id = $1
       AND v.is_active = TRUE
       AND p.is_active = TRUE
       AND p.kind = 'composite'
     GROUP BY v.id, p.id, p.name, v.label, v.unit, p.stock_mode, v.price_cents, v.recipe_yield
     ORDER BY p.name ASC, v.label ASC, v.id ASC`,
    [storeId]
  );

  return result.rows.map((row: Record<string, unknown>) => {
    const price = Number(row.price_cents);
    const costExact = Number(row.cost_exact);
    // The very rounding `sumUnitCost` makes, so this screen and the
    // production document that assembles the same recipe agree exactly.
    const rounded = Math.round(Math.round(costExact * 1e3) / 1e3);
    const costMilli = costExact > 0 && rounded === 0 ? 1 : rounded;
    const recipeYield = row.recipe_yield == null ? null : Number(row.recipe_yield);
    const leafCount = Number(row.leaf_count);
    const hasUnpricedLeaf = Boolean(row.has_unpriced_leaf);
    return {
      variant_id: Number(row.variant_id),
      product_id: Number(row.product_id),
      product_name: String(row.product_name ?? ''),
      label: String(row.label ?? ''),
      unit: String(row.unit ?? ''),
      kind: 'composite' as const,
      stock_mode: row.stock_mode === 'derived' ? ('derived' as const) : ('own' as const),
      price_cents: price,
      cost_cents: milliToCents(costMilli),
      cost_milli: costMilli,
      recipe_yield: recipeYield,
      batch_cost_cents: recipeYield == null ? null : milliToCents(costExact * recipeYield),
      leaf_count: leafCount,
      has_unpriced_leaf: hasUnpricedLeaf,
      // Null, never 0: «we cannot tell» and «this dish costs nothing» are
      // different facts, and only one of them is ever true.
      food_cost_bps:
        price > 0 && leafCount > 0 && !hasUnpricedLeaf
          ? foodCostBps(costMilli, price)
          : null,
    };
  });
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
