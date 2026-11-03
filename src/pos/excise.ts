// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/excise.ts
//
// Excise stamps and УКТ ЗЕД codes as the till and the owner type or scan them
// (track ДК, ДК4-Б, TechDocs/POS_DUAL_REGISTER.md §4.3). The format is checked
// loosely on purpose (decision Д9): the ДПС example's «AATE508932 0000412168»
// passes, and so must whatever a real scanner types — letters (Latin or
// Cyrillic), digits and spaces — until real scans say more. Normalised so the
// same stamp typed twice is the same row: upper case, one space between parts.

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

const LABEL_RE = /^[\p{L}\p{N} ]{8,40}$/u;

/** A stamp as stored, or null when it cannot be one. */
export function normalizeExciseLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const label = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!LABEL_RE.test(label) || !/\d/.test(label)) return null;
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
