// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/debts.routes.ts — goods given «під запис» (migration 073,
// TechDocs/grocery/G3_DEBTS.md). The server half of the `debts` module.
//
// A core group, like `tables` and `kitchen`: the module that draws these
// screens opts in through `module_remotes`, not `enabled_modules`, so there is
// no `ensureModule` to ask. The gate is per customer instead — nobody may take
// goods on credit until the owner gives them a limit (decision Д2), and only
// the owner can, here.
//
// Who may do what: a cashier gives goods, takes them back from an unpaid line,
// takes the money and reads the statement; the owner also sets the limit,
// writes a debt off and reads the figures.

import type { FastifyInstance, FastifyReply } from 'fastify';
import { ensurePosAuth, ensurePosOwner } from '../core/auth.js';
import { localDateString } from '../core/localDate.js';
import { readStoreClock } from '../core/storeClock.js';
import { CompositeError } from '../composites.service.js';
import { WeighedLineError } from '../weighed.js';
import { ModifierError } from '../modifiers.service.js';
import * as debts from '../debts.service.js';
import * as debtPayment from '../debt-payment.service.js';
import * as fiscalService from '../fiscal/fiscal.service.js';
import { asFiscalError, cashierMessage, supportCode } from '../fiscal/errors.js';
import { holderFromError } from '../fiscal/offline/holder.js';
import { badRange } from './analytics.routes.js';
import { errorMessage, readDeviceId } from './_shared.js';
import { formatUah } from '../core/money.js';

