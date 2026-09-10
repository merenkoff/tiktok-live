// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

export type PosRole = 'owner' | 'seller';

export type PaymentMethod = 'cash' | 'card' | 'qr';

export type QrPaymentMode = 'static' | 'dynamic';

/**
 * The object form of a `store.module_remotes` value (roadmap #13 Part C): a new
 * **online-only** feature module the desktop cashier downloads and runs but
 * ships no code for. It self-describes enough to render a nav entry + a route
 * before its full descriptor is available (cold offline first run). Mirrors the
 * backend `ModuleRemoteEntry` (`src/pos/core/modules.ts`). A bare string value
 * still means "override a bundled module's code" (roadmap #9).
 */
export interface ModuleRemoteEntry {
  url: string;
  title: string;
  routePath: string;
  nav: Array<{
    label: string;
    location: 'cashier-primary' | 'admin-sidebar';
    order: number;
    match?: string;
    /** lucide export name, resolved host-side (roadmap #13 Part D). Falls back to `icon`. */
    icon?: string;
  }>;
  /** Default lucide export name for every nav entry that doesn't name its own. */
  icon?: string;
}

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
  auto_print_receipt: boolean;
  /** Toggleable module ids the store has enabled (effective set; core ids not listed). */
  enabled_modules: string[];
  /**
   * Per-store module-remote map. A string value = a bundled module's code
   * overridden at boot (web, roadmap #9); an object value = a new online-only
   * module for the desktop cashier (roadmap #13 Part C).
   */
  module_remotes: Record<string, string | ModuleRemoteEntry>;
  /**
   * TikTok LIVE account this store sells from, or null when it isn't connected.
   * Drives `POST /api/pos/live/session-token` — see the `tiktok-live` module.
   */
  live_tiktok_username: string | null;
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
    | 'live_tiktok_username'
  >
