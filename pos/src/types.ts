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

/**
 * One navigation entry's per-store appearance (`store.nav_overrides`). Every
 * field is optional and absent means «keep what the module declares» — that is
 * what lets a module rename or re-icon its own entry and still reach a store
 * that only reordered its menu. Mirrors the backend `NavOverride`
 * (`src/pos/core/nav.ts`). See TechDocs/POS_NAV_CUSTOMIZATION.md.
 */
export interface NavOverride {
  label?: string;
  /** lucide export name, resolved host-side by `resolveNavIcon`. */
  icon?: string;
  order?: number;
}

/** Sparse `{ '<moduleId>:<location>:<path>': NavOverride }` — see `navItemKey`. */
export type NavOverrides = Record<string, NavOverride>;

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

/**
 * Sales verticals this build knows — mirrors `VerticalId` in
 * `src/pos/verticals/types.ts`. What a store sells decides its product
 * attribute schema, its units and which module renders the sell screen's
 * catalog (`vertical-<id>`).
 */
export type VerticalId = 'clothing' | 'flowers' | 'cafe';

/** Normalised attribute values of one variant: only keys the schema declares. */
export type AttributeValues = Record<string, string | number>;

/** One product-variant attribute, as the store's vertical declares it. */
export interface AttributeSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  /** `number` only — rendered after the value ('см'), never stored. */
  unitSuffix?: string;
  required?: boolean;
  /** Feeds the server-built variant label and earns a column in the variants table. */
  inLabel?: boolean;
  /** Searchable on the till. */
  inSearch?: boolean;
  placeholder?: string;
}

/**
 * The store's vertical as the server reports it: schema and units, no rules.
 * The client renders attribute inputs from this and reads the server-built
 * `label` — it never composes a label itself.
 */
export interface VerticalPublicConfig {
  id: VerticalId;
  title: string;
  attributes: AttributeSpec[];
  units: string[];
  defaultUnit: string;
}

/** Shape returned by GET /store and PATCH /store (owner settings). */
export interface StoreConfig {
  id: number;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  /** What this store sells. Read-only here — only the super admin writes it. */
  vertical: VerticalPublicConfig;
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
  /**
   * What the shop charges for assembling a composite, in basis points of its
   * components' retail sum (2500 = 25%). 0 = parts only.
   */
  florist_labour_bps: number;
  /** Toggleable module ids the store has enabled (effective set; core ids not listed). */
  enabled_modules: string[];
  /**
   * Per-store module-remote map. A string value = a bundled module's code
   * overridden at boot (web, roadmap #9); an object value = a new online-only
   * module for the desktop cashier (roadmap #13 Part C).
   */
  module_remotes: Record<string, string | ModuleRemoteEntry>;
  /** Per-store menu appearance — the owner's «Вигляд меню» screen. */
  nav_overrides: NavOverrides;
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
    | 'florist_labour_bps'
    | 'enabled_modules'
    | 'module_remotes'
    | 'nav_overrides'
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
    /**
     * The store's sales vertical. Absent on older cached auth → the till treats
     * it as clothing (`DEFAULT_VERTICAL`), which is what every store was before
     * verticals existed.
     */
    vertical?: VerticalPublicConfig;
    /** Optional so a cashier build reading an older cached/offline auth still typechecks. */
    qr_payment?: QrPaymentConfig;
    auto_print_receipt?: boolean;
    /**
     * Assembly charge on a composite, in basis points. Optional for the same
     * reason as the rest: a cached auth from before this existed reads as 0,
     * which is exactly the old behaviour (parts only).
     */
    florist_labour_bps?: number;
    /** Toggleable module ids the store has enabled. Absent on older cached auth → treat as "all defaults on". */
    enabled_modules?: string[];
    /** Module-remote map (roadmap #9 string form / #13 Part C object form). Absent on older cached auth. */
    module_remotes?: Record<string, string | ModuleRemoteEntry>;
    /**
     * Per-store menu appearance. Absent on older cached auth → factory menus.
     * It ships with the login because the desktop cashier rebuilds its whole
     * session from the cached `pos_auth` when it starts cold offline.
     */
    nav_overrides?: NavOverrides;
    /**
     * Whether this store fiscalises, and with whom — no credentials.
     *
     * The desktop cashier reads this to refuse an offline sale, and cold-offline
     * the cached `pos_auth` is the only source, so it travels with the login.
     */
    fiscal?: FiscalPublicConfig;
  };
}

