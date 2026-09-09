// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/fiscal.routes.ts
//
// Ukrainian ПРРО settings surface. See TechDocs/POS_FISCAL_PRRO.md.
//
// Registered as a CORE route group (`moduleId: null`), same reasoning as
// `registerLiveRoutes`: the `fiscal-<provider>` UI module opts in through
// `pos_stores.module_remotes`, not `enabled_modules`, so `ensureModule` would
// have nothing to check. The gate here is `ensurePosOwner`.
//
// Phase 1 is settings only. Shift control, status and the retry surface arrive
// in phase 3, checkout orchestration in phase 4.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import { isSecretsKeyConfigured } from '../core/secrets.js';
import { asFiscalError, cashierMessage, supportCode } from '../fiscal/errors.js';
import * as fiscalService from '../fiscal/fiscal.service.js';
import { hasProvider } from '../fiscal/providers/index.js';
import * as fiscalSettings from '../fiscal/settings.service.js';
import * as shifts from '../fiscal/shifts.service.js';
import type { FiscalSettingsPatch } from '../fiscal/types.js';
import { errorMessage } from './_shared.js';

/** Shift calls are interactive; keep them inside the till's own patience. */
const SHIFT_TIMEOUT_MS = 12_000;

/**
 * One place that turns a `FiscalError` into a response.
 *
 * 409 for "fix something first" (no shift, bad setup) so the client can act;
 * 502 for "the provider is unhappy", which is not the caller's fault. Both
 * carry the support code, which is what a cashier reads down the phone.
 */
function replyFiscalError(reply: FastifyReply, error: unknown, fallback: string) {
  const fiscal = asFiscalError(error, fallback);
  const status =
    fiscal.kind === 'not_configured' || fiscal.kind === 'shift_closed' ? 409 : 502;
  return reply.code(status).send({
    error: fiscal.kind,
    message: cashierMessage(fiscal.kind),
    detail: fiscal.message,
    support_code: supportCode(fiscal),
  });
}

export function registerFiscalRoutes(fastify: FastifyInstance): void {
  fastify.get('/fiscal/settings', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    const settings = await fiscalSettings.getFiscalSettings(auth.storeId);
    return {
      ...fiscalSettings.toFiscalSettingsView(auth.storeId, settings),
      // The owner needs to know that credentials cannot be saved before they
      // fill in a form that will 503 on submit.
      secrets_key_configured: isSecretsKeyConfigured(),
      // Whether this build actually ships an adapter for the chosen provider.
      // A store that enables a provider with no adapter gets 503 on every sale,
      // and nothing else would tell the owner why.
      adapter_available: settings?.provider ? hasProvider(settings.provider) : false,
    };
  });

  fastify.patch('/fiscal/settings', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    const body = (request.body ?? {}) as FiscalSettingsPatch;
    if (typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'body must be an object' });
    }

    // Refuse before touching the row: storing a provider licence key in
    // plaintext is not an acceptable degraded mode.
    if (body.secrets !== undefined && !isSecretsKeyConfigured()) {
      return reply
        .code(503)
        .send({ error: 'secrets_key_missing', message: 'POS_SECRETS_KEY is not configured' });
    }

    try {
      const saved = await fiscalSettings.updateFiscalSettings(auth.storeId, body);
      return {
        ...fiscalSettings.toFiscalSettingsView(auth.storeId, saved),
        secrets_key_configured: isSecretsKeyConfigured(),
      };
    } catch (error) {
      if (error instanceof fiscalSettings.FiscalSettingsValidationError) {
        return reply.code(400).send({ error: errorMessage(error) });
      }
      request.log.error({ err: error }, 'Fiscal settings update failed');
      return reply.code(500).send({ error: 'fiscal_settings_failed' });
    }
  });

  // ── Shift control ─────────────────────────────────────────────────────────
  // Any staff member, not owner-only: opening the shift is the first thing a
  // cashier does in the morning, and a store where only the owner can do it
  // cannot trade until the owner logs in.

  fastify.get('/fiscal/status', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    // Never throws — an unreachable provider is a state to display, not a
    // failed request.
    return shifts.getStatus(auth.storeId, AbortSignal.timeout(SHIFT_TIMEOUT_MS));
  });

  fastify.post('/fiscal/shift/open', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const ctx = await shifts.resolveContext(auth.storeId);
      if (!ctx) return notConfigured(reply);
      const state = await shifts.openShift(
        ctx,
        AbortSignal.timeout(SHIFT_TIMEOUT_MS),
        auth.staffId
      );
      return { shift: state };
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося відкрити зміну ПРРО');
    }
  });

  fastify.post('/fiscal/shift/close', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const ctx = await shifts.resolveContext(auth.storeId);
      if (!ctx) return notConfigured(reply);
      const closed = await shifts.closeShift(ctx, AbortSignal.timeout(SHIFT_TIMEOUT_MS));
      return {
        shift: closed,
        z_report: closed.zReport,
        z_report_text: closed.zReportText,
      };
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося закрити зміну ПРРО');
    }
  });

  // Службове внесення / видача готівки. Positive = in, negative = out.
  fastify.post('/fiscal/service', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = request.body as { amount_cents?: number };
    const amount = Number(body?.amount_cents);
    if (!Number.isInteger(amount) || amount === 0) {
      return reply.code(400).send({ error: 'amount_cents must be a non-zero integer' });
    }
    try {
      // A service receipt needs an open shift like any other document, so it
      // goes through the same gate rather than a bespoke path.
      const gate = await fiscalService.preflight(auth.storeId, auth.staffId);
      if (!gate.on) return notConfigured(reply);
      return await fiscalService.fiscalizeService(gate, {
        amountCents: amount,
        cashierName: auth.displayName,
        ourNumber: `SV-${Date.now()}`,
      });
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося провести службовий чек');
    }
  });

  fastify.get('/fiscal/attention', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    return { documents: await fiscalService.listAttentionDocs(auth.storeId) };
  });

  fastify.post('/fiscal/x-report', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    try {
      const ctx = await shifts.resolveContext(auth.storeId);
      if (!ctx) return notConfigured(reply);
      return await shifts.xReport(ctx, AbortSignal.timeout(SHIFT_TIMEOUT_MS));
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося отримати X-звіт');
    }
  });
}

function notConfigured(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'not_configured',
    message: cashierMessage('not_configured'),
    support_code: 'FS-NOT-CONFIGURED',
  });
}
