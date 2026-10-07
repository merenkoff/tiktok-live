// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/products.service.ts

import { pool } from '../db.js';
import { buildInternalBarcode } from './gtin/internal-code.js';
import type { CatalogItem, ProductKind, ProductStockMode } from './types.js';

export type { ProductKind, ProductStockMode };
import { getProductTagIds, resolveTagFilterIds } from './tags.service.js';
import { loadStoreVertical, normalizeVariant, searchableAttributeKeys } from './verticals/index.js';
import type { VerticalDefinition } from './verticals/types.js';
import { sortVariantRuns } from './verticals/variantOrder.js';
import { escapeLike, searchTokens } from './searchTokens.js';
import { storeClock } from './core/storeClock.js';
import { normalizeAllergens, normalizeComposition } from './allergens.js';
import {
  CompositeError,
  listComponentsForStore,
  lockRecipes,
  recomputeFlat,
  setComponents,
} from './composites.service.js';
import {
  groupsForVariant,
  listProductGroupIds,
  loadGroupsForProducts,
  toCatalogGroup,
} from './modifiers.service.js';
import type { ComponentInput } from './composites.service.js';

export interface VariantInput {
  /**
   * Vertical-defined attribute bag (clothing: `{ color, size }`; flowers:
   * `{ color, length_cm, country }`). Validated against the store's schema and
   * turned into the stored `label` by `normalizeVariant` — a client never sends
   * a label. On update the bag replaces the row's wholesale.
   */
  attributes?: unknown;
  /** Base unit of quantity; must be one the store's vertical sells in. */
  unit?: string;
  sku?: string | null;
  barcode?: string | null;
  price_cents: number;
  cost_cents?: number;
  quantity?: number;
  compare_at_cents?: number | null;
  /**
   * Composition of a composite variant — what one of it is assembled from.
   * Only meaningful when the product is `kind: 'composite'`; replaced wholesale
   * on update, exactly like the attribute bag.
   */
  components?: ComponentInput[];
  /**
   * How the variant ARRIVES, as opposed to how it is counted (migration 054):
   * `pack_qty` base units per purchase pack, `pack_label` what it is called.
   * Both or neither — see `normalizePack`. A typing aid for the receiving
   * screens; stock, recipes and documents stay in base units.
   */
  pack_qty?: number | null;
  pack_label?: string | null;
}

export interface CreateProductInput {
  name: string;
  description?: string | null;
  /**
   * One line the guest reads under the dish's name — what is in it, written by
   * the owner (migration 060). Not the recipe. See `allergens.ts`.
   */
  composition?: string | null;
  /** Codes of the allergens the owner ticked; empty means «not said», not «none». */
  allergens?: string[];
  image_url?: string | null;
  variants: VariantInput[];
  needs_review?: boolean;
  created_from_document_id?: number | null;
  /** `composite` is a bouquet or a tech card: assembled from other variants. */
  kind?: ProductKind;
  /** Where a composite's stock lives. See composites.service.ts. */
  stock_mode?: ProductStockMode;
  /**
   * This card exists for ONE physical object — a bouquet made at the bench for
   * the window, not a product line that repeats. See migration `041` and
   * `TechDocs/POS_FLORIST_BENCH.md` §11.
   */
  one_off?: boolean;
  /**
   * On the sell screen. `false` for an ingredient or a semi-finished product:
   * the shelf, the documents, the stock count and every recipe still see it,
   * only the till does not (migration `044`, `TechDocs/POS_CAFE.md` §4.8).
   * Defaults to `true` — every product a clothing or flower shop has is sold.
   */
  sellable?: boolean;
}

/**
 * A composite is only as good as its composition, and a derived one keeps no
 * stock of its own — so the two ways to end up with a silently wrong catalogue
 * (a bouquet made of nothing, a bouquet carrying stock nobody will ever see)
 * are refused at the write, not discovered at the till.
 */
function resolveCompositeShape(
  kind: ProductKind | undefined,
  stockMode: ProductStockMode | undefined,
  fallback: { kind: ProductKind; stock_mode: ProductStockMode } = {
    kind: 'simple',
    stock_mode: 'own',
  }
): { kind: ProductKind; stock_mode: ProductStockMode } {
  const resolvedKind = kind ?? fallback.kind;
  if (resolvedKind !== 'simple' && resolvedKind !== 'composite') {
    throw new CompositeError(`Unknown product kind: ${String(kind)}`);
  }
  if (resolvedKind === 'simple') {
    if (stockMode === 'derived') {
      throw new CompositeError('Only a composite product can have derived stock');
    }
    return { kind: 'simple', stock_mode: 'own' };
  }
  const resolvedMode = stockMode ?? fallback.stock_mode;
  if (resolvedMode !== 'own' && resolvedMode !== 'derived') {
    throw new CompositeError(`Unknown stock_mode: ${String(stockMode)}`);
  }
  return { kind: 'composite', stock_mode: resolvedMode };
}

