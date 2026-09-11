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
  /** Offline mode (TechDocs/POS_FISCAL_OFFLINE.md). Always present — a store
   * that cannot or does not use it reports `capable`/`enabled` false. */
  offline: OfflineStatusBlock;
  /** Which device holds the register. Null while offline mode is off: the lock
   * is only enforced then, so there is nothing to report. */
  holder: HolderStatusBlock | null;
}

/** Mirrors `OfflineStatusBlock` in `src/pos/fiscal/offline/status.ts`. */
export interface OfflineStatusBlock {
  /** The provider's adapter implements the offline capability. */
  capable: boolean;
  /** …and the owner switched it on (and fiscalisation itself is enabled). */
  enabled: boolean;
  codes_target: number;
  /** Null while offline mode is off — the pool is not read at all then. */
  codes: { free: number; leased: number; used: number } | null;
  session: OfflineSessionView | null;
}

/**
 * One offline session: the stretch of sales stamped from the reserve while the
 * provider was unreachable, and its replay.
 *
 * `stuck` is the one state a human has to settle — the replay could not put the
 * register back online and stopped rather than guess.
 */
export interface OfflineSessionView {
  id: number;
  holder: 'server' | 'device';
  device_id: string | null;
  status: 'open' | 'replaying' | 'closed' | 'stuck';
  started_at: string;
  ended_at: string | null;
  /** The replay has sent `go-offline`; the documents follow it in `offline_seq` order. */
  go_offline_sent: boolean;
  last_go_online_at: string | null;
  /** Mirrors `SessionDocumentCounts`: everything not done or abandoned counts
   * as pending, so `pending + done + abandoned` is the whole session. */
  documents: { pending: number; done: number; abandoned: number };
  error_code: string | null;
  error_message: string | null;
}

/**
 * Who holds the register, as the `register/*` routes report it.
 *
 * Deliberately without `is_me`: those routes answer about the register, not
 * about the caller. Only `GET /fiscal/status` knows whose device asked.
 */
export interface HolderView {
  device_id: string;
  name: string | null;
  since: string | null;
  last_seen_at: string | null;
  /** No heartbeat for over 5 minutes — the holder may be gone for good. */
  stale: boolean;
  handover_request: {
    device_id: string;
    name: string | null;
    requested_at: string | null;
  } | null;
}

/** The `holder` block of `GET /fiscal/status` — `HolderView` plus `is_me`. */
export interface HolderStatusBlock extends HolderView {
  /** The caller's own `X-POS-Device-ID` is the holder. Always false on the web
   * shell, which sends no device id at all. */
  is_me: boolean;
}

/** The body every `register/*` route answers with, success or 409. */
export interface HolderResponse {
  holder: HolderView | null;
}

/** `POST /fiscal/register/handover/request` — 202 `requested`, 200 `claimed`. */
export interface HandoverRequestResponse extends HolderResponse {
  status: 'requested' | 'claimed';
}

/** `POST /fiscal/register/handover/force` — owner only. */
export interface ForceHandoverResponse extends HolderResponse {
  status: 'ok';
  /** Sessions of the ousted holder parked as `stuck`. */
  stuck_sessions: number;
  /** Its leased codes, burned: they can never be used now. */
  burned_codes: number;
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

/** One document row of `GET /fiscal/attention` — a document the retry cron gave up on. */
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
