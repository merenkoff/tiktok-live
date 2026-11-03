// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The registers a product can be put on (track ДК, TechDocs/POS_DUAL_REGISTER.md
// §4.2): register 1, and every further one the login lists as switched on —
// another ФОП's, where a restaurant's alcohol goes. A store with one register
// gets none, and the product form asks nothing.

import type { FiscalPublicConfig } from '@pos/platform';

export interface RegisterChoice {
  registerNo: number;
  /** «Каса 1 · ТОВ «Шабля»», «Каса 2 · Бар». */
  label: string;
}

export function registerChoices(fiscal: FiscalPublicConfig | null | undefined): RegisterChoice[] {
  const extra = fiscal?.enabled ? (fiscal.registers ?? []) : [];
  if (extra.length === 0) return [];
  const first = fiscal?.requisites?.organization.name?.trim();
  return [
    { registerNo: 1, label: first ? `Каса 1 · ${first}` : 'Каса 1' },
    ...[...extra]
      .sort((a, b) => a.register_no - b.register_no)
      .map((r) => {
        const name = r.label?.trim() || r.requisites?.organization.name?.trim();
        return { registerNo: r.register_no, label: name ? `Каса ${r.register_no} · ${name}` : `Каса ${r.register_no}` };
      }),
  ];
}

/**
 * Put every selected product on one register — «весь алкоголь на касу 2» is
 * the tag filter, «Обрати всі показані» and this. One `PATCH` per product,
 * one after another (there is no batch route, and a hundred parallel writes
 * would trip the API for nothing); a refusal is counted, never stops the rest.
 */
export async function assignRegister(
  productIds: readonly number[],
  registerNo: number,
  update: (id: number, registerNo: number) => Promise<unknown>
): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  for (const id of productIds) {
    try {
      await update(id, registerNo);
      done += 1;
    } catch {
      failed += 1;
    }
  }
  return { done, failed };
}
