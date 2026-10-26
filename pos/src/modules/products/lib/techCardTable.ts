// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { DelimitedTable } from '../../../lib/parseDelimited';

/**
 * The owner's tech-card table (TechDocs/POS_ONBOARDING.md, O3) read into the
 * rows the server plans from. The columns are found by their headings — a
 * table saved out of Excel keeps them in any order — and a file without
 * recognisable headings is read in the order of the sample. Everything else
 * (units, numbers, prices, which dish is which) is the server's to judge, so
 * the preview and the write can never disagree with what this page thought.
 */

export type TechCardColumn = 'dish' | 'variant' | 'ingredient' | 'quantity' | 'unit' | 'price';

export const TECH_CARD_COLUMNS: Array<{ key: TechCardColumn; title: string; match: RegExp }> = [
  { key: 'dish', title: 'Страва', match: /страв|dish|блюд/i },
  { key: 'variant', title: 'Варіант', match: /варіант|розмір|variant|size/i },
  { key: 'ingredient', title: 'Складник', match: /складник|інгредієнт|ingredient|сировин/i },
  { key: 'quantity', title: 'Кількість', match: /кількість|к-сть|qty|quantity|вага|обсяг/i },
  { key: 'unit', title: 'Од.', match: /^од|одиниц|unit/i },
  { key: 'price', title: 'Ціна закупівлі', match: /ціна|price|вартість/i },
];

export interface TechCardRowOut {
  line: number;
  dish: string;
  variant: string;
  ingredient: string;
  quantity: string;
  unit: string;
  price: string;
}

/** Which column of the file holds each field; `null` for a missing optional one. */
export function mapColumns(headers: string[]): Record<TechCardColumn, number | null> {
  const found = {} as Record<TechCardColumn, number | null>;
  const taken = new Set<number>();
  for (const col of TECH_CARD_COLUMNS) {
    const index = headers.findIndex((h, i) => !taken.has(i) && col.match.test(h.trim()));
    found[col.key] = index >= 0 ? index : null;
    if (index >= 0) taken.add(index);
  }
  return found;
}

/**
 * The rows to send. A file whose first row names no «Страва» and no
 * «Складник» has no header: then its first row is data and the columns are
 * read in the sample's order.
 */
export function tableToRows(table: DelimitedTable): { rows: TechCardRowOut[]; headerFound: boolean } {
  const mapped = mapColumns(table.headers);
  const headerFound = mapped.dish != null && mapped.ingredient != null;
  const columns: Record<TechCardColumn, number | null> = headerFound
    ? mapped
    : { dish: 0, variant: 1, ingredient: 2, quantity: 3, unit: 4, price: 5 };
  const body = headerFound ? table.rows : [table.headers, ...table.rows];
  const firstLine = headerFound ? 2 : 1;
  const cell = (row: string[], key: TechCardColumn) => {
    const index = columns[key];
    return index == null ? '' : (row[index] ?? '').trim();
  };
  const rows = body
    .map((row, i) => ({
      line: firstLine + i,
      dish: cell(row, 'dish'),
      variant: cell(row, 'variant'),
      ingredient: cell(row, 'ingredient'),
      quantity: cell(row, 'quantity'),
      unit: cell(row, 'unit'),
      price: cell(row, 'price'),
    }))
    .filter((r) => r.dish || r.ingredient || r.quantity);
  return { rows, headerFound };
}

/** The sample the dialog offers to download: the headings and two dishes. */
export const TECH_CARD_SAMPLE: string[][] = [
  ['Страва', 'Варіант', 'Складник', 'Кількість', 'Од.', 'Ціна закупівлі (грн за кг / л / шт)'],
  ['Борщ', '', 'Буряк', '80', 'г', '20'],
  ['Борщ', '', 'Капуста', '50', 'г', '15'],
  ['Борщ', '', 'Яловичина', '70', 'г', '280'],
  ['Взвар', '1 л', 'Сухофрукти', '120', 'г', '200'],
  ['Взвар', '1 л', 'Цукор', '30', 'г', '40'],
  ['Взвар', '300 мл', 'Сухофрукти', '40', 'г', ''],
  ['Взвар', '300 мл', 'Цукор', '10', 'г', ''],
];
