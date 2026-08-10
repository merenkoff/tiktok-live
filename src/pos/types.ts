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

export type PaymentMethod = 'cash' | 'card';

export interface PosStore {
  id: number;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
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

export interface PosAuthContext {
  sessionId: number;
  storeId: number;
  staffId: number;
  role: PosRole;
  displayName: string;
  storeName: string;
  storeSlug: string;
  currency: string;
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
}

export interface CompleteSaleItemInput {
  variant_id: number;
  quantity: number;
}

export interface CompleteSalePaymentInput {
  method: PaymentMethod;
  amount_cents: number;
}

export interface CartDiscountInput {
  type: 'percent' | 'fixed';
  value: number;
}

export interface RefundItemInput {
  sale_item_id: number;
  quantity: number;
}
