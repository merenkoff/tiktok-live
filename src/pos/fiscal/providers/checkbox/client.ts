// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/checkbox/client.ts
//
// Raw HTTP transport for api.checkbox.in.ua. No FiscalError classification
// here — that is `./errors.ts`'s job, kept separate so this file stays a
// faithful, boring mirror of the wire protocol. Response types are narrow: only
// the fields an adapter method actually reads, not Checkbox's full schema (see
// src/__tests__/fixtures/checkbox/ for the full captured shapes).
//
// `signal` is always the caller's shared AbortSignal (never a fresh
// AbortSignal.timeout() of our own, unlike qr.service.ts) — see poll.ts's
// header comment for why.

const BASE_URL = 'https://api.checkbox.in.ua/api/v1';

export class CheckboxApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly body: unknown
  ) {
    super(`Checkbox API ${status}${code ? ` (${code})` : ''}`);
    this.name = 'CheckboxApiError';
  }
}

interface RequestOpts {
  method: 'GET' | 'POST';
  path: string;
  signal: AbortSignal;
  licenseKey: string;
  clientName: string;
  clientVersion: string;
  token?: string;
  body?: unknown;
}

async function request<T>(opts: RequestOpts): Promise<T | null> {
  const res = await fetch(`${BASE_URL}${opts.path}`, {
    method: opts.method,
    headers: {
      'content-type': 'application/json',
      'x-license-key': opts.licenseKey,
      'x-client-name': opts.clientName,
      'x-client-version': opts.clientVersion,
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  // Some GETs (current shift, when none is open) legitimately answer 200 with
  // a bare `null` body — not an error, and not absent either.
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code =
      json && typeof json === 'object' && 'code' in json
        ? String((json as { code: unknown }).code)
        : null;
    throw new CheckboxApiError(res.status, code, json);
  }
  return json as T | null;
}

// ── Response shapes — narrowed to what an adapter method reads ─────────────

export interface CheckboxCashierMe {
  full_name: string;
  organization?: { title?: string | null } | null;
}

export interface CheckboxShift {
  id: string;
  status: string;
  opened_at: string | null;
}

export interface CheckboxZReportRef {
  id: string;
  fiscal_code: string | null;
}

export interface CheckboxShiftShort {
  id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
  initial_transaction: { response_error_message?: string | null } | null;
  closing_transaction: { response_error_message?: string | null } | null;
  z_report: CheckboxZReportRef | null;
}

export interface CheckboxReceipt {
  id: string;
  status: 'CREATED' | 'DONE' | 'ERROR' | 'CANCELLATION' | 'CANCELLED';
  fiscal_code: string | null;
  fiscal_date: string | null;
  tax_url: string | null;
  transaction: { response_error_message?: string | null } | null;
}

export interface CheckboxReport {
  id: string;
}

// ── Request payload shapes — built by payload.ts ────────────────────────────

export interface CheckboxGoodPayload {
  code: string;
  name: string;
  price: number;
  barcode?: string;
  uktzed?: string;
  tax?: number[];
}

export interface CheckboxDiscountPayload {
  type: 'DISCOUNT';
  mode: 'VALUE';
  /** Same minor-unit (kopecks) convention as everything else — confirmed live. */
  value: number;
}

export interface CheckboxGoodItemPayload {
  good: CheckboxGoodPayload;
  quantity: number;
  discounts?: CheckboxDiscountPayload[];
  is_return?: boolean;
}

export interface CheckboxCashPayment {
  type: 'CASH';
  value: number;
}

export interface CheckboxCardPayment {
  type: 'CASHLESS';
  value: number;
}

export type CheckboxPayment = CheckboxCashPayment | CheckboxCardPayment;

export interface CheckboxSellPayload {
  id: string;
  cashier_name?: string;
  goods: CheckboxGoodItemPayload[];
  payments: CheckboxPayment[];
  related_receipt_id?: string;
}

export interface CheckboxServicePayload {
  id: string;
  payment: CheckboxCashPayment;
}

export type CheckboxRenderFormat = 'text' | 'html' | 'png' | 'pdf' | 'xml' | 'qrcode';

interface AuthedOpts {
  token: string;
  licenseKey: string;
  signal: AbortSignal;
  clientName: string;
  clientVersion: string;
}

// ── Wire calls ───────────────────────────────────────────────────────────

export async function signInPinCode(
  licenseKey: string,
  pinCode: string,
  signal: AbortSignal,
  clientName: string,
  clientVersion: string
): Promise<{ access_token: string }> {
  const result = await request<{ access_token: string }>({
    method: 'POST',
    path: '/cashier/signinPinCode',
    signal,
    licenseKey,
    clientName,
    clientVersion,
    body: { pin_code: pinCode },
  });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function signOutRequest(opts: AuthedOpts): Promise<void> {
  await request({ method: 'POST', path: '/cashier/signout', ...opts });
}

export async function getMe(opts: AuthedOpts): Promise<CheckboxCashierMe> {
  const result = await request<CheckboxCashierMe>({ method: 'GET', path: '/cashier/me', ...opts });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function getCurrentShift(opts: AuthedOpts): Promise<CheckboxShift | null> {
  return request<CheckboxShift>({ method: 'GET', path: '/cashier/shift', ...opts });
}

export async function openShiftRequest(
  opts: AuthedOpts,
  autoCloseAt?: Date
): Promise<CheckboxShift> {
  const result = await request<CheckboxShift>({
    method: 'POST',
    path: '/shifts',
    ...opts,
    body: autoCloseAt ? { auto_close_at: autoCloseAt.toISOString() } : {},
  });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function getShiftShort(opts: AuthedOpts, shiftId: string): Promise<CheckboxShiftShort> {
  const result = await request<CheckboxShiftShort>({
    method: 'GET',
    path: `/shifts/short/${shiftId}`,
    ...opts,
  });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function closeShiftRequest(opts: AuthedOpts): Promise<void> {
  await request({ method: 'POST', path: '/shifts/close', ...opts, body: {} });
}

export async function sellReceipt(
  opts: AuthedOpts,
  payload: CheckboxSellPayload
): Promise<CheckboxReceipt> {
  const result = await request<CheckboxReceipt>({
    method: 'POST',
    path: '/receipts/sell',
    ...opts,
    body: payload,
  });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function serviceReceipt(
  opts: AuthedOpts,
  payload: CheckboxServicePayload
): Promise<CheckboxReceipt> {
  const result = await request<CheckboxReceipt>({
    method: 'POST',
    path: '/receipts/service',
    ...opts,
    body: payload,
  });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function getReceipt(opts: AuthedOpts, receiptId: string): Promise<CheckboxReceipt | null> {
  try {
    return await request<CheckboxReceipt>({ method: 'GET', path: `/receipts/${receiptId}`, ...opts });
  } catch (error) {
    if (error instanceof CheckboxApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * `width` — characters per line for the text render (Checkbox: 10..250,
 * default 42). Sent only when given, so non-text formats keep the plain URL.
 */
export async function getReceiptRendering(
  opts: AuthedOpts,
  receiptId: string,
  format: CheckboxRenderFormat,
  render: { width?: number } = {}
): Promise<{ contentType: string; body: string | Buffer } | null> {
  const query = render.width ? `?width=${Math.trunc(render.width)}` : '';
  const res = await fetch(`${BASE_URL}/receipts/${receiptId}/${format}${query}`, {
    method: 'GET',
    headers: {
      'x-license-key': opts.licenseKey,
      'x-client-name': opts.clientName,
      'x-client-version': opts.clientVersion,
      authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new CheckboxApiError(res.status, null, await res.text().catch(() => null));
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const isBinary = format === 'png' || format === 'pdf';
  const body = isBinary ? Buffer.from(await res.arrayBuffer()) : await res.text();
  return { contentType, body };
}

export async function createXReport(opts: AuthedOpts): Promise<CheckboxReport> {
  const result = await request<CheckboxReport>({ method: 'POST', path: '/reports', ...opts, body: {} });
  if (!result) throw new CheckboxApiError(502, null, result);
  return result;
}

export async function getReportText(opts: AuthedOpts, reportId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/reports/${reportId}/text`, {
    method: 'GET',
    headers: {
      'x-license-key': opts.licenseKey,
      'x-client-name': opts.clientName,
      'x-client-version': opts.clientVersion,
      authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  if (!res.ok) throw new CheckboxApiError(res.status, null, await res.text().catch(() => null));
  return res.text();
}
