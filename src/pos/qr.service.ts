// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/qr.service.ts
// Dynamic QR payment: generate an NBU "оплата за реквізитами" QR for the exact
// check amount via the Opendatabot IBAN Payment API (https://iban.opendatabot.ua).
// Cost: ~0.42 UAH per generated invoice — only call this when the cashier opens
// the QR step, and cache the result client-side per sale draft.

import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../logger.js';

const OPENDATABOT_INVOICE_URL = 'https://iban.opendatabot.ua/api/invoice';
const OPENDATABOT_TRANSACTIONS_URL = 'https://iban.opendatabot.ua/api/transactions';
const DEFAULT_PURPOSE_TEMPLATE = 'Оплата, {store}, {ref}';
const PURPOSE_MAX_LEN = 140;
const REQUEST_TIMEOUT_MS = 5000;
// Amount-only fallback matching is limited to recent unconfirmed QR payments.
const FALLBACK_MATCH_WINDOW = "created_at > NOW() - INTERVAL '2 days'";

export class QrProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'qr_not_configured' | 'qr_no_credentials' | 'qr_provider_unavailable'
  ) {
    super(message);
    this.name = 'QrProviderError';
  }
}

export interface QrInvoice {
  invoiceId: string;
  url: string;
  /** `data:image/png;base64,...` — renders directly in an <img> under the Tauri CSP. */
  qrcode: string;
}

export function applyPurposeTemplate(
  template: string | null | undefined,
  vars: { ref: string; store: string }
): string {
  const text = (template?.trim() || DEFAULT_PURPOSE_TEMPLATE)
    .replace(/\{ref\}/g, vars.ref.trim())
    .replace(/\{store\}/g, vars.store.trim())
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, PURPOSE_MAX_LEN);
}

