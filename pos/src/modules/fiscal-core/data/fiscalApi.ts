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
// itself; see TechDocs/prro/POS_FISCAL_PRRO.md §"Тумблер живёт в хосте".

import { api } from '@pos/platform';
import { posRequest } from '../lib/hostPlatform';
import type {
  AttentionDoc,
  FiscalProbe,
  FiscalReport,
  FiscalStatus,
  ForceHandoverResponse,
  HandoverRequestResponse,
  HandoverConfirmResponse,
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
export function getFiscalSettingsView(registerNo = 1): Promise<FiscalSettingsView> {
  return registerNo === 1 ? api.fiscalSettings() : posRequest('get', `/fiscal/settings${registerQuery(registerNo)}`);
}

// ── Which register (track ДК, TechDocs/POS_DUAL_REGISTER.md) ─────────────────
//
// A store may run a second register — another ФОП's. Every call below takes
// its number, default 1, and says it only when it is not 1: a GET in the query,
// a POST/PATCH in the body. Register 1's requests are byte for byte what they
// were, so a provider bundle that never asks about a register (Checkbox)
// changes nothing.

function registerQuery(registerNo: number): string {
  return registerNo === 1 ? '' : `?register=${registerNo}`;
}

function registerBody(registerNo: number): { register?: number } {
  return registerNo === 1 ? {} : { register: registerNo };
}

/** A further register's own fields: its name and whether it works (register 1 has neither). */
export function saveRegisterBasics(
  registerNo: number,
  patch: { label?: string | null; enabled?: boolean }
): Promise<FiscalSettingsView> {
  return posRequest('patch', '/fiscal/settings', { ...patch, register: registerNo });
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
  secrets: Record<string, string | null>,
  registerNo = 1
): Promise<FiscalSettingsView> {
  return posRequest('patch', '/fiscal/settings', { secrets, ...registerBody(registerNo) });
}

/**
 * Save the provider's own non-secret settings (`config`) — the part of the
 * row only its bundle understands (Cashalot's tax table and test mode) — and,
 * with it, the default tax code, because for such a provider that code is a
 * row of that table. The backend runs the adapter's `normalizeConfig` and
 * answers its refusal as a 400 in the owner's words.
 */
export function saveFiscalConfig(
  config: Record<string, unknown>,
  defaultTaxCode?: string | null,
  registerNo = 1
): Promise<FiscalSettingsView> {
  return posRequest('patch', '/fiscal/settings', {
    config,
    ...(defaultTaxCode !== undefined ? { default_tax_code: defaultTaxCode } : {}),
    ...registerBody(registerNo),
  });
}

export function getFiscalStatus(registerNo = 1): Promise<FiscalStatus> {
  return posRequest('get', `/fiscal/status${registerQuery(registerNo)}`);
}

// Register 1 keeps its exact old call (no body): a POST without one is what
// every server before the second register expects.
function postFor<T>(path: string, registerNo: number): Promise<T> {
  return registerNo === 1 ? posRequest('post', path) : posRequest('post', path, registerBody(registerNo));
}

export function testFiscalConnection(registerNo = 1): Promise<FiscalProbe> {
  return postFor('/fiscal/test-connection', registerNo);
}

export function openFiscalShift(registerNo = 1): Promise<ShiftOpenResponse> {
  return postFor('/fiscal/shift/open', registerNo);
}

export function closeFiscalShift(registerNo = 1): Promise<ShiftCloseResponse> {
  return postFor('/fiscal/shift/close', registerNo);
}

export function fiscalXReport(registerNo = 1): Promise<FiscalReport> {
  return postFor('/fiscal/x-report', registerNo);
}

/** Positive = internal cash in, negative = cash out. */
export function fiscalServiceReceipt(amountCents: number, registerNo = 1): Promise<FiscalActionResult> {
  const body: ServiceReceiptRequest = { amount_cents: amountCents, ...registerBody(registerNo) };
  return posRequest('post', '/fiscal/service', body);
}

export function listFiscalAttention(registerNo?: number): Promise<{
  documents: AttentionDoc[];
  sessions: OfflineSessionView[];
}> {
  // Without a number: every register's, as before. A tab asks for its own.
  return posRequest('get', `/fiscal/attention${registerNo ? `?register=${registerNo}` : ''}`);
}

// ── Register holder (TechDocs/prro/POS_FISCAL_OFFLINE.md §3а) ─────────────────────
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
 *
 * `closeShift` is off by default and deliberately so: swapping a computer must
 * not cut the day into two Z-reports. It is for the cashier who is finishing
 * for the day anyway; the shift is then closed before the lock moves, and a
 * failure to close leaves the register exactly where it was.
 */
export function confirmHandover(
  outboxPending: number,
  closeShift = false
): Promise<HandoverConfirmResponse> {
  return posRequest('post', '/fiscal/register/handover/confirm', {
    outbox_pending: outboxPending,
    ...(closeShift ? { close_shift: true } : {}),
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
