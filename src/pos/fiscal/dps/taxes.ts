// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/dps/taxes.ts
//
// The store's tax table and the `CHECKTAX` block of a ДПС check.
//
// A ДПС-format provider does not list the rates the way Checkbox does: the
// check carries its own `CHECKTAX`, and the tax office refuses a document
// whose tax sums disagree with its lines (Cashalot's developers,
// TechDocs/prro/cashalot/sources/support-answers.md, answer 9). So the table is
// the owner's (copied from the provider's cabinet), and the arithmetic is ours
// and has to match the tax office's to the kopeck.
//
// The arithmetic is the one all five figures of the official examples agree
// on (TechDocs/prro/dps/document-structures.md): the tax included in a price is
// the base minus the base without the tax, the latter rounded to the kopeck —
// `base − round(base × 100 / (100 + rate))`. The direct
// `round(base × rate / (100 + rate))` agrees with four of them and gives one
// kopeck more on a tie: 12.57 at 20 % is 2.09 in the example «Заокруглення»,
// 2.10 the direct way. The till's paper still uses the direct form
// (`pos/src/lib/receipt.ts` `vatLines`) — the same on every non-tie sum.

import type { DpsTaxRate, DpsTaxRow } from './types.js';
import { toUah } from './money.js';

/**
 * The letters a table may use, with the ASCII code each is known by in
 * `default_tax_code` / `pos_products.fiscal_tax_code` — those columns take
 * `[A-Za-z0-9_-]` only (`settings.service.ts` `TAX_CODE_RE`).
 */
const LETTER_CODES: Readonly<Record<string, string>> = {
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'G',
  Д: 'D',
  Е: 'E',
  Є: 'YE',
  Ж: 'ZH',
  З: 'Z',
  И: 'Y',
  І: 'I',
  Ї: 'YI',
  Й: 'J',
  К: 'K',
};

const MAX_RATES = 10;
const MAX_NAME = 64;

/** Thrown with a sentence for the owner; a settings save turns it into a 400. */
export class DpsTaxTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DpsTaxTableError';
  }
}

/** The ASCII code of a letter, or null for one outside the table's alphabet. */
export function letterCode(letter: string): string | null {
  return LETTER_CODES[letter.trim().toUpperCase()] ?? null;
}

/**
 * Check a tax table as the owner typed it and return it in canonical form.
 *
 * Refuses rather than repairs: a Latin «A» that looks Cyrillic, a letter used
 * twice (Cashalot's developers warn against one letter for two taxes inside a
 * shift), a rate outside 0…100 or with more than two decimals, a nameless
 * row, a kind other than ПДВ (0) or the excise (1), a second excise row.
 * Whether the table may change at all right now (not inside an open shift) is
 * the caller's business — it knows the shift.
 */
export function normalizeTaxTable(raw: unknown): DpsTaxRate[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new DpsTaxTableError('Ставки податку мають бути списком');
  if (raw.length > MAX_RATES) {
    throw new DpsTaxTableError(`Ставок податку може бути не більше ${MAX_RATES}`);
  }
  const seen = new Set<string>();
  let excise = 0;
  return raw.map((row, index) => {
    const where = `Ставка ${index + 1}`;
    if (!row || typeof row !== 'object') throw new DpsTaxTableError(`${where}: порожній рядок`);
    const { letter, name, rate, type } = row as Record<string, unknown>;

    if (typeof letter !== 'string' || !letterCode(letter)) {
      throw new DpsTaxTableError(
        `${where}: літера має бути однією кириличною з ${Object.keys(LETTER_CODES).join(', ')}`
      );
    }
    const canonical = letter.trim().toUpperCase();
    if (seen.has(canonical)) {
      throw new DpsTaxTableError(`${where}: літера «${canonical}» уже є в таблиці`);
    }
    seen.add(canonical);

    const label = typeof name === 'string' ? name.trim() : '';
    if (!label || label.length > MAX_NAME) {
      throw new DpsTaxTableError(`${where}: назва від 1 до ${MAX_NAME} символів`);
    }
    if (
      typeof rate !== 'number' ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 100 ||
      Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-9
    ) {
      throw new DpsTaxTableError(`${where}: відсоток від 0 до 100, не більше двох знаків після коми`);
    }
    if (type !== undefined && type !== 0 && type !== 1) {
      throw new DpsTaxTableError(`${where}: вид податку — ПДВ (0) або акциз (1)`);
    }
    if (type === 1 && ++excise > 1) {
      throw new DpsTaxTableError(`${where}: рядок акцизу в таблиці може бути лише один`);
    }
    return { letter: canonical, name: label, type: type === 1 ? 1 : 0, rate };
  });
}

