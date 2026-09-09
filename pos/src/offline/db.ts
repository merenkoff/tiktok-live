// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import Dexie, { type Table } from 'dexie';
import type {
  CatalogItem,
  PosCustomer,
  PosRole,
  QrPaymentMode,
  SaleDetail,
  SaleFiscalStatus,
  SalePaymentInput,
} from '../types';

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
  /** Enabled module ids cached from AuthResponse so the till honours toggles offline (optional on old rows). */
  enabledModules?: string[];
  /**
   * ПРРО state cached from AuthResponse (optional on old rows).
   *
   * Cold-offline PIN login rebuilds the whole `AuthResponse` from this row, so
   * without it `store.fiscal` reads `undefined` → `false` → the offline sale
   * block silently disappears exactly when it is needed.
   */
  fiscalEnabled?: boolean;
  fiscalProvider?: string | null;
}

export type OutboxType = 'sale' | 'customer';
/**
 * `'dead'` is terminal: the server will never accept this row.
 *
 * It is a new *value* on the already-indexed `status` key path, not a schema
 * change — IndexedDB indexes values, not enumerations — so it needs no Dexie
 * version bump. `refreshPending` counts only `pending|error`, which is what
 * stops a permanently-rejected row pinning the offline banner forever.
 */
export type OutboxStatus = 'pending' | 'error' | 'dead';

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
  // The three below are non-indexed additions — no version bump. Optional
  // because rows written by older builds must still read correctly.
  /** End of the last attempt. The backoff is measured from here, not `createdAt`. */
  lastAttemptAt?: number;
  deadReason?: 'rejected' | 'sale_voided' | 'attempts_exhausted' | 'blocked_by_customer';
  /** True only when the server definitely created nothing — governs stock on discard. */
  nothingWritten?: boolean;
}

export interface CachedCustomer extends PosCustomer {
  client_uuid?: string | null;
}

/**
 * Local mirror of a receipt, keyed by `client_uuid` so a sale keeps its identity
 * across the offline → synced transition. `detail` is present only for receipts
 * this device rang up or opened while online; rows merged from the server list
 * carry summary fields only until opened.
 */
export interface LocalSaleRow {
  client_uuid: string;
  server_id: number | null;
  receipt_number: string;
  status: string;
  total_cents: number;
  refunded_cents: number;
  staff_name: string;
  customer_name: string | null;
  created_at: string;
  detail?: SaleDetail;
  /** ПРРО projection mirrored from the server row (optional on old rows). */
  fiscal_status?: SaleFiscalStatus;
  /** `'dead'` when this row's outbox entry was given up on. */
  sync_state?: 'dead' | 'discarded';
}

class PosOfflineDB extends Dexie {
  meta!: Table<MetaRow, string>;
  staffUnlock!: Table<StaffUnlockRow, string>;
  catalog!: Table<CatalogItem, number>;
  customers!: Table<CachedCustomer, number>;
  outbox!: Table<OutboxRow, string>;
  sales!: Table<LocalSaleRow, string>;

  constructor() {
    super('cloth-pos-offline');
    this.version(1).stores({
      meta: 'key',
      staffUnlock: 'id, storeSlug, staffId',
      catalog: 'variant_id, product_id, barcode',
      customers: 'id, phone, client_uuid, store_id',
      outbox: 'id, type, status, createdAt',
    });
    // v2 adds the local receipt mirror that powers the cashier's sales screen
    // and the offline void queue. Existing installs upgrade in place.
    this.version(2).stores({
      sales: 'client_uuid, server_id, created_at, status',
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
