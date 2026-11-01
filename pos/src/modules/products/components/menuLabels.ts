// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The six labels a dish may carry on the guest's QR menu — «Гостре», «Хіт»…
// (migration 086, phase F9). A COPY of `src/pos/menu-labels.ts`: the two apps
// cannot import each other, so `pos.public-menu.dishfacts.test.ts` on the
// backend compares this file with the server's list. Pure on purpose (no
// imports) so that test can read it.

export interface MenuLabel {
  code: string;
  label: string;
}

/** In the order a guest reads them; also the canonical order of a chosen set. */
export const MENU_LABELS: readonly MenuLabel[] = [
  { code: 'spicy', label: 'Гостре' },
  { code: 'vegetarian', label: 'Вегетаріанське' },
  { code: 'vegan', label: 'Веганське' },
  { code: 'new', label: 'Новинка' },
  { code: 'hit', label: 'Хіт' },
  { code: 'recommended', label: 'Рекомендуємо' },
];
