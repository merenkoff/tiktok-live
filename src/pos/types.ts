// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/types.ts

export type PosRole = 'owner' | 'seller';

export type StockReason =
  | 'sale'
  | 'refund'
  | 'adjust'
  | 'void'
  | 'seed'
  | 'receipt'
  | 'writeoff'
  | 'inventory';

export type StockDocumentType = 'receipt' | 'writeoff' | 'adjustment' | 'inventory';

export type StockDocumentStatus = 'draft' | 'posted' | 'voided' | 'reversed';

export type WriteoffReasonCode = 'damaged' | 'lost' | 'gift' | 'other';

export type AdjustmentReasonCode = 'found' | 'loss' | 'data_fix' | 'other';

export type SaleStatus = 'completed' | 'voided' | 'refunded' | 'partially_refunded';

export type PaymentMethod = 'cash' | 'card' | 'qr';

export type QrPaymentMode = 'static' | 'dynamic';

export interface PosStore {
  id: number;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  qr_payment_enabled: boolean;
  qr_payment_mode: QrPaymentMode;
  qr_static_image_url: string | null;
  qr_purpose_template: string | null;
  qr_iban: string | null;
  qr_edrpou: string | null;
  qr_recipient: string | null;
  enabled_modules: string[];
  module_remotes: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

export interface PosStaff {
  id: number;
  store_id: number;
  role: PosRole;
  display_name: string;
  login: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface QrPaymentPublicConfig {
  enabled: boolean;
  mode: QrPaymentMode;
  static_image_url: string | null;
}

export interface PosAuthContext {
  sessionId: number;
  storeId: number;
  staffId: number;
  role: PosRole;
  displayName: string;
  storeName: string;
  storeSlug: string;
  currency: string;
  qrPayment: QrPaymentPublicConfig;
  autoPrintReceipt: boolean;
  /** Toggleable module ids enabled for this store (core ids not included). */
  enabledModules: string[];
  /** Per-store `{ moduleId: remote-entry.js URL }` map — web build only (roadmap #9). */
  moduleRemotes: Record<string, string>;
  token: string;
}

export interface PosProduct {
  id: number;
  store_id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PosVariant {
  id: number;
  store_id: number;
  product_id: number;
  size: string;
  color: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CatalogItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  size: string;
  color: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  quantity: number;
  image_url: string | null;
  tag_ids?: number[];
}

export interface CompleteSaleItemInput {
  variant_id: number;
  quantity: number;
}

export interface CompleteSalePaymentInput {
  method: PaymentMethod;
  amount_cents: number;
  /** Provider invoice id for a dynamic QR payment (Opendatabot). */
  provider_ref?: string | null;
}

export interface CartDiscountInput {
  type: 'percent' | 'fixed';
  value: number;
}

export interface RefundItemInput {
  sale_item_id: number;
  quantity: number;
}

/** How refunded money goes back to the customer — same set as PaymentMethod. */
export type RefundMethod = PaymentMethod;
