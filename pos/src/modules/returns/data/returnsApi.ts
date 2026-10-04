// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api, cashierApi } from '@pos/platform';
import type {
  ListSalesParams,
  LocalSaleRow,
  RefundedSaleRow,
  RefundLineInput,
  RefundOptions,
  SaleDetail,
  SaleListItem,
} from '@pos/platform';

export type { LocalSaleRow };

/**
 * Till-side receipts. Shell-aware via `cashierApi`: the Dexie mirror on the
 * desktop cashier, the live API on the web. Rows are `LocalSaleRow`.
 */
export const returnsApi = {
  listSales: (params: number | ListSalesParams = 50): Promise<LocalSaleRow[]> => cashierApi.listSales(params),
  getSale: (row: LocalSaleRow): Promise<SaleDetail | null> => cashierApi.getSale(row),
  refundSale: (
    row: LocalSaleRow,
    items: RefundLineInput[],
    opts: RefundOptions = {}
  ): Promise<RefundedSaleRow> => cashierApi.refundSale(row, items, opts),
  discardQueuedSale: (clientUuid: string): Promise<void> =>
    cashierApi.discardQueuedSale(clientUuid),
};

/**
 * Admin (web, owner) receipts. Always straight to the API — no offline path,
 * full `SaleDetail` / `SaleListItem` shapes.
 */
export const adminReturnsApi = {
  listSales: (params: number | ListSalesParams = 100): Promise<SaleListItem[]> => api.listSales(params),
  getSale: (id: number): Promise<SaleDetail> => api.getSale(id),
  refundSale: (
    saleId: number,
    items: RefundLineInput[],
    opts: RefundOptions & { client_uuid?: string | null } = {}
  ): Promise<SaleDetail> => api.refundSale(saleId, items, opts),
};
