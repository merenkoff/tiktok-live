// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/excise.ts
//
// Excise stamps and УКТ ЗЕД codes as the till and the owner type or scan them
// (track ДК, ДК4-Б, TechDocs/POS_DUAL_REGISTER.md §4.3). The format is checked
// loosely on purpose (decision Д9): the ДПС example's «AATE508932 0000412168»
// passes, and so does what the bar's scanner types («ANFC015604» — four
// Latin letters and six digits). Normalised so the same stamp typed twice is
// the same row: upper case, one space between parts, Latin letters.
//
// A wedge scanner presses the KEYS a stamp's Latin letters sit on, so under
// a Ukrainian or Russian keyboard layout «ANFC015604» arrives as «ФТАС015604»
// (the real scans of 2026-11-04, `TechDocs/POS_DUAL_REGISTER.md` §7.11). The
// till's own scan detector already reads keys by position (`scannedChar`), so
// this catches what reaches us another way — a stamp typed or pasted under
// that layout, a tablet's Bluetooth scanner, another client. The series of a
// paper stamp is Latin, so a Cyrillic letter is read back as the Latin letter
// on the same key; one with no letter on its key (Х, Ж, Є…) leaves the scan
// unreadable. And a cashier scanning the bottle's own
// barcode instead of its stamp is told so rather than selling the EAN-13.
//
// `pos/src/lib/excise.ts` is the till's copy; both test files carry the same
// cases.

import { verifyCheckDigit } from './gtin/normalize.js';

export class ExciseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 409,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ExciseError';
  }
}

const LAYOUT: Record<string, string> = {
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P',
  Ф: 'A', І: 'S', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J', Л: 'K', Д: 'L',
  Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M',
};

const LABEL_RE = /^[A-Z0-9 ]{8,40}$/;

function latin(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/[\u0400-\u04FF]/g, (c) => LAYOUT[c] ?? c);
}

/** True when what was scanned is a goods barcode (EAN-8/UPC/EAN-13/GTIN-14), not a stamp. */
export function isGoodsBarcode(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const digits = raw.replace(/\s+/g, '');
  return /^(\d{8}|\d{12,14})$/.test(digits) && verifyCheckDigit(digits);
}

/** A stamp as stored, or null when it cannot be one. */
export function normalizeExciseLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = latin(raw);
  if (!LABEL_RE.test(label) || !/\d/.test(label) || isGoodsBarcode(label)) return null;
  return label;
}

/**
 * The stamps a request names for one line: each normalised, none repeated,
 * refused in the cashier's words when one is not a stamp at all.
 */
export function readExciseLabels(raw: unknown, where: string): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ExciseError(`${where}: марки — це список`, 'excise_label_invalid', 400);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const label = normalizeExciseLabel(item);
    if (!label) {
      if (isGoodsBarcode(item)) {
        throw new ExciseError(
          `${where}: ${String(item).trim()} — штрихкод самого товару, а не марки. Скануйте акцизну марку на пляшці`,
          'excise_label_invalid',
          400,
          { label: String(item).slice(0, 64) }
        );
      }
      throw new ExciseError(
        `${where}: «${String(item).slice(0, 40)}» не схоже на акцизну марку — скануйте ще раз або введіть серію й номер`,
        'excise_label_invalid',
        400,
        { label: String(item).slice(0, 64) }
      );
    }
    if (seen.has(label)) {
      throw new ExciseError(`${where}: марку ${label} відскановано двічі`, 'excise_label_repeated', 409, { label });
    }
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** УКТ ЗЕД as stored: digits only, 4 to 10 of them; null to clear. */
export function normalizeUktzed(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const code = String(raw).replace(/\s+/g, '');
  if (!/^\d{4,10}$/.test(code)) throw new Error('УКТ ЗЕД — від 4 до 10 цифр');
  return code;
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };

/**
 * Put stamps on a line — a sale item or a table's bill line. One stamp sells
 * once: a stamp that is already on goods not returned in this store is
 * refused by name, before anything else of the line is kept (the caller's
 * transaction rolls back).
 */
export async function claimExciseLabels(
  client: Queryable,
  params: {
    storeId: number;
    labels: readonly string[];
    saleItemId?: number | null;
    billItemId?: number | null;
    staffId?: number | null;
  }
): Promise<void> {
  for (const label of params.labels) {
    const inserted = await client.query(
      `INSERT INTO pos_excise_labels (store_id, label, sale_item_id, bill_item_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id, label) WHERE released_at IS NULL DO NOTHING
       RETURNING id`,
      [params.storeId, label, params.saleItemId ?? null, params.billItemId ?? null, params.staffId ?? null]
    );
    if ((inserted.rowCount ?? 0) === 0) {
      throw new ExciseError(
        `Марку ${label} уже продано — це інша пляшка? Скануйте марку тієї, що в руках`,
        'excise_label_taken',
        409,
        { label }
      );
    }
  }
}

/** A table's line is paid: its stamps now belong to the receipt line that paid it. */
export async function moveBillLabelsToSale(
  client: Queryable,
  storeId: number,
  billItemId: number,
  saleItemId: number
): Promise<void> {
  await client.query(
    `UPDATE pos_excise_labels SET sale_item_id = $1
     WHERE store_id = $2 AND bill_item_id = $3 AND released_at IS NULL AND sale_item_id IS NULL`,
    [saleItemId, storeId, billItemId]
  );
}
