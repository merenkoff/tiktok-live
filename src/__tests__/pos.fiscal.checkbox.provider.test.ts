// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.checkbox.provider.test.ts
//
// End-to-end (against a mocked fetch, never the real Checkbox API) coverage
// of the CheckboxProvider adapter — the whole reason this file matters is
// proving the internal polling actually waits rather than trusting the
// first response, since nothing above this adapter does that waiting.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkboxProvider } from '../pos/fiscal/providers/checkbox/index.js';
import type { FiscalCallCtx, FiscalCredentials } from '../pos/fiscal/types.js';

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

/** For endpoints read via `res.text()` directly (report/receipt text renders) — not JSON. */
function textResponse(status: number, body: string) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

const creds: FiscalCredentials = {
  provider: 'checkbox',
  config: {},
  secrets: { licenceKey: 'lic-key', cashierPin: '2736645432' },
};

function ctx(overrides: Partial<FiscalCallCtx> = {}): FiscalCallCtx {
  return {
    storeId: 1,
    creds,
    session: { token: 'jwt-token', expiresAt: null },
    clientName: 'the-live-shop-pos',
    clientVersion: '1',
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe('checkboxProvider — identity', () => {
  it('declares exactly the two secrets the client bundle also declares', () => {
    // Mirrors pos/src/modules/fiscal-checkbox/secretSpecs.ts's contract test
    // (manifest.test.ts) from the client side — kept as a literal here since
    // a backend test cannot import across the pos/ project boundary. If this
    // ever drifts from that file, both tests need updating together.
    const keys = checkboxProvider.secretKeys.map((s) => s.key).sort();
    expect(keys).toEqual(['cashierPin', 'licenceKey']);
    expect(checkboxProvider.secretKeys.every((s) => s.required)).toBe(true);
    expect(checkboxProvider.secretKeys.every((s) => s.kind === 'password')).toBe(true);
  });
});

describe('checkboxProvider.probe', () => {
  it('signs in and reports the cashier name and shift state', async () => {
    stubFetch(
      jsonResponse(200, { access_token: 'tok' }),
      jsonResponse(200, { full_name: 'Тестовий касир', organization: { title: 'Тестова організація' } }),
      jsonResponse(200, { id: 'shift-1', status: 'OPENED', opened_at: '2026-09-09T10:00:00Z' })
    );
    const probe = await checkboxProvider.probe(creds, new AbortController().signal);
    expect(probe).toEqual({
      ok: true,
      cashierName: 'Тестовий касир',
      cashRegister: 'Тестова організація',
      shiftOpen: true,
      message: null,
    });
  });

  it('throws a classified auth_rejected error on a bad PIN, rather than returning ok:false', async () => {
    stubFetch(jsonResponse(403, { code: 'cashier.invalid_credentials', message: 'Невірний пінкод' }));
    await expect(checkboxProvider.probe(creds, new AbortController().signal)).rejects.toMatchObject({
      kind: 'auth_rejected',
    });
  });
});

describe('checkboxProvider.signIn', () => {
  it('returns a session with expiresAt: null — the sandbox JWT has no exp claim', async () => {
    stubFetch(jsonResponse(200, { access_token: 'tok-2' }));
    const session = await checkboxProvider.signIn(creds, new AbortController().signal);
    expect(session).toEqual({ token: 'tok-2', expiresAt: null, meta: {} });
  });
});

describe('checkboxProvider.getShift', () => {
  it('returns null when no shift is open (bare null body)', async () => {
    stubFetch(jsonResponse(200, null));
    const shift = await checkboxProvider.getShift(ctx());
    expect(shift).toBeNull();
  });

  it('collapses a non-OPENED status (e.g. CREATED mid-transition) to null', async () => {
    stubFetch(jsonResponse(200, { id: 's1', status: 'CREATED', opened_at: null }));
    const shift = await checkboxProvider.getShift(ctx());
    expect(shift).toBeNull();
  });

  it('maps an OPENED shift to the FiscalShiftState shape', async () => {
    stubFetch(jsonResponse(200, { id: 's1', status: 'OPENED', opened_at: '2026-09-09T10:00:00Z' }));
    const shift = await checkboxProvider.getShift(ctx());
    expect(shift).toEqual({
      providerShiftId: 's1',
      status: 'open',
      openedAt: '2026-09-09T10:00:00Z',
      autoCloseAt: null,
    });
  });
});

describe('checkboxProvider.openShift — polls until OPENED', () => {
  it('does not trust the first (still-CREATED) response', async () => {
    const fetchMock = stubFetch(
      jsonResponse(202, { id: 's1', status: 'CREATED', opened_at: null }), // POST /shifts
      jsonResponse(200, { id: 's1', status: 'CREATED', opened_at: null, initial_transaction: null }), // poll 1: not yet
      jsonResponse(200, {
        id: 's1',
        status: 'OPENED',
        opened_at: '2026-09-09T10:00:00Z',
        initial_transaction: null,
      }) // poll 2: settled
    );
    const state = await checkboxProvider.openShift(ctx(), {});
    expect(state).toMatchObject({ providerShiftId: 's1', status: 'open', openedAt: '2026-09-09T10:00:00Z' });
    // 1 open call + 2 status polls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when the open fails at the provider, even though the HTTP call itself succeeded', async () => {
    stubFetch(
      jsonResponse(202, { id: 's1', status: 'CREATED', opened_at: null }),
      jsonResponse(200, {
        id: 's1',
        status: 'CREATED',
        opened_at: null,
        initial_transaction: { response_error_message: 'ДПС недоступна' },
      })
    );
    await expect(checkboxProvider.openShift(ctx(), {})).rejects.toMatchObject({ kind: 'unknown' });
  });

  it('never forwards autoCloseAt to Checkbox, even when the caller passes one', async () => {
    // Confirmed live: Checkbox rejects auto_close_at with 422 whenever it
    // falls on a later calendar day ("Дата закриття може бути лише в рамках
    // поточного дня!") — and shifts.service.ts always computes it as "now +
    // 23.5h", which crosses midnight for most of the day. Our own auto-close
    // cron is the sole enforcer of the 24h cap for this provider.
    const fetchMock = stubFetch(
      jsonResponse(202, { id: 's1', status: 'CREATED', opened_at: null }),
      jsonResponse(200, {
        id: 's1',
        status: 'OPENED',
        opened_at: '2026-09-09T10:00:00Z',
        initial_transaction: null,
      })
    );
    const autoCloseAt = new Date('2026-09-10T00:00:00.000Z');
    const state = await checkboxProvider.openShift(ctx(), { autoCloseAt });
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({});
    expect(state.autoCloseAt).toBeNull();
  });
});

describe('checkboxProvider.closeShift — polls until CLOSED, then fetches the Z-report text', () => {
  it('waits for CLOSED before resolving, and fetches the report text after', async () => {
    const fetchMock = stubFetch(
      jsonResponse(200, { id: 's1', status: 'OPENED', opened_at: '2026-09-09T10:00:00Z' }), // GET current shift
      jsonResponse(202, { id: 's1', status: 'CLOSING' }), // POST /shifts/close
      jsonResponse(200, { id: 's1', status: 'CLOSING', closing_transaction: null, z_report: null }), // poll 1: not yet
      jsonResponse(200, {
        id: 's1',
        status: 'CLOSED',
        closed_at: '2026-09-09T11:00:00Z',
        closing_transaction: null,
        z_report: { id: 'z1', fiscal_code: 'TEST-Z1' },
      }), // poll 2: settled
      textResponse(200, 'Z-ЗВІТ ТЕКСТ') // GET /reports/z1/text
    );
    const closed = await checkboxProvider.closeShift(ctx());
    expect(closed).toMatchObject({
      providerShiftId: 's1',
      status: 'closed',
      closedAt: '2026-09-09T11:00:00Z',
      zReport: { id: 'z1', fiscal_code: 'TEST-Z1' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('throws shift_closed when there is nothing to close', async () => {
    stubFetch(jsonResponse(200, null));
    await expect(checkboxProvider.closeShift(ctx())).rejects.toMatchObject({ kind: 'shift_closed' });
  });
});

describe('checkboxProvider.xReport — no polling needed', () => {
  it('creates the report and reads its text in two calls, no wait', async () => {
    const fetchMock = stubFetch(jsonResponse(201, { id: 'report-1' }), textResponse(200, 'X-ЗВІТ ТЕКСТ'));
    const report = await checkboxProvider.xReport(ctx());
    expect(report.text).toBe('X-ЗВІТ ТЕКСТ');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function receiptResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receipt-1',
    status: 'CREATED',
    fiscal_code: null,
    fiscal_date: null,
    tax_url: null,
    transaction: null,
    ...overrides,
  };
}

const saleDoc = {
  kind: 'sale' as const,
  requestId: 'req-1',
  ourNumber: 'R-00001',
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
  payments: [{ method: 'cash' as const, amountCents: 10000 }],
  totalCents: 10000,
  discountCents: 0,
};

describe('checkboxProvider.registerSale — polls until DONE or ERROR', () => {
  it('does not trust the immediate 201 (still CREATED) response', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, receiptResponse({ status: 'CREATED' })), // POST /receipts/sell
      jsonResponse(200, receiptResponse({ status: 'CREATED' })), // poll 1: not yet
      jsonResponse(
        200,
        receiptResponse({ status: 'DONE', fiscal_code: 'TEST-F1', tax_url: 'https://tax.gov.ua/x' })
      ) // poll 2: settled
    );
    const result = await checkboxProvider.registerSale(ctx(), saleDoc);
    expect(result.fiscalCode).toBe('TEST-F1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('recovers a duplicate via fetchDocument, using requestId as the provider doc id', async () => {
    stubFetch(
      jsonResponse(400, { code: 'receipt.already_exists', message: 'Вказаний id чеку вже існує' }), // POST fails
      jsonResponse(200, receiptResponse({ status: 'DONE', fiscal_code: 'TEST-DUP' })) // caller's own fetchDocument
    );
    await expect(checkboxProvider.registerSale(ctx(), saleDoc)).rejects.toMatchObject({
      kind: 'duplicate',
      existingProviderDocId: 'req-1',
    });
    // registerSale itself only throws duplicate — resolving it is
    // fiscal.service.ts's job (resolveDuplicate -> fetchDocument), exercised
    // here just to confirm fetchDocument works against the same id.
    const fetched = await checkboxProvider.fetchDocument(ctx(), 'req-1');
    expect(fetched?.fiscalCode).toBe('TEST-DUP');
  });

  it('classifies a post-creation ERROR status as unknown, carrying the provider message', async () => {
    stubFetch(
      jsonResponse(201, receiptResponse({ status: 'CREATED' })),
      jsonResponse(
        200,
        receiptResponse({
          status: 'ERROR',
          transaction: { response_error_message: 'ПРРО відхилило чек' },
        })
      )
    );
    await expect(checkboxProvider.registerSale(ctx(), saleDoc)).rejects.toMatchObject({
      kind: 'unknown',
      message: 'ПРРО відхилило чек',
    });
  });
});

describe('checkboxProvider.registerRefund / registerService', () => {
  it('registerRefund posts a sell payload marked as a return', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, receiptResponse({ status: 'CREATED' })),
      jsonResponse(200, receiptResponse({ status: 'DONE', fiscal_code: 'TEST-RF' }))
    );
    const refundDoc = {
      kind: 'refund' as const,
      requestId: 'req-refund-1',
      ourNumber: 'RF-1',
      cashierName: 'Оля',
      lines: saleDoc.lines,
      payments: saleDoc.payments,
      totalCents: 10000,
      discountCents: 0,
      relatedProviderDocId: 'req-1',
      relatedOurNumber: 'R-00001',
    };
    const result = await checkboxProvider.registerRefund(ctx(), refundDoc);
    expect(result.fiscalCode).toBe('TEST-RF');
    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.related_receipt_id).toBe('req-1');
    expect(body.goods[0].is_return).toBe(true);
  });

  it('registerService posts to /receipts/service', async () => {
    const fetchMock = stubFetch(
      jsonResponse(201, receiptResponse({ status: 'CREATED' })),
      jsonResponse(200, receiptResponse({ status: 'DONE', fiscal_code: 'TEST-SVC' }))
    );
    const serviceDoc = {
      kind: 'service_in' as const,
      requestId: 'req-svc-1',
      ourNumber: 'S-1',
      cashierName: 'Оля',
      amountCents: 5000,
    };
    await checkboxProvider.registerService(ctx(), serviceDoc);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.checkbox.in.ua/api/v1/receipts/service');
  });
});

describe('checkboxProvider.fetchDocument', () => {
  it('returns null when the receipt does not exist', async () => {
    stubFetch(jsonResponse(404, { message: 'Not Found' }));
    const result = await checkboxProvider.fetchDocument(ctx(), 'missing');
    expect(result).toBeNull();
  });
});

describe('checkboxProvider.renderReceipt', () => {
  it('returns the rendering with the requested format', async () => {
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
    const rendering = await checkboxProvider.renderReceipt?.(ctx(), 'receipt-1', 'png');
    expect(rendering?.format).toBe('png');
    expect(Buffer.isBuffer(rendering?.body)).toBe(true);
  });
});

describe('checkboxProvider.signOut', () => {
  it('does not throw on a normal sign-out', async () => {
    stubFetch(jsonResponse(200, {}));
    await expect(checkboxProvider.signOut(ctx())).resolves.toBeUndefined();
  });
});
