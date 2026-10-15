// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/guest-author.ts — who a screen says added a line, fired a round or
// opened a bill when nobody on the staff did (TechDocs/POS_QR_MENU.md, phase
// Q9; migration 068). A guest's order sent straight to the kitchen leaves the
// author column NULL and a `*_by_guest` flag set; the bill, the kitchen board
// and the pre-bill print these words in its place. Its own file because both
// `bills.service` and `kitchen.service` need it and neither imports the other.

export const GUEST_AUTHOR_NAME = 'Гість · QR-меню';

/** The staff member's name, or the guest's label when the flag says a guest did it. */
export function authorName(name: unknown, byGuest: unknown): string {
  if (name != null) return String(name);
  return byGuest === true ? GUEST_AUTHOR_NAME : '';
}
