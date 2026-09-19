// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Modifiers on a cart line, for a sales-vertical module that asks them (the
// café's «вівсяне +15», «без цукру»). Pure mirrors of the server's arithmetic,
// exported here rather than copied into a module for the same reason
// `bouquet.ts` is: the price on the «Додати» button and the price the server
// stores have to agree, and one table of cases pins both.
export {
  MAX_LINE_NOTE,
  cartLineUid,
  cleanLineNote,
  defaultModifierIds,
  groupsOf,
  lineCaption,
  needsModifierSheet,
  normalizeModifierIds,
  resolveLineModifiers,
  shiftCompareAt,
} from '../lib/modifiers';
export type { CartLineChoice, CartLineModifier, ResolvedLineModifiers } from '../lib/modifiers';