export async function createInvoice(args: {
  storeId: number;
  amountCents: number;
  saleRef: string;
}): Promise<QrInvoice> {
  const clientKey = process.env.OPENDATABOT_QR_KEY?.trim();
  const clientName = process.env.OPENDATABOT_QR_NAME?.trim();
  if (!clientKey || !clientName) {
    throw new QrProviderError('Opendatabot QR credentials are not set', 'qr_no_credentials');
  }

  const storeResult = await pool.query(
    `SELECT name, qr_iban, qr_edrpou, qr_purpose_template FROM pos_stores WHERE id = $1`,
    [args.storeId]
  );
  const store = storeResult.rows[0];
  if (!store) throw new QrProviderError('Store not found', 'qr_not_configured');

  const iban = (store.qr_iban as string | null)?.trim();
  const code = (store.qr_edrpou as string | null)?.trim();
  if (!iban || !code) {
    throw new QrProviderError('IBAN / EDRPOU not configured for this store', 'qr_not_configured');
  }

  const amount = (args.amountCents / 100).toFixed(2);
  const purpose = applyPurposeTemplate(store.qr_purpose_template, {
    ref: args.saleRef,
    store: store.name as string,
  });

  let res: Response;
  try {
    res = await fetch(OPENDATABOT_INVOICE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-key': clientKey,
        'x-client-name': clientName,
      },
      body: JSON.stringify({ code, iban, amount, purpose, responseMode: 'json' }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logger.warn('QR invoice request failed', {
      storeId: args.storeId,
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
    throw new QrProviderError('QR provider unreachable', 'qr_provider_unavailable');
  }

  if (!res.ok) {
    logger.warn('QR invoice non-2xx', { storeId: args.storeId, status: res.status });
    throw new QrProviderError(`QR provider returned ${res.status}`, 'qr_provider_unavailable');
  }

  const body = (await res.json().catch(() => null)) as
    | { id?: string; url?: string; qrcode?: string }
    | null;
  if (!body?.id || !body.qrcode) {
    throw new QrProviderError('QR provider returned an unexpected payload', 'qr_provider_unavailable');
  }

  logger.info('QR invoice created', { storeId: args.storeId, invoiceId: body.id });
  return { invoiceId: body.id, url: body.url ?? '', qrcode: body.qrcode };
}

// ── Phase 3: payment confirmation (webhook + daily reconciliation) ────────────

/**
 * Verify the `Signature` header on an Opendatabot webhook: HMAC-SHA256 of the
 * raw request body, keyed with OPENDATABOT_QR_KEY. Accepts a hex or base64 digest.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const key = process.env.OPENDATABOT_QR_KEY?.trim();
  if (!key || !signature) return false;
  const digest = crypto.createHmac('sha256', key).update(rawBody).digest();
  const candidates = [digest.toString('hex'), digest.toString('base64')];
  return candidates.some((c) => {
    if (c.length !== signature.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(signature));
    } catch {
      return false;
    }
  });
}

interface WebhookLikePayload {
  matches?: { amount?: boolean; purpose?: boolean; counterpartyCode?: boolean };
  invoiceNumber?: string;
  invoiceId?: string;
  invoice?: { id?: string; _id?: string } | null;
  transaction?: { amount?: number; currency?: string; purpose?: string } | null;
}

function invoiceIdCandidates(payload: WebhookLikePayload): string[] {
  return [
    payload.invoice?.id,
    payload.invoice?._id,
    payload.invoiceId,
    payload.invoiceNumber,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export interface ConfirmResult {
  matched: boolean;
  by?: 'provider_ref' | 'amount';
  paymentId?: number;
  saleId?: number;
}

/**
 * Mark a QR payment confirmed from an Opendatabot transaction/webhook payload.
 * Primary match is the provider invoice id we stored on `pos_payments.provider_ref`;
 * a narrow amount-only fallback covers static/legacy invoices when the provider
 * reports it matched the amount.
 */
export async function confirmQrPayment(
  payload: unknown,
  opts: { quietOnMiss?: boolean } = {}
): Promise<ConfirmResult> {
  const p = (payload ?? {}) as WebhookLikePayload;
  const refs = invoiceIdCandidates(p);

  if (refs.length > 0) {
    const byRef = await pool.query(
      `UPDATE pos_payments
         SET confirmed_at = NOW()
       WHERE method = 'qr' AND confirmed_at IS NULL AND provider_ref = ANY($1::text[])
       RETURNING id, sale_id`,
      [refs]
    );
    if (byRef.rows[0]) {
      const row = byRef.rows[0];
      logger.info('QR payment confirmed (provider_ref)', { paymentId: Number(row.id) });
      return {
        matched: true,
        by: 'provider_ref',
        paymentId: Number(row.id),
        saleId: Number(row.sale_id),
      };
    }
  }

  const amount = p.transaction?.amount;
  if (p.matches?.amount === true && typeof amount === 'number' && amount > 0) {
    const cents = Math.round(amount * 100);
    const byAmount = await pool.query(
      `UPDATE pos_payments
         SET confirmed_at = NOW()
       WHERE id = (
         SELECT id FROM pos_payments
         WHERE method = 'qr' AND confirmed_at IS NULL AND amount_cents = $1 AND ${FALLBACK_MATCH_WINDOW}
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING id, sale_id`,
      [cents]
    );
    if (byAmount.rows[0]) {
      const row = byAmount.rows[0];
      logger.info('QR payment confirmed (amount fallback)', { paymentId: Number(row.id), cents });
      return {
        matched: true,
        by: 'amount',
        paymentId: Number(row.id),
        saleId: Number(row.sale_id),
      };
    }
  }

  if (!opts.quietOnMiss) logger.warn('QR webhook: no matching payment', { refs, amount });
  return { matched: false };
}

export interface ReconcileResult {
  fetched: number;
  confirmed: number;
  unmatched: number;
  stale_unconfirmed: number;
}

/**
 * Daily sweep: pull recent paid transactions from Opendatabot and confirm any
 * QR payments the webhook missed; log QR payments still unconfirmed after 30 min.
 */
export async function reconcileQrPayments(): Promise<ReconcileResult> {
  const stale = await pool.query(
    `SELECT COUNT(*)::int AS n FROM pos_payments
     WHERE method = 'qr' AND confirmed_at IS NULL AND created_at < NOW() - INTERVAL '30 minutes'`
  );
  const staleCount = Number(stale.rows[0]?.n ?? 0);
  if (staleCount > 0) {
    logger.warn('QR reconcile: unconfirmed QR payments', { count: staleCount });
  }

  const clientKey = process.env.OPENDATABOT_QR_KEY?.trim();
  const clientName = process.env.OPENDATABOT_QR_NAME?.trim();
  if (!clientKey || !clientName) {
    return { fetched: 0, confirmed: 0, unmatched: 0, stale_unconfirmed: staleCount };
  }

  const dateFrom = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let items: unknown[] = [];
  try {
    const res = await fetch(
      `${OPENDATABOT_TRANSACTIONS_URL}?status=paid&limit=100&dateFrom=${dateFrom}`,
      {
        headers: { 'x-client-key': clientKey, 'x-client-name': clientName },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      logger.warn('QR reconcile: transactions non-2xx', { status: res.status });
      return { fetched: 0, confirmed: 0, unmatched: 0, stale_unconfirmed: staleCount };
    }
    const body = (await res.json().catch(() => null)) as { items?: unknown[] } | null;
    items = Array.isArray(body?.items) ? body!.items : [];
  } catch (error) {
    logger.warn('QR reconcile: transactions request failed', {
      error: error instanceof Error ? error.message : 'fetch_failed',
    });
    return { fetched: 0, confirmed: 0, unmatched: 0, stale_unconfirmed: staleCount };
  }

  let confirmed = 0;
  let unmatched = 0;
  for (const item of items) {
    const result = await confirmQrPayment(item, { quietOnMiss: true });
    if (result.matched) confirmed += 1;
    else unmatched += 1;
  }
  logger.info('QR reconcile done', { fetched: items.length, confirmed, unmatched });
  return { fetched: items.length, confirmed, unmatched, stale_unconfirmed: staleCount };
}
