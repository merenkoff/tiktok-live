// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/techcards-import.service.ts — «Імпорт техкарт» on /admin/tech-cards
// (TechDocs/POS_ONBOARDING.md, O3): a table of dish → ingredient → quantity →
// purchase price, in the owner's words, turned into recipes. One plan serves
// the preview and the write (the markdowns pattern), and the write is all or
// nothing: a table with one bad row changes nothing, and the preview names
// every row to fix.
//
// What it does, per the rules every hand edit already follows:
//   · an ingredient it does not find is created — `sellable = false`, tagged
//     «Складники», its price stored per BASE unit (kopecks per gram, per ml,
//     per piece), because that is what `cost_cents` has always meant;
//   · a dish found as `simple` with nothing on the shelf becomes a `derived`
//     composite (cooked when sold, availability from its ingredients); one
//     with stock is refused — a derived dish has no shelf of its own, so the
//     owner writes the stock off or counts it first;
//   · a composite dish gets its composition replaced wholesale, `own` stays own.

import { pool } from '../db.js';
import { logger } from '../logger.js';
import { lockRecipes, recomputeFlat, setComponents } from './composites.service.js';
import { createProductInTx } from './products.service.js';
import { invalidatePublicMenu } from './public-menu/menu.service.js';
import { verticalOrDefault } from './verticals/index.js';

/** A whole-request refusal (not a row's) → 400. */
export class TechCardImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TechCardImportError';
  }
}

export const MAX_TECH_CARD_ROWS = 5000;
const INGREDIENT_TAG = 'Складники';

export interface TechCardRowInput {
  line?: unknown;
  dish?: unknown;
  variant?: unknown;
  ingredient?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
}

type BaseUnit = 'г' | 'мл' | 'шт';

const UNITS: Record<string, { base: BaseUnit; factor: number }> = {
  г: { base: 'г', factor: 1 }, гр: { base: 'г', factor: 1 }, g: { base: 'г', factor: 1 },
  кг: { base: 'г', factor: 1000 }, kg: { base: 'г', factor: 1000 },
  мл: { base: 'мл', factor: 1 }, ml: { base: 'мл', factor: 1 },
  л: { base: 'мл', factor: 1000 }, l: { base: 'мл', factor: 1000 },
  шт: { base: 'шт', factor: 1 }, pcs: { base: 'шт', factor: 1 }, pc: { base: 'шт', factor: 1 },
};
/** What the price column is per, for each base unit. */
const PRICE_PER: Record<BaseUnit, { word: string; baseUnits: number }> = {
  г: { word: 'кг', baseUnits: 1000 },
  мл: { word: 'л', baseUnits: 1000 },
  шт: { word: 'шт', baseUnits: 1 },
};

export interface PlannedComponent {
  ingredient: string;
  quantity: number;
  unit: BaseUnit;
  is_new: boolean;
}

export interface PlannedDish {
  dish: string;
  variant: string | null;
  product_id: number | null;
  variant_id: number | null;
  components: PlannedComponent[];
  /** Kopecks one portion costs at the planned prices; null when a part has no price. */
  cost_cents: number | null;
  price_cents: number | null;
  food_cost_bps: number | null;
  /** `derived` — a simple dish that becomes a recipe; `replaced` — a composite whose recipe is rewritten. */
  becomes: 'derived' | 'replaced' | null;
  error: string | null;
}

export interface PlannedIngredient {
  name: string;
  unit: BaseUnit;
  cost_cents: number | null;
  is_new: boolean;
  price_changed: boolean;
}

export interface TechCardImportPlan {
  ok: boolean;
  /** Rows that could not be read at all, with their line. */
  errors: string[];
  warnings: string[];
  dishes: PlannedDish[];
  ingredients: PlannedIngredient[];
  totals: { dishes: number; becomes_derived: number; replaced: number; ingredients_new: number; prices_set: number };
}

export interface TechCardImportResult extends TechCardImportPlan {
  applied: boolean;
}

interface CatalogVariant {
  id: number;
  label: string;
  unit: string;
  cost_cents: number;
  price_cents: number;
  on_hand: number;
  weighed: boolean;
}
interface CatalogProduct {
  id: number;
  name: string;
  kind: 'simple' | 'composite';
  stock_mode: 'own' | 'derived';
  variants: CatalogVariant[];
}

