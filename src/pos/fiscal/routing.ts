// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/routing.ts
//
// Which of a store's registers a product is sold through (track ДК,
// TechDocs/POS_DUAL_REGISTER.md §4.2): `pos_products.fiscal_register`
// (migration 089), honoured only while that register is switched on. A
// product marked for register 2 in a store whose register 2 is off — never
// set up, or switched off for the night — sells through register 1, so
// turning register 2 off can never strand a sale.

import { pool } from '../../db.js';
import { bottlesOfLines, type PouringLine } from '../bottles.service.js';

type Queryable = Pick<typeof pool, 'query'>;

/** The store's switched-on registers 2.. — empty for every store with one register. */
export async function activeRegisters(
  client: Queryable,
  storeId: number
): Promise<ReadonlySet<number>> {
  const result = await client.query(
    `SELECT register_no FROM pos_fiscal_registers WHERE store_id = $1 AND enabled`,
    [storeId]
  );
  return new Set(result.rows.map((row) => Number(row.register_no)));
}

/** The register a product actually sells through, given what is switched on. */
export function effectiveRegister(
  stored: number | string | null | undefined,
  active: ReadonlySet<number>
): number {
  const n = stored == null ? 1 : Number(stored);
  return n >= 2 && active.has(n) ? n : 1;
}

/** Each variant's effective register — what a cart is split by. */
export async function registersOfVariants(
  client: Queryable,
  storeId: number,
  variantIds: readonly number[]
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (variantIds.length === 0) return out;
  const active = await activeRegisters(client, storeId);
  const result = await client.query(
    `SELECT v.id, p.fiscal_register
     FROM pos_variants v
     JOIN pos_products p ON p.id = v.product_id
     WHERE v.store_id = $1 AND v.id = ANY($2::bigint[])`,
    [storeId, [...new Set(variantIds)]]
  );
  for (const row of result.rows) {
    out.set(Number(row.id), effectiveRegister(row.fiscal_register, active));
  }
  return out;
}

/**
 * Each line's register (ДК5, decision Д20): the register of the stamped
 * bottles it pours from, when it pours from any — a coffee with a cognac
 * answer is the cognac's register's goods — and its product's otherwise. A
 * line pouring from bottles of two registers belongs to neither, and is
 * refused in words. Same order as `lines`; all 1 in a store with one register.
 */
export async function registersOfLines(
  client: Queryable,
  storeId: number,
  lines: readonly PouringLine[],
  names?: (line: PouringLine) => string
): Promise<number[]> {
  if (lines.length === 0) return [];
  const active = await activeRegisters(client, storeId);
  if (active.size === 0) return lines.map(() => 1);
  const byVariant = await registersOfVariants(client, storeId, lines.map((line) => line.variant_id));
  const bottles = await bottlesOfLines(client, storeId, lines);
  return lines.map((line, index) => {
    const found = [...new Set(bottles[index].map((b) => effectiveRegister(b.fiscal_register, active)))];
    if (found.length > 1) {
      throw new FiscalRegisterMismatchError(
        `${names ? `«${names(line)}»` : 'Позиція'} наливає з пляшок різних кас (${bottles[index]
          .map((b) => b.product_name)
          .join(', ')}) — такий рядок не пробити жодним чеком`,
        found[0],
        found[1]
      );
    }
    return found.length === 1 ? found[0] : (byVariant.get(line.variant_id) ?? 1);
  });
}

/**
 * A sale's lines asked for one register and a line belongs to another. Raised
 * inside the sale's own transaction (`completeSaleTx`), so whichever path wrote
 * it — the till, a table's bill, an exchange — nothing is left half-written.
 */
export class FiscalRegisterMismatchError extends Error {
  readonly code = 'register_mismatch';
  constructor(
    message: string,
    readonly expected: number,
    readonly found: number
  ) {
    super(message);
    this.name = 'FiscalRegisterMismatchError';
  }
}

/** The owner's names for registers 2.. — what a receipt of a split order is captioned with. */
export async function registerLabels(
  client: Queryable,
  storeId: number
): Promise<Map<number, string | null>> {
  const rows = await client.query(
    `SELECT register_no, label FROM pos_fiscal_registers WHERE store_id = $1`,
    [storeId]
  );
  return new Map(rows.rows.map((row) => [Number(row.register_no), row.label as string | null]));
}
