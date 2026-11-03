// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/** «Каса 1», «Каса 2 · Бар» — a register as the owner and the cashier call it (track ДК). */
export function registerTitle(registerNo: number, label?: string | null): string {
  const name = label?.trim();
  return name ? `Каса ${registerNo} · ${name}` : `Каса ${registerNo}`;
}
