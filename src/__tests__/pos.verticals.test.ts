// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.verticals.test.ts — the sales-vertical registry and the
// attribute normalisation every variant write goes through.
// See TechDocs/POS_VERTICALS.md.

import { afterEach, describe, expect, it } from 'vitest';
import {
  cafeVertical,
  clothingVertical,
  DEFAULT_VERTICAL_ID,
  flowersVertical,
  getVertical,
  hasVertical,
  listVerticals,
  normalizeAttributes,
  normalizeUnit,
  normalizeVariant,
  publicConfigOf,
  registerVertical,
  resetVerticals,
  searchableAttributeKeys,
  verticalOrDefault,
  VerticalValidationError,
} from '../pos/verticals/index.js';
import type { VerticalDefinition } from '../pos/verticals/types.js';

afterEach(() => {
  resetVerticals();
});

describe('vertical registry', () => {
  it('ships clothing, flowers and café, with clothing as the default', () => {
    expect(hasVertical('clothing')).toBe(true);
    expect(hasVertical('flowers')).toBe(true);
    expect(hasVertical('cafe')).toBe(true);
    expect(hasVertical('bakery')).toBe(false);
    expect(DEFAULT_VERTICAL_ID).toBe('clothing');
    expect(listVerticals().map((v) => v.id)).toEqual(['clothing', 'flowers', 'cafe']);
  });

  it('falls back to clothing for a column this build does not know', () => {
    // A newer build wrote 'bakery', or somebody typed into psql: every login
    // of that store must still work, on the generic catalog.
    expect(verticalOrDefault('bakery').id).toBe('clothing');
    expect(verticalOrDefault(null).id).toBe('clothing');
    expect(verticalOrDefault('').id).toBe('clothing');
    expect(verticalOrDefault('flowers').id).toBe('flowers');
  });

  it('throws for an unknown id on the strict lookup', () => {
    expect(() => getVertical('bakery' as never)).toThrow();
  });

  it('strips the rules from the client config', () => {
    const config = publicConfigOf(flowersVertical);
    expect(config).toEqual({
      id: 'flowers',
      title: 'Квіти',
      attributes: flowersVertical.attributes,
      units: ['шт'],
      defaultUnit: 'шт',
      maxCompositionDepth: 1,
    });
    expect('labelOf' in config).toBe(false);
  });

  it('takes a registered vertical and restores the built-ins on reset', () => {
    const fake: VerticalDefinition = {
      id: 'flowers',
      title: 'Тест',
      attributes: [],
      units: ['шт'],
      labelOf: () => 'x',
      productKinds: ['simple'],
      maxCompositionDepth: 1,
    };
    registerVertical(fake);
    expect(getVertical('flowers').title).toBe('Тест');
    resetVerticals();
    expect(getVertical('flowers').title).toBe('Квіти');
  });
});

describe('labelOf', () => {
  it('reproduces the pre-verticals clothing label byte for byte', () => {
    // `[color, size].filter(Boolean).join(' / ')` — what sales.service.ts did
    // and what migration 035 backfills. A change here silently relabels every
    // existing variant of every clothing store.
    expect(clothingVertical.labelOf({ color: 'Синій', size: 'M' })).toBe('Синій / M');
    expect(clothingVertical.labelOf({ size: 'M' })).toBe('M');
    expect(clothingVertical.labelOf({ color: 'Синій' })).toBe('Синій');
    expect(clothingVertical.labelOf({})).toBe('');
  });

  it('builds the flowers label from colour and length', () => {
    expect(flowersVertical.labelOf({ color: 'Червона', length_cm: 60 })).toBe('Червона · 60 см');
    expect(flowersVertical.labelOf({ length_cm: 60 })).toBe('60 см');
    expect(flowersVertical.labelOf({})).toBe('');
  });

  it('labels a café variant by its size alone, and a dish by nothing', () => {
    expect(cafeVertical.labelOf({ size: 'M · 350 мл' })).toBe('M · 350 мл');
    expect(cafeVertical.labelOf({})).toBe('');
  });
});

describe('café vertical', () => {
  it('counts ingredients in grams and millilitres, pieces by default', () => {
    // 200 ml of milk is quantity 200 in unit 'мл' — quantities stay whole
    // (TechDocs/POS_CAFE.md §9.3), so the small unit is the base unit.
    expect([...cafeVertical.units]).toEqual(['шт', 'г', 'мл']);
    expect(normalizeUnit(cafeVertical, undefined)).toBe('шт');
    expect(normalizeUnit(cafeVertical, 'мл')).toBe('мл');
    expect(() => normalizeUnit(cafeVertical, 'л')).toThrow(VerticalValidationError);
    // A florist still cannot sell by the gram.
    expect(() => normalizeUnit(flowersVertical, 'г')).toThrow(VerticalValidationError);
  });

  it('is the only vertical that allows a recipe inside a recipe', () => {
    // A bouquet holds stems, never another bouquet; a dish holds a sauce that
    // is itself a recipe. The depth is a property of the vertical, not of the
    // composites service, because `validateComponents` is shared.
    expect(clothingVertical.maxCompositionDepth).toBe(1);
    expect(flowersVertical.maxCompositionDepth).toBe(1);
    expect(cafeVertical.maxCompositionDepth).toBe(3);
    expect(cafeVertical.productKinds).toEqual(['simple', 'composite']);
  });

  it('puts the depth on the wire, so the composition editor can offer a recipe as a component', () => {
    expect(publicConfigOf(cafeVertical).maxCompositionDepth).toBe(3);
    expect(publicConfigOf(clothingVertical).maxCompositionDepth).toBe(1);
  });
});

