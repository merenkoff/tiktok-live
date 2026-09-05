// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export type PosRole = 'owner' | 'seller';

export type PaymentMethod = 'cash' | 'card' | 'qr';

export type QrPaymentMode = 'static' | 'dynamic';

export interface SalePaymentInput {
  method: PaymentMethod;
  amount_cents: number;
  /** Provider invoice id for a dynamic QR payment (Opendatabot). */
  provider_ref?: string | null;
}

export interface QrPaymentConfig {
  enabled: boolean;
  mode: QrPaymentMode;
  static_image_url: string | null;
}

/** Shape returned by GET /store and PATCH /store (owner settings). */
export interface StoreConfig {
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
  gtin_lookup_enabled: boolean;
  /** Whether a paid-provider API key is stored — the key itself is never returned. */
  gtin_api_key_set: boolean;
  gtin_daily_limit: number | null;
  auto_print_receipt: boolean;
  /** Toggleable module ids the store has enabled (effective set; core ids not listed). */
  enabled_modules: string[];
  /** `{ moduleId: remote-entry.js URL }` — web build loads these at boot instead of the bundled module (roadmap #9). */
  module_remotes: Record<string, string>;
}

export type StorePatch = Partial<
  Pick<
    StoreConfig,
    | 'name'
    | 'qr_payment_enabled'
    | 'qr_payment_mode'
    | 'qr_static_image_url'
    | 'qr_purpose_template'
    | 'qr_iban'
    | 'qr_edrpou'
    | 'qr_recipient'
    | 'gtin_lookup_enabled'
    | 'auto_print_receipt'
    | 'enabled_modules'
    | 'module_remotes'
  >
> & {
  /** write-only: non-empty string sets it, null/"" clears it, omitted keeps it */
  gtin_api_key?: string | null;
  gtin_daily_limit?: number | null;
};

export interface AuthResponse {
  token: string;
  expires_at: string;
  /** Local PIN/owner session without a live JWT — cashier shell only. */
  offlineSession?: boolean;
  staff: {
    id: number;
    display_name: string;
    role: PosRole;
  };
  store: {
    id: number;
    name: string;
    slug: string;
    currency: string;
    /** Optional so a cashier build reading an older cached/offline auth still typechecks. */
    qr_payment?: QrPaymentConfig;
    auto_print_receipt?: boolean;
    /** Toggleable module ids the store has enabled. Absent on older cached auth → treat as "all defaults on". */
    enabled_modules?: string[];
    /** `{ moduleId: remote-entry.js URL }` — web build only (roadmap #9). Absent on older cached auth. */
    module_remotes?: Record<string, string>;
  };
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
  compare_at_cents?: number | null;
  quantity: number;
  image_url: string | null;
  tag_ids?: number[];
}

export interface ProductVariant {
  id: number;
  product_id: number;
  size: string;
  color: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  compare_at_cents?: number | null;
  is_active: boolean;
  quantity: number;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  needs_review?: boolean;
  created_from_document_id?: number | null;
  tag_ids: number[];
  variants: ProductVariant[];
}

export interface PosTag {
  id: number;
  store_id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  color: string | null;
  show_in_catalog_bar: boolean;
  children?: PosTag[];
}

export interface SaleListItem {
  id: number;
  receipt_number: string;
  /** Client-generated UUID (offline idempotency key) — links a server sale to its local row. */
  client_uuid?: string | null;
  status: string;
  total_cents: number;
  refunded_cents: number;
  staff_name: string;
  customer_name?: string | null;
  created_at: string;
  /** true when the sale has a QR payment not yet confirmed by the provider. */
  qr_pending?: boolean;
}

