// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api } from '../services/api';
import { isOfflinePosEnabled, isOfflineReadsEnabled } from './enabled';
import { OfflineWriteError } from './errors';
import * as repo from './repository';
import { useOfflineStatus } from './status';
import type { LocalSaleRow } from './db';
import type {
  CatalogItem,
  PaymentMethod,
  PosCustomer,
  PosTag,
  RefundLineInput,
  SaleDetail,
  SaleListItem,
  SaleItemInput,
  SalePaymentInput,
} from '../types';

/**
 * The web shell has no local mirror, so map the server list onto the same row
 * shape the cashier screens consume. `server_id` is always set here, which is
 * exactly what makes every void take the direct-API path.
 */
export function saleRowFromDetail(detail: SaleDetail): LocalSaleRow {
  return {
    client_uuid: detail.client_uuid ?? `srv:${detail.id}`,
    // Offline receipts carry a negative placeholder id until they sync.
    server_id: detail.id > 0 ? detail.id : null,
    receipt_number: detail.receipt_number,
    status: detail.status,
    total_cents: detail.total_cents,
    refunded_cents: detail.refunded_cents,
    staff_name: detail.staff_name,
    customer_name: detail.customer_name ?? null,
    created_at: detail.created_at,
    fiscal_status: detail.fiscal_status,
    detail,
  };
}

function rowFromServer(item: SaleListItem): LocalSaleRow {
  return {
    client_uuid: item.client_uuid ?? `srv:${item.id}`,
    server_id: item.id,
    receipt_number: item.receipt_number,
    status: item.status,
    total_cents: item.total_cents,
    refunded_cents: item.refunded_cents,
    staff_name: item.staff_name,
    customer_name: item.customer_name ?? null,
    created_at: item.created_at,
    fiscal_status: item.fiscal_status,
  };
}

/**
 * A write on a shell that never queues (`reads` mode) with no connection is
 * refused before it leaves the page: waiting for axios to time out would keep
 * a waiter staring at a spinner for the length of the request timeout, and
 * the answer is known already. The `full` till never comes here — its writes
 * go to the repository, which queues them.
 */
function assertWritable(): void {
  if (isOfflinePosEnabled()) return;
  if (isOfflineReadsEnabled() && !useOfflineStatus.getState().online) {
    throw new OfflineWriteError();
  }
}

/**
 * Every read goes to the mirror on any shell that keeps one (`full` or
 * `reads`); every write goes to the queue only on the `full` till, and to the
 * server otherwise. The split is the whole point of the tablet's mode: it can
 * show yesterday's menu without a network, and it can never invent a sale.
 */
export const cashierApi = {
  /**
   * `searchKeys` only matters offline: the server reads the store's vertical
   * itself, while the local mirror has to be told which attributes are
   * searchable so it finds exactly what the online query would.
   */
  getCatalog(opts?: {
    q?: string;
    barcode?: string;
    tag_id?: number;
    searchKeys?: readonly string[];
    /**
     * Also products that are not on the menu — an ingredient, a semi-finished
     * product. Online it is a query flag; offline the snapshot holds everything
     * and `filterCatalog` hides the unsellable rows unless asked, so the
     * desktop stock count of a café finds its milk too.
     */
    include_unsellable?: boolean;
  }): Promise<CatalogItem[]> {
    return isOfflineReadsEnabled() ? repo.getCatalog(opts) : api.getCatalog(opts);
  },

  getTags(): Promise<PosTag[]> {
    return isOfflineReadsEnabled() ? repo.getTags() : api.getTags();
  },

  /**
   * Re-read the catalog now. On the desktop and the tablet that is the offline
   * mirror, which is what the sell screen draws from — so a stop-list toggle
   * on the kitchen board (К3) greys the tile at once rather than at the next
   * scheduled refresh. The web shell reads the server on every catalog call
   * and has nothing to refresh.
   */
  refreshCatalog(): Promise<void> {
    return isOfflineReadsEnabled() ? repo.refreshSnapshot() : Promise.resolve();
  },

  async completeSale(payload: {
    items: SaleItemInput[];
    payments: SalePaymentInput[];
    note?: string;
    cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
    customer_id?: number | null;
    /**
     * The parked cart this sale came out of. Bookkeeping only, and dropped on
     * the offline path: the cart was already picked up (which is what released
     * its hold), and a queued sale has no server to tell.
     */
    parked_cart_id?: number | null;
    /**
     * The pre-order being handed over. Online only by nature: its lines and
     * their locked prices live on the server, so a queued offline sale has
     * nothing to ring — the offline path drops it, as it does `parked_cart_id`.
     */
    preorder_id?: number | null;
  },
  /** `clientUuid` reuses an existing idempotency key — see FiscalSaleUnknownError. */
  opts: { clientUuid?: string } = {}
  ): Promise<SaleDetail> {
    if (isOfflinePosEnabled()) return repo.completeSale(payload, opts);
    assertWritable();
    return api.completeSale({ ...payload, client_uuid: opts.clientUuid });
  },

  listCustomers(q?: string): Promise<PosCustomer[]> {
    return isOfflineReadsEnabled() ? repo.listCustomers(q) : api.listCustomers(q);
  },

  async createCustomer(payload: {
    name: string;
    phone: string;
    email?: string | null;
    children_birthdays?: PosCustomer['children_birthdays'];
    client_uuid?: string | null;
  }): Promise<PosCustomer> {
    if (isOfflinePosEnabled()) return repo.createCustomer(payload);
    assertWritable();
    return api.createCustomer(payload);
  },

  async updateCustomer(
    id: number,
    payload: {
      name?: string;
      phone?: string;
      email?: string | null;
      children_birthdays?: PosCustomer['children_birthdays'];
      client_uuid?: string | null;
    }
  ): Promise<PosCustomer> {
    if (isOfflinePosEnabled()) return repo.updateCustomer(id, payload);
    assertWritable();
    return api.updateCustomer(id, payload);
  },

  async listSales(limit = 50): Promise<LocalSaleRow[]> {
    if (isOfflineReadsEnabled()) return repo.listSales(limit);
    return (await api.listSales(limit)).map(rowFromServer);
  },

  async getSale(row: LocalSaleRow): Promise<SaleDetail | null> {
    if (isOfflineReadsEnabled()) return repo.getSale(row);
    return row.server_id ? api.getSale(row.server_id) : null;
  },

  async refundSale(
    row: LocalSaleRow,
    items: RefundLineInput[],
    opts: { method?: PaymentMethod | null; reason?: string } = {}
  ): Promise<repo.RefundedSaleRow> {
    if (isOfflinePosEnabled()) return repo.refundSale(row, items, opts);
    if (!row.server_id) throw new Error('Sale has no server id');
    assertWritable();
    const detail = await api.refundSale(row.server_id, items, {
      ...opts,
      client_uuid: crypto.randomUUID(),
    });
    // Keep the refund's fiscal result off the stored sale — see RefundedSaleRow.
    const { refund_fiscal: refundFiscal, ...saleShape } = detail;
    return {
      ...row,
      status: saleShape.status,
      refunded_cents: saleShape.refunded_cents,
      detail: saleShape as SaleDetail,
      fiscal_status: saleShape.fiscal_status ?? row.fiscal_status,
      refund_fiscal: refundFiscal ?? null,
    };
  },

  /** Drop a queued sale the server will never accept. Only the till has a queue. */
  async discardQueuedSale(clientUuid: string): Promise<void> {
    if (!isOfflinePosEnabled()) throw new Error('Черга доступна лише в застосунку каси');
    return repo.discardQueuedSale(clientUuid);
  },
};
