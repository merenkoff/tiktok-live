// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/format.ts — how the guest's menu writes money and hints.
//
// A copy of the till's wording, on purpose: the backend's `rootDir` is `src/`,
// so it cannot import `pos/src/lib/money.ts`, and the server's own
// `core/money.ts#formatUah` has no thousands grouping («1250,00 ₴» where the
// till says «1 250,00 ₴»). A guest reading the menu must see the same figure
// the cashier will ring. `pos.public-menu.format.test.ts` pins the cases that
// `pos/src/lib/money.test.ts` pins, so the two cannot drift apart quietly.

const GROUP = ' ';

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

/** «1 268,75 ₴» — thousands split by a no-break space, a comma before the kopiykas. */
export function formatUahGuest(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const [whole, frac] = (Math.abs(cents) / 100).toFixed(2).split('.');
  return `${sign}${groupThousands(whole)},${frac} ₴`;
}

/** «60 ₴» when there are no kopiykas, the full form otherwise. */
export function formatUahGuestCompact(cents: number): string {
  if (cents % 100 !== 0) return formatUahGuest(cents);
  const sign = cents < 0 ? '-' : '';
  return `${sign}${groupThousands(String(Math.abs(cents) / 100))} ₴`;
}

/** «+15 ₴» / «−20 ₴» (U+2212, as on the till's sheet); nothing for a free answer. */
export function deltaText(deltaCents: number): string {
  if (deltaCents > 0) return `+${formatUahGuestCompact(deltaCents)}`;
  if (deltaCents < 0) return `−${formatUahGuestCompact(-deltaCents)}`;
  return '';
}

/**
 * «обовʼязково» / «можна одне» / «скільки завгодно» / «до 2» — what a group of
 * answers lets you do. The till's `hintOf`, with the same words.
 */
export function groupHint(group: { min_select: number; max_select: number; modifiers: unknown[] }): string {
  if (group.min_select >= 1) {
    return group.max_select > 1 ? `обовʼязково · до ${group.max_select}` : 'обовʼязково';
  }
  if (group.max_select <= 1) return 'можна одне';
  if (group.max_select >= group.modifiers.length) return 'скільки завгодно';
  return `до ${group.max_select}`;
}

/** «Стіл 5»; an owner who already named it «Стіл 5» does not get «Стіл Стіл 5». */
export function tableLabel(name: string): string {
  return /^стіл/i.test(name.trim()) ? name.trim() : `Стіл ${name.trim()}`;
}