/**
 * One line of a `POST /sales/complete` payload.
 *
 * `components` is what a bouquet assembled at the counter took. Ids and counts
 * only: the server re-prices from them (`priceOfComposition` plus the store's
 * assembly charge), because a line price the till can set freely is a hole no
 * receipt would show. A line carrying it is never merged with another of the
 * same variant.
 */
export interface SaleItemInput {
  variant_id: number;
  quantity: number;
  components?: Array<{ component_variant_id: number; quantity: number }>;
  /**
   * Modifier ids this line chose («вівсяне молоко», «без цукру»). Ids only —
   * the server prices the line as the card price plus the deltas and writes
   * off what the modifiers take. Never together with `components`.
   */
  modifiers?: number[];
  /** Kitchen note, ≤ 120 characters. Never on the fiscal receipt. */
  note?: string;
}

/** One answer the till may pick for a product. */
export interface CatalogModifier {
  id: number;
  name: string;
  /** Signed. */
  price_delta_cents: number;
  /** Pre-selected on the till; the server never applies it on its own. */
  is_default: boolean;
  component_variant_id: number | null;
  component_quantity: number | null;
}

/** A question the till asks about a product and how many answers it takes. */
export interface CatalogModifierGroup {
  id: number;
  name: string;
  min_select: number;
  max_select: number;
  modifiers: CatalogModifier[];
}

export interface CatalogItem {
  variant_id: number;
  product_id: number;
  product_name: string;
  /** Vertical-defined attributes — the schema is `store.vertical.attributes`. */
  attributes: AttributeValues;
  /**
   * The variant's caption, built by the server from `attributes`. The client
   * never composes one: the rule belongs to the store's vertical, and four
   * hand-rolled composers on this side had already drifted apart.
   */
  label: string;
  /** Base unit of `quantity` ('шт', 'г'…). */
  unit: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  compare_at_cents?: number | null;
  quantity: number;
  image_url: string | null;
  /**
   * What shape of product this variant belongs to. The till needs it to tell a
   * bouquet card from a rose — before this the only endpoint carrying it was
   * owner-only, so a cashier could not.
   *
   * Optional because the offline mirror can still hold rows snapshotted by an
   * older build: absent reads as `'simple'` / `'own'`, which is what every
   * product was before composites existed.
   */
  kind?: ProductKind;
  stock_mode?: ProductStockMode;
  /**
   * A card made at the bench for one physical bouquet. The window and a
   * catalogue bouquet are both `composite` + `own`; only this one may be
   * written off from the till. Absent on an older cached snapshot → false.
   */
  one_off?: boolean;
  /**
   * On the menu. A plain catalog answer only ever carries `true`; `false`
   * appears on rows the stock count asked for with `include_unsellable`
   * (an ingredient, a semi-finished product). Absent on an older snapshot →
   * true, which is what every product was before the column existed.
   */
  sellable?: boolean;
  /**
   * The catalogue recipe, for a composite only. Rides into the offline
   * snapshot for free, because the snapshot is this same endpoint.
   */
  components?: CatalogComponent[];
  /** The product's modifier groups, in order — only when it has any. */
  modifier_groups?: CatalogModifierGroup[];
  tag_ids?: number[];
}

/**
 * What `POST /bench/showcase` gives back: the catalogue card a bouquet
 * assembled for the window became, and the production document that took its
 * stems off the shelf. Mirrors `ShowcaseResult` in `src/pos/bench.service.ts`.
 */
export interface ShowcaseResult {
  product_id: number;
  variant_id: number;
  name: string;
  /** Internal EAN-13 the price tag prints — GS1 prefix 2, issued server-side. */
  barcode: string;
  price_cents: number;
  cost_cents: number;
  document_id: number;
  /** `ВР-2026-00042`; its tail is the number the default name carries. */
  doc_number: string;
  /** False when this was a retry of a `client_uuid` already assembled. */
  created: boolean;
}

/**
 * A bouquet ordered now for a day that has not happened yet
 * (`TechDocs/POS_FLORIST_BENCH.md` §14). Mirrors `Preorder` in
 * `src/pos/preorders.service.ts`.
 *
 * `unit_price_cents` is the LOCKED price — what the shop promised. The till
 * never sends it back; handing the order over names its id and the server reads
 * the number out of its own table.
 */
export type PreorderStatus = 'new' | 'assembled' | 'handed_over' | 'cancelled';