function assertVariantShape(
  shape: { kind: ProductKind; stock_mode: ProductStockMode },
  components: ComponentInput[] | undefined,
  quantity: number
): void {
  if (shape.kind === 'simple') {
    if (components?.length) {
      throw new CompositeError('Only a composite product can have components');
    }
    return;
  }
  if (shape.stock_mode === 'derived') {
    if (!components?.length) {
      throw new CompositeError('A derived composite needs at least one component');
    }
    if (quantity !== 0) {
      throw new CompositeError(
        'A derived composite has no stock of its own — its quantity must be 0'
      );
    }
  }
}

type DbClient = { query: typeof pool.query };

function emptyToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The purchase pack: both halves or neither (migration 054). A pack with no
 * name cannot be read off a screen and a name with no number cannot be
 * converted, so half a pair is refused rather than quietly dropped — the
 * receiving clerk would otherwise see a toggle that multiplies by nothing.
 *
 * Takes what the row has today so an update that mentions neither field keeps
 * it, and one that mentions either resolves against the other.
 */
function normalizePack(
  input: { pack_qty?: number | null; pack_label?: string | null },
  current: { pack_qty: number | null; pack_label: string } = { pack_qty: null, pack_label: '' }
): { pack_qty: number | null; pack_label: string } {
  const qty = input.pack_qty === undefined ? current.pack_qty : input.pack_qty;
  const rawLabel = input.pack_label === undefined ? current.pack_label : input.pack_label;
  const label = (rawLabel ?? '').trim();

  if (qty == null && label === '') return { pack_qty: null, pack_label: '' };
  if (qty == null) {
    throw new Error('Вкажіть, скільки одиниць в упаковці, або приберіть її назву');
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('Кількість в упаковці має бути цілим числом більше нуля');
  }
  if (label === '') {
    throw new Error('Вкажіть назву упаковки — наприклад «пляшка»');
  }
  if (label.length > 32) throw new Error('Назва упаковки задовга');
  return { pack_qty: qty, pack_label: label };
}

function normalizeCompareAt(
  priceCents: number,
  compareAt: number | null | undefined
): number | null {
  if (compareAt == null) return null;
  if (compareAt < 0) throw new Error('compare_at_cents must be >= 0');
  if (compareAt <= priceCents) {
    throw new Error('compare_at_cents must be greater than price_cents');
  }
  return compareAt;
}