interface ParsedRow {
  line: number;
  dish: string;
  variant: string | null;
  ingredient: string;
  quantity: number;
  unit: BaseUnit;
  /** Kopecks per base unit, or undefined when the row carries no price. */
  cost?: number;
}

const lower = (s: string) => s.toLocaleLowerCase('uk-UA').replace(/\s+/g, ' ').trim();

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : typeof value === 'number' ? String(value) : '';
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseRows(input: TechCardRowInput[], warnings: string[]): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  input.forEach((raw, index) => {
    const line = Number.isInteger(Number(raw.line)) && Number(raw.line) > 0 ? Number(raw.line) : index + 2;
    const at = `Рядок ${line}`;
    const dish = text(raw.dish, 200);
    const ingredient = text(raw.ingredient, 200);
    if (!dish && !ingredient && !text(raw.quantity, 20)) return; // an empty spreadsheet row
    if (!dish) return void errors.push(`${at}: не вказано страву`);
    if (!ingredient) return void errors.push(`${at}: не вказано складник для «${dish}»`);
    const unitWord = lower(text(raw.unit, 10)).replace(/\.$/, '');
    const unit = UNITS[unitWord];
    if (!unit) return void errors.push(`${at}: одиниця «${text(raw.unit, 10)}» — потрібна г, кг, мл, л або шт`);
    const amount = number(raw.quantity);
    if (amount == null || amount <= 0) return void errors.push(`${at}: кількість «${text(raw.quantity, 20)}» — потрібне додатне число`);
    const quantity = amount * unit.factor;
    if (Math.abs(quantity - Math.round(quantity)) > 1e-6) {
      return void errors.push(`${at}: ${text(raw.quantity, 20)} ${unitWord} — у техкарті лише цілі ${unit.base}`);
    }
    const row: ParsedRow = {
      line,
      dish,
      variant: text(raw.variant, 120) || null,
      ingredient,
      quantity: Math.round(quantity),
      unit: unit.base,
    };
    const priceText = text(raw.price, 20);
    if (priceText) {
      const price = number(priceText);
      if (price == null || price < 0) return void errors.push(`${at}: ціна «${priceText}» — потрібне число, грн за ${PRICE_PER[unit.base].word}`);
      // The price column is per kg / l / piece; `cost_cents` is per base unit.
      const exact = (price * 100) / PRICE_PER[unit.base].baseUnits;
      let cost = Math.round(exact);
      if (exact > 0 && cost === 0) {
        cost = 1;
        warnings.push(
          `«${ingredient}» дешевший за копійку за ${unit.base} — записано 1 коп/${unit.base}, бо 0 означав би «ціна невідома»`
        );
      }
      row.cost = cost;
    }
    rows.push(row);
  });
  return { rows, errors };
}

async function loadCatalog(storeId: number): Promise<Map<string, CatalogProduct[]>> {
  const result = await pool.query(
    `SELECT p.id, p.name, p.kind, p.stock_mode,
            v.id AS variant_id, v.label, v.unit, v.cost_cents, v.price_cents, v.price_per,
            COALESCE(s.quantity, 0)::int AS on_hand
       FROM pos_products p
       JOIN pos_variants v ON v.product_id = p.id AND v.is_active
       LEFT JOIN pos_stock s ON s.variant_id = v.id AND s.store_id = p.store_id
      WHERE p.store_id = $1 AND p.is_active
      ORDER BY p.id, v.id`,
    [storeId]
  );
  const byId = new Map<number, CatalogProduct>();
  for (const r of result.rows) {
    const id = Number(r.id);
    let product = byId.get(id);
    if (!product) {
      product = {
        id,
        name: String(r.name),
        kind: r.kind === 'composite' ? 'composite' : 'simple',
        stock_mode: r.stock_mode === 'derived' ? 'derived' : 'own',
        variants: [],
      };
      byId.set(id, product);
    }
    product.variants.push({
      id: Number(r.variant_id),
      label: String(r.label ?? ''),
      unit: String(r.unit ?? 'шт'),
      cost_cents: Number(r.cost_cents ?? 0),
      price_cents: Number(r.price_cents ?? 0),
      on_hand: Number(r.on_hand ?? 0),
      weighed: Number(r.price_per ?? 1) > 1,
    });
  }
  const byName = new Map<string, CatalogProduct[]>();
  for (const product of byId.values()) {
    const key = lower(product.name);
    byName.set(key, [...(byName.get(key) ?? []), product]);
  }
  return byName;
}

