// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/marketer.ts — what the marketer may change on a route it is let into
// (track МР, TechDocs/POS_MARKETER_ROLE.md §2.1, decisions М4, М5, М7).
//
// `core/roles.ts` decides which ROUTES a marketer reaches; this file decides
// which FIELDS on them. A product card is the menu, except for the parts that
// are the kitchen's, the stock's or the register's: the purchase price, the
// shelf, the recipe and the product's shape, the purchase pack, the bottle and
// everything fiscal. The marketer reads none of the money and stock and
// changes none of the rest — a field sent with the value it already has is
// not a change, so a form that resends the whole card still saves.

import { MARKETER_FORBIDDEN } from './core/roles.js';

/** A marketer's write that touches a field only the owner changes — answered 403. */
export class MarketerFieldError extends Error {
  readonly code = 'role_forbidden';
  constructor(field: string) {
    super(`${MARKETER_FORBIDDEN} (${field})`);
    this.name = 'MarketerFieldError';
  }
}

/** The owner's half of a product card, in the words the refusal names it by. */
const PRODUCT_FIELDS: Record<string, string> = {
  kind: 'вид товару',
  stock_mode: 'вид товару',
  one_off: 'вид товару',
  created_from_document_id: 'прихід',
  fiscal_register: 'каса',
  fiscal_excise: 'акциз',
  excise_per_unit: 'акциз',
  fiscal_uktzed: 'УКТ ЗЕД',
};

const VARIANT_FIELDS: Record<string, string> = {
  cost_cents: 'закупівельна ціна',
  quantity: 'залишок',
  components: 'техкарта',
  pack_qty: 'фасування',
  pack_label: 'фасування',
  bottle_ml: 'пляшка за маркою',
};

/** What a field holds when nobody set it — a new card's value. */
const DEFAULTS: Record<string, unknown> = {
  kind: 'simple',
  stock_mode: 'own',
  one_off: false,
  created_from_document_id: null,
  fiscal_register: null,
  fiscal_excise: false,
  excise_per_unit: false,
  fiscal_uktzed: null,
  cost_cents: 0,
  quantity: 0,
  components: [],
  pack_qty: null,
  pack_label: null,
  bottle_ml: null,
};

/** null, undefined, '' and false-for-flags read alike; numbers by value; recipes by content. */
function normalize(field: string, value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (field === 'components') {
    if (!Array.isArray(value) || value.length === 0) return null;
    return JSON.stringify(
      value
        .map((c) => ({
          v: Number((c as { component_variant_id?: unknown }).component_variant_id),
          q: Number((c as { quantity?: unknown }).quantity),
        }))
        .sort((a, b) => a.v - b.v || a.q - b.q)
    );
  }
  if (typeof value === 'boolean') return value ? true : null;
  if (field === 'fiscal_register' && Number(value) === 1) return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value))) {
    const n = Number(value);
    return n === 0 && field !== 'fiscal_register' ? null : n;
  }
  return value;
}

function check(
  input: Record<string, unknown>,
  fields: Record<string, string>,
  current: Record<string, unknown> | null
): void {
  for (const [field, words] of Object.entries(fields)) {
    if (!(field in input) || input[field] === undefined) continue;
    const before = current ? current[field] : DEFAULTS[field];
    if (normalize(field, input[field]) !== normalize(field, before)) throw new MarketerFieldError(words);
  }
}

/**
 * Refuse a marketer's product write that changes the owner's half of the card
 * (`current` = the card as it stands, null for a new one), its variants
 * included when the body carries them.
 */
export function assertMarketerProductWrite(
  input: unknown,
  current: Record<string, unknown> | null
): void {
  const body = (input ?? {}) as Record<string, unknown>;
  check(body, PRODUCT_FIELDS, current);
  if (Array.isArray(body.variants)) {
    for (const variant of body.variants) assertMarketerVariantWrite(variant, null);
  }
}

/** The same for one variant: a new one (`current` null) or an edit of `current`. */
export function assertMarketerVariantWrite(input: unknown, current: Record<string, unknown> | null): void {
  check((input ?? {}) as Record<string, unknown>, VARIANT_FIELDS, current);
}

/**
 * Products as the marketer reads them: no purchase price and no stock. Any
 * answer of the product routes goes through — a list, a card, a variant — and
 * every object priced for sale (`price_cents`) loses `cost_cents` and
 * `quantity`; a recipe line keeps its `quantity`, which is the recipe.
 */
export function catalogForMarketer<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => catalogForMarketer(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const source = value as Record<string, unknown>;
    const priced = 'price_cents' in source;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (priced && (key === 'cost_cents' || key === 'quantity')) continue;
      out[key] = catalogForMarketer(item);
    }
    return out as T;
  }
  return value;
}

/**
 * Guests' feedback as the marketer reads it (М7): every `phone` taken out,
 * wherever the answer nests it — the guest left it for the owner's call-back.
 */
export function withoutPhones<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutPhones(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'phone') continue;
      out[key] = withoutPhones(item);
    }
    return out as T;
  }
  return value;
}

/**
 * The guest-menu switches only the owner flips (М5): guest ordering, sending
 * it straight to the kitchen and its limit, calling a waiter — the hall's
 * work, and `auto_kitchen` needs the owner's own confirmation of the risks.
 * Rotating the menu's address is a route of its own and stays the owner's.
 */
export const OWNER_ONLY_MENU_SWITCHES: Record<string, string> = {
  ordering_enabled: 'замовлення з телефону',
  call_enabled: 'виклик офіціанта',
  auto_kitchen: 'одразу на кухню',
  auto_kitchen_ack: 'одразу на кухню',
  auto_limit_cents: 'одразу на кухню',
};

/** Refuse a marketer's guest-menu patch that names an owner-only switch. */
export function assertMarketerMenuPatch(body: Record<string, unknown>): void {
  for (const [field, words] of Object.entries(OWNER_ONLY_MENU_SWITCHES)) {
    if (body[field] !== undefined) throw new MarketerFieldError(words);
  }
}
