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

export function listFiscalAttention(): Promise<{ documents: AttentionDoc[] }> {
  return posRequest('get', '/fiscal/attention');
}
