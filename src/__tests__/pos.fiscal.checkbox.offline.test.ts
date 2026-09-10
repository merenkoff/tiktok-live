// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.checkbox.offline.test.ts
//
// The Checkbox adapter's offline capability (`checkboxProvider.offline`),
// against a mocked fetch. Wire shapes follow TechDocs/checkbox-api/
// {cash-register,receipts-offline}.md; the point here is that every call hits
// the documented path with the documented headers and that the offline-only
// answers (control number, textual refusals) reach the orchestrator in the
// shape it branches on.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkboxProvider } from '../pos/fiscal/providers/checkbox/index.js';
import type {
  FiscalCallCtx,
  FiscalCredentials,
  FiscalOfflineOps,
  FiscalSaleDoc,
} from '../pos/fiscal/types.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => 'application/json' },
  };
}

function stubFetch(...responses: unknown[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const creds: FiscalCredentials = {
  provider: 'checkbox',
  config: {},
  secrets: { licenceKey: 'lic-key', cashierPin: '2736645432' },
};

function ctx(): FiscalCallCtx {
  return {
    storeId: 1,
    creds,
    session: { token: 'jwt-token', expiresAt: null },
    clientName: 'the-live-shop-pos',
    clientVersion: '1',
    signal: new AbortController().signal,
  };
}

const offline = checkboxProvider.offline as FiscalOfflineOps;

function lastCall(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
}

const saleDoc: FiscalSaleDoc = {
  kind: 'sale',
  requestId: 'req-off-1',
  ourNumber: 'R-00042',
  cashierName: 'Оля',
  lines: [
    {
      name: 'Футболка',
      quantityMilli: 1000,
      unitPriceCents: 10000,
      lineTotalCents: 10000,
      discountCents: 0,
      taxCode: '8',
      barcode: null,
      uktzed: null,
      sourceLineRef: '1',
    },
  ],
  payments: [{ method: 'cash', amountCents: 10000 }],
  totalCents: 10000,
  discountCents: 0,
};

describe('checkboxProvider declares the offline capability', () => {
  it('exposes every FiscalOfflineOps method', () => {
    expect(checkboxProvider.offline).toBeDefined();
    for (const method of [
      'registerState',
      'goOffline',
      'goOnline',
      'askOfflineCodes',
      'getOfflineCodes',
      'offlineCodesCount',
      'registerSaleOffline',
      'registerRefundOffline',
    ] as const) {
      expect(typeof offline[method]).toBe('function');
    }
  });
});

describe('registerState', () => {
  it('reads /cash-registers/info with the licence key and maps offline/stay_offline', async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, {
        id: 'c138',
        fiscal_number: 'TEST511111',
        offline_mode: true,
        stay_offline: true,
        has_shift: true,
      })
    );
    const state = await offline.registerState(ctx());
    expect(state).toMatchObject({ fiscalNumber: 'TEST511111', offline: true, manualOffline: true });
    const { url, init, headers } = lastCall(fetchMock);
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/cash-registers/info');
    expect(init.method).toBe('GET');
    expect(headers['x-license-key']).toBe('lic-key');
    expect(headers.authorization).toBe('Bearer jwt-token');
  });
});

