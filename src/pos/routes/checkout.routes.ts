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
import type {
  CompleteSaleItemInput,
  CompleteSalePaymentInput,
  PaymentMethod,
  RefundReasonCode,
} from '../types.js';
import { ensurePosAuth } from '../core/auth.js';
import * as salesService from '../sales.service.js';
import * as parkedCarts from '../parked-carts.service.js';
import * as preorders from '../preorders.service.js';
import { PreorderClosedError } from '../preorders.service.js';
import * as fiscalService from '../fiscal/fiscal.service.js';
import { getSaleDocument } from '../fiscal/ledger.js';
import { asFiscalError, cashierMessage, supportCode } from '../fiscal/errors.js';
import { holderFromError } from '../fiscal/offline/holder.js';
import { logger } from '../../logger.js';
import { errorMessage, readDeviceId } from './_shared.js';

/** `getSale`'s row, non-null. `completeSale` / `refundSale` return the same shape. */
type SaleDetail = NonNullable<Awaited<ReturnType<typeof salesService.getSale>>>;

/**
 * Record which sale a parked cart became.
 *
 * Deliberately swallows its own failure: the sale exists and is about to be
 * fiscalised, and losing a receipt because a bookkeeping UPDATE did not land
 * would be a far worse trade than an unannotated parked cart.
 */
/** Record which sale a pre-order became. Same trade as `noteParkedCart`. */
async function notePreorder(
  storeId: number,
  preorderId: number | null | undefined,
  saleId: number
): Promise<void> {
  if (!preorderId) return;
  try {
    await preorders.markSold({ storeId, preorderId: Number(preorderId), saleId });
  } catch (error) {
    logger.warn('Could not link sale to its pre-order', {
      storeId,
      preorderId,
      saleId,
      error: errorMessage(error),
    });
  }
}

async function noteParkedCart(
  storeId: number,
  cartId: number | null | undefined,
  saleId: number
): Promise<void> {
  if (!cartId) return;
  try {
    await parkedCarts.markSold({ storeId, cartId: Number(cartId), saleId });
  } catch (error) {
    logger.warn('Could not link sale to its parked cart', {
      storeId,
      cartId,
      saleId,
      error: errorMessage(error),
    });
  }
}

