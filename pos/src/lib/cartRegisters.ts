// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which registers a till cart goes through (track ДК, TechDocs/POS_DUAL_REGISTER.md
// §4.2): a restaurant's food through one ФОП's register, its alcohol through
// another's. The line carries what the catalog said (`CatalogItem.fiscal_register`,
// already resolved by the server); a line without one — a cart restored from a
// parked cart, an older snapshot — reads as register 1, and the server, which
// checks every line, answers `split_needs_update` if that was wrong.

import type { FiscalPublicConfig } from '../types';

/** The registers the lines go through, as far as the till knows. */
export function cartRegisterSet(lines: ReadonlyArray<{ fiscal_register?: number }>): Set<number> {
  return new Set(lines.map((line) => line.fiscal_register ?? 1));
}

/** Two receipts, one per register — only where the login lists a register 2. */
export function cartNeedsSplit(
  lines: ReadonlyArray<{ fiscal_register?: number }>,
  fiscal: FiscalPublicConfig | null | undefined
): boolean {
  if (!fiscal?.enabled || !fiscal.registers?.length) return false;
  return cartRegisterSet(lines).size > 1;
}

/**
 * «Каса 1 · ФОП Іваненко», «Каса 2 · Бар» — what a receipt and a terminal are
 * called on the payment screen. The owner's label first (the server sends it
 * with a quote), then the ФОП's name from the login, then the bare number.
 */
export function registerCaption(
  fiscal: FiscalPublicConfig | null | undefined,
  registerNo: number,
  label?: string | null
): string {
  const extra = registerNo === 1 ? null : fiscal?.registers?.find((r) => r.register_no === registerNo);
  const name =
    label?.trim() ||
    extra?.label?.trim() ||
    (registerNo === 1 ? fiscal?.requisites?.organization.name : extra?.requisites?.organization.name)?.trim();
  return name ? `Каса ${registerNo} · ${name}` : `Каса ${registerNo}`;
}