function idOf(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const NOT_FOUND = 'Покупця не знайдено';

/** Map a service error onto its status. Anything else is a real 500. */
function sendError(reply: FastifyReply, error: unknown): unknown {
  if (error instanceof debts.DebtNotFound) return reply.code(404).send({ error: errorMessage(error) });
  if (error instanceof debts.DebtConflict) {
    return reply.code(409).send({ error: errorMessage(error), code: error.code, ...error.detail });
  }
  if (
    error instanceof debts.DebtError ||
    error instanceof ModifierError ||
    error instanceof CompositeError ||
    error instanceof WeighedLineError
  ) {
    return reply.code(400).send({ error: errorMessage(error) });
  }
  throw error;
}

/**
 * A repayment that ПРРО stopped. `preflight` — nothing of the document was
 * written: 503, or 409 when another till holds the register or the store is
 * inside an offline session (a «внесок» never goes offline). `document` — the
 * provider refused it, it was voided and the goods are owed again: 502.
 * Either way the answer carries the debt as it stands, so the screen redraws
 * the truth — and when it was not the first document of the sum (§11 «Крок
 * 2»), the sales of the ones that DID go through and what to hand back.
 */
async function sendFiscalRefusal(
  reply: FastifyReply,
  storeId: number,
  customerId: number,
  refusal: debtPayment.DebtFiscalRefusal
): Promise<unknown> {
  const fiscal = asFiscalError(refusal.detail.cause, 'Немає звʼязку з ПРРО');
  const statement = await debts.getStatement(storeId, customerId);
  const { paidSaleIds, notTakenCents, part } = refusal.detail;
  const common = {
    code: fiscal.kind,
    message: cashierMessage(fiscal.kind),
    support_code: supportCode(fiscal),
    credit: statement.credit,
    open_lines: statement.open_lines,
    part,
    sale_ids: paidSaleIds,
    not_taken_cents: notTakenCents,
  };
  // After an earlier document went through, the sentence says so: the money
  // for it stays, the rest goes back.
  const tail =
    paidSaleIds.length > 0
      ? ` Попередні чеки пройшли; решту поверніть покупцеві — ${formatUah(notTakenCents)}.`
      : '';
  if (refusal.detail.stage === 'document') {
    const undone = part === 'prepayment' ? 'Внесок скасовано, сума знову в борг.' : 'Чек погашення скасовано, товари знову в борг.';
    return reply.code(502).send({
      error: `${cashierMessage(fiscal.kind)}. ${undone}${tail}`,
      ...common,
      sale_id: refusal.detail.saleId,
      sale_voided: refusal.detail.voided,
      sale_kept: !refusal.detail.voided,
    });
  }
  const error = tail ? `${cashierMessage(fiscal.kind)}.${tail}` : cashierMessage(fiscal.kind);
  if (fiscal.kind === 'register_held') {
    return reply.code(409).send({ error, ...common, holder: holderFromError(fiscal) });
  }
  if (fiscal.kind === 'offline_session_open') return reply.code(409).send({ error, ...common });
  return reply.code(503).send({ error, ...common });
}

export function registerDebtsRoutes(fastify: FastifyInstance): void {
  // Who owes the shop. `?all=1` adds customers with a limit and no debt.
  fastify.get('/debts', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const query = request.query as { all?: string };
    return { debtors: await debts.listDebtors(auth.storeId, { all: query.all === '1' }) };
  });

  // The owner's figures for a window of the store's own days.
  fastify.get('/debts/summary', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const q = request.query as { from?: string; to?: string };
    const bad = badRange(q);
    if (bad) return reply.code(400).send({ error: bad });
    const clock = await readStoreClock(auth.storeId);
    const today = localDateString(clock.timezone);
    const from = q.from ?? q.to ?? today;
    const to = q.to ?? from;
    if (from > to) return reply.code(400).send({ error: 'from must be <= to' });
    return debts.debtSummary(auth.storeId, { from, to, timezone: clock.timezone });
  });

  fastify.get('/debts/customers/:id', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    try {
      return await debts.getStatement(auth.storeId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // What the till's cart strip shows: owed, the limit, how much more.
  fastify.get('/debts/customers/:id/balance', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    try {
      return await debts.getCredit(auth.storeId, id);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.patch('/debts/customers/:id/credit', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    try {
      return await debts.setCredit(auth.storeId, auth.staffId, id, (request.body ?? {}) as Record<string, unknown>);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/debts/issue', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const customerId = Number(body.customer_id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
      return reply.code(400).send({ error: 'Під запис записують на покупця — оберіть його' });
    }
    try {
      const result = await debts.issueOnCredit({
        storeId: auth.storeId,
        staffId: auth.staffId,
        customerId,
        items: body.items,
        cart_discount: body.cart_discount,
        client_uuid: body.client_uuid,
        note: body.note,
        offline_at: body.offline_at,
      });
      return reply.code(result.replay ? 200 : 201).send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/debts/customers/:id/return', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      return await debts.returnFromDebt({
        storeId: auth.storeId,
        staffId: auth.staffId,
        customerId: id,
        lines: body.lines,
        client_uuid: body.client_uuid,
        reason: body.reason,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/debts/customers/:id/writeoff', async (request, reply) => {
    const auth = await ensurePosOwner(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      return await debts.writeOffDebt({
        storeId: auth.storeId,
        staffId: auth.staffId,
        customerId: id,
        line_ids: body.line_ids,
        reason: body.reason,
        client_uuid: body.client_uuid,
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  fastify.post('/debts/customers/:id/pay', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const id = idOf((request.params as { id: string }).id);
    if (id == null) return reply.code(404).send({ error: NOT_FOUND });
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      return await debtPayment.payDebt({
        storeId: auth.storeId,
        staffId: auth.staffId,
        customerId: id,
        line_ids: body.line_ids,
        part: body.part,
        payments: (Array.isArray(body.payments) ? body.payments : []) as never[],
        client_uuid: body.client_uuid,
        cash_rounding: body.cash_rounding,
        fiscal: {
          gateFor: (op) => fiscalService.preflight(auth.storeId, auth.staffId, readDeviceId(request), op),
          capability: () => fiscalService.fiscalCapability(auth.storeId),
        },
      });
    } catch (error) {
      if (error instanceof debtPayment.DebtFiscalRefusal) {
        return sendFiscalRefusal(reply, auth.storeId, id, error);
      }
      if (error instanceof debts.DebtError) return sendError(reply, error);
      // The sale's own refusals — a payment short of the sum, an unknown
      // method — are the till's to fix, as at the checkout.
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });
}
