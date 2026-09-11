// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/modules/fiscal-core/data/fiscalApi.ts
//
// Typed wrappers over `host.posRequest()` for every `/api/pos/fiscal/*` route
// this module's screens need. The one thing kept OUT of this file on purpose:
// `/fiscal/settings` (GET/PATCH). Those are the host's own typed methods
// (`api.fiscalSettings` / `api.updateFiscalSettings`, added in phase 5 for
// `FiscalSettingsCard`) — a provider module never edits `enabled`/`provider`
// itself; see TechDocs/POS_FISCAL_PRRO.md §"Тумблер живёт в хосте".

import { api } from '@pos/platform';
import { posRequest } from '../lib/hostPlatform';
import type {
  AttentionDoc,
  FiscalProbe,
  FiscalReport,
  FiscalStatus,
  ForceHandoverResponse,
  HandoverRequestResponse,
  HolderResponse,
  OfflineSessionView,
  ServiceReceiptRequest,
  ShiftCloseResponse,
  ShiftOpenResponse,
} from '../types';
// Type-only, so this does not pull anything extra into the bundle — just two
// erased types from the shared domain types.
import type { FiscalActionResult, FiscalSettingsView } from '@pos/platform';

/**
 * Read the current settings, including which credential keys are set.
 *
 * Goes through the host's own `api.fiscalSettings()` (a stable typed method
 * that shipped alongside the host settings card, strictly before this module
 * could exist at all — every shell new enough to run `fiscal-checkbox`
 * already has it) rather than `posRequest`, so it needs no `REQUIRED_HOST_API`
 * entry of its own.
 */
export function getFiscalSettingsView(): Promise<FiscalSettingsView> {
  return api.fiscalSettings();
}

/**
 * Save credential values.
 *
 * Deliberately NOT `api.updateFiscalSettings()` — the host's typed
 * `FiscalSettingsPatch` omits `secrets` on purpose (`FiscalSettingsCard` must
 * never be ABLE to send one, so it can never trigger the 503 a missing
 * `POS_SECRETS_KEY` answers). This bundle IS the credentials screen for its
 * provider, so it goes through `posRequest` directly. Empty string = leave a
 * key unchanged, `null` = clear it — the same rule the backend documents on
 * `FiscalSettingsPatch.secrets`.
 */
export function saveFiscalSecrets(
  secrets: Record<string, string | null>
): Promise<FiscalSettingsView> {
  return posRequest('patch', '/fiscal/settings', { secrets });
}

export function getFiscalStatus(): Promise<FiscalStatus> {
  return posRequest('get', '/fiscal/status');
}

export function testFiscalConnection(): Promise<FiscalProbe> {
  return posRequest('post', '/fiscal/test-connection');
}

export function openFiscalShift(): Promise<ShiftOpenResponse> {
  return posRequest('post', '/fiscal/shift/open');
}

export function closeFiscalShift(): Promise<ShiftCloseResponse> {
  return posRequest('post', '/fiscal/shift/close');
}

export function fiscalXReport(): Promise<FiscalReport> {
  return posRequest('post', '/fiscal/x-report');
}

/** Positive = internal cash in, negative = cash out. */
export function fiscalServiceReceipt(amountCents: number): Promise<FiscalActionResult> {
  const body: ServiceReceiptRequest = { amount_cents: amountCents };
  return posRequest('post', '/fiscal/service', body);
}

export function listFiscalAttention(): Promise<{
  documents: AttentionDoc[];
  sessions: OfflineSessionView[];
}> {
  return posRequest('get', '/fiscal/attention');
}

// ── Register holder (TechDocs/POS_FISCAL_OFFLINE.md §3а) ─────────────────────
//
// All four of the till-side calls need the `X-POS-Device-ID` header, which only
// the desktop cashier sends (`api.setDeviceId` from the offline runtime) — on
// the web shell they answer 400 `device_id_required`, which is why the screens
// hide their buttons there rather than let a cashier press them.
//
// A 409 is a state, not a crash: its body carries the same `holder` block, so
// callers read it off the rejection and re-render.

export function claimRegister(deviceName?: string): Promise<HolderResponse> {
  return posRequest('post', '/fiscal/register/claim', deviceName ? { device_name: deviceName } : {});
}

export function releaseRegister(): Promise<HolderResponse> {
  return posRequest('post', '/fiscal/register/release', {});
}

export function requestHandover(deviceName?: string): Promise<HandoverRequestResponse> {
  return posRequest(
    'post',
    '/fiscal/register/handover/request',
    deviceName ? { device_name: deviceName } : {}
  );
}

/**
 * The holder hands the register over.
 *
 * `outboxPending` is the till's own count of queued sales — the backend refuses
 * the handover while it is non-zero, because those receipts would be registered
 * by a device that no longer holds the register.
 */
export function confirmHandover(outboxPending: number): Promise<HolderResponse> {
  return posRequest('post', '/fiscal/register/handover/confirm', {
    outbox_pending: outboxPending,
  });
}

/** Owner only, and the one register route the web shell can call. */
export function forceHandover(deviceId?: string | null): Promise<ForceHandoverResponse> {
  return posRequest(
    'post',
    '/fiscal/register/handover/force',
    deviceId ? { device_id: deviceId } : {}
  );
}
