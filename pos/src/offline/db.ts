// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import Dexie, { type Table } from 'dexie';
import type { CatalogItem, PosCustomer, PosRole, QrPaymentMode, SalePaymentInput } from '../types';

export interface MetaRow {
  key: string;
  value: unknown;
}

export interface StaffUnlockRow {
  id: string;
  storeSlug: string;
  storeId: number;
  storeName: string;
  storeCurrency: string;
  staffId: number;
  displayName: string;
  role: PosRole;
  kind: 'pin' | 'password';
  loginHint: string | null;
  saltB64: string;
  hashB64: string;
  iterations: number;
  updatedAt: number;
  /** QR payment config cached from AuthResponse for offline checkout (added later — optional on old rows). */
  qrPaymentEnabled?: boolean;
  qrPaymentMode?: QrPaymentMode;
  qrStaticImageUrl?: string | null;
  /** Auto-print receipt flag cached from AuthResponse (optional on old rows). */
  autoPrintReceipt?: boolean;
}

export type OutboxType = 'sale' | 'customer';
export type OutboxStatus = 'pending' | 'error';

export interface OutboxCustomerPayload {
  client_uuid: string;
  local_id: number;
  server_id: number | null;
  name: string;
  phone: string;
  email: string | null;
  children_birthdays: PosCustomer['children_birthdays'];
}

export interface OutboxSalePayload {
  client_uuid: string;
  items: Array<{ variant_id: number; quantity: number }>;
  payments: SalePaymentInput[];
  note?: string;
  cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
  customer_id: number | null;
  customer_client_uuid: string | null;
}

export interface OutboxRow {
  id: string;
  type: OutboxType;
  clientUuid: string;
  payload: OutboxCustomerPayload | OutboxSalePayload;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
}

export interface CachedCustomer extends PosCustomer {
  client_uuid?: string | null;
}

class PosOfflineDB extends Dexie {
  meta!: Table<MetaRow, string>;
  staffUnlock!: Table<StaffUnlockRow, string>;
  catalog!: Table<CatalogItem, number>;
  customers!: Table<CachedCustomer, number>;
  outbox!: Table<OutboxRow, string>;

  constructor() {
    super('cloth-pos-offline');
    this.version(1).stores({
      meta: 'key',
      staffUnlock: 'id, storeSlug, staffId',
      catalog: 'variant_id, product_id, barcode',
      customers: 'id, phone, client_uuid, store_id',
      outbox: 'id, type, status, createdAt',
    });
  }
}

export const db = new PosOfflineDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getDeviceId(): Promise<string> {
  const existing = await getMeta<string>('deviceId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await setMeta('deviceId', id);
  return id;
}