describe('normalizeAttributes', () => {
  it('keeps schema keys in schema order, trimmed', () => {
    expect(normalizeAttributes(clothingVertical, { size: ' M ', color: 'Синій' })).toEqual({
      color: 'Синій',
      size: 'M',
    });
    // Canonical order makes the object usable as a jsonb equality key — which
    // is what the placeholder duplicate rule and its unique index rely on.
    expect(Object.keys(normalizeAttributes(clothingVertical, { size: 'M', color: 'C' }))).toEqual([
      'color',
      'size',
    ]);
  });

  it('drops empty values rather than storing blanks', () => {
    expect(normalizeAttributes(clothingVertical, { size: '', color: '  ' })).toEqual({});
    expect(normalizeAttributes(clothingVertical, {})).toEqual({});
    expect(normalizeAttributes(clothingVertical, undefined)).toEqual({});
  });

  it('rejects an unknown key instead of silently dropping it', () => {
    expect(() => normalizeAttributes(clothingVertical, { sixe: 'M' })).toThrow(
      VerticalValidationError
    );
    // The clothing keys are not universal: a florist has no 'size'.
    expect(() => normalizeAttributes(flowersVertical, { size: 'M' })).toThrow(
      VerticalValidationError
    );
  });

  it('parses numbers, including the strings a form sends', () => {
    expect(normalizeAttributes(flowersVertical, { length_cm: '60' })).toEqual({ length_cm: 60 });
    expect(normalizeAttributes(flowersVertical, { length_cm: 60 })).toEqual({ length_cm: 60 });
    expect(normalizeAttributes(flowersVertical, { length_cm: '' })).toEqual({});
    expect(() => normalizeAttributes(flowersVertical, { length_cm: 'довга' })).toThrow(
      VerticalValidationError
    );
  });

  it('enforces select options and required attributes', () => {
    const withSelect: VerticalDefinition = {
      ...clothingVertical,
      attributes: [
        { key: 'color', label: 'Колір', type: 'select', options: ['Синій', 'Чорний'], required: true },
      ],
    };
    expect(normalizeAttributes(withSelect, { color: 'Чорний' })).toEqual({ color: 'Чорний' });
    expect(() => normalizeAttributes(withSelect, { color: 'Рожевий' })).toThrow(
      VerticalValidationError
    );
    expect(() => normalizeAttributes(withSelect, {})).toThrow(VerticalValidationError);
  });

  it('refuses a non-object bag', () => {
    expect(() => normalizeAttributes(clothingVertical, 'M')).toThrow(VerticalValidationError);
    expect(() => normalizeAttributes(clothingVertical, ['M'])).toThrow(VerticalValidationError);
  });
});

describe('normalizeUnit', () => {
  it('defaults to the vertical\'s first unit', () => {
    expect(normalizeUnit(clothingVertical, undefined)).toBe('шт');
    expect(normalizeUnit(clothingVertical, '')).toBe('шт');
    expect(normalizeUnit(clothingVertical, ' шт ')).toBe('шт');
  });

  it('refuses a unit the vertical does not sell in', () => {
    expect(() => normalizeUnit(clothingVertical, 'г')).toThrow(VerticalValidationError);
  });
});

describe('normalizeVariant', () => {
  it('derives the label from the normalised attributes', () => {
    expect(normalizeVariant(clothingVertical, { attributes: { color: 'Синій', size: 'M' } })).toEqual({
      attributes: { color: 'Синій', size: 'M' },
      label: 'Синій / M',
      unit: 'шт',
    });
  });

  it('never takes a label from the client', () => {
    const out = normalizeVariant(flowersVertical, {
      attributes: { color: 'Червона', length_cm: '60' },
      unit: 'шт',
    });
    expect(out.label).toBe('Червона · 60 см');
  });
});

describe('searchableAttributeKeys', () => {
  it('lists the keys the catalog search looks inside', () => {
    expect(searchableAttributeKeys(clothingVertical)).toEqual(['color', 'size']);
    // A flower's length is not text anyone types into the search box.
    expect(searchableAttributeKeys(flowersVertical)).toEqual(['color', 'country']);
  });
});

describe('label rules the database depends on', () => {
  it('matches migration 035\'s clothing backfill exactly', () => {
    // 035 writes `concat_ws(' / ', NULLIF(color,''), NULLIF(size,''))` into
    // `pos_variants.label` for every existing row. If `labelOf` ever stops
    // agreeing with that SQL, the first edit of an untouched variant silently
    // rewrites its caption — this test is the tripwire.
    const cases: Array<[Record<string, string>, string]> = [
      [{ color: 'Синій', size: 'M' }, 'Синій / M'],
      [{ color: 'Синій' }, 'Синій'],
      [{ size: 'M' }, 'M'],
      [{}, ''],
    ];
    for (const [attrs, expected] of cases) {
      expect(clothingVertical.labelOf(attrs)).toBe(expected);
    }
  });
});
