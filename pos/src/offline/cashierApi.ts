// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api } from '../services/api';
import { isOfflinePosEnabled } from './enabled';
import * as repo from './repository';
import type { CatalogItem, PosCustomer, PosTag, SaleDetail } from '../types';

export const cashierApi = {
  getCatalog(opts?: { q?: string; barcode?: string; tag_id?: number }): Promise<CatalogItem[]> {
    return isOfflinePosEnabled() ? repo.getCatalog(opts) : api.getCatalog(opts);
  },

  getTags(): Promise<PosTag[]> {
    return isOfflinePosEnabled() ? repo.getTags() : api.getTags();
  },

  completeSale(payload: {
    items: Array<{ variant_id: number; quantity: number }>;
    payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>;
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
};