export function registerCheckoutRoutes(fastify: FastifyInstance): void {
  fastify.post('/sales/complete', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;

    const body = request.body as {
      items: CompleteSaleItemInput[];
      payments: { method: PaymentMethod; amount_cents: number; provider_ref?: string | null }[];
      note?: string;
      cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
      customer_id?: number | null;
      client_uuid?: string | null;
      /** Set by the desktop till for a sale it stamped itself while offline (фаза 3). */
      fiscal_offline?: unknown;
      /**
       * The parked cart this sale came out of, if any. Bookkeeping only — the
       * cart stopped holding its stems when it was picked up, so nothing here
       * depends on it arriving (TechDocs/POS_FLORIST_BENCH.md §9).
       */
      parked_cart_id?: number | null;
      /**
       * A pre-order being handed over (фаза B6). Its lines and their promised
       * prices come from the server's own table; the till names the id.
       */
      preorder_id?: number | null;
      /**
       * The desktop till replaying a sale it rang while offline (`sync.ts`,
       * café phase К3). The sale is stamped `served` instead of landing on the
       * kitchen board, and the day's stop-list does not refuse it. Only ever
       * `true` from the outbox; the web shell never sends it.
       */
      offline_replay?: unknown;
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

    // A sale the till rang while it had no network: it carries its own
    // tax-office stamp, so the question is not whether it may happen but
    // whether we can file what already did. Everything after this point —
    // pre-flight, refusal semantics, what a failure does to the sale — is
    // different enough to live in its own path.
    if (body.fiscal_offline !== undefined && body.fiscal_offline !== null) {
      return completeDeviceStampedSale(request, reply, auth, body, clientUuid);
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
        preorder_id: body.preorder_id,
        offline_replay: body.offline_replay === true,
      });
    } catch (error) {
      logger.error('Complete sale failed', { error: errorMessage(error) });
      // Another till handed this order over first. A conflict, not a bad ask —
      // and the sale rolled back with the claim, so nothing needs undoing.
      if (error instanceof PreorderClosedError) {
        return reply.code(409).send({ error: errorMessage(error) });
      }
      return reply.code(400).send({ error: errorMessage(error) });
    }
    if (!sale) {
      // `completeSale` re-reads the row it just inserted; a null here means the
      // sale vanished between INSERT and SELECT, which is not the caller's fault.
      logger.error('Complete sale returned no row', { storeId: auth.storeId });
      return reply.code(500).send({ error: 'sale_not_readable' });
    }

    if (!gate.on) {
      await noteParkedCart(auth.storeId, body.parked_cart_id, sale.id);
      await notePreorder(auth.storeId, body.preorder_id, sale.id);
      return reply.code(201).send(sale);
    }

    await noteParkedCart(auth.storeId, body.parked_cart_id, sale.id);
    await notePreorder(auth.storeId, body.preorder_id, sale.id);

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

  /**
   * An exchange: goods back against receipt `:id`, new goods out, one
   * transaction (TechDocs/POS_CLOTHING.md R1).
   *
   * Under ПРРО it is TWO documents — the return receipt and the sale receipt,
   * each for its full amount — registered in that order after the commit. One
   * pre-flight, with the refund's op: it is the stricter of the two (it never
   * opens an offline session and refuses inside one), and the sale half must
   * not be able to go where the return half cannot. The return receipt failing
   * keeps the 200 the refund route has (the refund happened; the cron retries);
   * the sale receipt failing has the sale's own three outcomes, with the refund
   * named in the body so the till can say «повернення оформлено, пробийте товар
   * окремим чеком» rather than start the exchange again.
   */
  fastify.post('/sales/:id/exchange', async (request, reply) => {
    const auth = await ensurePosAuth(request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const saleId = Number(id);
    const body = (request.body ?? {}) as {
      refund?: {
        items?: { sale_item_id: number; quantity: number }[];
        method?: PaymentMethod | null;
        reason_code?: RefundReasonCode | null;
        reason?: string | null;
        buyer_name?: string | null;
        buyer_document?: string | null;
        client_uuid?: string | null;
      };
      sale?: {
        items?: CompleteSaleItemInput[];
        payments?: CompleteSalePaymentInput[];
        cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
        customer_id?: number | null;
        note?: string;
        client_uuid?: string | null;
      };
    };
    const refundUuid = String(body.refund?.client_uuid ?? '').trim().toLowerCase();
    const saleUuid = String(body.sale?.client_uuid ?? '').trim().toLowerCase();
    if (!refundUuid || !saleUuid) {
      return reply.code(400).send({
        error: 'client_uuid обовʼязковий для обміну — окремий для повернення і для продажу',
      });
    }

    // A replay (the till timed out and asked again): answer from what exists,
    // with no provider call. Both halves commit together, so seeing exactly
    // one of them means a different request reused one of the keys.
    const existingRefund = await salesService.getRefundRowByClientUuid(auth.storeId, refundUuid);
    const existingSale = await salesService.getSaleByClientUuid(auth.storeId, saleUuid);
    if (existingRefund && existingSale) {
      if (existingSale.status === 'voided') {
        const original = await salesService.getSale(auth.storeId, existingRefund.sale_id);
        return reply.code(409).send({
          error: 'exchange_sale_voided',
          message:
            'Новий чек обміну скасовано через відмову ПРРО — повернення вже оформлено, пробийте товар окремим чеком',
          refund_id: existingRefund.id,
          refund: original,
        });
      }
      const view = await exchangeView(auth.storeId, existingRefund.sale_id, existingRefund.id, existingSale.id);
      if (!view) return reply.code(404).send({ error: 'Sale not found' });
      return reply.code(200).send(view);
    }
    if (existingRefund || existingSale) {
      return reply.code(409).send({
        error: 'exchange_inconsistent',
        message: 'Один із client_uuid уже використано іншою операцією — почніть обмін заново',
      });
    }

    let gate: fiscalService.FiscalGate;
    try {
      gate = await fiscalService.preflight(auth.storeId, auth.staffId, readDeviceId(request), 'refund');
    } catch (error) {
      return preflightRefusal(reply, error);
    }

    let ids: { refundId: number; newSaleId: number };
    try {
      ids = await salesService.exchangeSale({
        storeId: auth.storeId,
        staffId: auth.staffId,
        saleId,
        refund: {
          items: body.refund?.items ?? [],
          method: body.refund?.method ?? null,
          reason_code: body.refund?.reason_code ?? null,
          reason: body.refund?.reason ?? null,
          buyer_name: body.refund?.buyer_name ?? null,
          buyer_document: body.refund?.buyer_document ?? null,
          client_uuid: refundUuid,
        },
        sale: {
          items: body.sale?.items ?? [],
          payments: body.sale?.payments ?? [],
          cart_discount: body.sale?.cart_discount ?? null,
          ...(body.sale && 'customer_id' in body.sale ? { customer_id: body.sale.customer_id } : {}),
          note: body.sale?.note,
          client_uuid: saleUuid,
        },
        fiscal_status: gate.on ? 'pending' : 'none',
      });
    } catch (error) {
      const message = errorMessage(error);
      // Two tills (or one impatient one) sent the same exchange at once: the
      // loser waited on the sale's row lock and then found the receipt already
      // refunded (or died on the client_uuid index) — either way the winner's
      // result, found by this request's own keys, is this request's answer.
      const refundRow = await salesService.getRefundRowByClientUuid(auth.storeId, refundUuid);
      const saleRow = await salesService.getSaleByClientUuid(auth.storeId, saleUuid);
      if (refundRow && saleRow) {
        const view = await exchangeView(auth.storeId, refundRow.sale_id, refundRow.id, saleRow.id);
        if (view) return reply.code(200).send(view);
      }
      if (message === 'Sale not found') return reply.code(404).send({ error: message });
      logger.warn('Exchange refused', { storeId: auth.storeId, saleId, error: message });
      return reply.code(400).send({ error: message });
    }

    if (!gate.on) {
      const view = await exchangeView(auth.storeId, saleId, ids.refundId, ids.newSaleId);
      if (!view) return reply.code(500).send({ error: 'sale_not_readable' });
      return reply.code(201).send(view);
    }

    const original = await salesService.getSale(auth.storeId, saleId);
    const fresh = await salesService.getSale(auth.storeId, ids.newSaleId);
    const refundRow = original?.refunds.find((r) => r.id === ids.refundId);
    if (!original || !fresh || !refundRow) {
      logger.error('Exchange committed but not readable', { storeId: auth.storeId, saleId, ids });
      return reply.code(500).send({ error: 'sale_not_readable' });
    }

    // 1. The return receipt. Same stance as the refund route: it happened,
    //    money and stock moved, so a failure is a 200-grade outcome the cron
    //    retries — never a reason to undo the sale half that follows.
    let refundFiscal: fiscalService.FiscalView | null;
    try {
      refundFiscal = await fiscalService.fiscalizeRefund(
        gate,
        {
          id: refundRow.id,
          client_uuid: refundRow.client_uuid,
          refund_number: refundRow.refund_number ?? '',
          staff_name: refundRow.staff_name,
          method: refundRow.method,
          total_cents: refundRow.total_cents,
          reason: refundRow.reason,
          lines: refundRow.items.map((line) => ({
            sale_item_id: line.sale_item_id,
            quantity: line.quantity,
            amount_cents: line.line_total_cents,
          })),
        },
        original
      );
    } catch (error) {
      const failed = error instanceof fiscalService.FiscalDocumentFailed;
      if (!failed) await salesService.markRefundFiscalFailed(auth.storeId, refundRow.id);
      logger.error('Exchange: refund fiscalisation failed', {
        storeId: auth.storeId,
        saleId,
        refundId: refundRow.id,
        hadLedgerRow: failed,
        error: errorMessage(error),
      });
      refundFiscal = failed
        ? fiscalService.failureView(error)
        : {
            status: 'failed' as const,
            mode: 'online' as const,
            fiscal_code: null,
            fiscal_date: null,
            control_number: null,
            tax_url: null,
            qr_payload: null,
            receipt_text: null,
            error_code: 'unknown',
            message: errorMessage(error),
          };
    }

    // 2. The sale receipt, on a fresh budget — the gate's signal was cut for
    //    one document and has just paid for the first.
    try {
      const fiscal = await fiscalService.fiscalizeSale(fiscalService.renewGate(gate), {
        ...fresh,
        customer_phone: fresh.customer_phone,
      });
      const view = await exchangeView(auth.storeId, saleId, ids.refundId, ids.newSaleId, {
        refund: refundFiscal,
        sale: fiscal,
      });
      return reply.code(201).send(view);
    } catch (error) {
      return finishFailedSale(reply, auth.storeId, auth.staffId, fresh, error, {
        refund_id: refundRow.id,
        refund: { ...original, refund_id: refundRow.id, refund_fiscal: refundFiscal },
        difference_cents: fresh.total_cents - refundRow.total_cents,
      });
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
      reason_code?: RefundReasonCode | null;
      buyer_name?: string | null;
      buyer_document?: string | null;
    };

    // Same gate as a sale: most refund failures are caught here, before money
    // and stock have moved.
    let gate: fiscalService.FiscalGate;
    try {
      gate = await fiscalService.preflight(auth.storeId, auth.staffId, readDeviceId(request), 'refund');
    } catch (error) {
      return preflightRefusal(reply, error);
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
        reason_code: body.reason_code ?? null,
        buyer_name: body.buyer_name ?? null,
        buyer_document: body.buyer_document ?? null,
      });
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }
    if (!refund) return reply.code(404).send({ error: 'Sale not found' });

    if (!gate.on) return refund;

    const sale = refund;
    // The refund THIS request made — found by its idempotency key, never
    // assumed to be the last one: a replay after a timeout may land after a
    // second, unrelated refund of the same receipt, and fiscalising that one
    // with this request's lines would register the wrong document.
    const lastRefund =
      (body.client_uuid && refund.refunds.find((r) => r.client_uuid === body.client_uuid)) ||
      refund.refunds[refund.refunds.length - 1];
    // Already registered on an earlier attempt: answer from the ledger, no
    // second return receipt.
    if (lastRefund.fiscal_status === 'done' && lastRefund.fiscal) {
      return { ...refund, refund_fiscal: lastRefund.fiscal };
    }
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
          lines: lastRefund.items.map((line) => ({
            sale_item_id: line.sale_item_id,
            quantity: line.quantity,
            amount_cents: line.line_total_cents,
          })),
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
          mode: 'online' as const,
          fiscal_code: null,
          fiscal_date: null,
          control_number: null,
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

/**
 * A pre-flight refusal, as the refund and exchange routes answer it. Not "the
 * provider is down" when another till owns the register: 409 so the till shows
 * the handover screen instead of the retry one.
 */
function preflightRefusal(reply: FastifyReply, error: unknown) {
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

/** The exchange route's answer: the original receipt with its new refund, the new receipt, the difference. */
async function exchangeView(
  storeId: number,
  saleId: number,
  refundId: number,
  newSaleId: number,
  fiscal: { refund?: fiscalService.FiscalView | null; sale?: fiscalService.FiscalView | null } = {}
) {
  const original = await salesService.getSale(storeId, saleId);
  const fresh = await salesService.getSale(storeId, newSaleId);
  if (!original || !fresh) return null;
  const refundRow = original.refunds.find((r) => r.id === refundId) ?? null;
  return {
    refund: {
      ...original,
      refund_id: refundId,
      // The REFUND's document, under its own key — `fiscal` on this object is
      // the original sale's receipt (see the refund route).
      refund_fiscal: fiscal.refund ?? refundRow?.fiscal ?? null,
    },
    sale: fiscal.sale ? { ...fresh, fiscal: fiscal.sale } : fresh,
    // > 0: the customer pays the difference; < 0: the shop returns it; 0: even.
    difference_cents: fresh.total_cents - (refundRow?.total_cents ?? 0),
  };
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
/** The body a till sends for a sale it stamped from its own lease. */
interface DeviceStampBody {
  client_session_id?: unknown;
  seq?: unknown;
  fiscal_code?: unknown;
  fiscal_date?: unknown;
}

/**
 * Read the till's stamp, or say what is wrong with it.
 *
 * The date is taken as given: it is what the customer's receipt says, printed
 * by a clock we cannot check and must not overrule (TechDocs/POS_FISCAL_OFFLINE.md,
 * план фазы 3, решение 7). Everything else has a shape we can insist on.
 */
function readDeviceStamp(raw: unknown): fiscalService.DeviceStampInput | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return 'fiscal_offline must be an object';
  }
  const body = raw as DeviceStampBody;
  const clientSessionId = typeof body.client_session_id === 'string' ? body.client_session_id.trim() : '';
  if (!/^[A-Za-z0-9-]{1,64}$/.test(clientSessionId)) {
    return 'fiscal_offline.client_session_id must be 1-64 of [A-Za-z0-9-]';
  }
  const fiscalCode = typeof body.fiscal_code === 'string' ? body.fiscal_code.trim() : '';
  if (!fiscalCode || fiscalCode.length > 64) {
    return 'fiscal_offline.fiscal_code must be 1-64 characters';
  }
  const seq = Number(body.seq);
  if (!Number.isInteger(seq) || seq < 1) return 'fiscal_offline.seq must be a positive integer';
  const fiscalDate = new Date(String(body.fiscal_date));
  if (Number.isNaN(fiscalDate.getTime())) return 'fiscal_offline.fiscal_date must be a date';
  return { clientSessionId, fiscalCode, fiscalDate, seq };
}

/**
 * Kinds the till must stop retrying on.
 *
 * Not `isTerminal`: that counts the offline-session gates as terminal because
 * they end the *request*, while here `replaying` means "we are sending the
 * chain right now, come back in a minute" — the one answer that must keep the
 * receipt in the queue.
 */
const STAMP_REFUSED: ReadonlySet<string> = new Set([
  'not_configured',
  'register_held',
  'offline_code_invalid',
  'rejected',
  'auth_rejected',
]);

/**
 * File a sale the till stamped offline.
 *
 * Two rules make this different from an ordinary checkout, and both come from
 * the same fact — the receipt is printed and the customer has gone:
 *
 *   * a refusal never voids the sale and never hands stock back. 409 tells the
 *     till to stop retrying and keep the receipt in its «непроведені» list;
 *   * a 503 means "not now" and the till tries the same receipt again, which is
 *     safe because `client_uuid` resolves a sale we already took.
 */
async function completeDeviceStampedSale(
  request: Parameters<typeof readDeviceId>[0],
  reply: FastifyReply,
  auth: { storeId: number; staffId: number },
  body: {
    items: CompleteSaleItemInput[];
    payments: { method: PaymentMethod; amount_cents: number; provider_ref?: string | null }[];
    note?: string;
    cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
    customer_id?: number | null;
    fiscal_offline?: unknown;
    offline_replay?: unknown;
  },
  clientUuid: string | null
) {
  const deviceId = readDeviceId(request);
  if (!deviceId) {
    // The web shell can never have stamped anything: it has no lease, no
    // device id and no offline mode.
    return reply.code(400).send({
      error: 'device_id_required',
      message: 'Офлайн-чек може надіслати лише касовий застосунок',
    });
  }
  const stamp = readDeviceStamp(body.fiscal_offline);
  if (typeof stamp === 'string') return reply.code(400).send({ error: stamp });

  let gate: fiscalService.FiscalGate;
  try {
    gate = await fiscalService.preflightDeviceStamp(auth.storeId, auth.staffId, deviceId, stamp);
  } catch (error) {
    return replyStampRefused(reply, error, auth.storeId, null);
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
      fiscal_status: 'pending',
      // A till-stamped receipt was by construction rung with no network: the
      // customer left with it long before this request, whatever the outbox
      // says.
      offline_replay: true,
    });
  } catch (error) {
    logger.error('Complete offline-stamped sale failed', { error: errorMessage(error) });
    return reply.code(400).send({ error: errorMessage(error) });
  }
  if (!sale) {
    logger.error('Complete offline-stamped sale returned no row', { storeId: auth.storeId });
    return reply.code(500).send({ error: 'sale_not_readable' });
  }

  try {
    const fiscal = await fiscalService.fiscalizeSaleDeviceStamp(gate, sale, deviceId, stamp);
    return reply.code(201).send({ ...sale, fiscal });
  } catch (error) {
    return replyStampRefused(reply, error, auth.storeId, sale.id);
  }
}