export interface SaleDetail {
  id: number;
  receipt_number: string;
  /** Client-generated UUID (offline idempotency key) — links a server sale to its local row. */
  client_uuid?: string | null;
  status: string;
  subtotal_cents: number;
  total_cents: number;
  cart_discount_cents?: number;
  cart_discount_type?: string | null;
  cart_discount_value?: number | null;
  refunded_cents: number;
  staff_name: string;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  created_at: string;
  items: Array<{
    id: number;
    variant_id: number;
    product_name: string;
    variant_label: string;
    quantity: number;
    unit_price_cents: number;
    compare_at_unit_cents?: number | null;
    line_discount_cents?: number;
    line_total_cents: number;
    refunded_quantity: number;
  }>;
  payments: Array<{
    id: number;
    method: PaymentMethod;
    amount_cents: number;
    /** Set once a QR payment is confirmed paid by the provider; null while pending. */
    confirmed_at?: string | null;
  }>;
  refunds: Array<{
    id: number;
    /** Document number (RF-00001); null on refunds predating the column. */
    refund_number: string | null;
    client_uuid: string | null;
    /** How the money went back; null on refunds predating the column. */
    method: PaymentMethod | null;
    total_cents: number;
    reason: string | null;
    staff_name: string;
    created_at: string;
  }>;
}

/** One line of a refund request — how many units of a sale item go back. */
export interface RefundLineInput {
  sale_item_id: number;
  quantity: number;
}

export interface CustomerChild {
  name: string;
  birthday: string;
}

export interface PosCustomer {
  id: number;
  store_id: number;
  name: string;
  phone: string;
  email: string | null;
  children_birthdays: CustomerChild[];
  created_at: string;
  updated_at: string;
  client_uuid?: string | null;
}

export interface SalesSummary {
  from: string;
  to: string;
  sales_count: number;
  gross_cents: number;
  refunded_cents: number;
  net_cents: number;
  avg_check_cents: number;
  top_items: Array<{
    product_name: string;
    variant_label: string;
    qty_sold: number;
    revenue_cents: number;
  }>;
  payments: Array<{
    method: PaymentMethod;
    amount_cents: number;
    unconfirmed_cents: number;
  }>;
  daily: Array<{
    date: string;
    gross_cents: number;
    net_cents: number;
    sales_count: number;
  }>;
}

export interface StaffMember {
  id: number;
  display_name: string;
  role: PosRole;
  login: string | null;
  is_active: boolean;
  has_pin: boolean;
}

export type StockDocumentType = 'receipt' | 'writeoff' | 'adjustment' | 'inventory';
export type StockDocumentStatus = 'draft' | 'posted' | 'voided' | 'reversed';

export interface StockDocumentLine {
  id: number;
  document_id: number;
  store_id: number;
  variant_id: number | null;
  quantity: number;
  unit_cost_cents: number | null;
  system_qty: number | null;
  counted_qty: number | null;
  line_note: string | null;
  is_placeholder?: boolean;
  placeholder_name?: string | null;
  placeholder_size?: string;
  placeholder_color?: string;
  placeholder_barcode?: string | null;
  placeholder_price_cents?: number | null;
  product_name?: string;
  size?: string;
  color?: string;
  product_id?: number;
}

export interface StockDocument {
  id: number;
  store_id: number;
  type: StockDocumentType;
  status: StockDocumentStatus;
  doc_number: string;
  occurred_at: string;
  supplier_id: number | null;
  reason_code: string | null;
  note: string | null;
  created_by: number;
  posted_by: number | null;
  posted_at: string | null;
  reversed_at: string | null;
  reversal_of_id: number | null;
  created_at: string;
  updated_at: string;
  lines?: StockDocumentLine[];
}

export interface Supplier {
  id: number;
  store_id: number;
  name: string;
  phone: string | null;
  note: string | null;
  is_active: boolean;
}

export interface OnHandRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  size: string;
  color: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  cost_cents: number;
  price_cents: number;
}

export interface StockMovementRow {
  id: number;
  variant_id: number;
  product_name: string;
  size: string;
  color: string;
  delta: number;
  reason: string;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  staff_name: string | null;
  unit_cost_cents: number | null;
  occurred_at: string;
}

export interface MovementSummaryRow {
  variant_id: number;
  product_name: string;
  size: string;
  color: string;
  opening: number;
  receipt: number;
  sale: number;
  writeoff: number;
  adjust: number;
  inventory: number;
  refund: number;
  void: number;
  closing: number;
}

export interface LowStockRow {
  variant_id: number;
  product_name: string;
  size: string;
  color: string;
  quantity: number;
}
