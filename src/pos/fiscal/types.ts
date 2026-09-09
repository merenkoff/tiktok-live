// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/types.ts
//
// Shared types for Ukrainian ПРРО fiscalisation. See TechDocs/POS_FISCAL_PRRO.md.
//
// Split: per-store settings first, then the provider-facing contract. The
// contract is designed against all three providers rather than Checkbox — the
// reasoning for each choice is on the declaration it justifies.

/** Providers we intend to support. `checkbox` is the reference implementation. */
export const FISCAL_PROVIDER_IDS = ['checkbox', 'vchasno', 'echeck'] as const;

export type FiscalProviderId = (typeof FISCAL_PROVIDER_IDS)[number];

export function isFiscalProviderId(value: unknown): value is FiscalProviderId {
  return typeof value === 'string' && (FISCAL_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * v1 has exactly one stance when the fiscal server is unreachable: no sale.
 * The union is here so widening it later is a type error everywhere it matters,
 * not a silent behaviour change.
 */
export type FiscalFailMode = 'block';

/**
 * Which receipt the printer gets.
 *
 * `local` — our ESC/POS layout plus a fiscal block (number, date, tax QR).
 * `provider` — the provider's own pre-rendered text, fetched once at
 * fiscalisation time and stored on the ledger row; the till prints it verbatim
 * and falls back to `local` whenever the text could not be fetched.
 */
export type FiscalReceiptSource = 'local' | 'provider';

/** Characters per line the provider renders at: 32 = 58mm roll, 48 = 80mm. */
export type FiscalReceiptWidth = 32 | 48;
export const FISCAL_RECEIPT_WIDTHS: readonly FiscalReceiptWidth[] = [32, 48];

/** A `pos_fiscal_settings` row, secrets still encrypted. */
export interface PosFiscalSettings {
  store_id: number;
  enabled: boolean;
  provider: FiscalProviderId | null;
  config: Record<string, unknown>;
  secrets_encrypted: Buffer | null;
  secrets_key_version: number | null;
  default_tax_code: string | null;
  auto_open_shift: boolean;
  fail_mode: FiscalFailMode;
  receipt_source: FiscalReceiptSource;
  receipt_width: FiscalReceiptWidth;
  created_at: Date;
  updated_at: Date;
}

/**
 * The wire shape — never carries secret material.
 *
 * `secrets_set` lists the credential keys that currently hold a value, the
 * generalisation of the `*_set: boolean` pattern in `toSettingsView`
 * (`src/users/settings.controller.ts`). It is a list rather than a fixed record
 * because which keys exist is the provider adapter's business (phase 2): the
 * settings form is generated from the adapter's declarative `secretKeys` and
 * marks each one set or unset by membership here.
 */
export interface FiscalSettingsView {
  enabled: boolean;
  provider: FiscalProviderId | null;
  config: Record<string, unknown>;
  secrets_set: string[];
  default_tax_code: string | null;
  auto_open_shift: boolean;
  fail_mode: FiscalFailMode;
  receipt_source: FiscalReceiptSource;
  receipt_width: FiscalReceiptWidth;
  updated_at: string | null;
}

/**
 * Patch body for `PATCH /api/pos/fiscal/settings`.
 *
 * Secret semantics, matching the LIVE settings rule:
 *   - key absent, or an empty string → leave the stored value alone;
 *   - `null` → clear that credential;
 *   - non-empty string → set it.
 */
export interface FiscalSettingsPatch {
  enabled?: boolean;
  provider?: FiscalProviderId | null;
  config?: Record<string, unknown>;
  secrets?: Record<string, string | null>;
  default_tax_code?: string | null;
  auto_open_shift?: boolean;
  receipt_source?: FiscalReceiptSource;
  receipt_width?: FiscalReceiptWidth;
}

/** Everything an adapter needs to talk to a provider on a store's behalf. */
export interface FiscalCredentials {
  provider: FiscalProviderId;
  /** Non-secret, provider-shaped. */
  config: Readonly<Record<string, unknown>>;
  /** Decrypted credential bag. Never logged, never serialised to a response. */
  secrets: Readonly<Record<string, string>>;
}

// ── The provider contract ───────────────────────────────────────────────────

/**
 * An authenticated provider session — a Checkbox cashier JWT, a Вчасно device
 * token, whatever the adapter needs to carry between calls.
 *
 * Opaque on purpose, with a `meta` bag: Вчасно's local Device Manager base URL
 * belongs there, Checkbox's JWT in `token`. The orchestrator caches this and
 * never looks inside it.
 */
export interface FiscalSession {
  token: string;
  expiresAt: Date | null;
  meta?: Record<string, unknown>;
}

/** One line of a fiscal document. */
export interface FiscalDocLine {
  name: string;
  /**
   * Thousandths of a unit — 1 pc = 1000.
   *
   * Thousandths is the common ПРРО convention (Checkbox happens to want exactly
   * this), so the contract carries it rather than baking one provider's ×1000
   * into every adapter. `pos_sale_items.quantity` is an INTEGER count of whole
   * units today; weighted goods would need a schema change, not a change here.
   */
  quantityMilli: number;
  /** Pre-discount unit price, for display on the fiscal receipt. */
  unitPriceCents: number;
  /** Post-discount line total — what the customer actually pays for this line. */
  lineTotalCents: number;
  discountCents: number;
  /** Resolved `COALESCE(product.fiscal_tax_code, settings.default_tax_code)`. */
  taxCode: string | null;
  barcode: string | null;
  uktzed: string | null;
  /** Our sale-item id, so a return line can be traced back to what it undoes. */
  sourceLineRef: string | null;
}

export interface FiscalDocPayment {
  method: 'cash' | 'card' | 'qr';
  amountCents: number;
  providerRef?: string | null;
}

interface FiscalDocBase {
  /**
   * OUR idempotency key. The adapter MUST forward it as the provider's own
   * document id (Checkbox: `ReceiptSellPayload.id`, "Обов'язково вкажіть
   * унікальний UUID чеку"). This is what lets a timed-out retry come back as
   * `duplicate` instead of fiscalising the same sale twice.
   */
  requestId: string;
  /** Our receipt number, e.g. `R-00042`. Informational for the provider. */
  ourNumber: string;
  cashierName: string;
}

export interface FiscalSaleDoc extends FiscalDocBase {
  kind: 'sale';
  lines: FiscalDocLine[];
  payments: FiscalDocPayment[];
  totalCents: number;
  discountCents: number;
  note?: string | null;
  /** For a provider-delivered electronic receipt, when the customer has one. */
  customerPhone?: string | null;
}

export interface FiscalRefundDoc extends FiscalDocBase {
  kind: 'refund';
  lines: FiscalDocLine[];
  payments: FiscalDocPayment[];
  totalCents: number;
  discountCents: number;
  note?: string | null;
  customerPhone?: string | null;
  /** Provider doc id of the sale being returned (Checkbox `related_receipt_id`). */
  relatedProviderDocId: string;
  relatedOurNumber: string;
}

/** Cash in/out — службове внесення / видача. Has no sale behind it. */
export interface FiscalServiceDoc extends FiscalDocBase {
  kind: 'service_in' | 'service_out';
  amountCents: number;
}

export type FiscalDoc = FiscalSaleDoc | FiscalRefundDoc | FiscalServiceDoc;

/** The normalised result every provider must produce. */
export interface FiscalResult {
  providerDocId: string;
  /** Фіскальний номер. */
  fiscalCode: string | null;
  /** ISO-8601. */
  fiscalDate: string | null;
  /** cabinet.tax.gov.ua verification link, when the provider gives one. */
  taxUrl: string | null;
  /** The string to encode as a QR — NOT an image. */
  qrPayload: string | null;
  vatCents: number | null;
  /**
   * The provider's own pre-rendered plain-text receipt, or null.
   *
   * Nullable because not every provider offers one; that is exactly the seam
   * that lets the print-source decision stay open until phase 8.
   */
  receiptText: string | null;
  /** Stored verbatim in `pos_fiscal_receipts.response_payload` for support. */
  raw: unknown;
}

export type FiscalShiftStatus = 'open' | 'closed';

export interface FiscalShiftState {
  providerShiftId: string;
  status: FiscalShiftStatus;
  openedAt: string | null;
  /** Provider-side auto-close deadline, when it supports one. */
  autoCloseAt: string | null;
  raw?: unknown;
}

export interface FiscalShiftClosed extends FiscalShiftState {
  status: 'closed';
  closedAt: string | null;
  zReport: unknown;
  zReportText: string | null;
}

export interface FiscalReport {
  text: string | null;
  raw: unknown;
}

/** Cheap credential check for the settings screen's "Перевірити зʼєднання". */
export interface FiscalProbe {
  ok: boolean;
  cashierName: string | null;
  cashRegister: string | null;
  /** Provider's view of the shift, when the probe can see it without cost. */
  shiftOpen: boolean | null;
  message: string | null;
}

export type FiscalRenderFormat = 'text' | 'html' | 'png' | 'pdf' | 'xml' | 'qrcode';

export interface FiscalRendering {
  format: FiscalRenderFormat;
  contentType: string;
  /** Text formats come back as a string, binary ones as a Buffer. */
  body: string | Buffer;
}

/** Declares one credential field, so the settings form needs no per-provider UI. */
export interface FiscalSecretKeySpec {
  key: string;
  label: string;
  required: boolean;
  kind: 'text' | 'password' | 'file';
  hint?: string;
}

export interface FiscalCallCtx {
  storeId: number;
  creds: FiscalCredentials;
  session: FiscalSession;
  /** `X-Client-Name` / `X-Client-Version`, so providers can see who called. */
  clientName: string;
  clientVersion: string;
  /**
   * One deadline shared by the whole fiscal phase of a request.
   *
   * Non-optional deliberately: the till's axios client gives up at 15s, so a
   * server still working past that fiscalises a sale the cashier already saw
   * fail. Making this required means nobody can forget to pass it.
   */
  signal: AbortSignal;
}

/**
 * What every ПРРО provider must implement.
 *
 * Shaped by three providers, not one. The calls a given provider cannot make
 * are expressed by an optional method (`renderReceipt`), not by a stub that
 * pretends.
 */
export interface FiscalProvider {
  readonly id: FiscalProviderId;
  readonly title: string;
  /** Drives a generic credentials form — no provider-specific UI code. */
  readonly secretKeys: readonly FiscalSecretKeySpec[];

  /** Never mutates anything; safe to call from a settings screen. */
  probe(creds: FiscalCredentials, signal: AbortSignal): Promise<FiscalProbe>;

  signIn(creds: FiscalCredentials, signal: AbortSignal): Promise<FiscalSession>;
  signOut(ctx: FiscalCallCtx): Promise<void>;

  /**
   * The PROVIDER's view of the shift — the source of truth.
   *
   * The orchestrator reconciles `pos_fiscal_shifts` to this, never the reverse:
   * Вчасно's Device Manager can open a shift we know nothing about, and a
   * design that trusted our own table would desync permanently.
   */
  getShift(ctx: FiscalCallCtx): Promise<FiscalShiftState | null>;
  openShift(ctx: FiscalCallCtx, opts?: { autoCloseAt?: Date }): Promise<FiscalShiftState>;
  closeShift(ctx: FiscalCallCtx): Promise<FiscalShiftClosed>;
  xReport(ctx: FiscalCallCtx): Promise<FiscalReport>;

  registerSale(ctx: FiscalCallCtx, doc: FiscalSaleDoc): Promise<FiscalResult>;
  registerRefund(ctx: FiscalCallCtx, doc: FiscalRefundDoc): Promise<FiscalResult>;
  registerService(ctx: FiscalCallCtx, doc: FiscalServiceDoc): Promise<FiscalResult>;

  /**
   * Re-read a document we may or may not have successfully created.
   *
   * The recovery path for `duplicate`: the provider already has our
   * `requestId`, so we fetch what it made instead of sending it again.
   */
  fetchDocument(ctx: FiscalCallCtx, providerDocId: string): Promise<FiscalResult | null>;

  /**
   * Optional: only some providers render receipts for us.
   *
   * `opts.width` is the character width for text renders — the store's
   * `receipt_width`. Adapters that cannot honour it ignore it.
   */
  renderReceipt?(
    ctx: FiscalCallCtx,
    providerDocId: string,
    format: FiscalRenderFormat,
    opts?: FiscalRenderOptions
  ): Promise<FiscalRendering | null>;
}

export interface FiscalRenderOptions {
  width?: number;
}
