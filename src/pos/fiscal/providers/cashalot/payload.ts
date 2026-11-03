// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/payload.ts
//
// What Cashalot answers → the provider-neutral `FiscalResult`.
//
// The fiscal number is the document's identity for everything after it: the
// provider doc id a return names in `ORDERRETNUM`, what `GetCheck` reads it
// back by, what the receipt prints. A document registered while the tax
// office was down comes back `Offline: true` with a number shaped
// `<сесія>.<локальний>.<контрольне>` (support answer 13) — its tail is the
// контрольне число, and the ledger row becomes `provider_offline`.
//
// The link on the receipt is Cashalot's `Url`; without one (a document read
// back from its XML) it is built the way the regulation prescribes
// (`../../taxUrl.ts`), from the register's number, the document's number,
// its date and its sum.

import { buildTaxUrl } from '../../taxUrl.js';
import type { FiscalResult } from '../../types.js';
import type { CashalotDocument } from './client.js';
import { parseCashalotDate, parseDpsDateTime } from './dates.js';

const OFFLINE_NUMBER = /^\d+\.\d+\.(\d+)$/;

/** The контрольне число of an offline number, or null for an online one. */
export function controlNumberOf(fiscalCode: string): string | null {
  return OFFLINE_NUMBER.exec(fiscalCode.trim())?.[1] ?? null;
}

function taxLink(
  url: string | null | undefined,
  fiscalCode: string,
  fiscalDate: string | null,
  registerFiscalNumber: string,
  totalCents: number
): string | null {
  const own = url?.trim();
  if (own) return own;
  if (!fiscalDate) return null;
  return buildTaxUrl({ fiscalCode, fiscalDate: new Date(fiscalDate), registerFiscalNumber, totalCents });
}

/** The answer without its images — `response_payload` is for support, not for base64 QR codes. */
function withoutImages(doc: CashalotDocument): Record<string, unknown> {
  const { QrCode, Visualization, ...rest } = doc;
  return {
    ...rest,
    ...(QrCode ? { QrCode: '<omitted>' } : {}),
    ...(Visualization ? { Visualization: '<omitted>' } : {}),
  };
}

export interface SentDocument {
  /** What the customer paid or got back — the `sm` of the tax link. */
  totalCents: number;
  /** The VAT our check carried, or null for a seller with no tax table. */
  vatCents: number | null;
  registerFiscalNumber: string;
}

export function toFiscalResult(doc: CashalotDocument, sent: SentDocument): FiscalResult {
  const fiscalCode = String(doc.NumFiscal).trim();
  const fiscalDate = parseCashalotDate(doc.OrderDateTime);
  const offline = doc.Offline === true;
  const link = taxLink(doc.Url, fiscalCode, fiscalDate, sent.registerFiscalNumber, sent.totalCents);
  return {
    providerDocId: fiscalCode,
    fiscalCode,
    fiscalDate,
    taxUrl: link,
    qrPayload: link,
    vatCents: sent.vatCents,
    receiptText: null,
    controlNumber: offline ? controlNumberOf(fiscalCode) : null,
    ...(offline ? { mode: 'provider_offline' as const } : {}),
    raw: withoutImages(doc),
  };
}

function tag(xml: string, name: string): string | null {
  return new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`, 'i').exec(xml)?.[1] ?? null;
}

function section(xml: string, name: string): string {
  return new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1] ?? '';
}

/**
 * A document read back from its original XML (`GetCheck`, `OriginalXml`) —
 * the recovery path after a duplicate. `offline` comes from the server's
 * own answer (`OfflineNumberReserved`) or the document's `OFFLINE` flag.
 */
export function fromOriginalXml(
  xml: string,
  input: { fiscalCode: string; registerFiscalNumber: string; url?: string | null; offline?: boolean }
): FiscalResult {
  const fiscalCode = input.fiscalCode.trim();
  const head = section(xml, 'CHECKHEAD');
  const fiscalDate = parseDpsDateTime(tag(head, 'ORDERDATE'), tag(head, 'ORDERTIME'));
  const offline = input.offline === true || /^true$/i.test(tag(head, 'OFFLINE') ?? '');
  const sum = Number(tag(section(xml, 'CHECKTOTAL'), 'SUM') ?? NaN);
  const totalCents = Number.isFinite(sum) ? Math.round(sum * 100) : 0;

  let vatCents: number | null = null;
  for (const row of section(xml, 'CHECKTAX').match(/<ROW[\s\S]*?<\/ROW>/gi) ?? []) {
    if ((tag(row, 'TYPE') ?? '0') !== '0') continue;
    const value = Number(tag(row, 'SUM') ?? NaN);
    if (Number.isFinite(value)) vatCents = (vatCents ?? 0) + Math.round(value * 100);
  }

  const link = taxLink(input.url, fiscalCode, fiscalDate, input.registerFiscalNumber, totalCents);
  return {
    providerDocId: fiscalCode,
    fiscalCode,
    fiscalDate,
    taxUrl: link,
    qrPayload: link,
    vatCents,
    receiptText: null,
    controlNumber: offline ? controlNumberOf(fiscalCode) : null,
    ...(offline ? { mode: 'provider_offline' as const } : {}),
    raw: { source: 'GetCheck OriginalXml', fiscalCode },
  };
}
