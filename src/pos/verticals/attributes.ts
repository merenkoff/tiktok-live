// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/attributes.ts — the one place a client-supplied attribute
// bag becomes something safe to store.
//
// Everything a variant carries goes through `normalizeVariant`: the admin form,
// the stock-document placeholder, and the placeholder→product materialisation.
// The output is canonical (schema order, schema keys only, trimmed), which is
// what lets `pos_stock_document_lines.placeholder_attributes` be a jsonb
// equality key in the duplicate rule and its unique index.

import { WEIGHABLE_UNITS, WEIGHED_PRICE_PER } from '../weighed.js';
import type { AttributeSpec, AttributeValues, VerticalDefinition } from './types.js';

/** A bad attribute bag / unit from a client. Routes map it to 400. */
export class VerticalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerticalValidationError';
  }
}

function specValue(spec: AttributeSpec, raw: unknown, title: string): string | number | null {
  if (raw == null) return null;
  if (typeof raw === 'boolean' || typeof raw === 'object') {
    throw new VerticalValidationError(`Атрибут «${spec.label}» має недопустиме значення`);
  }
  if (spec.type === 'number') {
    // A form sends strings; '' means "not set", not 0.
    if (typeof raw === 'string' && !raw.trim()) return null;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      throw new VerticalValidationError(`Атрибут «${spec.label}» має бути числом`);
    }
    return num;
  }
  const text = String(raw).trim();
  if (!text) return null;
  if (spec.type === 'select' && !(spec.options ?? []).includes(text)) {
    throw new VerticalValidationError(
      `Атрибут «${spec.label}» не приймає значення «${text}» у типі магазину «${title}»`
    );
  }
  return text;
}

/**
 * Keep only what this vertical declares, in schema order, trimmed and typed.
 *
 * An unknown key throws rather than being dropped: silently swallowing
 * `{ sixe: 'M' }` from a typo'd import would lose data with no sign of it.
 */
export function normalizeAttributes(def: VerticalDefinition, input: unknown): AttributeValues {
  if (input == null) return requireAll(def, {});
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new VerticalValidationError('attributes must be an object');
  }
  const known = new Map(def.attributes.map((spec) => [spec.key, spec]));
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (!known.has(key)) {
      throw new VerticalValidationError(
        `Невідомий атрибут «${key}» для типу магазину «${def.title}»`
      );
    }
  }
  const source = input as Record<string, unknown>;
  const out: AttributeValues = {};
  for (const spec of def.attributes) {
    if (!(spec.key in source)) continue;
    const value = specValue(spec, source[spec.key], def.title);
    if (value !== null) out[spec.key] = value;
  }
  return requireAll(def, out);
}

function requireAll(def: VerticalDefinition, attrs: AttributeValues): AttributeValues {
  for (const spec of def.attributes) {
    if (spec.required && attrs[spec.key] === undefined) {
      throw new VerticalValidationError(`Атрибут «${spec.label}» обовʼязковий`);
    }
  }
  return attrs;
}

/** `undefined` → the vertical's default unit; anything outside its set throws. */
export function normalizeUnit(def: VerticalDefinition, input: unknown): string {
  if (input == null || (typeof input === 'string' && !input.trim())) return def.units[0];
  const unit = typeof input === 'string' ? input.trim() : String(input);
  if (!def.units.includes(unit)) {
    throw new VerticalValidationError(
      `Одиниця «${unit}» недоступна в типі магазину «${def.title}»`
    );
  }
  return unit;
}

/**
 * What a variant's price is for in this vertical (migration 075): 1000 base
 * units — a kilogram, a litre — for a unit the vertical sells by weight, one
 * otherwise. Never something a client sends.
 */
export function pricePerFor(def: VerticalDefinition, unit: string): number {
  return def.weighedUnits.includes(unit) && WEIGHABLE_UNITS.includes(unit) ? WEIGHED_PRICE_PER : 1;
}

/**
 * The four derived columns of a variant row. `label` is recomputed on every
 * write — it is a projection of `attributes`, never something a client sends —
 * and so is `price_per`, a projection of the unit under this vertical.
 */
export function normalizeVariant(
  def: VerticalDefinition,
  input: { attributes?: unknown; unit?: unknown }
): { attributes: AttributeValues; label: string; unit: string; price_per: number } {
  const attributes = normalizeAttributes(def, input.attributes);
  const unit = normalizeUnit(def, input.unit);
  return {
    attributes,
    label: def.labelOf(attributes),
    unit,
    price_per: pricePerFor(def, unit),
  };
}

/** Attribute keys the catalog search looks inside (server query + offline mirror). */
export function searchableAttributeKeys(def: VerticalDefinition): string[] {
  return def.attributes.filter((spec) => spec.inSearch).map((spec) => spec.key);
}
