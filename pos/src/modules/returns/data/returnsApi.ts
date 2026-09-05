// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api, cashierApi } from '@pos/platform';
import type {
  LocalSaleRow,
  PaymentMethod,
  RefundLineInput,
  SaleDetail,
  SaleListItem,
} from '@pos/platform';

export type { LocalSaleRow };

/**
 * Till-side receipts. Shell-aware via `cashierApi`: the Dexie mirror on the
 * desktop cashier, the live API on the web. Rows are `LocalSaleRow`.
 */
export const returnsApi = {
  listSales: (limit = 50): Promise<LocalSaleRow[]> => cashierApi.listSales(limit),
  getSale: (row: LocalSaleRow): Promise<SaleDetail | null> => cashierApi.getSale(row),
  refundSale: (
    row: LocalSaleRow,
    items: RefundLineInput[],
    opts: { method?: PaymentMethod | null; reason?: string } = {}
  ): Promise<LocalSaleRow> => cashierApi.refundSale(row, items, opts),
};

/**
 * Admin (web, owner) receipts. Always straight to the API — no offline path,
 * full `SaleDetail` / `SaleListItem` shapes.
 */
export const adminReturnsApi = {
  listSales: (limit = 100): Promise<SaleListItem[]> => api.listSales(limit),
  getSale: (id: number): Promise<SaleDetail> => api.getSale(id),
  refundSale: (
    saleId: number,
    items: RefundLineInput[],
    opts: { reason?: string; method?: PaymentMethod | null; client_uuid?: string | null } = {}
  ): Promise<SaleDetail> => api.refundSale(saleId, items, opts),
};
