// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Printing a price tag to the receipt roll.
//
// A florist who assembles a bouquet for the window has to put a price on it,
// and that printed tag is the only thing tying the flowers in the bucket to
// the card in the database (`TechDocs/POS_FLORIST_BENCH.md` §11.3). So a
// vertical module needs the tag payload and the print trigger, not a second
// implementation of either.
//
// `triggerPrint` in particular: `window.print()` silently no-ops inside
// WKWebView on macOS, and the workaround lives in one place on purpose. A
// module that called `window.print()` itself would look fine everywhere except
// on the shop's Mac.
export { buildPriceTags, expandCopies, defaultCopies } from '../lib/priceTag';
export type { PriceTag, PriceTagSource } from '../lib/priceTag';
export { triggerPrint } from '../lib/triggerPrint';