function replyStampRefused(
  reply: FastifyReply,
  error: unknown,
  storeId: number,
  saleId: number | null
) {
  const raw = error instanceof fiscalService.FiscalDocumentFailed ? error.cause : error;
  const fiscal = asFiscalError(raw, 'Не вдалося прийняти офлайн-чек каси');
  logger.warn('Offline-stamped sale refused', {
    storeId,
    saleId,
    kind: fiscal.kind,
    message: fiscal.message,
  });

  if (fiscal.kind === 'register_held') {
    return reply.code(409).send({
      error: 'register_held',
      code: fiscal.providerCode,
      message: cashierMessage(fiscal.kind),
      holder: holderFromError(fiscal),
      support_code: supportCode(fiscal),
      sale_id: saleId,
    });
  }
  if (STAMP_REFUSED.has(fiscal.kind)) {
    return reply.code(409).send({
      error: 'offline_stamp_rejected',
      code: fiscal.kind,
      message: cashierMessage(fiscal.kind),
      support_code: supportCode(fiscal),
      sale_id: saleId,
    });
  }
  return reply.code(503).send({
    error: 'fiscal_unavailable',
    code: fiscal.kind,
    message: cashierMessage(fiscal.kind),
    support_code: supportCode(fiscal),
  });
}

async function finishFailedSale(
  reply: FastifyReply,
  storeId: number,
  staffId: number,
  sale: SaleDetail,
  error: unknown,
  /** More for the body — an exchange adds the refund that stands regardless. */
  extra: Record<string, unknown> = {}
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
      ...extra,
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
    ...extra,
  });
}
