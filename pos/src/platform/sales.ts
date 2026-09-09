// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The shell-aware sales/receipts data surface. `cashierApi` routes each call to
// the local Dexie mirror (cashier shell) or straight to the API (web).
export { cashierApi, saleRowFromDetail } from '../offline/cashierApi';
export type { LocalSaleRow } from '../offline/db';
// A type, not a runtime symbol — erased at build time, so it costs no shell
// version. Carries the REFUND's fiscal result, which must never be folded into
// the sale row it accompanies.
export type { RefundedSaleRow } from '../offline/repository';
