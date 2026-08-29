// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/qr.service.ts
// Dynamic QR payment: generate an NBU "оплата за реквізитами" QR for the exact
// check amount via the Opendatabot IBAN Payment API (https://iban.opendatabot.ua).
// Cost: ~0.42 UAH per generated invoice — only call this when the cashier opens
// the QR step, and cache the result client-side per sale draft.

import { pool } from '../db.js';
import { logger } from '../logger.js';

const OPENDATABOT_INVOICE_URL = 'https://iban.opendatabot.ua/api/invoice';
const DEFAULT_PURPOSE_TEMPLATE = 'Оплата, {store}, {ref}';
const PURPOSE_MAX_LEN = 140;
const REQUEST_TIMEOUT_MS = 5000;

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
