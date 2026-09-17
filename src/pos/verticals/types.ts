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
export type VerticalId = 'clothing' | 'flowers';

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

export interface VerticalDefinition {
  id: VerticalId;
  /** Shown to the owner and the super admin («Одяг», «Квіти»). */
  title: string;
  attributes: AttributeSpec[];
  /** Allowed `pos_variants.unit` values; `units[0]` is the default. */
  units: readonly string[];
  /**
   * The variant label, from already-normalised attributes. Pure — it is called
   * on every variant write and by `relabelStoreVariants` when a store's
   * vertical changes.
   */
  labelOf(attrs: AttributeValues): string;
  /**
   * Which `pos_products.kind` values this vertical may create. Every vertical
   * is `['simple']` today; `'composite'` is reserved for bouquets and tech
   * cards (TechDocs/POS_VERTICALS.md §future).
   */
  productKinds: readonly ('simple' | 'composite')[];
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
}
