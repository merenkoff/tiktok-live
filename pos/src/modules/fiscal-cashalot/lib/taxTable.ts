// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-cashalot/lib/taxTable.ts
//
// The owner's tax table as the form holds it, and its two translations: to
// the `config.taxes` the backend validates (`normalizeTaxTable` in
// `src/pos/fiscal/dps/taxes.ts`) and back. Pure — no React, no API.
//
// The one rule worth stating: a letter is Cyrillic on the receipt and in the
// table, but `default_tax_code` is ASCII-only on the server (`TAX_CODE_RE`),
// so the code stored for «А» is `A`, for «Є» — `YE`. `CASHALOT_LETTER_CODES`
// is a COPY of the server's `LETTER_CODES`; a root test
// (`src/__tests__/pos.fiscal.cashalot.letters.test.ts`) keeps the two equal.

export const CASHALOT_LETTER_CODES: Readonly<Record<string, string>> = {
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

export const CASHALOT_LETTERS: readonly string[] = Object.keys(CASHALOT_LETTER_CODES);

/** The server's cap — `normalizeTaxTable` refuses an eleventh row. */
export const MAX_TAX_ROWS = 10;

export interface TaxRateDraft {
  letter: string;
  name: string;
  /** Text while typing («20», «7,5»); parsed only on save. */
  rate: string;
}

export interface CashalotConfigDraft {
  taxes: TaxRateDraft[];
  testing: boolean;
}

export function emptyRow(letter = ''): TaxRateDraft {
  return { letter, name: '', rate: '' };
}

/** The stored config as the form shows it; a malformed row is shown as typed, never dropped. */
export function draftFromConfig(config: Readonly<Record<string, unknown>> | null | undefined): CashalotConfigDraft {
  const raw = Array.isArray(config?.taxes) ? config.taxes : [];
  return {
    taxes: raw.map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        letter: typeof r.letter === 'string' ? r.letter : '',
        name: typeof r.name === 'string' ? r.name : '',
        rate: r.rate === undefined || r.rate === null ? '' : String(r.rate),
      };
    }),
    testing: config?.testing === true,
  };
}

/**
 * What the form sends. A rate that reads as a number goes as one; anything
 * else goes as typed so the server's own sentence («Ставка 2: відсоток від 0
 * до 100…») names the row — the form keeps no second validator.
 */
export function configFromDraft(draft: CashalotConfigDraft): Record<string, unknown> {
  return {
    taxes: draft.taxes.map((row) => ({
      letter: row.letter.trim(),
      name: row.name.trim(),
      rate: parseRate(row.rate),
    })),
    testing: draft.testing,
  };
}

function parseRate(text: string): number | string {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return text;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : text;
}

/** ASCII code for a Cyrillic letter — what `default_tax_code` stores. Null outside the fourteen. */
export function letterCode(letter: string): string | null {
  return CASHALOT_LETTER_CODES[letter.trim().toUpperCase()] ?? null;
}

/**
 * The table row a stored `default_tax_code` points at — by code (`A`), or by
 * the letter itself for a code typed on the host card before this screen
 * existed. Null when the code names no row: the server would then refuse
 * every line before sending it, which is what the page warns about.
 */
export function defaultLetterFor(
  code: string | null | undefined,
  taxes: readonly TaxRateDraft[]
): string | null {
  const wanted = code?.trim().toUpperCase();
  if (!wanted) return null;
  const row = taxes.find((t) => {
    const letter = t.letter.trim().toUpperCase();
    return letter === wanted || letterCode(letter) === wanted;
  });
  return row ? row.letter.trim().toUpperCase() : null;
}

/** The letters a row may still take: the fourteen minus those other rows hold. */
export function freeLetters(taxes: readonly TaxRateDraft[], index: number): string[] {
  const taken = new Set(
    taxes.filter((_, i) => i !== index).map((t) => t.letter.trim().toUpperCase())
  );
  return CASHALOT_LETTERS.filter((letter) => !taken.has(letter));
}