export interface PreorderItem {
  id: number;
  variant_id: number;
  quantity: number;
  unit_price_cents: number;
  components: Array<{ component_variant_id: number; quantity: number }> | null;
  product_name: string;
  label: string;
  unit: string;
  image_url: string | null;
  /** What it would cost if quoted today. Null when a stem was delisted. */
  current_unit_price_cents: number | null;
}

export interface Preorder {
  id: number;
  status: PreorderStatus;
  staff_id: number;
  staff_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  fulfilment: 'pickup' | 'delivery';
  address: string | null;
  due_at: string;
  due_window_minutes: number | null;
  card_message: string | null;
  note: string | null;
  quoted_total_cents: number;
  sale_id: number | null;
  created_at: string;
  items: PreorderItem[];
  current_total_cents: number | null;
}

/**
 * The florist's own numbers (`TechDocs/POS_FLORIST_BENCH.md` §13). Mirrors
 * `FlowerAnalytics` in `src/pos/flowers-analytics.service.ts`.
 *
 * Basis points throughout for the same reason the store's assembly charge is:
 * a percentage with one decimal is a rounding argument waiting to happen.
 */
export interface FlowerLossRow {
  reason: 'damaged' | 'gift' | 'lost' | 'other';
  quantity: number;
  cost_cents: number;
}

export interface FlowerLossVariant {
  variant_id: number;
  product_name: string;
  label: string;
  unit: string;
  written_off: number;
  cost_cents: number;
  received: number;
  /** Written off as a share of what came in. Null when nothing came in. */
  waste_bps: number | null;
}

export interface FlowerStemRow {
  variant_id: number;
  product_name: string;
  label: string;
  unit: string;
  loose: number;
  in_bouquets: number;
  total: number;
}

export interface FlowerMarginRow {
  kind: 'bouquet' | 'other';
  lines: number;
  revenue_cents: number;
  cost_cents: number;
  margin_cents: number;
  markup_bps: number | null;
}

export interface FlowerAnalytics {
  from: string;
  to: string;
  loss: {
    total_cost_cents: number;
    by_reason: FlowerLossRow[];
    top_variants: FlowerLossVariant[];
  };
  stems: FlowerStemRow[];
  margin: {
    rows: FlowerMarginRow[];
    total_revenue_cents: number;
    total_cost_cents: number;
    total_margin_cents: number;
    /** What the shop charges for assembly — the number the margin is read against. */
    labour_bps: number;
  };
  daily_loss: Array<{ date: string; cost_cents: number }>;
}

/**
 * A cart put aside at one till, waiting to be rung up at another
 * (`TechDocs/POS_FLORIST_BENCH.md` §9). Mirrors `ParkedCart` in
 * `src/pos/parked-carts.service.ts`.
 *
 * The server holds the stock behind it, so nothing on the till reserves
 * anything: `quantity` here is what was parked, and the hold ends when the
 * cart is picked up, put back or lapses at `expires_at`.
 */
export interface ParkedCartComponent {
  component_variant_id: number;
  quantity: number;
  product_name: string;
  label: string;
  unit: string;
  unit_price_cents: number;
}

export interface ParkedCartItem {
  id: number;
  variant_id: number;
  quantity: number;
  /** Absent on an ordinary line; the stems for a bouquet built at the bench. */
  components: ParkedCartComponent[] | null;
  product_name: string;
  label: string;
  unit: string;
  /** The catalogue card's price. For a bouquet, only a starting point. */
  price_cents: number;
  /**
   * What the line actually costs: the assembled price for a bouquet built at
   * the bench (stems plus the shop's assembly charge), the card's price
   * otherwise. Computed server-side by the same function checkout prices with.
   */
  line_price_cents: number;
  image_url: string | null;
}

export interface ParkedCart {
  id: number;
  label: string;
  note: string | null;
  status: 'open' | 'picked' | 'released' | 'expired';
  staff_id: number;
  staff_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  cart_discount: { type: 'percent' | 'fixed'; value: number } | null;
  expires_at: string;
  created_at: string;
  items: ParkedCartItem[];
  /** At today's prices — a line under a name in a list, not a promise. */
  total_cents: number;
}

/** One line of a composite's recipe, resolved for the till. Mirrors the server. */
export interface CatalogComponent {
  component_variant_id: number;
  /** Per one unit of the composite, in the component's own unit. */
  quantity: number;
  product_name: string;
  label: string;
  unit: string;
}

/** `composite` is a bouquet or a tech card, assembled from other variants. */
export type ProductKind = 'simple' | 'composite';

/**
 * Where a composite's stock lives: `own` = assembled in advance and counted on
 * its own row, `derived` = assembled when it sells, so its availability is the
 * components'. Meaningless for a simple product, which is always `own`.
 */
