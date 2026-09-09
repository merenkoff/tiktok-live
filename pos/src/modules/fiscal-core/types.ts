// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/types.ts
//
// Wire shapes for `/api/pos/fiscal/*`, mirroring `src/pos/fiscal/types.ts` and
// `src/pos/fiscal/{shifts,ledger}.service.ts` field for field.
//
// `FiscalSettingsView` / `FiscalSettingsPatch` / `FiscalProviderId` /
// `FiscalActionResult` already exist in `pos/src/types.ts` (phase 5, the host
// settings card) and are reachable through `@pos/platform` — not redeclared
// here. This file covers only what phase 5 had no reason to add: shifts,
// reports, the credential probe, and the attention list.

/** `GET /fiscal/status` — never an error response; an unreachable provider is
 * a state to render, carried in `error`. */
export interface FiscalStatus {
  enabled: boolean;
  provider: string | null;
  /** Credentials present and an adapter compiled in for the provider. */
  configured: boolean;
  auto_open_shift: boolean;
  shift: {
    status: 'open' | 'closed';
    provider_shift_id: string | null;
    opened_at: string | null;
    auto_close_due_at: string | null;
  } | null;
  error: { code: string; message: string } | null;
}

export type FiscalShiftStatus = 'open' | 'closed';

export interface FiscalShiftState {
  providerShiftId: string;
  status: FiscalShiftStatus;
  openedAt: string | null;
  autoCloseAt: string | null;
}

export interface FiscalShiftClosed extends FiscalShiftState {
  status: 'closed';
  closedAt: string | null;
  zReport: unknown;
  zReportText: string | null;
}

/** `POST /fiscal/shift/open` */
export interface ShiftOpenResponse {
  shift: FiscalShiftState;
}

/** `POST /fiscal/shift/close` */
export interface ShiftCloseResponse {
  shift: FiscalShiftClosed;
  z_report: unknown;
  z_report_text: string | null;
}

/** `POST /fiscal/x-report` */
export interface FiscalReport {
  text: string | null;
  raw: unknown;
}

/** `POST /fiscal/test-connection` */
export interface FiscalProbe {
  ok: boolean;
  cashierName: string | null;
  cashRegister: string | null;
  shiftOpen: boolean | null;
  message: string | null;
}

/** One row of `GET /fiscal/attention` — a document the retry cron gave up on. */
export interface AttentionDoc {
  id: number;
  doc_type: 'sale' | 'refund' | 'service_in' | 'service_out';
  sale_id: number | null;
  refund_id: number | null;
  receipt_number: string | null;
  total_cents: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

/** `POST /fiscal/service` — cash in (positive) / out (negative). */
export interface ServiceReceiptRequest {
  amount_cents: number;
}

/** Declares one credential field, so the form needs no per-provider UI code. */
export interface FiscalSecretKeySpec {
  key: string;
  label: string;
  required: boolean;
  kind: 'text' | 'password' | 'file';
  hint?: string;
}

/** The shape every `/fiscal/*` error body shares (`replyFiscalError` on the backend). */
export interface FiscalErrorBody {
  error: string;
  message: string;
  detail?: string;
  support_code?: string;
}

export function isFiscalErrorBody(value: unknown): value is FiscalErrorBody {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { error?: unknown }).error === 'string'
  );
}