describe('goOffline / goOnline', () => {
  it('posts the fiscal date and code, returning the transaction id', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: 'ok', id: '4722e600' }));
    const at = new Date('2026-09-11T06:14:20.000Z');
    const res = await offline.goOffline(ctx(), at, 'TEST-aQ-V-c');
    expect(res).toEqual({ transactionId: '4722e600' });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/cash-registers/go-offline');
    expect(JSON.parse(String(init.body))).toEqual({
      go_offline_date: '2026-09-11T06:14:20.000Z',
      fiscal_code: 'TEST-aQ-V-c',
    });
  });

  it('goOnline posts an empty body and resolves on {status: ok}', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: 'ok' }));
    await expect(offline.goOnline(ctx())).resolves.toBeUndefined();
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/cash-registers/go-online');
    expect(init.method).toBe('POST');
  });

  it('classifies a 5xx on goOnline as unavailable (retry later, do not give up)', async () => {
    stubFetch(jsonResponse(503, { message: 'Service Unavailable' }));
    await expect(offline.goOnline(ctx())).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('askOfflineCodes / getOfflineCodes / offlineCodesCount', () => {
  it('asks synchronously and maps DONE → done', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { status: 'DONE' }));
    const res = await offline.askOfflineCodes(ctx(), 200);
    expect(res).toEqual({ status: 'done', error: null });
    expect(lastCall(fetchMock).url).toBe(
      'https://api.checkbox.in.ua/api/v1/cash-registers/ask-offline-codes?count=200&sync=true'
    );
  });

  it('maps TIMEOUT and ERROR without throwing — the caller decides whether to read the pool anyway', async () => {
    stubFetch(jsonResponse(200, { status: 'TIMEOUT' }));
    expect(await offline.askOfflineCodes(ctx(), 10)).toEqual({ status: 'timeout', error: null });
    stubFetch(jsonResponse(200, { status: 'ERROR', error: 'ДПС недоступна' }));
    expect(await offline.askOfflineCodes(ctx(), 10)).toEqual({
      status: 'error',
      error: 'ДПС недоступна',
    });
  });

  it('getOfflineCodes maps the provider list in order and tolerates an empty array', async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, [
        { fiscal_code: 'TEST-iA5fmb', serial_id: 1, created_at: '2026-09-10T12:25:21.586071+00:00' },
        { fiscal_code: 'TEST-aQ-V-c', serial_id: 2, created_at: null },
      ])
    );
    const codes = await offline.getOfflineCodes(ctx(), 2);
    expect(codes).toEqual([
      { fiscalCode: 'TEST-iA5fmb', serialId: 1, createdAt: new Date('2026-09-10T12:25:21.586Z') },
      { fiscalCode: 'TEST-aQ-V-c', serialId: 2, createdAt: null },
    ]);
    expect(lastCall(fetchMock).url).toBe(
      'https://api.checkbox.in.ua/api/v1/cash-registers/get-offline-codes?count=2'
    );

    stubFetch(jsonResponse(200, []));
    expect(await offline.getOfflineCodes(ctx(), 5)).toEqual([]);
  });

  it('offlineCodesCount maps enough_offline_codes and defaults missing counters to 0', async () => {
    stubFetch(jsonResponse(200, { available: 120, minimal: 100, used: 3, enough_offline_codes: true }));
    expect(await offline.offlineCodesCount(ctx())).toEqual({
      available: 120,
      minimal: 100,
      used: 3,
      enough: true,
    });
    stubFetch(jsonResponse(200, { enough_offline_codes: false }));
    expect(await offline.offlineCodesCount(ctx())).toEqual({
      available: 0,
      minimal: 0,
      used: 0,
      enough: false,
    });
  });
});