export type ProductStockMode = 'own' | 'derived';

/** One line of a composite variant's composition. */
export interface ProductComponent {
  id: number;
  component_variant_id: number;
  /** In the component's own unit. */
  quantity: number;
  sort_order: number;
  product_name: string;
  label: string;
  unit: string;
}

/** What a composition write sends — the server resolves the rest. */
export interface ProductComponentInput {
  component_variant_id: number;
  quantity: number;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  attributes: AttributeValues;
  label: string;
  unit: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  compare_at_cents?: number | null;
  is_active: boolean;
  /**
   * For a `derived` composite this is what the components allow, not a stored
   * number — the server computes it. Absent on an older cached payload.
   */
  quantity: number;
  components?: ProductComponent[];
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  needs_review?: boolean;
  created_from_document_id?: number | null;
  /** Optional: an older cached payload predates composites. */
  kind?: ProductKind;
  stock_mode?: ProductStockMode;
  /**
   * A card made at the bench for one physical bouquet. The window and a
   * catalogue bouquet are both `composite` + `own`; only this one may be
   * written off from the till. Absent on an older cached snapshot → false.
   */
  one_off?: boolean;
  /**
   * On the sell screen. `false` for an ingredient or a semi-finished product
   * — still on the shelf, in the documents and in recipes. Absent on an older
   * cached payload → true.
   */
  sellable?: boolean;
  tag_ids: number[];
  /** Modifier groups this product asks, in order. Absent on an older payload. */
  modifier_group_ids?: number[];
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
  /** ФН ПРРО (рядок 34 of the receipt), cached from the provider. Optional: older cached auth lacks it. */
  register_fiscal_number?: string | null;
  /** The rate code sales are fiscalised under; picks the letter printed next to each line. */
  default_tax_code?: string | null;
  /**
   * What the receipt header says about the store, as the provider last
   * reported it. Travels with the login so the desktop till prints it offline.
   */
  requisites?: FiscalRequisites | null;
}

/** One tax rate as the provider lists it — the letter printed next to a receipt line. */
export interface FiscalTaxRate {
  /** The provider's id of the rate, the value `default_tax_code` holds. */
  code: string;
  symbol: string;
  label: string;
  /** Percent. */
  rate: number;
  no_vat: boolean;
  is_default: boolean;
}

/**
 * The store as the provider knows it — mirrors `FiscalRequisites` on the
 * backend field for field (Положення № 13, розділ II п. 2).
 */
export interface FiscalRequisites {
  organization: {
    name: string | null;
    edrpou: string | null;
    tax_number: string | null;
    is_vat: boolean | null;
  };
  point: { name: string | null; address: string | null };
  register: { fiscal_number: string | null; title: string | null; address: string | null };
  taxes: FiscalTaxRate[];
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
  /** `offline` = stamped from the tax-office code reserve; the provider confirms it on replay. */
  mode?: FiscalDocMode;
  fiscal_code: string | null;
  fiscal_date: string | null;
  /** Контрольне число — an offline document gets it from the provider on replay. */
  control_number?: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  error_message: string | null;
}

export type FiscalDocMode = 'online' | 'offline';

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
  /** Sell without the provider, stamping receipts from the tax-office code
   * reserve. Only ever true for a provider that can do it — the backend
   * refuses to store it otherwise. */
  offline_mode: boolean;
  /** How many offline codes the refill cron keeps in the pool. 50…2000. */
  offline_codes_target: number;
  /** The chosen provider's adapter implements `FiscalProvider.offline`.
   * False ⇒ `offline_mode` cannot be switched on at all, so the owner is not
   * shown a switch that only ever errors. */
  offline_capable: boolean;
  /** As last fetched from the provider; null until the first online contact. */
  requisites: FiscalRequisites | null;
  requisites_fetched_at: string | null;
  /** Offline hours spent this calendar month, of the tax office's 168. */
  offline_month?: FiscalOfflineMonth | null;
  updated_at: string | null;
  /** False when the server has no `POS_SECRETS_KEY` — credentials cannot be saved. */
  secrets_key_configured: boolean;
  /** False when this build ships no adapter for `provider` — every sale would 503. */
  adapter_available?: boolean;
}

export type FiscalReceiptSource = 'local' | 'provider';
export type FiscalReceiptWidth = 32 | 48;

