// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/routes/checkout.routes.ts
//
// Selling, refunding, cancelling — and, when the store fiscalises, the ПРРО
// orchestration around each. The orchestration lives here rather than in
// `sales.service.ts` deliberately: that module is a pure DB function with no
// network calls, driven directly by several test files, and this route is the
// single choke point the offline outbox replays through.
//
// See TechDocs/POS_FISCAL_PRRO.md §8 for the failure matrix.

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PaymentMethod } from '../types.js';
import { ensurePosAuth } from '../core/auth.js';
import * as salesService from '../sales.service.js';
import * as fiscalService from '../fiscal/fiscal.service.js';
import { getSaleDocument } from '../fiscal/ledger.js';
import { asFiscalError, cashierMessage, supportCode } from '../fiscal/errors.js';
import { holderFromError } from '../fiscal/offline/holder.js';
import { logger } from '../../logger.js';
import { errorMessage, readDeviceId } from './_shared.js';

/** `getSale`'s row, non-null. `completeSale` / `refundSale` return the same shape. */
type SaleDetail = NonNullable<Awaited<ReturnType<typeof salesService.getSale>>>;

export function registerCheckoutRoutes(fastify: FastifyInstance): void {
  fastify.post('/sales/complete', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;

    const body = request.body as {
      items: { variant_id: number; quantity: number }[];
      payments: { method: PaymentMethod; amount_cents: number; provider_ref?: string | null }[];
      note?: string;
      cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
      customer_id?: number | null;
      client_uuid?: string | null;
    };

    const headerKey = request.headers['idempotency-key'];
    const headerUuid =
      typeof headerKey === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(headerKey)
        ? headerKey
        : null;
    const clientUuid = body.client_uuid?.trim() || headerUuid;

    if (clientUuid) {
      const existing = await salesService.getSaleByClientUuid(auth.storeId, clientUuid);
      if (existing) {
        // A voided sale must NOT come back as a 200 success: a failed
        // fiscalisation voids the sale, and the outbox replays the same
        // client_uuid, which would render a success screen for a corpse.
        //
        // Not fixed by filtering voided rows out of `getSaleByClientUuid`:
        // `idx_pos_sales_store_client_uuid` is UNIQUE, so the replay would loop
        // on 23505 forever and the 23505 recovery would hand back the same row.
        if (existing.status === 'voided') {
          return reply.code(409).send({
            error: 'sale_voided_not_fiscalised',
            message: 'Цей чек скасовано — почніть новий',
            sale_id: existing.id,
          });
        }
        return reply.code(200).send(existing);
      }
    }

    // Pre-flight BEFORE anything is written: no sale row, no burned receipt
    // number, no stock movement. This is the whole "block the sale when ПРРО is
    // unreachable" stance.
    let gate: fiscalService.FiscalGate;
    try {
      gate = await fiscalService.preflight(auth.storeId, auth.staffId, readDeviceId(request));
    } catch (error) {
      const fiscal = asFiscalError(error, 'Немає звʼязку з ПРРО');
      logger.warn('Fiscal pre-flight refused a sale', {
        storeId: auth.storeId,
        kind: fiscal.kind,
        message: fiscal.message,
      });
      // Not "the provider is down" — another till owns the register. 409 so
      // the till shows the handover screen instead of the retry one.
      if (fiscal.kind === 'register_held') {
        return reply.code(409).send({
          error: 'register_held',
          code: fiscal.providerCode,
          message: cashierMessage(fiscal.kind),
          holder: holderFromError(fiscal),
          support_code: supportCode(fiscal),
        });
      }
      return reply.code(503).send({
        error: 'fiscal_unavailable',
        code: fiscal.kind,
        message: cashierMessage(fiscal.kind),
        support_code: supportCode(fiscal),
      });
    }

    let sale: SaleDetail | null;
    try {
      sale = await salesService.completeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        items: body.items,
        payments: body.payments,
        note: body.note,
        cart_discount: body.cart_discount,
        customer_id: body.customer_id,
        client_uuid: clientUuid,
        fiscal_status: gate.on ? 'pending' : 'none',
      });
    } catch (error) {
      logger.error('Complete sale failed', { error: errorMessage(error) });
      return reply.code(400).send({ error: errorMessage(error) });
    }
    if (!sale) {
      // `completeSale` re-reads the row it just inserted; a null here means the
      // sale vanished between INSERT and SELECT, which is not the caller's fault.
      logger.error('Complete sale returned no row', { storeId: auth.storeId });
      return reply.code(500).send({ error: 'sale_not_readable' });
    }

    if (!gate.on) return reply.code(201).send(sale);

    try {
      const fiscal = await fiscalService.fiscalizeSale(gate, {
        ...sale,
        customer_phone: sale.customer_phone,
      });
      return reply.code(201).send({ ...sale, fiscal });
    } catch (error) {
      return finishFailedSale(reply, auth.storeId, auth.staffId, sale, error);
    }
  });

  fastify.post('/sales/:id/void', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const saleId = Number(id);

    // Under ПРРО a receipt the tax service has seen can no longer be cancelled,
    // only refunded. Without this gate a cashier could cancel a fiscalised sale
    // locally while the tax record keeps the receipt.
    const doc = await getSaleDocument(saleId);
    if (doc?.status === 'done') {
      return reply.code(409).send({
        error: 'sale_fiscalised',
        message: 'Чек уже зареєстровано в ПРРО — оформіть повернення',
        fiscal_code: doc.fiscal_code,
      });
    }

    try {
      return await salesService.voidSale({ storeId: auth.storeId, saleId, staffId: auth.staffId });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
  });

  fastify.post('/sales/:id/refunds', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const saleId = Number(id);
    const body = request.body as {
      items: { sale_item_id: number; quantity: number }[];
      reason?: string;
      method?: 'cash' | 'card' | 'qr' | null;
      client_uuid?: string | null;
    };

    // Same gate as a sale: most refund failures are caught here, before money
    // and stock have moved.
    let gate: fiscalService.FiscalGate;
    try {
      gate = await fiscalService.preflight(auth.storeId, auth.staffId, readDeviceId(request));
    } catch (error) {
      const fiscal = asFiscalError(error, 'Немає звʼязку з ПРРО');
      if (fiscal.kind === 'register_held') {
        return reply.code(409).send({
          error: 'register_held',
          code: fiscal.providerCode,
          message: cashierMessage(fiscal.kind),
          holder: holderFromError(fiscal),
          support_code: supportCode(fiscal),
        });
      }
      return reply.code(503).send({
        error: 'fiscal_unavailable',
        code: fiscal.kind,
        message: cashierMessage(fiscal.kind),
        support_code: supportCode(fiscal),
      });
    }

    let refund: SaleDetail | null;
    try {
      refund = await salesService.refundSale({
        storeId: auth.storeId,
        saleId,
        staffId: auth.staffId,
        items: body.items,
        reason: body.reason,
        method: body.method ?? null,
        client_uuid: body.client_uuid ?? null,
        fiscal_status: gate.on ? 'pending' : 'none',
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
    if (!refund) return reply.code(404).send({ error: 'Sale not found' });

    if (!gate.on) return refund;

    const sale = refund;
    const lastRefund = refund.refunds[refund.refunds.length - 1];
    try {
      const fiscal = await fiscalService.fiscalizeRefund(
        gate,
        {
          id: lastRefund.id,
          client_uuid: lastRefund.client_uuid,
          refund_number: lastRefund.refund_number ?? '',
          staff_name: lastRefund.staff_name,
          method: lastRefund.method,
          total_cents: lastRefund.total_cents,
          reason: lastRefund.reason,
          lines: refundLinesOf(body.items, sale),
        },
        sale
      );
      // `refund_fiscal`, not `fiscal`: the body is `getSale`'s output, which
      // already carries the SALE's fiscal document under `fiscal`. Reusing that
      // key would overwrite it with a different document that even has
      // different field names (`message` here vs `error_message` there) — and
      // the client stores the whole detail in its offline mirror, so a refund's
      // fiscal code would permanently masquerade as the sale's.
      return { ...refund, refund_fiscal: fiscal };
    } catch (error) {
      // Deliberately 200, not an error. The refund really did happen — money
      // and stock have moved — and an error screen would make the cashier do it
      // again, refunding the customer twice. The retry cron picks it up.
      const failed = error instanceof fiscalService.FiscalDocumentFailed;
      const fiscal = failed ? fiscalService.failureView(error) : null;

      // A failure BEFORE the ledger row was written (the sale was never
      // fiscalised, so there is nothing to return against) leaves the refund at
      // `fiscal_status='pending'` with no ledger row at all — invisible to the
      // retry cron, to `listAttentionDocs`, and to the orphan-adoption pass,
      // which scans `pos_sales` only. Project it as failed so it is at least
      // visible on the receipt.
      if (!failed) {
        await salesService.markRefundFiscalFailed(auth.storeId, lastRefund.id);
      }

      logger.error('Refund fiscalisation failed', {
        storeId: auth.storeId,
        saleId,
        refundId: lastRefund.id,
        hadLedgerRow: failed,
        error: errorMessage(error),
      });
      return {
        ...refund,
        refund_fiscal: fiscal ?? {
          status: 'failed' as const,
          fiscal_code: null,
          fiscal_date: null,
          tax_url: null,
          qr_payload: null,
          receipt_text: null,
          error_code: 'unknown',
          message: errorMessage(error),
        },
      };
    }
  });

  // ── Analytics & store ─────────────────────────────────
}

/** Per-line refund amounts, read back from what the refund actually recorded. */
function refundLinesOf(
  requested: { sale_item_id: number; quantity: number }[],
  sale: SaleDetail
): { sale_item_id: number; quantity: number; amount_cents: number }[] {
  const itemsById = new Map(sale.items.map((item) => [item.id, item]));
  return requested.map((line) => {
    const item = itemsById.get(line.sale_item_id);
    const quantity = item?.quantity ?? line.quantity;
    const lineTotal = item?.line_total_cents ?? 0;
    const before = (item?.refunded_quantity ?? line.quantity) - line.quantity;
    return {
      sale_item_id: line.sale_item_id,
      quantity: line.quantity,
      // Same cumulative rule the refund itself used, so the fiscal document
      // states exactly what was charged back.
      amount_cents: salesService.refundLineAmount(lineTotal, quantity, before, line.quantity),
    };
  });
}

/**
 * A sale committed but not fiscalised.
 *
 * The sale is voided **only** when the document cannot possibly exist at the
 * provider. A timeout says nothing about whether ПРРО committed the receipt;
 * voiding there returns stock while the tax service may hold a valid receipt,
 * and the cashier's re-ring uses a fresh client_uuid — so the duplicate
 * machinery that exists to prevent exactly this is bypassed, and the sale is
 * fiscalised twice. Ambiguous failures stay committed and `failed`, where the
 * shift-bounded retry can resolve them with the SAME request id.
 */
async function finishFailedSale(
  reply: FastifyReply,
  storeId: number,
  staffId: number,
  sale: SaleDetail,
  error: unknown
) {
  if (!(error instanceof fiscalService.FiscalDocumentFailed)) {
    logger.error('Fiscalisation failed outside the document path', {
      storeId,
      saleId: sale.id,
      error: errorMessage(error),
    });
    return reply.code(502).send({
      error: 'fiscal_failed',
      code: 'unknown',
      message: cashierMessage('unknown'),
      support_code: 'FS-INTERNAL',
      sale_id: sale.id,
      sale_voided: false,
      // Present on every `fiscal_failed` body, so a client can read either key.
      // It is still `sale_voided` that decides — this branch never voids.
      sale_kept: true,
    });
  }

  let voided = false;
  if (!error.mayExist) {
    voided = await fiscalService.abortSale(storeId, sale.id, staffId, error.row);
  }

  logger.error('Sale fiscalisation failed', {
    storeId,
    saleId: sale.id,
    kind: error.cause.kind,
    mayExistAtProvider: error.mayExist,
    voided,
  });

  return reply.code(502).send({
    error: 'fiscal_failed',
    code: error.cause.kind,
    message: cashierMessage(error.cause.kind),
    support_code: supportCode(error.cause),
    sale_id: sale.id,
    sale_voided: voided,
    // False here means the sale stands, un-fiscalised, and will be retried.
    // The till must not tell the customer the purchase did not happen.
    sale_kept: !voided,
  });
}
