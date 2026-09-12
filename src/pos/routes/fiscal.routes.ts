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
import { asFiscalError, cashierMessage, FiscalError, isOfflineGate, supportCode } from '../fiscal/errors.js';
import { leaseCodes } from '../fiscal/offline/lease.js';
import { getLiveSession, listStuckSessions } from '../fiscal/offline/session.js';
import { sessionView } from '../fiscal/offline/status.js';
import * as fiscalService from '../fiscal/fiscal.service.js';
import * as holder from '../fiscal/offline/holder.js';
import { getOfflineStatus } from '../fiscal/offline/status.js';
import { getProvider, hasProvider } from '../fiscal/providers/index.js';
import { refreshRequisites } from '../fiscal/requisites.js';
import * as fiscalSettings from '../fiscal/settings.service.js';
import * as shifts from '../fiscal/shifts.service.js';
import type { FiscalSettingsPatch } from '../fiscal/types.js';
import { errorMessage, readDeviceId } from './_shared.js';

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
  // The offline-session gates are "wait for the replay / fix the limit" —
  // the caller's situation, not the provider's mood.
  const status =
    fiscal.kind === 'not_configured' ||
    fiscal.kind === 'shift_closed' ||
    fiscal.kind === 'register_held' ||
    isOfflineGate(fiscal.kind)
      ? 409
      : 502;
  return reply.code(status).send({
    error: fiscal.kind,
    message: cashierMessage(fiscal.kind),
    detail: fiscal.message,
    support_code: supportCode(fiscal),
    ...(fiscal.kind === 'register_held' ? { holder: holder.holderFromError(fiscal) } : {}),
  });
}

/**
 * The register-holder routes need a device id; a caller without one (web
 * shell) cannot hold or request anything, and saying so is clearer than a
 * 409 from a lock it can never take.
 */