/** What the till stamps on a receipt it prints without a connection (фаза 3). */
export interface FiscalOfflineStamp {
  /** The till's own id for this offline stretch; every receipt of it carries the same one. */
  client_session_id: string;
  /** Position inside the stretch, from 1. */
  seq: number;
  /** The tax-office code spent on this receipt. */
  fiscal_code: string;
  /** ISO date and time printed on the receipt, by the till's clock. */
  fiscal_date: string;
}

export interface FiscalLeaseCode {
  fiscal_code: string;
  serial_id: number | null;
}

export interface FiscalLeaseShift {
  id: number;
  opened_at: string | null;
  auto_close_due_at: string | null;
}

export interface FiscalLeaseSession {
  id: number;
  holder: 'server' | 'device';
  device_id: string | null;
  client_session_id: string | null;
  status: 'open' | 'replaying' | 'closed' | 'stuck';
  ready_at: string | null;
}

/**
 * The 168 hours a ПРРО may spend offline in a calendar month (Положення № 13),
 * as the server counted them. The till adds the stretch it is living through.
 */
export interface FiscalOfflineMonth {
  used_ms: number;
  limit_ms: number;
  measured_at: string;
  month_start: string;
}

/** `POST /fiscal/offline/lease` — the reserve this till may sell from. */
export interface FiscalLeaseResponse {
  lease_size: number;
  codes: FiscalLeaseCode[];
  shift: FiscalLeaseShift | null;
  register_fiscal_number: string | null;
  session: FiscalLeaseSession | null;
  offline_month?: FiscalOfflineMonth;
}

export interface FiscalSettingsPatch {
  enabled?: boolean;
  provider?: FiscalProviderId | null;
  default_tax_code?: string | null;
  auto_open_shift?: boolean;
  receipt_source?: FiscalReceiptSource;
  receipt_width?: FiscalReceiptWidth;
  offline_mode?: boolean;
  offline_codes_target?: number;
}


/**
 * The result of one fiscalisation attempt, as returned by a sale or refund.
 *
 * `pending` + `mode: 'offline'` is a sale stamped while the provider was
 * unreachable (server-side offline session): the fiscal number is real, the
 * control number and QR arrive once the session is replayed.
 */
export interface FiscalActionResult {
  status: 'done' | 'failed' | 'pending';
  mode?: FiscalDocMode;
  fiscal_code: string | null;
  fiscal_date: string | null;
  control_number?: string | null;
  tax_url: string | null;
  qr_payload: string | null;
  receipt_text: string | null;
  error_code: string | null;
  message: string | null;
}

export interface SaleListItem {
  id: number;
  receipt_number: string;
  /** Short daily order number (migration 047); null on older sales. */
  order_no?: number | null;
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
  /**
   * The short daily number the counter calls out (migration 047). Null on a
   * sale made before it existed, and on a sale the desktop till stamped
   * offline until it syncs. Shown where the vertical wants it.
   */
  order_no?: number | null;
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
    /** Unit the quantity is counted in, snapshotted at sale time. */
    unit?: string;
    quantity: number;
    unit_price_cents: number;
    compare_at_unit_cents?: number | null;
    line_discount_cents?: number;
    line_total_cents: number;
    refunded_quantity: number;
    /**
     * What this line actually consumed, for a composite. For a bouquet
     * assembled at the counter this is the only place its recipe exists —
     * there is no catalogue card to look it up on. Absent on an ordinary line
     * and on an older cached sale.
     */
    components?: Array<{
      component_variant_id: number;
      /** Per one unit of the composite. */
      quantity_per_unit: number;
      product_name: string;
      label: string;
      unit: string;
    }>;
    /** What the line chose, by name and delta, as it was at the time. */
    modifiers?: Array<{
      modifier_id: number | null;
      group_name: string;
      name: string;
      price_delta_cents: number;
    }>;
    /** Kitchen note. */
    note?: string;
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

export type StockDocumentType =
  | 'receipt'
  | 'writeoff'
  | 'adjustment'
  | 'inventory'
  /** Assembles a composite from its components. */
  | 'production';
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
  placeholder_attributes?: AttributeValues;
  placeholder_label?: string;
  placeholder_unit?: string;
  placeholder_sku?: string | null;
  placeholder_barcode?: string | null;
  placeholder_price_cents?: number | null;
  product_name?: string;
  /** Resolved caption: the variant's, or the placeholder's for a stub line. */
  label?: string;
  unit?: string;
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
  label: string;
  unit: string;
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
  label: string;
  unit: string;
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
  label: string;
  unit: string;
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
  label: string;
  unit: string;
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
