// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The shell-aware sales/receipts data surface. `cashierApi` routes each call to
// the local Dexie mirror (cashier shell) or straight to the API (web).
export { cashierApi, saleRowFromDetail } from '../offline/cashierApi';
export type { LocalSaleRow } from '../offline/db';
