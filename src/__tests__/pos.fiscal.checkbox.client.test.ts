// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CheckboxApiError,
  closeShiftRequest,
  createXReport,
  getCurrentShift,
  getMe,
  getReceipt,
  getReceiptRendering,
  getReportText,
  getShiftShort,
  openShiftRequest,
  sellReceipt,
  serviceReceipt,
  signInPinCode,
  signOutRequest,
} from '../pos/fiscal/providers/checkbox/client.js';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

function stubFetch(...responses: Array<ReturnType<typeof jsonResponse>>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

const signal = new AbortController().signal;
const authed = { token: 'tok', licenseKey: 'lic', signal, clientName: 'the-live-shop-pos', clientVersion: '1' };

afterEach(() => vi.unstubAllGlobals());

describe('signInPinCode', () => {
  it('POSTs pin_code with X-License-Key, no Authorization header', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { access_token: 'jwt-here' }));
    const result = await signInPinCode('lic-key', '1234', signal, 'client', 'v1');
    expect(result).toEqual({ access_token: 'jwt-here' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/cashier/signinPinCode');
    expect(opts.method).toBe('POST');
    expect(opts.headers['x-license-key']).toBe('lic-key');
    expect(opts.headers['x-client-name']).toBe('client');
    expect(opts.headers.authorization).toBeUndefined();
    expect(JSON.parse(opts.body)).toEqual({ pin_code: '1234' });
  });

  it('throws CheckboxApiError with the response code on a non-2xx', async () => {
    stubFetch(jsonResponse(403, { code: 'cashier.invalid_credentials', message: 'Невірний пінкод' }));
    await expect(signInPinCode('lic', 'bad', signal, 'c', 'v')).rejects.toMatchObject({
      status: 403,
      code: 'cashier.invalid_credentials',
    });
  });
});

describe('getMe / getCurrentShift', () => {
  it('sends the Authorization bearer header', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { full_name: 'Тестовий касир' }));
    await getMe(authed);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.authorization).toBe('Bearer tok');
  });

  it('treats a bare null body as "no shift", not an error', async () => {
    stubFetch(jsonResponse(200, null));
    const shift = await getCurrentShift(authed);
    expect(shift).toBeNull();
  });
});

describe('openShiftRequest', () => {
  it('POSTs auto_close_at as ISO when given, and returns the created shift', async () => {
    const fetchMock = stubFetch(jsonResponse(202, { id: 'shift-1', status: 'CREATED', opened_at: null }));
    const autoCloseAt = new Date('2026-09-10T00:00:00.000Z');
    const result = await openShiftRequest(authed, autoCloseAt);
    expect(result).toEqual({ id: 'shift-1', status: 'CREATED', opened_at: null });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/shifts');
    expect(JSON.parse(opts.body)).toEqual({ auto_close_at: '2026-09-10T00:00:00.000Z' });
  });

  it('sends an empty body when no auto-close deadline is given', async () => {
    const fetchMock = stubFetch(jsonResponse(202, { id: 's', status: 'CREATED', opened_at: null }));
    await openShiftRequest(authed);
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({});
  });
});

describe('getShiftShort', () => {
  it('GETs /shifts/short/{id}', async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, { id: 'shift-1', status: 'OPENED', opened_at: '2026-09-09T10:00:00Z' })
    );
    const result = await getShiftShort(authed, 'shift-1');
    expect(result.status).toBe('OPENED');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/shifts/short/shift-1');
  });
});

describe('closeShiftRequest', () => {
  it('POSTs to /shifts/close', async () => {
    const fetchMock = stubFetch(jsonResponse(202, { id: 's', status: 'CLOSING' }));
    await closeShiftRequest(authed);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/shifts/close');
    expect(opts.method).toBe('POST');
  });
});

describe('sellReceipt / serviceReceipt', () => {
  it('POSTs the sell payload to /receipts/sell', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, {
        id: 'r1',
        status: 'CREATED',
        fiscal_code: null,
        fiscal_date: null,
        tax_url: null,
        transaction: null,
      })
    );
    const payload = { id: 'r1', goods: [], payments: [] };
    const result = await sellReceipt(authed, payload);
    expect(result.id).toBe('r1');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/receipts/sell');
    expect(JSON.parse(opts.body)).toEqual(payload);
  });

  it('POSTs the service payload to /receipts/service', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, {
        id: 'r2',
        status: 'CREATED',
        fiscal_code: null,
        fiscal_date: null,
        tax_url: null,
        transaction: null,
      })
    );
    await serviceReceipt(authed, { id: 'r2', payment: { type: 'CASH', value: 5000 } });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/receipts/service');
  });

  it('throws CheckboxApiError on a duplicate id', async () => {
    stubFetch(jsonResponse(400, { code: 'receipt.already_exists', message: 'Вказаний id чеку вже існує' }));
    await expect(sellReceipt(authed, { id: 'dup', goods: [], payments: [] })).rejects.toMatchObject({
      status: 400,
      code: 'receipt.already_exists',
    });
  });
});

describe('getReceipt', () => {
  it('returns the receipt when found', async () => {
    stubFetch(
      jsonResponse(200, {
        id: 'r1',
        status: 'DONE',
        fiscal_code: 'F1',
        fiscal_date: null,
        tax_url: null,
        transaction: null,
      })
    );
    const result = await getReceipt(authed, 'r1');
    expect(result?.status).toBe('DONE');
  });

  it('returns null on a 404 rather than throwing', async () => {
    stubFetch(jsonResponse(404, { message: 'Not Found' }));
    const result = await getReceipt(authed, 'missing');
    expect(result).toBeNull();
  });

  it('still throws for a non-404 error', async () => {
    stubFetch(jsonResponse(500, {}));
    await expect(getReceipt(authed, 'x')).rejects.toBeInstanceOf(CheckboxApiError);
  });
});

describe('getReceiptRendering', () => {
  it('returns text content for the text format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'ТЕСТОВИЙ ЧЕК',
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as typeof fetch
    );
    const result = await getReceiptRendering(authed, 'r1', 'text');
    expect(result).toEqual({ contentType: 'text/plain', body: 'ТЕСТОВИЙ ЧЕК' });
  });

  it('returns a Buffer for binary formats (png/pdf)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        text: async () => '',
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }) as unknown as typeof fetch
    );
    const result = await getReceiptRendering(authed, 'r1', 'png');
    expect(Buffer.isBuffer(result?.body)).toBe(true);
    expect(result?.contentType).toBe('image/png');
  });

  it('returns null on a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => '',
      }) as unknown as typeof fetch
    );
    const result = await getReceiptRendering(authed, 'missing', 'qrcode');
    expect(result).toBeNull();
  });
});

describe('createXReport / getReportText', () => {
  it('POSTs to /reports with no body', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { id: 'report-1' }));
    const result = await createXReport(authed);
    expect(result).toEqual({ id: 'report-1' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/reports');
    expect(JSON.parse(opts.body)).toEqual({});
  });

  it('GETs the rendered text for a report id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'X-ЗВІТ №1',
      }) as unknown as typeof fetch
    );
    const text = await getReportText(authed, 'report-1');
    expect(text).toBe('X-ЗВІТ №1');
  });
});

describe('signOutRequest', () => {
  it('POSTs to /cashier/signout', async () => {
    const fetchMock = stubFetch(jsonResponse(200, {}));
    await signOutRequest(authed);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/cashier/signout');
  });
});
