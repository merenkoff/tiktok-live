// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Turning a parsed price list into what `POST /gtin/learn/batch` accepts.
 *
 * Every supplier names their columns differently, so the mapping is the owner's
 * to confirm — this only guesses a starting point and reports what would be
 * dropped, so nobody discovers a wrong column after importing 4 000 rows.
 *
 * Barcode *validity* is deliberately not judged here: the check digit is the
 * server's call (`normalizeGtin`), and a second implementation on the client
 * would be one more thing to drift. Only the obvious is filtered — an empty
 * cell, or one with no digits in it at all.
 */

import type { DelimitedTable } from './parseDelimited';

export type ColumnMapping = {
  /** Column index, or -1 when unmapped. */
  gtin: number;
  name: number;
  brand: number;
};

export type ImportItem = { gtin: string; name: string; brand?: string | null; source: 'supplier' };

export type ImportPlan = {
  items: ImportItem[];
  /** Rows the mapping cannot use, with the reason, capped for display. */
  dropped: Array<{ row: number; reason: string }>;
  droppedTotal: number;
};

const GTIN_HINTS = /штрих|штрих-?код|barcode|bar_code|ean|gtin|upc|код\s*товар/i;
const NAME_HINTS = /назв|наимен|найменув|товар|описан|name|title|product|опис/i;
const BRAND_HINTS = /бренд|brand|торгов|марка|виробник|производ|manufact/i;

function guess(headers: string[], hints: RegExp, taken: number[]): number {
  const i = headers.findIndex((h, idx) => !taken.includes(idx) && hints.test(h));
  return i;
}

/** First pass at the mapping, from the header names. */
export function guessMapping(headers: string[]): ColumnMapping {
  const gtin = guess(headers, GTIN_HINTS, []);
  const name = guess(headers, NAME_HINTS, [gtin]);
  const brand = guess(headers, BRAND_HINTS, [gtin, name]);
  return { gtin, name, brand };
}

const MAX_LISTED_DROPS = 20;

export function buildPlan(table: DelimitedTable, mapping: ColumnMapping): ImportPlan {
  const items: ImportItem[] = [];
  const dropped: ImportPlan['dropped'] = [];
  let droppedTotal = 0;

  const drop = (row: number, reason: string) => {
    droppedTotal += 1;
    if (dropped.length < MAX_LISTED_DROPS) dropped.push({ row, reason });
  };

  table.rows.forEach((cells, i) => {
    // +2: rows are 1-based for a human, and the header took line 1.
    const line = i + 2;
    const rawGtin = (mapping.gtin >= 0 ? cells[mapping.gtin] : '')?.trim() ?? '';
    const name = (mapping.name >= 0 ? cells[mapping.name] : '')?.trim() ?? '';

    const digits = rawGtin.replace(/\D/g, '');
    if (!digits) {
      drop(line, rawGtin ? 'у колонці штрихкоду немає цифр' : 'порожній штрихкод');
      return;
    }
    if (!name) {
      drop(line, 'порожня назва');
      return;
    }
    const brand = (mapping.brand >= 0 ? cells[mapping.brand] : '')?.trim() || null;
    items.push({ gtin: digits, name, brand, source: 'supplier' });
  });

  return { items, dropped, droppedTotal };
}

/** `learn/batch` takes at most 500 items per request. */
export const BATCH_SIZE = 500;

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