> & {
  /** write-only: non-empty string sets it, null/"" clears it, omitted keeps it */
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
    /** Module-remote map (roadmap #9 string form / #13 Part C object form). Absent on older cached auth. */
    module_remotes?: Record<string, string | ModuleRemoteEntry>;
    /**
     * Whether this store fiscalises, and with whom — no credentials.
     *
     * The desktop cashier reads this to refuse an offline sale, and cold-offline
     * the cached `pos_auth` is the only source, so it travels with the login.
     */
    fiscal?: FiscalPublicConfig;
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

// ── ПРРО fiscalisation ──────────────────────────────────────────────────────
// Everything here is optional: an older cached `pos_auth`, the synthetic
// offline receipt, and every non-fiscalising store must all still typecheck.

/** Mirrors `FISCAL_PROVIDER_IDS` in the backend. Types-only here by design. */
export type FiscalProviderId = 'checkbox' | 'vchasno' | 'echeck';

/** Projection on a sale/refund. `'none'` = this store does not fiscalise. */
export type SaleFiscalStatus = 'none' | 'pending' | 'done' | 'failed';

export type FiscalDocStatus = 'pending' | 'sent' | 'done' | 'failed' | 'abandoned';

export interface FiscalPublicConfig {
  enabled: boolean;
  provider: FiscalProviderId | null;
  /**
   * The store sells from an offline-code reserve when the provider is down
   * (TechDocs/POS_FISCAL_OFFLINE.md). Optional: older cached auth lacks it.
   */
  offline_mode?: boolean;
}

/**
 * The fiscal document attached to a sale by `getSale`.
 *
 * Deliberately NOT the same interface as {@link FiscalActionResult}: this one
 * carries `error_message`, that one `message`. Collapsing them would make
 * `.message` silently `undefined` on every reloaded receipt.
 */
export interface SaleFiscalDoc {
  status: FiscalDocStatus | string;
  fiscal_code: string | null;
  fiscal_date: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  error_message: string | null;
}

/** Owner-facing ПРРО settings. Credentials are reported by presence only. */
export interface FiscalSettingsView {
  enabled: boolean;
  provider: FiscalProviderId | null;
  config: Record<string, unknown>;
  /** Which credential keys hold a value. Never the values themselves. */
  secrets_set: string[];
  default_tax_code: string | null;
  auto_open_shift: boolean;
  fail_mode: string;
  /** `local` = our layout + fiscal block; `provider` = the provider's text, printed verbatim. */
  receipt_source: FiscalReceiptSource;
  /** Characters per line the provider renders at: 32 = 58mm roll, 48 = 80mm. */
  receipt_width: FiscalReceiptWidth;
  updated_at: string | null;
  /** False when the server has no `POS_SECRETS_KEY` — credentials cannot be saved. */
  secrets_key_configured: boolean;
  /** False when this build ships no adapter for `provider` — every sale would 503. */
  adapter_available?: boolean;
}

export type FiscalReceiptSource = 'local' | 'provider';
export type FiscalReceiptWidth = 32 | 48;

export interface FiscalSettingsPatch {
  enabled?: boolean;
  provider?: FiscalProviderId | null;
  default_tax_code?: string | null;
  auto_open_shift?: boolean;
  receipt_source?: FiscalReceiptSource;
  receipt_width?: FiscalReceiptWidth;
}

/** The result of one fiscalisation attempt, as returned by a sale or refund. */
export interface FiscalActionResult {
  status: 'done' | 'failed';
  fiscal_code: string | null;
  fiscal_date: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  message: string | null;
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
  /** ПРРО projection. Absent/`'none'` for a store that does not fiscalise. */
  fiscal_status?: SaleFiscalStatus;
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
  /** ПРРО projection. Absent/`'none'` for a store that does not fiscalise. */
  fiscal_status?: SaleFiscalStatus;
  /** The sale's own fiscal document. Null until it has one. */
  fiscal?: SaleFiscalDoc | null;
  /**
   * Set only on the immediate response to a refund — it describes the REFUND's
   * document, not the sale's, and is never persisted on the sale.
   */
  refund_fiscal?: FiscalActionResult | null;
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
  placeholder_sku?: string | null;
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
  /** Set on documents submitted idempotently from the till (roadmap #12 track 3). */
  client_uuid?: string | null;
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

/**
 * Response of `POST /api/pos/live/session-token` — a TikTok LIVE token minted
 * from the store's `live_tiktok_username`. Consumed by the `tiktok-live`
 * feature module; the LIVE side verifies it as a stateless HMAC, so the client
 * simply caches it and re-mints on 401 or near `expiresAt`.
 */
export interface LiveBridgeToken {
  token: string;
  user: { id: number; tiktok_username: string };
  expiresAt: string;
}

/**
 * TikTok LIVE broadcast settings, as the owner-only proxy
 * (`GET /api/pos/live/settings`) reports them.
 *
 * Secrets are absent by design — only whether one is stored. Returning them
 * masked meant a form round-trip wrote the mask over the real credential.
 */
export interface LiveSettings {
  user_id: number;
  tiktok_username: string | null;
  telegram_bot_token_set: boolean;
  /** `bigint` column — a string end to end so precision survives. */
  telegram_channel_id: string | null;
  novaposhta_api_key_set: boolean;
  novaposhta_merchant_name: string | null;
  reservation_timeout_minutes: number;
}

/** Omit a field to keep it, send `null`/`''` to clear it, send a value to set it. */
export interface LiveSettingsPatch {
  telegram_bot_token?: string | null;
  telegram_channel_id?: string | null;
  novaposhta_api_key?: string | null;
  novaposhta_merchant_name?: string | null;
  reservation_timeout_minutes?: number;
}

/**
 * One row of the shared GTIN cache (`pos_gtin_cache`), as the owner's repair
 * page sees it. `gtin` is the canonical GTIN-14 storage key — show it through
 * `displayGtin` rather than raw.
 */
export interface GtinCacheEntry {
  gtin: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  best_source: string | null;
  /** An owner cleared this entry; automatic sources may not refill it. */
  blocked: boolean;
  filled_at: string;
  updated_at: string;
}

export interface GtinCachePage {
  items: GtinCacheEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Result of `POST /api/pos/gtin/learn/batch`. */
export interface GtinLearnResult {
  /** Rows the server took in (a valid barcode, a name, an allowed source). */
  accepted: number;
  /** Of those, the ones that actually changed the cache row. */
  upserted: number;
  skipped: Array<{ gtin: string; reason: string }>;
}