/** The table's VAT rows — what a line's own tax code may name. */
export function vatRates(table: readonly DpsTaxRate[]): DpsTaxRate[] {
  return table.filter((t) => t.type === 0);
}

/** The table's excise row, added to an excise line's letters; null where there is none. */
export function exciseRate(table: readonly DpsTaxRate[]): DpsTaxRate | null {
  return table.find((t) => t.type === 1) ?? null;
}

/**
 * The VAT row a line's tax code points at — by ASCII code (what
 * `default_tax_code` holds) or by the letter itself. Never the excise row: a
 * line's own code names its VAT, and the excise letter is added to an excise
 * line on top of it.
 */
export function resolveLetter(
  taxCode: string | null,
  table: readonly DpsTaxRate[]
): DpsTaxRate | null {
  const code = taxCode?.trim();
  if (!code) return null;
  const vat = vatRates(table);
  return (
    vat.find((t) => letterCode(t.letter) === code.toUpperCase()) ??
    vat.find((t) => t.letter === code.toUpperCase()) ??
    null
  );
}

/**
 * The tax inside a VAT-inclusive base, in kopecks: the base minus the base
 * without the tax rounded half up — the form the official examples use.
 * Integer arithmetic on the rate in basis points, so a tie is a tie.
 */
export function includedTaxCents(baseCents: number, rate: number): number {
  if (baseCents <= 0 || rate <= 0) return 0;
  const bp = Math.round(rate * 100);
  const num = baseCents * 10000;
  const den = 10000 + bp;
  let net = Math.floor(num / den);
  if (2 * (num - net * den) >= den) net += 1;
  return baseCents - net;
}

/**
 * One line as `CHECKTAX` sees it: its VAT letter (null for a seller who is
 * not a VAT payer), its excise letter on an excise line, its cost before
 * discounts, its discount.
 */
export interface DpsTaxedLine {
  letter: string | null;
  exciseLetter?: string | null;
  costCents: number;
  discountCents: number;
}

/**
 * `CHECKTAX` of a check: one row per letter used, in the table's order —
 * `TURNOVER` the letter's cost before discounts, `SOURCESUM` the base after
 * them, `SUM` the tax inside the base. Integer kopecks until the very end.
 *
 * The price carries both taxes (ДПС example «Два податки», 259.90): the
 * excise is inside the whole price (ПКУ 214.1.4 — its base is the value WITH
 * VAT and WITHOUT the excise, i.e. price / 1.05), 12.38; the VAT is inside
 * what is left, 247.52, so its `SOURCESUM` is the price less the excise —
 * 41.25 — while its `TURNOVER` stays the price. The excise of the lines a VAT
 * letter shares with the excise is taken off that letter's base; computed on
 * that group's own sum, so it equals the excise row whenever the excise
 * lines carry one VAT letter, which is every real store.
 */
export function computeCheckTax(
  lines: readonly DpsTaxedLine[],
  table: readonly DpsTaxRate[]
): { rows: DpsTaxRow[]; vatCents: number } {
  const rows: DpsTaxRow[] = [];
  let vatCents = 0;
  const source = (own: readonly DpsTaxedLine[]) => own.reduce((sum, l) => sum + l.costCents - l.discountCents, 0);
  const excise = exciseRate(table);
  for (const rate of table) {
    const own = lines.filter((l) => (rate.type === 1 ? l.exciseLetter === rate.letter : l.letter === rate.letter));
    if (own.length === 0) continue;
    const turnover = own.reduce((sum, l) => sum + l.costCents, 0);
    let base = source(own);
    if (rate.type === 0 && excise) {
      base -= includedTaxCents(source(own.filter((l) => l.exciseLetter === excise.letter)), excise.rate);
    }
    const tax = includedTaxCents(base, rate.rate);
    if (rate.type === 0) vatCents += tax;
    rows.push({
      TYPE: rate.type,
      NAME: rate.name,
      LETTER: rate.letter,
      PRC: rate.rate,
      SIGN: false,
      TURNOVER: toUah(turnover),
      SOURCESUM: toUah(base),
      SUM: toUah(tax),
    });
  }
  return { rows, vatCents };
}
