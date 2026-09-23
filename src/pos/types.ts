// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/types.ts

import type { ModuleRemoteEntry } from './core/modules.js';
import type { NavOverrides } from './core/nav.js';
import type { FiscalProviderId, FiscalRequisites } from './fiscal/types.js';
import type { AttributeValues, VerticalId } from './verticals/types.js';

export type { ModuleRemoteEntry, NavOverrides };

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

export type StockDocumentType =
  | 'receipt'
  | 'writeoff'
  | 'adjustment'
  | 'inventory'
  /** Assembles a composite from its components — see composites.service.ts. */
  | 'production';

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
  module_remotes: Record<string, string | ModuleRemoteEntry>;
  nav_overrides: NavOverrides;
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

/**
 * The only part of the ПРРО settings a cashier's client is allowed to see —
 * no credentials, no provider config.
 *
 * It rides in the auth response on purpose: the desktop cashier must refuse to
 * queue an offline sale for a fiscalising store, and cold-offline the cached
 * `pos_auth` blob is the only thing it can read.
 */
export interface FiscalPublicConfig {
  enabled: boolean;
  provider: FiscalProviderId | null;
  /** The store sells from an offline-code reserve when the provider is down (POS_FISCAL_OFFLINE.md). */
  offline_mode: boolean;
  /** ФН ПРРО (рядок 34), cached from the provider; null until the first online contact. */
  register_fiscal_number: string | null;
  /** The rate code sales are fiscalised under — the till prints its letter (рядок 11). */
  default_tax_code: string | null;
  /**
   * Everything the receipt header needs, as the provider last reported it.
   * Travels with the login so the desktop till prints it without a connection.
   */
  requisites: FiscalRequisites | null;
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
  /**
   * What kind of shop this is — the product attribute schema, the units it may
   * sell in and which module supplies the sell screen's catalog
   * (`vertical-<id>`). Always a vertical this build knows: an unrecognised
   * column value degrades to clothing at read time (`verticalOrDefault`).
   */
  vertical: VerticalId;
  qrPayment: QrPaymentPublicConfig;
  /** Whether this store fiscalises, and with whom. Credentials stay server-side. */
  fiscal: FiscalPublicConfig;
  autoPrintReceipt: boolean;
  /** Assembly charge on a composite, in basis points. See migration 040. */
  floristLabourBps: number;
  /** Toggleable module ids enabled for this store (core ids not included). */
  enabledModules: string[];
  /** Per-store `{ moduleId: remote-entry.js URL }` map — web build only (roadmap #9). */
  moduleRemotes: Record<string, string | ModuleRemoteEntry>;
  /** Per-store menu appearance (label/icon/order) — see `core/nav.ts`. */
  navOverrides: NavOverrides;
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
  /** Vertical-defined attributes — see `src/pos/verticals`. */
  attributes: AttributeValues;
  /** Derived from `attributes` on every write by the store's `labelOf`. */
  label: string;
  /** Base unit of quantity (`quantity` counts whole units of it). */
  unit: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  cost_cents: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** `composite` is a bouquet or a tech card, assembled from other variants. */
export type ProductKind = 'simple' | 'composite';

/**
 * Where a composite's stock lives: `own` = assembled in advance and counted on
 * its own row, `derived` = assembled when it sells. Always `own` for a simple
 * product. See `composites.service.ts`.
 */
export type ProductStockMode = 'own' | 'derived';

/** One line of a composite's recipe, resolved for the till. */
export interface CatalogComponent {
  component_variant_id: number;
  /** Per one unit of the composite, in the component's own unit. */
  quantity: number;
  product_name: string;
  label: string;
  unit: string;
}

/** One answer the till may pick, as the catalog carries it. */
export interface CatalogModifier {
  id: number;
  name: string;
  /** Signed: «пів порції −15» is a real modifier. */
  price_delta_cents: number;
  /** Pre-selected on the till; never applied by the server on its own. */
  is_default: boolean;
  component_variant_id: number | null;
  component_quantity: number | null;
}

/**
 * A question the till asks about a product («Молоко?») and how many answers
 * it takes. Migration 046, TechDocs/POS_CAFE.md §3.
 */
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
  attributes: AttributeValues;
  /** The one caption the till, receipts and reports show for this variant. */
  label: string;
  unit: string;
  sku: string | null;
  barcode: string | null;
  price_cents: number;
  compare_at_cents: number | null;
  quantity: number;
  image_url: string | null;
  kind: ProductKind;
  stock_mode: ProductStockMode;
  /**
   * True for a card made at the bench for one physical bouquet. The window and
   * a catalogue bouquet are both `composite` + `own`, so nothing else tells
   * them apart — and only this one may be written off from the till.
   */
  one_off: boolean;
  /**
   * On the menu. Always `true` in a plain `GET /catalog` answer — the query
   * filters on it — and `false` only for rows a stock count asked for with
   * `include_unsellable=1` (an ingredient, a semi-finished product).
   */
  sellable: boolean;
  /**
   * The purchase pack (migration 054): `pack_qty` base units per pack,
   * `pack_label` what it is called. Here because the till's stock count is the
   * one screen there that types a quantity in, and «5 пляшок» is what the
   * person holding the clipboard is actually counting. Never used to price or
   * to sell — stock stays in base units.
   */
  pack_qty: number | null;
  pack_label: string;
  /**
   * On the day's manual stop-list («сьогодні не робимо», migration 050). The
   * row stays in the answer so the tile greys with a caption instead of
   * vanishing; `stop_listed_on` is the raw store-local day, so an offline
   * till can un-grey it at midnight without asking.
   */
  stop_listed: boolean;
  stop_listed_on: string | null;
  /**
   * The catalogue recipe, for a composite only. Present so the till can tell a
   * bouquet card from a rose and start a custom bouquet from it — the only
   * endpoint that carried this before is owner-only, so a cashier could not.
   * It rides into the offline snapshot for free, since the snapshot is this
   * same endpoint.
   */
  components?: CatalogComponent[];
  /**
   * The product's active modifier groups, in order — present only when it
   * has any. Rides into the offline snapshot, so the desktop till can price
   * a modified line without the network.
   */
  modifier_groups?: CatalogModifierGroup[];
  tag_ids?: number[];
}

/**
 * Where a paid order is between «paid» and «handed over» (migration 049,
 * café phase К3): `new` on the kitchen board, `ready` on the pickup shelf
 * («Готово»), `served` taken by the customer («Видано»). Every sale of a
 * store without a kitchen is `served` from the moment it is rung.
 */
export type PrepStatus = 'new' | 'ready' | 'served';

export interface CompleteSaleItemInput {
  variant_id: number;
  quantity: number;
  /**
   * Modifier ids this line chose (migration 046). Ids only: the server prices
   * the line as the card price plus the deltas, snapshots names and deltas
   * onto the line and writes off what the modifiers take. A line naming none
   * still has to satisfy every required group of its product. Never together
   * with `components`.
   */
  modifiers?: number[];
  /** Kitchen note for this line, ≤ 120 characters. Never on the fiscal receipt. */
  note?: string;
  /**
   * A bouquet assembled at the counter: the composition this ONE line was rung
   * with, overriding the catalogue's. Only a derived composite accepts it.
   * Its price is summed from the components, never sent — see
   * `priceOfComposition`. A line carrying this is never merged with another of
   * the same variant, because two custom bouquets are two different things.
   */
  components?: Array<{ component_variant_id: number; quantity: number }>;
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