function requireDeviceId(request: Parameters<typeof readDeviceId>[0], reply: FastifyReply) {
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    void reply.code(400).send({
      error: 'device_id_required',
      message: 'Потрібен заголовок X-POS-Device-ID (касовий застосунок)',
    });
  }
  return deviceId;
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

  /**
   * "Перевірити з'єднання" — deliberately does NOT require `enabled: true`.
   *
   * The whole point is to let an owner test credentials before flipping the
   * switch on. It never mutates anything at the provider (`FiscalProvider.probe`
   * is documented as safe to call from a settings screen), so testing ahead of
   * enabling is not a safety concern — the settings screen already blocks
   * `enabled: true` until this or a later probe succeeds anyway.
   */
  fastify.post('/fiscal/test-connection', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;

    const creds = await fiscalSettings.getFiscalCredentials(auth.storeId, {
      requireEnabled: false,
    });
    if (!creds) {
      return reply.code(409).send({
        error: 'not_configured',
        message: 'Оберіть провайдера і збережіть дані доступу перед перевіркою',
        support_code: 'FS-NOT-CONFIGURED',
      });
    }

    try {
      const provider = getProvider(creds.provider);
      const probe = await provider.probe(creds, AbortSignal.timeout(SHIFT_TIMEOUT_MS));
      // «Оновити з ПРРО» on the settings screen is this same button: a
      // successful probe is the cheapest online moment to refresh the
      // requisites. Only for an enabled store — `resolveContext` is null
      // otherwise, and a store that is not fiscalising has nothing to print.
      if (probe.ok) {
        const ctx = await shifts.resolveContext(auth.storeId);
        if (ctx) await refreshRequisites(ctx, AbortSignal.timeout(SHIFT_TIMEOUT_MS), { force: true });
      }
      return probe;
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося перевірити з\'єднання з ПРРО');
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
    // failed request. The offline/holder blocks are DB-only and cheap.
    const deviceId = readDeviceId(request);
    const [status, offline] = await Promise.all([
      shifts.getStatus(auth.storeId, AbortSignal.timeout(SHIFT_TIMEOUT_MS)),
      getOfflineStatus(auth.storeId, deviceId),
    ]);
    return { ...status, ...offline };
  });

  // ── Register holder (TechDocs/POS_FISCAL_OFFLINE.md §3а) ──────────────────
  // Only meaningful while `offline_mode` is on; the routes still answer
  // otherwise (the lock is simply never enforced), so a till can show the
  // holder state before the owner flips the switch.

  fastify.post('/fiscal/register/claim', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = requireDeviceId(request, reply);
    if (!deviceId) return;
    const body = (request.body ?? {}) as { device_name?: unknown };
    try {
      const claim = await holder.claimRegister(auth.storeId, deviceId, body.device_name);
      if (claim.ok) return { holder: claim.holder };
      return reply.code(409).send({
        error: 'register_taken',
        message: cashierMessage('register_held'),
        holder: claim.holder,
      });
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося зайняти касу ПРРО');
    }
  });

  fastify.post('/fiscal/register/release', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = requireDeviceId(request, reply);
    if (!deviceId) return;
    const result = await holder.releaseRegister(auth.storeId, deviceId);
    if (result === 'ok') return { holder: null };
    return reply.code(409).send({
      error: result,
      message:
        result === 'session_open'
          ? 'Триває офлайн-сесія — звільнити касу можна після синхронізації'
          : 'Ця каса зайнята іншим пристроєм',
      holder: await holder.getHolder(auth.storeId),
    });
  });

  fastify.post('/fiscal/register/handover/request', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = requireDeviceId(request, reply);
    if (!deviceId) return;
    const body = (request.body ?? {}) as { device_name?: unknown };
    try {
      const result = await holder.requestHandover(auth.storeId, deviceId, body.device_name);
      if (result.status === 'already_holder') {
        return reply.code(409).send({ error: 'already_holder', holder: result.holder });
      }
      if (result.status === 'claimed') return { status: 'claimed', holder: result.holder };
      return reply.code(202).send({ status: 'requested', holder: result.holder });
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося запросити передачу каси');
    }
  });

  fastify.post('/fiscal/register/handover/confirm', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = requireDeviceId(request, reply);
    if (!deviceId) return;
    const body = (request.body ?? {}) as { outbox_pending?: unknown };
    const pending = Number(body.outbox_pending);
    if (!Number.isInteger(pending) || pending < 0) {
      return reply.code(400).send({ error: 'outbox_pending must be a non-negative integer' });
    }
    const result = await holder.confirmHandover(auth.storeId, deviceId, pending);
    if (result.status === 'ok') return { holder: result.holder };
    return reply.code(409).send({
      error: result.status,
      ...(result.status === 'handover_blocked' ? { reason: result.reason } : {}),
      message:
        result.status === 'handover_blocked'
          ? result.reason === 'outbox_pending'
            ? 'Спершу синхронізуйте чеки, що очікують відправки'
            : 'Триває офлайн-сесія — передати касу можна після синхронізації'
          : result.status === 'no_request'
            ? 'Немає запиту на передачу'
            : 'Ця каса зайнята іншим пристроєм',
      holder: result.holder,
    });
  });

  // Owner only: takes the register away from a holder that cannot confirm.
  fastify.post('/fiscal/register/handover/force', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as { device_id?: unknown; device_name?: unknown };
    const target =
      typeof body.device_id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(body.device_id.trim())
        ? body.device_id.trim()
        : null;
    if (body.device_id !== undefined && body.device_id !== null && !target) {
      return reply.code(400).send({ error: 'device_id must be 1-64 of [A-Za-z0-9-]' });
    }
    try {
      const result = await holder.forceHandover(auth.storeId, {
        deviceId: target,
        name: body.device_name,
      });
      if (result.status === 'no_target') {
        return reply.code(400).send({
          error: 'no_target',
          message: 'Вкажіть пристрій, якому передати касу, або дочекайтесь запиту на передачу',
        });
      }
      return result;
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося примусово передати касу');
    }
  });

  /**
   * The till's reserve of offline codes (фаза 3).
   *
   * Called at the end of every sync, not only when something is wrong: the
   * lease is a cache of rows we own, and `outbox_pending` is how the till
   * tells us whether more of its offline receipts are still on their way —
   * which is what holds the replay back. Refreshing it while online is the
   * whole preparation for going offline.
   */
  fastify.post('/fiscal/offline/lease', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const deviceId = requireDeviceId(request, reply);
    if (!deviceId) return;

    const body = (request.body ?? {}) as { outbox_pending?: unknown };
    const pending = Number(body.outbox_pending);
    if (!Number.isInteger(pending) || pending < 0) {
      return reply.code(400).send({ error: 'outbox_pending must be a non-negative integer' });
    }

    const ctx = await shifts.resolveContext(auth.storeId);
    if (!ctx) return notConfigured(reply);
    if (!ctx.settings.offline_mode || !ctx.provider.offline) {
      // Not an error the cashier caused: the store simply does not sell
      // offline, and the till stops asking until the owner turns it on.
      return reply.code(409).send({
        error: 'offline_off',
        message: 'Офлайн-режим ПРРО вимкнено для цього магазину',
      });
    }

    try {
      return await leaseCodes(ctx, deviceId, { outboxPending: pending });
    } catch (error) {
      return replyFiscalError(reply, error, 'Не вдалося отримати офлайн-коди ПРРО');
    }
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
      // A Z-report sent before the session's receipts are replayed would turn
      // them into "receipts after Z" (POS_FISCAL_OFFLINE.md §6). The auto-close
      // cron already waits; a person must too.
      if (await getLiveSession(ctx.storeId, ctx.registerKey)) {
        throw new FiscalError(
          'Офлайн-чеки ПРРО ще не надіслано — зміну можна закрити після синхронізації',
          'offline_session_open'
        );
      }
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
      const gate = await fiscalService.preflight(
        auth.storeId,
        auth.staffId,
        readDeviceId(request),
        'service'
      );
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
    const [documents, stuck] = await Promise.all([
      fiscalService.listAttentionDocs(auth.storeId),
      listStuckSessions(auth.storeId),
    ]);
    // Parked offline sessions: their documents may still be `pending` (never
    // sent) — the owner settles them with the provider by hand.
    return { documents, sessions: await Promise.all(stuck.map(sessionView)) };
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
