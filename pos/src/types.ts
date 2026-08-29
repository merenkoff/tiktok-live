// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export type PosRole = 'owner' | 'seller';

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
  status: string;
  total_cents: number;
  refunded_cents: number;
  staff_name: string;
  customer_name?: string | null;
  created_at: string;
}

export interface SaleDetail {
  id: number;
  receipt_number: string;
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
    method: 'cash' | 'card';
    amount_cents: number;
  }>;
  refunds: Array<{
    id: number;
    total_cents: number;
    reason: string | null;
    staff_name: string;
    created_at: string;
  }>;
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
    method: 'cash' | 'card';
    amount_cents: number;
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