async function buildPlan(storeId: number, input: TechCardRowInput[]): Promise<{ plan: TechCardImportPlan; rows: ParsedRow[]; catalog: Map<string, CatalogProduct[]> }> {
  const store = (await pool.query(`SELECT vertical FROM pos_stores WHERE id = $1`, [storeId])).rows[0];
  if (!store) throw new TechCardImportError('Магазин не знайдено');
  const vertical = verticalOrDefault(store.vertical as string | null);
  if (!vertical.productKinds.includes('composite')) {
    throw new TechCardImportError(`У магазину з типом «${vertical.title}» немає складених товарів — техкарти тут не ведуться`);
  }
  if (!Array.isArray(input) || input.length === 0) throw new TechCardImportError('Таблиця порожня');
  if (input.length > MAX_TECH_CARD_ROWS) throw new TechCardImportError(`Забагато рядків: не більше ${MAX_TECH_CARD_ROWS}`);

  const warnings: string[] = [];
  const { rows, errors } = parseRows(input, warnings);
  const catalog = await loadCatalog(storeId);
  const dishNames = new Set(rows.map((r) => lower(r.dish)));

  // ── Ingredients ──
  const ingredients = new Map<string, PlannedIngredient & { variant?: CatalogVariant; errorText?: string; seenPrice?: number }>();
  for (const row of rows) {
    const key = lower(row.ingredient);
    let entry = ingredients.get(key);
    if (!entry) {
      const found = catalog.get(key) ?? [];
      entry = { name: row.ingredient, unit: row.unit, cost_cents: null, is_new: found.length === 0, price_changed: false };
      if (found.length > 1) entry.errorText = `складник «${row.ingredient}» неоднозначний: у магазині ${found.length} товари з такою назвою`;
      else if (found.length === 1) {
        const [product] = found;
        if (product.variants.length !== 1) {
          entry.errorText = `у складника «${row.ingredient}» кілька варіантів — складником може бути товар з одним варіантом`;
        } else {
          entry.variant = product.variants[0];
          entry.unit = product.variants[0].unit as BaseUnit;
          entry.cost_cents = product.variants[0].cost_cents || null;
          if (product.variants[0].weighed) entry.errorText = `«${row.ingredient}» продається на вагу — ваговий товар не може бути складником`;
        }
      }
      ingredients.set(key, entry);
    }
    if (!entry.errorText && entry.unit !== row.unit) {
      errors.push(`Рядок ${row.line}: «${row.ingredient}» ведеться в ${entry.unit}, а в таблиці — ${row.unit}`);
    }
    if (row.cost !== undefined) {
      if (entry.seenPrice !== undefined && entry.seenPrice !== row.cost) {
        warnings.push(`«${row.ingredient}»: різні ціни в таблиці — береться остання (рядок ${row.line})`);
      }
      entry.seenPrice = row.cost;
      entry.price_changed = entry.is_new || entry.variant?.cost_cents !== row.cost;
      entry.cost_cents = row.cost;
    }
  }
  for (const entry of ingredients.values()) {
    if (entry.errorText) errors.push(entry.errorText[0].toUpperCase() + entry.errorText.slice(1));
    else if (entry.is_new && entry.cost_cents == null) warnings.push(`«${entry.name}» без ціни — фудкост страв із ним буде «—», доки не прийде прихід`);
  }

  // ── Dishes ──
  const groups = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const key = `${lower(row.dish)}\u0000${lower(row.variant ?? '')}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const dishes: PlannedDish[] = [];
  const coveredByProduct = new Map<number, Set<number>>();
  for (const group of groups.values()) {
    const first = group[0];
    const dish: PlannedDish = {
      dish: first.dish,
      variant: first.variant,
      product_id: null,
      variant_id: null,
      components: [],
      cost_cents: null,
      price_cents: null,
      food_cost_bps: null,
      becomes: null,
      error: null,
    };
    dishes.push(dish);
    const found = catalog.get(lower(first.dish)) ?? [];
    if (found.length === 0) {
      dish.error = `страви «${first.dish}» немає в магазині — спершу імпортуйте меню або створіть картку`;
      continue;
    }
    if (found.length > 1) {
      dish.error = `«${first.dish}»: у магазині ${found.length} товари з такою назвою — перейменуйте один`;
      continue;
    }
    const product = found[0];
    dish.product_id = product.id;
    let variant: CatalogVariant | undefined;
    if (first.variant) {
      variant = product.variants.find((v) => lower(v.label) === lower(first.variant!));
      if (!variant) {
        dish.error = `у «${product.name}» немає варіанта «${first.variant}» (є: ${product.variants.map((v) => v.label || '—').join(', ')})`;
        continue;
      }
    } else if (product.variants.length === 1) {
      variant = product.variants[0];
    } else {
      dish.error = `у «${product.name}» кілька варіантів (${product.variants.map((v) => v.label || '—').join(', ')}) — вкажіть варіант`;
      continue;
    }
    dish.variant_id = variant.id;
    dish.price_cents = variant.price_cents;
    if (variant.weighed) {
      dish.error = `«${product.name}» продається на вагу — складена страва на вагу не продається`;
      continue;
    }
    if (product.kind === 'simple') {
      const onHand = product.variants.reduce((n, v) => n + v.on_hand, 0);
      if (onHand !== 0) {
        dish.error = `«${product.name}»: на полиці ${onHand} — страва з техкартою не має свого залишку, тож спершу спишіть його або проведіть інвентаризацію`;
        continue;
      }
      dish.becomes = 'derived';
    } else {
      dish.becomes = 'replaced';
    }
    coveredByProduct.set(product.id, (coveredByProduct.get(product.id) ?? new Set()).add(variant.id));

    // The rows of one dish: a repeated ingredient is summed (the editor keeps one row per part).
    const parts = new Map<string, PlannedComponent>();
    for (const row of group) {
      const key = lower(row.ingredient);
      if (key === lower(product.name)) {
        dish.error = `«${product.name}» не може бути складником самої себе (рядок ${row.line})`;
        break;
      }
      const ing = ingredients.get(key)!;
      const prev = parts.get(key);
      if (prev) {
        prev.quantity += row.quantity;
        warnings.push(`«${product.name}»: «${row.ingredient}» двічі — кількості додано`);
      } else {
        parts.set(key, { ingredient: ing.name, quantity: row.quantity, unit: row.unit, is_new: ing.is_new });
      }
    }
    if (dish.error) continue;
    dish.components = [...parts.values()];
    let cost = 0;
    for (const part of dish.components) {
      const ing = ingredients.get(lower(part.ingredient))!;
      // A recipe inside a recipe has no single price here; the tech-card page computes it.
      if (ing.cost_cents == null || dishNames.has(lower(part.ingredient))) {
        cost = Number.NaN;
        break;
      }
      cost += part.quantity * ing.cost_cents;
    }
    dish.cost_cents = Number.isNaN(cost) ? null : cost;
    dish.food_cost_bps =
      dish.cost_cents != null && dish.price_cents ? Math.round((dish.cost_cents / dish.price_cents) * 10000) : null;
  }

  // A derived dish needs a recipe on EVERY variant — say which ones are missing.
  for (const dish of dishes) {
    if (dish.error || dish.becomes !== 'derived' || dish.product_id == null) continue;
    const product = [...catalog.values()].flat().find((p) => p.id === dish.product_id)!;
    const covered = coveredByProduct.get(product.id)!;
    const missing = product.variants.filter((v) => !covered.has(v.id));
    if (missing.length) {
      dish.error = `у «${product.name}» техкарта потрібна кожному варіанту — бракує: ${missing.map((v) => v.label || '—').join(', ')}`;
    }
  }

  const ingredientList = [...ingredients.values()].map(({ name, unit, cost_cents, is_new, price_changed }) => ({
    name,
    unit,
    cost_cents,
    is_new,
    price_changed,
  }));
  const ok = errors.length === 0 && dishes.every((d) => !d.error);
  return {
    plan: {
      ok,
      errors,
      warnings,
      dishes,
      ingredients: ingredientList,
      totals: {
        dishes: dishes.length,
        becomes_derived: dishes.filter((d) => !d.error && d.becomes === 'derived').length,
        replaced: dishes.filter((d) => !d.error && d.becomes === 'replaced').length,
        ingredients_new: ingredientList.filter((i) => i.is_new).length,
        prices_set: ingredientList.filter((i) => i.price_changed).length,
      },
    },
    rows,
    catalog,
  };
}

export async function planTechCardImport(storeId: number, input: TechCardRowInput[]): Promise<TechCardImportPlan> {
  return (await buildPlan(storeId, input)).plan;
}

/**
 * Write the plan — only a plan with no error at all. One transaction under
 * the store's recipe lock: the ingredients, their prices, every dish's shape
 * and composition, then the expanded recipes once at the end.
 */
export async function applyTechCardImport(storeId: number, input: TechCardRowInput[]): Promise<TechCardImportResult> {
  const { plan, catalog } = await buildPlan(storeId, input);
  if (!plan.ok) return { ...plan, applied: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockRecipes(client, storeId);

    let tagId: number;
    const tag = await client.query(
      `SELECT id FROM pos_tags WHERE store_id = $1 AND parent_id IS NULL AND lower(name) = lower($2)`,
      [storeId, INGREDIENT_TAG]
    );
    if (tag.rows.length) tagId = Number(tag.rows[0].id);
    else {
      const created = await client.query(
        `INSERT INTO pos_tags (store_id, name, sort_order, show_in_catalog_bar) VALUES ($1, $2, 999, FALSE) RETURNING id`,
        [storeId, INGREDIENT_TAG]
      );
      tagId = Number(created.rows[0].id);
    }

    // Ingredients: the variant each one is in a recipe as — the one the plan
    // found (a single-variant product), or the one created here.
    const variantOf = new Map<string, number>();
    for (const ing of plan.ingredients) {
      const key = lower(ing.name);
      const found = catalog.get(key)?.[0];
      if (found) variantOf.set(key, found.variants[0].id);
      if (ing.is_new) {
        const { productId, variantIds } = await createProductInTx(client, storeId, {
          name: ing.name,
          sellable: false,
          variants: [{ attributes: {}, unit: ing.unit, price_cents: 0, cost_cents: ing.cost_cents ?? 0, quantity: 0 }],
        });
        await client.query(`INSERT INTO pos_product_tags (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
          productId,
          tagId,
        ]);
        variantOf.set(key, variantIds[0]);
      } else if (ing.price_changed && ing.cost_cents != null) {
        await client.query(
          `UPDATE pos_variants SET cost_cents = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3`,
          [ing.cost_cents, variantOf.get(key), storeId]
        );
      }
    }

    // Dishes: the shape first (a simple dish has nothing on the shelf — the
    // plan checked, and the row lock re-checks), then each variant's recipe.
    const reshaped = new Set<number>();
    for (const dish of plan.dishes) {
      if (dish.becomes === 'derived' && !reshaped.has(dish.product_id!)) {
        const shelf = await client.query(
          `SELECT COALESCE(SUM(s.quantity), 0)::int AS n
             FROM pos_variants v LEFT JOIN pos_stock s ON s.variant_id = v.id
            WHERE v.product_id = $1 AND v.is_active`,
          [dish.product_id]
        );
        if (Number(shelf.rows[0].n) !== 0) {
          throw new TechCardImportError(`«${dish.dish}»: на полиці щойно з’явився залишок — імпорт не застосовано`);
        }
        await client.query(
          `UPDATE pos_products SET kind = 'composite', stock_mode = 'derived', updated_at = NOW() WHERE id = $1 AND store_id = $2`,
          [dish.product_id, storeId]
        );
        reshaped.add(dish.product_id!);
      }
      await setComponents(
        client,
        storeId,
        dish.variant_id!,
        dish.components.map((c) => ({ component_variant_id: variantOf.get(lower(c.ingredient))!, quantity: c.quantity })),
        { recompute: false }
      );
    }
    await recomputeFlat(client, storeId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof TechCardImportError) throw error;
    throw new TechCardImportError(`Імпорт не застосовано: ${(error as Error).message}`);
  } finally {
    client.release();
  }

  invalidatePublicMenu(storeId);
  logger.info('tech-card import applied', { storeId, ...plan.totals });
  return { ...plan, applied: true };
}
