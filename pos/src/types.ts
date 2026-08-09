export type PosRole = 'owner' | 'seller';

export interface AuthResponse {
  token: string;
  expires_at: string;
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
  quantity: number;
  image_url: string | null;
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
  is_active: boolean;
  quantity: number;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  tag_ids: number[];
  variants: ProductVariant[];
}

export interface PosTag {
  id: number;
  store_id: number;
  parent_id: number | null;
  name: string;
  sort_order: number;
  children?: PosTag[];
}

export interface SaleListItem {
  id: number;
  receipt_number: string;
  status: string;
  total_cents: number;
  refunded_cents: number;
  staff_name: string;
  created_at: string;
}

export interface SaleDetail {
  id: number;
  receipt_number: string;
  status: string;
  subtotal_cents: number;
  total_cents: number;
  refunded_cents: number;
  staff_name: string;
  created_at: string;
  items: Array<{
    id: number;
    variant_id: number;
    product_name: string;
    variant_label: string;
    quantity: number;
    unit_price_cents: number;
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

export interface TodayAnalytics {
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
}

export interface StaffMember {
  id: number;
  display_name: string;
  role: PosRole;
  login: string | null;
  is_active: boolean;
  has_pin: boolean;
}
