// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// How a bouquet assembled at the counter is priced and named. The florist's
// bench shows the customer a price with every tap, so a vertical module needs
// the same arithmetic the server will apply when the sale is filed — and the
// same one the offline till prints on an `OFF-` receipt.
//
// Deliberately the SAME functions, not a second implementation: both sides are
// pinned to one table of cases (`lib/bouquet.test.ts` ↔
// `src/__tests__/pos.bouquet-pricing.test.ts`), so a module that computed its
// own would be the third copy and the first to drift.
export { withLabour, priceOfComponents, customBouquetLabel } from '../lib/bouquet';
export type { BouquetComponent } from '../lib/bouquet';