export async function listProducts(storeId: number) {
  const products = await pool.query(
    `SELECT * FROM pos_products
     WHERE store_id = $1
     ORDER BY name ASC`,
    [storeId]
  );

  const variants = await pool.query(
    `SELECT v.*,
            -- Same rule as the catalog: a derived composite's quantity is what
            -- its leaves allow (the recipe expanded, migration 045), not the 0
            -- sitting on its own stock row.
            CASE
              WHEN p.kind = 'composite' AND p.stock_mode = 'derived' THEN COALESCE((
                SELECT MIN(FLOOR(COALESCE(cs.quantity, 0)::numeric / f.quantity_per_unit))
                FROM pos_product_components_flat f
                LEFT JOIN pos_stock cs
                  ON cs.variant_id = f.leaf_variant_id AND cs.store_id = f.store_id
                WHERE f.store_id = v.store_id AND f.variant_id = v.id
              ), 0)
              ELSE COALESCE(s.quantity, 0)
            END::int AS quantity
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN pos_stock s ON s.variant_id = v.id
     WHERE v.store_id = $1
     ORDER BY v.product_id, v.label, v.id`,
    [storeId]
  );

  const components = await listComponentsForStore(storeId);

  const byProduct = new Map<number, unknown[]>();
  // A size run reads S, M, L, XL — not the alphabet (see verticals/variantOrder.ts).
  for (const row of sortVariantRuns(
    variants.rows,
    (r) => Number(r.product_id),
    (r) => String(r.label ?? '')
  )) {
    const productId = Number(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push({
      id: Number(row.id),
      product_id: productId,
      attributes: row.attributes ?? {},
      label: row.label ?? '',
      unit: row.unit ?? '',
      sku: row.sku,
      barcode: row.barcode,
      price_cents: Number(row.price_cents),
      cost_cents: Number(row.cost_cents),
      compare_at_cents:
        row.compare_at_cents == null ? null : Number(row.compare_at_cents),
      is_active: row.is_active,
      quantity: Number(row.quantity),
      components: components.get(Number(row.id)) ?? [],
      // How it arrives, not how it is counted (migration 054).
      pack_qty: row.pack_qty == null ? null : Number(row.pack_qty),
      pack_label: String(row.pack_label ?? ''),
    });
    byProduct.set(productId, list);
  }

  const productIds = products.rows.map((p) => Number(p.id));
  const tagMap = await getProductTagIds(storeId, productIds);
  const groupMap = await listProductGroupIds(storeId, productIds);

  return products.rows.map((p) => ({
    id: Number(p.id),
    name: p.name,
    description: p.description,
    composition: p.composition ?? null,
    allergens: Array.isArray(p.allergens) ? (p.allergens as string[]) : [],
    image_url: p.image_url,
    is_active: p.is_active,
    needs_review: Boolean(p.needs_review),
    created_from_document_id:
      p.created_from_document_id == null ? null : Number(p.created_from_document_id),
    created_at: p.created_at,
    updated_at: p.updated_at,
    kind: (p.kind === 'composite' ? 'composite' : 'simple') as ProductKind,
    stock_mode: (p.stock_mode === 'derived' ? 'derived' : 'own') as ProductStockMode,
    sellable: p.sellable !== false,
    stop_listed_on: dateOnly(p.stop_listed_on),
    tag_ids: tagMap.get(Number(p.id)) ?? [],
    modifier_group_ids: groupMap.get(Number(p.id)) ?? [],
    variants: byProduct.get(Number(p.id)) ?? [],
  }));
}

export async function getProduct(storeId: number, productId: number) {
  const products = await listProducts(storeId);
  return products.find((p) => p.id === productId) ?? null;
}

/**
 * One variant of an existing product: the row, its stock row, the seed movement
 * and — for a composite — its composition. Shared by creating a product, adding
 * a variant and adding a batch of them, so the three cannot drift apart.
 *
 * A variant that arrives without a barcode gets one of the store's own when its
 * vertical says so (`autoBarcode`): the owner of a clothing shop prints a tag
 * for every garment and forgets the button that makes the number. An explicit
 * barcode is never replaced.
 */
async function insertVariantTx(
  client: DbClient,
  storeId: number,
  productId: number,
  shape: { kind: ProductKind; stock_mode: ProductStockMode },
  vertical: VerticalDefinition,
  variant: VariantInput
): Promise<number> {
  if (variant.price_cents == null || variant.price_cents < 0) {
    throw new Error('Variant price must be >= 0');
  }
  const quantity = variant.quantity ?? 0;
  if (quantity < 0) throw new Error('Quantity must be >= 0');
  assertVariantShape(shape, variant.components, quantity);

  const compareAt = normalizeCompareAt(variant.price_cents, variant.compare_at_cents);
  const derived = normalizeVariant(vertical, variant);
  const pack = normalizePack(variant);
  const barcode =
    emptyToNull(variant.barcode) ??
    (vertical.autoBarcode ? await generateInternalBarcode(storeId, client) : null);
  const variantResult = await client.query(
    `INSERT INTO pos_variants
       (store_id, product_id, attributes, label, unit, sku, barcode, price_cents, cost_cents, compare_at_cents,
        pack_qty, pack_label)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      storeId,
      productId,
      JSON.stringify(derived.attributes),
      derived.label,
      derived.unit,
      emptyToNull(variant.sku),
      barcode,
      variant.price_cents,
      variant.cost_cents ?? 0,
      compareAt,
      pack.pack_qty,
      pack.pack_label,
    ]
  );
  const variantId = Number(variantResult.rows[0].id);

  await client.query(
    `INSERT INTO pos_stock (variant_id, store_id, quantity)
     VALUES ($1, $2, $3)`,
    [variantId, storeId, quantity]
  );

  if (quantity > 0) {
    await client.query(
      `INSERT INTO pos_stock_movements
         (store_id, variant_id, delta, reason, note)
       VALUES ($1, $2, $3, 'seed', 'Initial stock')`,
      [storeId, variantId, quantity]
    );
  }

  if (shape.kind === 'composite') {
    await setComponents(client, storeId, variantId, variant.components ?? []);
  }
  return variantId;
}

/** Insert product+variants+stock inside an open transaction. qty>0 writes seed movement. */
export async function createProductInTx(
  client: DbClient,
  storeId: number,
  input: CreateProductInput
): Promise<{ productId: number; variantIds: number[] }> {
  if (!input.name?.trim()) throw new Error('Product name is required');
  if (!input.variants?.length) throw new Error('At least one variant is required');

  const shape = resolveCompositeShape(input.kind, input.stock_mode);

  const productResult = await client.query(
    `INSERT INTO pos_products
       (store_id, name, description, image_url, needs_review, created_from_document_id,
        kind, stock_mode, one_off, sellable, composition, allergens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[])
     RETURNING id`,
    [
      storeId,
      input.name.trim(),
      emptyToNull(input.description),
      emptyToNull(input.image_url),
      input.needs_review ?? false,
      input.created_from_document_id ?? null,
      shape.kind,
      shape.stock_mode,
      input.one_off ?? false,
      input.sellable ?? true,
      normalizeComposition(input.composition),
      normalizeAllergens(input.allergens),
    ]
  );
  const productId = Number(productResult.rows[0].id);
  const variantIds: number[] = [];
  const vertical = await loadStoreVertical(client, storeId);

  for (const variant of input.variants) {
    variantIds.push(await insertVariantTx(client, storeId, productId, shape, vertical, variant));
  }

  return { productId, variantIds };
}

/**
 * Variants onto an EXISTING product inside an open transaction — what a
 * receipt's stubs on a card become when the document is posted (clothing S1,
 * `stock-documents.service.ts`). Same row, stock row and barcode rules as the
 * owner's batch (`addVariants`), minus the transaction, which is the caller's.
 * Ids come back in input order. A composite is refused: its variants carry a
 * recipe no receipt line can describe.
 */
export async function insertVariantsTx(
  client: DbClient,
  storeId: number,
  productId: number,
  variants: VariantInput[]
): Promise<number[]> {
  const product = await client.query(
    `SELECT id, name, kind, stock_mode FROM pos_products WHERE id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  if (product.rows.length === 0) throw new Error('Product not found');
  if (product.rows[0].kind !== 'simple') {
    throw new Error(`«${String(product.rows[0].name)}» — складений товар, варіант з приходу до нього не додати`);
  }
  const shape = resolveCompositeShape(product.rows[0].kind, product.rows[0].stock_mode);
  const vertical = await loadStoreVertical(client, storeId);
  const ids: number[] = [];
  for (const variant of variants) {
    ids.push(await insertVariantTx(client, storeId, productId, shape, vertical, variant));
  }
  return ids;
}

export async function createProduct(storeId: number, input: CreateProductInput) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { productId } = await createProductInTx(client, storeId, input);
    await client.query('COMMIT');
    return getProduct(storeId, productId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reshaping an existing product is where stock can quietly vanish: switching a
 * product to `derived` hides whatever its own `pos_stock` rows hold, and
 * switching away from `composite` orphans the compositions. Both are refused
 * unless the owner has already emptied the thing they would strand.
 */
async function resolveProductShapeChange(
  client: DbClient,
  storeId: number,
  productId: number,
  input: { kind?: ProductKind; stock_mode?: ProductStockMode }
): Promise<{ kind: ProductKind; stock_mode: ProductStockMode }> {
  // Scalar subqueries, not joins: one variant with two components would appear
  // twice in a join, doubling `on_hand` and inflating the variant count past
  // the composed one — so the check would fire on a product that is fine.
  const current = await client.query(
    `SELECT p.kind, p.stock_mode,
            (SELECT COALESCE(SUM(st.quantity), 0)::int
               FROM pos_variants v
               LEFT JOIN pos_stock st ON st.variant_id = v.id
              WHERE v.product_id = p.id AND v.is_active = TRUE) AS on_hand,
            (SELECT COUNT(*)::int FROM pos_variants v
              WHERE v.product_id = p.id AND v.is_active = TRUE) AS variant_count,
            (SELECT COUNT(DISTINCT c.variant_id)::int
               FROM pos_product_components c
               JOIN pos_variants v ON v.id = c.variant_id
              WHERE v.product_id = p.id AND v.is_active = TRUE) AS composed_variants
     FROM pos_products p
     WHERE p.id = $1 AND p.store_id = $2`,
    [productId, storeId]
  );
  if (current.rows.length === 0) throw new Error('Product not found');
  const row = current.rows[0];
  const shape = resolveCompositeShape(input.kind, input.stock_mode, {
    kind: row.kind === 'composite' ? 'composite' : 'simple',
    stock_mode: row.stock_mode === 'derived' ? 'derived' : 'own',
  });

  if (shape.stock_mode === 'derived' && Number(row.on_hand) !== 0) {
    throw new CompositeError(
      'Sell or write off the remaining stock before switching to derived stock'
    );
  }
  if (shape.kind === 'composite' && shape.stock_mode === 'derived') {
    if (Number(row.composed_variants) < Number(row.variant_count)) {
      throw new CompositeError('Every variant of a derived composite needs a composition');
    }
  }
  if (shape.kind === 'simple' && Number(row.composed_variants) > 0) {
    // Deleting the compositions here would be silent data loss, and they are
    // exactly the thing that is tedious to re-enter. Make it the owner's call.
    throw new CompositeError('Clear the composition of every variant before making it simple');
  }
  return shape;
}

export async function updateProduct(
  storeId: number,
  productId: number,
  input: Partial<
    Pick<
      CreateProductInput,
      'name' | 'description' | 'composition' | 'allergens' | 'image_url' | 'kind' | 'stock_mode' | 'sellable'
    >
  > & {
    is_active?: boolean;
    needs_review?: boolean;
  }
) {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let i = 1;
  const reshaping = input.kind !== undefined || input.stock_mode !== undefined;

  // A reshape is a recipe write in disguise: flipping a semi-finished product
  // between made-in-advance and made-when-sold changes whether every dish
  // above it sees a leaf or an expansion. So it runs in a transaction, under
  // the store's recipe lock, and rebuilds the expanded recipes before commit.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (reshaping) {
      await lockRecipes(client, storeId);
      const shape = await resolveProductShapeChange(client, storeId, productId, input);
      sets.push(`kind = $${i++}`);
      values.push(shape.kind);
      sets.push(`stock_mode = $${i++}`);
      values.push(shape.stock_mode);
    }

    if (input.name !== undefined) {
      sets.push(`name = $${i++}`);
      values.push(input.name.trim());
    }
    if (input.description !== undefined) {
      sets.push(`description = $${i++}`);
      values.push(emptyToNull(input.description));
    }
    if (input.composition !== undefined) {
      sets.push(`composition = $${i++}`);
      values.push(normalizeComposition(input.composition));
    }
    if (input.allergens !== undefined) {
      sets.push(`allergens = $${i++}::text[]`);
      values.push(normalizeAllergens(input.allergens));
    }
    if (input.image_url !== undefined) {
      sets.push(`image_url = $${i++}`);
      values.push(emptyToNull(input.image_url));
    }
    if (input.is_active !== undefined) {
      sets.push(`is_active = $${i++}`);
      values.push(input.is_active);
    }
    if (input.sellable !== undefined) {
      sets.push(`sellable = $${i++}`);
      values.push(Boolean(input.sellable));
    }
    if (input.needs_review !== undefined) {
      sets.push(`needs_review = $${i++}`);
      values.push(input.needs_review);
    } else if (
      input.name !== undefined ||
      input.description !== undefined ||
      input.composition !== undefined ||
      input.allergens !== undefined ||
      input.image_url !== undefined
    ) {
      // First meaningful edit clears review flag
      sets.push(`needs_review = FALSE`);
    }

    values.push(productId, storeId);
    const result = await client.query(
      `UPDATE pos_products
       SET ${sets.join(', ')}
       WHERE id = $${i++} AND store_id = $${i}
       RETURNING id`,
      values
    );
    if (result.rows.length === 0) throw new Error('Product not found');
    if (reshaping) await recomputeFlat(client, storeId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getProduct(storeId, productId);
}

/** The product a variant is being added to, with the shape every variant must fit. */
async function loadProductShape(storeId: number, productId: number) {
  const product = await pool.query(
    `SELECT id, kind, stock_mode FROM pos_products WHERE id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  if (product.rows.length === 0) throw new Error('Product not found');
  return resolveCompositeShape(product.rows[0].kind, product.rows[0].stock_mode);
}

export async function addVariant(storeId: number, productId: number, variant: VariantInput) {
  const shape = await loadProductShape(storeId, productId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vertical = await loadStoreVertical(client, storeId);
    await insertVariantTx(client, storeId, productId, shape, vertical, variant);
    await client.query('COMMIT');
    return getProduct(storeId, productId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** The most variants one batch may add — a colour × size matrix is a few dozen. */
export const MAX_VARIANT_BATCH = 200;

/**
 * Several variants in ONE transaction — the size × colour matrix of a garment
 * (TechDocs/POS_CLOTHING.md, C1). All of them or none: a clash on the fortieth
 * leaves nothing half-added, and the answer says WHICH article or barcode was
 * taken (`describeUniqueViolation`) so the owner can fix that one row.
 */
export async function addVariants(storeId: number, productId: number, variants: VariantInput[]) {
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error('Додайте хоча б один варіант');
  }
  if (variants.length > MAX_VARIANT_BATCH) {
    throw new Error(`За один раз можна додати не більше ${MAX_VARIANT_BATCH} варіантів`);
  }
  const shape = await loadProductShape(storeId, productId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vertical = await loadStoreVertical(client, storeId);
    for (const variant of variants) {
      await insertVariantTx(client, storeId, productId, shape, vertical, variant);
    }
    await client.query('COMMIT');
    return getProduct(storeId, productId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw describeUniqueViolation(error);
  } finally {
    client.release();
  }
}

/**
 * A unique-index violation on an article or a barcode, in the owner's words and
 * naming the value; anything else comes back unchanged. The index is the
 * authority (`idx_pos_variants_store_sku` / `_barcode`) — this only reads its
 * complaint. The error keeps its pg `code`, so the route still answers 409.
 */
function describeUniqueViolation(error: unknown): unknown {
  const e = error as { code?: string; detail?: string; constraint?: string };
  if (e?.code !== '23505') return error;
  const value = /=\((?:[^,]*,\s*)?([^)]*)\)/.exec(e.detail ?? '')?.[1]?.trim();
  const what = /barcode/.test(e.constraint ?? '') ? 'Штрихкод' : /sku/.test(e.constraint ?? '') ? 'Артикул' : null;
  if (!what) return error;
  const out = new Error(`${what}${value ? ` «${value}»` : ''} вже є в магазині`) as Error & { code?: string };
  out.code = '23505';
  return out;
}

export async function updateVariant(
  storeId: number,
  variantId: number,
  input: Partial<VariantInput> & { is_active?: boolean }
) {
  const current = await pool.query(
    `SELECT v.*, p.kind, p.stock_mode
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE v.id = $1 AND v.store_id = $2`,
    [variantId, storeId]
  );
  if (current.rows.length === 0) throw new Error('Variant not found');
  const row = current.rows[0];
  const shape = resolveCompositeShape(row.kind, row.stock_mode);
  if (input.components !== undefined && shape.kind === 'simple') {
    throw new CompositeError('Only a composite product can have components');
  }
  if (
    input.components !== undefined &&
    shape.stock_mode === 'derived' &&
    input.components.length === 0
  ) {
    throw new CompositeError('A derived composite needs at least one component');
  }

  const price =
    input.price_cents !== undefined ? input.price_cents : Number(row.price_cents);
  if (price < 0) throw new Error('Variant price must be >= 0');

  let compareAt: number | null =
    row.compare_at_cents == null ? null : Number(row.compare_at_cents);
  if (input.compare_at_cents !== undefined) {
    compareAt = normalizeCompareAt(price, input.compare_at_cents);
  } else if (compareAt != null && compareAt <= price) {
    throw new Error('compare_at_cents must be greater than price_cents');
  }

  // The attribute bag is replaced wholesale, never merged key by key: the admin
  // form sends the whole set, and merging would make "clear this attribute"
  // unexpressible — the same trap the COALESCE form below fell into for `sku`.
  // `label` is always recomputed; it is a projection of the bag, not an input.
  const pack = normalizePack(input, {
    pack_qty: row.pack_qty == null ? null : Number(row.pack_qty),
    pack_label: String(row.pack_label ?? ''),
  });

  const vertical = await loadStoreVertical(pool, storeId);
  const derived = normalizeVariant(vertical, {
    attributes: input.attributes === undefined ? (row.attributes ?? {}) : input.attributes,
    unit: input.unit === undefined ? row.unit : input.unit,
  });

  // Resolve every column against the row we already read, then write them all.
  // The previous COALESCE form could not express "clear this field": an empty
  // sku/barcode became NULL, which COALESCE then read as "keep the old value",
  // so a SKU could be set but never removed.
  const client = await pool.connect();
  let productId: number;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE pos_variants
       SET
         attributes = $1::jsonb,
         label = $2,
         unit = $3,
         sku = $4,
         barcode = $5,
         price_cents = $6,
         cost_cents = $7,
         is_active = $8,
         compare_at_cents = $9,
         pack_qty = $10,
         pack_label = $11,
         updated_at = NOW()
       WHERE id = $12 AND store_id = $13
       RETURNING product_id`,
      [
        JSON.stringify(derived.attributes),
        derived.label,
        derived.unit,
        input.sku === undefined ? (row.sku ?? null) : emptyToNull(input.sku),
        input.barcode === undefined ? (row.barcode ?? null) : emptyToNull(input.barcode),
        price,
        input.cost_cents === undefined ? Number(row.cost_cents) : input.cost_cents,
        input.is_active === undefined ? row.is_active : input.is_active,
        compareAt,
        pack.pack_qty,
        pack.pack_label,
        variantId,
        storeId,
      ]
    );
    productId = Number(result.rows[0].product_id);
    if (input.components !== undefined) {
      await setComponents(client, storeId, variantId, input.components);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getProduct(storeId, productId);
}

export async function archiveProduct(storeId: number, productId: number) {
  const result = await pool.query(
    `UPDATE pos_products
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING id`,
    [productId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Product not found');
  await pool.query(
    `UPDATE pos_variants SET is_active = FALSE, updated_at = NOW()
     WHERE product_id = $1 AND store_id = $2`,
    [productId, storeId]
  );
  return getProduct(storeId, productId);
}

/**
 * Back from the archive: the card and every variant on it, in one transaction.
 * The mirror of `archiveProduct`, which takes all the variants down with the
 * card — so all of them come back, including one archived on its own before;
 * the owner archives that one again from the card. Stock, prices and barcodes
 * were never touched by archiving and are not touched here.
 */
export async function restoreProduct(storeId: number, productId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE pos_products
       SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1 AND store_id = $2
       RETURNING id`,
      [productId, storeId]
    );
    if (result.rows.length === 0) throw new Error('Product not found');
    await client.query(
      `UPDATE pos_variants SET is_active = TRUE, updated_at = NOW()
       WHERE product_id = $1 AND store_id = $2 AND is_active = FALSE`,
      [productId, storeId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getProduct(storeId, productId);
}

export async function archiveVariant(storeId: number, variantId: number) {
  const result = await pool.query(
    `UPDATE pos_variants
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND store_id = $2
     RETURNING product_id`,
    [variantId, storeId]
  );
  if (result.rows.length === 0) throw new Error('Variant not found');
  return getProduct(storeId, Number(result.rows[0].product_id));
}

/**
 * Mint a store-local barcode for an item whose tag will not scan.
 *
 * The counter is global and non-transactional, so a code handed out and never
 * saved is simply a gap — nothing is reserved or held. The authority for
 * uniqueness stays where it belongs, on `idx_pos_variants_store_barcode` at
 * INSERT time.
 *
 * The retry loop is not there for sequence collisions, which cannot happen. It
 * covers the two ways a `29…` code can already exist: an operator typing one in
 * by hand, and a database restored from a partial dump with a rewound sequence.
 */
export async function generateInternalBarcode(
  storeId: number,
  db: DbClient = pool
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const seq = await db.query<{ n: string }>(
      `SELECT nextval('pos_internal_barcode_seq')::bigint AS n`
    );
    const barcode = buildInternalBarcode(Number(seq.rows[0].n));
    const taken = await db.query(
      `SELECT 1 FROM pos_variants WHERE store_id = $1 AND barcode = $2 LIMIT 1`,
      [storeId, barcode]
    );
    if (taken.rows.length === 0) return barcode;
  }
  throw new Error('Не вдалося згенерувати вільний штрихкод');
}

/**
 * A DATE column as `YYYY-MM-DD`, whether pg handed it over as text (a `::text`
 * cast) or as the local-midnight Date its default parser makes of a DATE.
 */
function dateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export async function getCatalog(
  storeId: number,
  opts: {
    q?: string;
    barcode?: string;
    tag_id?: number;
    snapshot?: boolean;
    /**
     * Also return products that are not on the menu (`sellable = FALSE`).
     * The stock count on the till finds what it counts through this same
     * endpoint, and a café counts its milk — without this the one screen
     * that must see an ingredient would be the one that cannot.
     */
    includeUnsellable?: boolean;
    /** The store's vertical, when the caller already has it. Read otherwise. */
    vertical?: VerticalDefinition;
  } = {}
): Promise<CatalogItem[]> {
  // One read for the vertical and «today»: the stop-list below is a day.
  const clock = await storeClock(pool, storeId);
  const vertical = opts.vertical ?? clock.vertical;
  const params: unknown[] = [storeId];
  const conditions = [
    'p.store_id = $1',
    'p.is_active = TRUE',
    'v.is_active = TRUE',
  ];
  // The one place `sellable` is read (migration 044): an ingredient exists for
  // the shelf, the documents and the recipes, and this query is the till.
  if (!opts.includeUnsellable) conditions.push('p.sellable = TRUE');

  const snapshot = Boolean(opts.snapshot);

  if (!snapshot && opts.tag_id) {
    const tagIds = await resolveTagFilterIds(storeId, opts.tag_id);
    params.push(tagIds);
    conditions.push(
      `EXISTS (
         SELECT 1 FROM pos_product_tags pt
         WHERE pt.product_id = p.id AND pt.tag_id = ANY($${params.length}::bigint[])
       )`
    );
  }

  if (!snapshot && opts.barcode?.trim()) {
    params.push(opts.barcode.trim());
    conditions.push(`v.barcode = $${params.length}`);
  } else if (!snapshot && searchTokens(opts.q).length > 0) {
    // Every WORD has to match something about the variant (`searchTokens`), in
    // any order: «зайчик 86» is a product and a size, and no single field holds
    // both. The label covers whatever the vertical puts in it; the `inSearch`
    // attributes cover what it does not (a florist searching by country). A
    // range typed «98/104» finds the one saved «98-104» — both sides are folded
    // the same way — and a short number is a size, never an EAN fragment.
    // `pos/src/offline/catalog-filter.ts` mirrors all of this for the offline till.
    const searchKeys = searchableAttributeKeys(vertical);
    params.push(searchKeys);
    const keysIdx = params.length;
    const fold = (column: string) => `translate(lower(${column}), '–—/', '---')`;
    for (const token of searchTokens(opts.q)) {
      params.push(`%${escapeLike(token.text)}%`);
      const idx = params.length;
      // A short number is a size: it finds an article or a barcode only when
      // that IS the number, never as a fragment of an EAN.
      let codes: string;
      if (token.shortNumber) {
        params.push(token.text);
        const exact = params.length;
        codes = `OR lower(COALESCE(v.sku, '')) = $${exact}
        OR COALESCE(v.barcode, '') = $${exact}
        `;
      } else {
        codes = `OR ${fold("COALESCE(v.sku, '')")} LIKE $${idx}
        OR ${fold("COALESCE(v.barcode, '')")} LIKE $${idx}
        `;
      }
      conditions.push(
        `(${fold('p.name')} LIKE $${idx}
        OR ${fold('v.label')} LIKE $${idx}
        ${codes}OR EXISTS (
             SELECT 1 FROM jsonb_each_text(v.attributes) attr
             WHERE attr.key = ANY($${keysIdx}::text[]) AND ${fold('attr.value')} LIKE $${idx}
           ))`
      );
    }
  }

  const limit = snapshot ? 10000 : 200;

  const result = await pool.query(
    `SELECT
       v.id AS variant_id,
       p.id AS product_id,
       p.name AS product_name,
       v.attributes,
       v.label,
       v.unit,
       -- How it arrives, beside how it is counted (migration 054). The till
       -- needs it because the stock count is the one screen there that types a
       -- quantity in, and it rides into the offline snapshot for free.
       v.pack_qty,
       v.pack_label,
       v.sku,
       v.barcode,
       v.price_cents,
       v.compare_at_cents,
       -- What the till may offer, which is not the same as what is on the
       -- shelf: a parked cart holds its stems (migration 042), and a bouquet
       -- waiting on the counter has already taken its roses out of the fridge
       -- as far as the next customer is concerned. GREATEST(…, 0) because a
       -- sale is allowed to drive stock negative and a negative offer is not
       -- a fact about anything.
       --
       -- A derived composite has no stock of its own: what it can sell is what
       -- its leaves allow (the recipe expanded to shelves, migration 045),
       -- each of them net of what they are holding. An empty composition is
       -- 0, never unlimited.
       CASE
         WHEN p.kind = 'composite' AND p.stock_mode = 'derived' THEN COALESCE((
           SELECT MIN(FLOOR(
                    GREATEST(COALESCE(cs.quantity, 0) - COALESCE(cres.reserved, 0), 0)::numeric
                    / f.quantity_per_unit
                  ))
           FROM pos_product_components_flat f
           LEFT JOIN pos_stock cs
             ON cs.variant_id = f.leaf_variant_id AND cs.store_id = f.store_id
           LEFT JOIN pos_stock_reserved cres
             ON cres.variant_id = f.leaf_variant_id AND cres.store_id = f.store_id
           WHERE f.store_id = p.store_id AND f.variant_id = v.id
         ), 0)
         ELSE GREATEST(COALESCE(s.quantity, 0) - COALESCE(res.reserved, 0), 0)
       END::int AS quantity,
       p.image_url,
       p.kind,
       p.stock_mode,
       -- A card that exists for ONE physical bouquet, not for a product line.
       -- The till needs it to tell the window apart from the catalogue: both
       -- are composite+own, and only the one-off may be written off from here.
       p.one_off,
       p.sellable,
       -- As text: node-postgres would parse a DATE into a local-midnight
       -- Date, and the store's day is a string everywhere else.
       p.stop_listed_on::text AS stop_listed_on,
       -- The till needs the recipe, not just the fact of one: the florist's
       -- bench starts a custom bouquet from the catalogue card's composition,
       -- and a composite it cannot read is a card it cannot sell from. Only
       -- composites carry it, so this is a handful of rows.
       CASE WHEN p.kind = 'composite' THEN COALESCE((
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'component_variant_id', c.component_variant_id,
                    'quantity', c.quantity,
                    'product_name', cp.name,
                    'label', cv.label,
                    'unit', cv.unit
                  ) ORDER BY c.sort_order, c.id
                )
         FROM pos_product_components c
         JOIN pos_variants cv ON cv.id = c.component_variant_id
         JOIN pos_products cp ON cp.id = cv.product_id
         WHERE c.store_id = p.store_id AND c.variant_id = v.id
       ), '[]'::jsonb) END AS components,
       COALESCE(
         (SELECT array_agg(pt.tag_id) FROM pos_product_tags pt WHERE pt.product_id = p.id),
         '{}'::bigint[]
       ) AS tag_ids
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     LEFT JOIN pos_stock s ON s.variant_id = v.id
     LEFT JOIN pos_stock_reserved res
       ON res.variant_id = v.id AND res.store_id = p.store_id
     WHERE ${conditions.join(' AND ')}
     -- p.id between the name and the label: two cards called «Костюмчик Зайчик» must
     -- not interleave their variants, or the size order (applied per product after
     -- this query) would see one product's rows split by another's.
     ORDER BY p.name ASC, p.id ASC, v.label ASC, v.id ASC
     LIMIT ${limit}`,
    params
  );

  // The questions the till asks about each product. One query for the whole
  // answer, and absent (not empty) on a product that asks none — the till
  // opens the modifier sheet only when there is something to choose.
  const groupsByProduct = await loadGroupsForProducts(
    pool,
    storeId,
    [...new Set(result.rows.map((row) => Number(row.product_id)))],
    { activeOnly: true }
  );

  return sortVariantRuns(
    result.rows,
    (r) => Number(r.product_id),
    (r) => String(r.label ?? '')
  ).map((row) => ({
    variant_id: Number(row.variant_id),
    product_id: Number(row.product_id),
    product_name: row.product_name,
    attributes: row.attributes ?? {},
    label: row.label ?? '',
    unit: row.unit ?? '',
    sku: row.sku,
    barcode: row.barcode,
    price_cents: Number(row.price_cents),
    compare_at_cents:
      row.compare_at_cents == null ? null : Number(row.compare_at_cents),
    quantity: Number(row.quantity),
    image_url: row.image_url,
    kind: (row.kind === 'composite' ? 'composite' : 'simple') as ProductKind,
    stock_mode: (row.stock_mode === 'derived' ? 'derived' : 'own') as ProductStockMode,
    one_off: Boolean(row.one_off),
    sellable: row.sellable !== false,
    pack_qty: row.pack_qty == null ? null : Number(row.pack_qty),
    pack_label: String(row.pack_label ?? ''),
    // The day's stop-list (migration 050): the row stays in the answer so the
    // tile greys with a caption instead of vanishing (§3 «видно, а не
    // зникло»); the raw day travels too, so an offline till can un-grey it at
    // midnight on its own.
    stop_listed: row.stop_listed_on === clock.today,
    stop_listed_on: row.stop_listed_on ?? null,
    // Absent for a simple product rather than an empty array: "this card has
    // no recipe" and "this bouquet's recipe is empty" are different facts, and
    // only the second one is a problem.
    ...(row.kind === 'composite'
      ? {
          components: (row.components ?? []).map((c: Record<string, unknown>) => ({
            component_variant_id: Number(c.component_variant_id),
            quantity: Number(c.quantity),
            product_name: String(c.product_name ?? ''),
            label: String(c.label ?? ''),
            unit: String(c.unit ?? ''),
          })),
        }
      : {}),
    ...(groupsByProduct.has(Number(row.product_id))
      ? {
          // Per row, because an answer may cost more on the bigger size (066):
          // each variant's row carries what the answers cost on IT.
          modifier_groups: groupsForVariant(
            groupsByProduct.get(Number(row.product_id))!,
            String(row.label ?? '')
          ).map(toCatalogGroup),
        }
      : {}),
    tag_ids: Array.isArray(row.tag_ids) ? row.tag_ids.map((id: string | number) => Number(id)) : [],
  }));
}
