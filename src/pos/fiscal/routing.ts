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
