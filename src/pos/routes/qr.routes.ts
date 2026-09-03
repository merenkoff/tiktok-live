// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { ensureModule } from '../core/auth.js';
import * as analyticsService from '../analytics.service.js';
import * as qrService from '../qr.service.js';
import { logger } from '../../logger.js';
import { errorMessage } from './_shared.js';

export async function registerQrRoutes(fastify: FastifyInstance): Promise<void> {
  // Generate a dynamic NBU QR (exact amount) for the current checkout via
  // Opendatabot. Billed per call — the cashier UI only hits this on the QR step
  // and caches the result per sale draft. A small per-store rate limit caps cost.
  const qrInvoiceHits = new Map<number, number[]>();

  fastify.post('/qr/invoice', async (request, reply) => {
    const auth = await ensureModule(request, reply, 'qr-payment');
    if (!auth) return;
    const body = request.body as { amount_cents?: number; sale_ref?: string };
    const amountCents = Number(body.amount_cents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return reply.code(400).send({ error: 'amount_cents must be a positive integer' });
    }

    const store = await analyticsService.getStore(auth.storeId);
    if (!store?.qr_payment_enabled || store.qr_payment_mode !== 'dynamic') {
      return reply.code(400).send({ error: 'dynamic QR payment is not enabled for this store' });
    }

    const now = Date.now();
    const recent = (qrInvoiceHits.get(auth.storeId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) {
      return reply.code(429).send({ error: 'too many QR requests, retry shortly' });
    }
    recent.push(now);
    qrInvoiceHits.set(auth.storeId, recent);

    try {
      const invoice = await qrService.createInvoice({
        storeId: auth.storeId,
        amountCents,
        saleRef: typeof body.sale_ref === 'string' ? body.sale_ref : '',
      });
      return {
        qrcode_data_uri: invoice.qrcode,
        url: invoice.url,
        invoice_id: invoice.invoiceId,
      };
    } catch (error) {
      if (error instanceof qrService.QrProviderError) {
        const status = error.code === 'qr_not_configured' ? 400 : 502;
        return reply.code(status).send({ error: error.code });
      }
      logger.error('QR invoice failed', { error: errorMessage(error) });
      return reply.code(502).send({ error: 'qr_provider_unavailable' });
    }
  });

  // Opendatabot payment webhook. No session auth — verified by an HMAC-SHA256
  // `Signature` header over the raw body. Encapsulated so the buffer parser does
  // not affect the other JSON routes. Always answers 2xx quickly (the provider
  // retries on non-2xx).
  await fastify.register(async (webhook) => {
    webhook.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, payload, done) => {
        try {
          const parsed = payload.length ? JSON.parse(payload.toString('utf8')) : {};
          done(null, { parsed, raw: payload });
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

    webhook.post('/qr/webhook', async (request, reply) => {
      const { parsed, raw } = (request.body ?? { parsed: {}, raw: Buffer.alloc(0) }) as {
        parsed: unknown;
        raw: Buffer;
      };
      const signature = request.headers['signature'];
      if (!qrService.verifyWebhookSignature(raw, Array.isArray(signature) ? signature[0] : signature)) {
        return reply.code(401).send({ error: 'bad signature' });
      }
      try {
        const result = await qrService.confirmQrPayment(parsed);
        return reply.code(200).send({ ok: true, matched: result.matched });
      } catch (error) {
        logger.error('QR webhook failed', { error: errorMessage(error) });
        return reply.code(200).send({ ok: false });
      }
    });
  });
}
