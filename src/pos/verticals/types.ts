// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/verticals/types.ts
//
// A **sales vertical** is what kind of shop this store is: it decides the
// product attribute schema (clothing has size/colour, a florist has stem length
// and country), the units it may sell in, and how a variant's one-line label is
// built. The same id names the client module that supplies the catalog half of
// the sell screen (`vertical-<id>`).
//
// The label rule lives here, on the server, and the derived string is stored on
// the row (`pos_variants.label`). That is deliberate: sales, receipts, the ПРРО
// document, analytics and every stock report already consume one denormalised
// string, and the four client-side label composers this replaces had drifted
// into four different separators. See TechDocs/POS_VERTICALS.md.

/** Verticals this build knows. Adding one is a code change, never a migration. */
export type VerticalId = 'clothing' | 'flowers' | 'cafe';

export type AttributeType = 'text' | 'number' | 'select';

/** One attribute of a product variant, as a vertical declares it. */
export interface AttributeSpec {
  /**
   * The `pos_variants.attributes` jsonb key. A code constant, never user input:
   * `/^[a-z][a-z0-9_]{0,31}$/`.
   */
  key: string;
  /** UI label, Ukrainian — the admin form's field caption. */
  label: string;
  type: AttributeType;
  /** `select` only: the allowed values. */
  options?: string[];
  /** `number` only: rendered after the value ('см'), never stored. */
  unitSuffix?: string;
  /** A variant cannot be saved without it. */
  required?: boolean;
  /** Feeds the variant label and earns a column in the variants table. */
  inLabel?: boolean;
  /** Searchable on the till (server query + its offline mirror). */
  inSearch?: boolean;
  placeholder?: string;
}

/** Normalised attribute values of one variant: schema keys only. */
export type AttributeValues = Record<string, string | number>;

/** One answer to «чому списуємо»: the stored code and what the owner reads. */
export interface WriteoffReason {
  /** Goes into `pos_stock_documents.reason_code`; VARCHAR(32), no CHECK. */
  code: string;
  /** UI label, Ukrainian. */
  label: string;
}

/**
 * What a shop that sells things says when stock leaves without being sold.
 *
 * `other` is last and is the only one that demands a comment — the rule
 * `createDocument` has enforced since migration 006. A vertical that needs
 * its own words does **not** drop these; it says more precisely what
 * happened, because each code is a separate line in the expense report and
 * «Інше з коментарем» is exactly what that report cannot add up.
 */
export const GENERIC_WRITEOFF_REASONS: readonly WriteoffReason[] = [
  { code: 'damaged', label: 'Брак' },
  { code: 'lost', label: 'Втрата' },
  { code: 'gift', label: 'Подарунок' },
  { code: 'other', label: 'Інше' },
];

export interface VerticalDefinition {
  id: VerticalId;
  /** Shown to the owner and the super admin («Одяг», «Квіти»). */
  title: string;
  attributes: AttributeSpec[];
  /** Allowed `pos_variants.unit` values; `units[0]` is the default. */
  units: readonly string[];
  /**
   * Why stock may be written off or corrected here, in the order the owner
   * sees them. The same mechanism as `units` and `attributes`: the vertical
   * owns the vocabulary, the screen only renders it.
   *
   * Checked by `createDocument`, not merely offered — a list that nothing
   * enforces is not a list. It travels to the client in
   * `VerticalPublicConfig`, so a till learns a new reason from the backend
   * rather than from a module release.
   *
   * It does **not** govern the florist's showcase write-off: `writeOffShowcase`
   * builds its document with its own INSERT and its own two-code list, a
   * deliberate narrowing at the till (TechDocs/POS_FLORIST_BENCH.md).
   */
  writeoffReasons: readonly WriteoffReason[];
  /**
   * The variant label, from already-normalised attributes. Pure — it is called
   * on every variant write and by `relabelStoreVariants` when a store's
   * vertical changes.
   */
  labelOf(attrs: AttributeValues): string;
  /**
   * Which `pos_products.kind` values this vertical may create: `'composite'`
   * is a bouquet (flowers) or a tech card (café), see
   * TechDocs/POS_VERTICALS.md §7e.
   */
  productKinds: readonly ('simple' | 'composite')[];
  /**
   * How many recipe levels a composite may have under it. The depth of a
   * composite is 1 + the deepest composite among its components (a simple
   * component adds nothing), so `1` means "components are stock leaves only"
   * — a bouquet of stems — and `3` allows dish → semi-finished →
   * semi-finished → ingredients. Enforced on every recipe write and re-checked
   * for every ancestor when an inner recipe or a product's `stock_mode`
   * changes (TechDocs/POS_CAFE.md §9.2). Enforced here only, but reported in
   * `VerticalPublicConfig` too, so the composition editor knows whether to
   * offer a recipe as a component at all rather than learning it from a 400.
   */
  maxCompositionDepth: number;
  /**
   * Whether a paid sale goes to a kitchen before it is handed over — i.e.
   * whether `completeSale` puts it on the kitchen board as `new`
   * (migration 049, TechDocs/POS_CAFE.md §10 К3). A boutique's sale is
   * `served` the moment it is rung. Server-only: the till learns about the
   * board from the module that draws it, not from the vertical config.
   */
  kitchen: boolean;
}

/**
 * What the client is told about its store's vertical. Functions are stripped on
 * purpose: the client renders attribute inputs and reads `label`, it never
 * composes a label itself.
 */
export interface VerticalPublicConfig {
  id: VerticalId;
  title: string;
  attributes: AttributeSpec[];
  units: string[];
  defaultUnit: string;
  /** How deep a recipe may nest — see `VerticalDefinition.maxCompositionDepth`. */
  maxCompositionDepth: number;
  /**
   * The write-off reasons this store may use. Optional on the client side
   * (see `pos/src/modules/stock/...`), because a module can meet a backend
   * older than this field and must fall back rather than draw no buttons.
   */
  writeoffReasons: WriteoffReason[];
}