describe('registerSaleOffline', () => {
  const offlineReceipt = {
    id: 'req-off-1',
    type: 'SELL',
    status: 'DONE',
    fiscal_code: 'TEST-iA5fmb',
    fiscal_date: '2026-09-11T14:07:28+00:00',
    tax_url: 'https://cabinet.tax.gov.ua/cashregs/check?id=TEST-iA5fmb&mac=5db006ff',
    is_created_offline: true,
    is_sent_dps: false,
    control_number: '9933',
    transaction: { id: 'tx-1', status: 'PENDING', offline_id: 'TEST-iA5fmb' },
  };

  it('posts sell + stamp to /receipts/sell-offline and returns the control number', async () => {
    // POST answers DONE already; the adapter still confirms with one GET, as
    // for online receipts (poll.ts reads at least once before settling).
    const fetchMock = stubFetch(jsonResponse(201, offlineReceipt), jsonResponse(200, offlineReceipt));
    const stamp = {
      fiscalCode: 'TEST-iA5fmb',
      fiscalDate: new Date('2026-09-11T14:07:28.000Z'),
      previousDocId: 'req-off-0',
    };
    const result = await offline.registerSaleOffline(ctx(), saleDoc, stamp);
    expect(result).toMatchObject({
      providerDocId: 'req-off-1',
      fiscalCode: 'TEST-iA5fmb',
      controlNumber: '9933',
      taxUrl: offlineReceipt.tax_url,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      'https://api.checkbox.in.ua/api/v1/receipts/req-off-1'
    );
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/receipts/sell-offline');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      id: 'req-off-1',
      fiscal_code: 'TEST-iA5fmb',
      fiscal_date: '2026-09-11T14:07:28.000Z',
      previous_receipt_id: 'req-off-0',
    });
    expect(body.control_number).toBeUndefined();
    expect(body.goods).toHaveLength(1);
  });

  it('omits previous_receipt_id when the stamp has none', async () => {
    const fetchMock = stubFetch(jsonResponse(201, offlineReceipt), jsonResponse(200, offlineReceipt));
    await offline.registerSaleOffline(ctx(), saleDoc, {
      fiscalCode: 'TEST-iA5fmb',
      fiscalDate: new Date('2026-09-11T14:07:28.000Z'),
    });
    expect('previous_receipt_id' in JSON.parse(String(lastCall(fetchMock).init.body))).toBe(false);
  });

  it('keeps polling when the offline receipt is still CREATED', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, { ...offlineReceipt, status: 'CREATED', control_number: null }),
      jsonResponse(200, { ...offlineReceipt, status: 'CREATED', control_number: null }),
      jsonResponse(200, offlineReceipt)
    );
    const result = await offline.registerSaleOffline(ctx(), saleDoc, {
      fiscalCode: 'TEST-iA5fmb',
      fiscalDate: new Date(),
    });
    expect(result.controlNumber).toBe('9933');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('turns "Cash register should be in manual offline mode!" into rejected/offline_not_manual', async () => {
    stubFetch(jsonResponse(400, { message: 'Cash register should be in manual offline mode!' }));
    await expect(
      offline.registerSaleOffline(ctx(), saleDoc, { fiscalCode: 'X', fiscalDate: new Date() })
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'offline_not_manual' });
  });

  it("turns \"Offline code 'X' was used before!\" into rejected/offline_code_used", async () => {
    stubFetch(jsonResponse(400, { message: "Offline code 'TEST-iA5fmb' was used before!" }));
    await expect(
      offline.registerSaleOffline(ctx(), saleDoc, { fiscalCode: 'TEST-iA5fmb', fiscalDate: new Date() })
    ).rejects.toMatchObject({ kind: 'rejected', providerCode: 'offline_code_used' });
  });

  it('still reports a duplicate with the requestId as the existing doc id', async () => {
    stubFetch(jsonResponse(400, { code: 'receipt.already_exists', message: 'Вказаний id чеку вже існує' }));
    await expect(
      offline.registerSaleOffline(ctx(), saleDoc, { fiscalCode: 'X', fiscalDate: new Date() })
    ).rejects.toMatchObject({ kind: 'duplicate', existingProviderDocId: 'req-off-1' });
  });

  it('registerRefundOffline posts the related receipt id alongside the stamp', async () => {
    const fetchMock = stubFetch(jsonResponse(201, offlineReceipt), jsonResponse(200, offlineReceipt));
    await offline.registerRefundOffline(
      ctx(),
      {
        ...saleDoc,
        kind: 'refund',
        requestId: 'req-off-1',
        relatedProviderDocId: 'orig-1',
        relatedOurNumber: 'R-00001',
      },
      { fiscalCode: 'TEST-iA5fmb', fiscalDate: new Date('2026-09-11T14:07:28.000Z') }
    );
    const body = JSON.parse(String(lastCall(fetchMock).init.body));
    expect(body.related_receipt_id).toBe('orig-1');
    expect(body.goods[0].is_return).toBe(true);
    expect(body.fiscal_code).toBe('TEST-iA5fmb');
  });
});

describe('online registerSale is untouched', () => {
  it('reports controlNumber: null for an online receipt', async () => {
    const online = {
      id: 'req-off-1',
      status: 'DONE',
      fiscal_code: 'ON-1',
      fiscal_date: null,
      tax_url: null,
      transaction: null,
    };
    stubFetch(jsonResponse(201, online), jsonResponse(200, online));
    const result = await checkboxProvider.registerSale(ctx(), saleDoc);
    expect(result.controlNumber).toBeNull();
  });
});
