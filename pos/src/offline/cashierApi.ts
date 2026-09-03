// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api } from '../services/api';
import { isOfflinePosEnabled } from './enabled';
import * as repo from './repository';
import type { LocalSaleRow } from './db';
import type {
  CatalogItem,
  PaymentMethod,
  PosCustomer,
  PosTag,
  RefundLineInput,
  SaleDetail,
  SaleListItem,
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
  };
}

export const cashierApi = {
  getCatalog(opts?: { q?: string; barcode?: string; tag_id?: number }): Promise<CatalogItem[]> {
    return isOfflinePosEnabled() ? repo.getCatalog(opts) : api.getCatalog(opts);
  },

  getTags(): Promise<PosTag[]> {
    return isOfflinePosEnabled() ? repo.getTags() : api.getTags();
  },

  completeSale(payload: {
    items: Array<{ variant_id: number; quantity: number }>;
    payments: SalePaymentInput[];
    note?: string;
    cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
    customer_id?: number | null;
  }): Promise<SaleDetail> {
    return isOfflinePosEnabled() ? repo.completeSale(payload) : api.completeSale(payload);
  },

  listCustomers(q?: string): Promise<PosCustomer[]> {
    return isOfflinePosEnabled() ? repo.listCustomers(q) : api.listCustomers(q);
  },

  createCustomer(payload: {
    name: string;
    phone: string;
    email?: string | null;
    children_birthdays?: PosCustomer['children_birthdays'];
    client_uuid?: string | null;
  }): Promise<PosCustomer> {
    return isOfflinePosEnabled() ? repo.createCustomer(payload) : api.createCustomer(payload);
  },

  updateCustomer(
    id: number,
    payload: {
      name?: string;
      phone?: string;
      email?: string | null;
      children_birthdays?: PosCustomer['children_birthdays'];
      client_uuid?: string | null;
    }
  ): Promise<PosCustomer> {
    return isOfflinePosEnabled() ? repo.updateCustomer(id, payload) : api.updateCustomer(id, payload);
  },

  async listSales(limit = 50): Promise<LocalSaleRow[]> {
    if (isOfflinePosEnabled()) return repo.listSales(limit);
    return (await api.listSales(limit)).map(rowFromServer);
  },

  async getSale(row: LocalSaleRow): Promise<SaleDetail | null> {
    if (isOfflinePosEnabled()) return repo.getSale(row);
    return row.server_id ? api.getSale(row.server_id) : null;
  },

  async refundSale(
    row: LocalSaleRow,
    items: RefundLineInput[],
    opts: { method?: PaymentMethod | null; reason?: string } = {}
  ): Promise<LocalSaleRow> {
    if (isOfflinePosEnabled()) return repo.refundSale(row, items, opts);
    if (!row.server_id) throw new Error('Sale has no server id');
    const detail = await api.refundSale(row.server_id, items, {
      ...opts,
      client_uuid: crypto.randomUUID(),
    });
    return { ...row, status: detail.status, refunded_cents: detail.refunded_cents, detail };
  },
};
