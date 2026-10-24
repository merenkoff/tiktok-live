// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.cashalot.provider.test.ts
//
// The Cashalot adapter against a stateful fake of the WEB API
// (`helpers/fake-cashalot.ts`) — never the real server. What matters most: a
// repeated UID is recovered by FINDING the existing document rather than by
// sending it again, a shift of the wrong mode stops the sale before a check is
// refused, and the check itself is the ДПС document `dps/` builds.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiscalError } from '../pos/fiscal/errors.js';
import { cashalotProvider } from '../pos/fiscal/providers/cashalot/index.js';
import type { FiscalCallCtx, FiscalCredentials, FiscalRefundDoc, FiscalSaleDoc } from '../pos/fiscal/types.js';
import { FakeCashalot } from './helpers/fake-cashalot.js';

let fake: FakeCashalot;

beforeEach(() => {
  fake = new FakeCashalot();
  vi.stubGlobal('fetch', fake.fetch);
});
afterEach(() => vi.unstubAllGlobals());

function creds(config: Record<string, unknown> = { taxes: [{ letter: 'А', name: 'ПДВ', type: 0, rate: 20 }] }): FiscalCredentials {
  return {
    provider: 'cashalot',
    config,
    secrets: { keyGuid: fake.keyGuid, keyPin: fake.keyPin, numFiscal: fake.numFiscal },
  };
}

function ctx(c: FiscalCredentials = creds()): FiscalCallCtx {
  return {
    storeId: 1,
    creds: c,
    session: { token: '', expiresAt: null },
    clientName: 'the-live-shop-pos',
    clientVersion: '1',
    signal: AbortSignal.timeout(5000),
  };
}

function sale(overrides: Partial<FiscalSaleDoc> = {}): FiscalSaleDoc {
  return {
    kind: 'sale',
    requestId: '0b1e6a52-7e57-4a0e-9a8b-1f2a3b4c5d6e',
    ourNumber: 'R-00042',
    cashierName: 'Оля',
    lines: [
      {
        name: 'Капучино',
        quantityMilli: 1000,
        unitPriceCents: 6000,
        lineTotalCents: 6000,
        discountCents: 0,
        taxCode: 'A',
        barcode: null,
        uktzed: null,
        sourceLineRef: '1',
        unit: 'шт',
      },
    ],
    payments: [{ method: 'cash', amountCents: 10000 }],
    totalCents: 6000,
    discountCents: 0,
    ...overrides,
  };
}

const kindOf = async (p: Promise<unknown>) => {
  const error = await p.catch((e) => e);
  expect(error).toBeInstanceOf(FiscalError);
  return error as FiscalError;
};

describe('cashalotProvider — identity and credentials', () => {
  it('declares the three credentials the owner copies from the cabinet', () => {
    expect(cashalotProvider.secretKeys.map((s) => s.key)).toEqual(['keyGuid', 'keyPin', 'numFiscal']);
    expect(cashalotProvider.secretKeys.every((s) => s.required)).toBe(true);
    expect(cashalotProvider.offline).toBeUndefined();
    expect(cashalotProvider.renderReceipt).toBeUndefined();
  });

  it('refuses before any request when a credential is missing', async () => {
    const error = await kindOf(cashalotProvider.signIn({ ...creds(), secrets: { keyGuid: 'x' } }, AbortSignal.timeout(1000)));
    expect(error.kind).toBe('auth_rejected');
    expect(fake.calls).toHaveLength(0);
  });

  it('signs in by reading the register — a wrong PIN is refused there', async () => {
    const session = await cashalotProvider.signIn(creds(), AbortSignal.timeout(1000));
    expect(session).toEqual({ token: '', expiresAt: null, meta: { numFiscal: fake.numFiscal } });
    expect(fake.calls[0].body).toMatchObject({ Command: 'TransactionsRegistrarState', KeyGuid: fake.keyGuid, KeyPin: fake.keyPin, NumFiscal: 4000000004 });

    const stale = creds();
    fake.keyPin = 'changed-in-the-cabinet';
    expect((await kindOf(cashalotProvider.signIn(stale, AbortSignal.timeout(1000)))).kind).toBe('auth_rejected');
  });

  it('probes and reads the requisites, with the tax table from the store’s config', async () => {
    const probe = await cashalotProvider.probe(creds(), AbortSignal.timeout(1000));
    expect(probe).toMatchObject({ ok: true, cashRegister: 'ПРРО 4000000004', shiftOpen: false, message: 'Ліцензія до 2027-01-01' });

    const req = await cashalotProvider.fetchRequisites(ctx());
    expect(req.organization).toEqual({ name: 'ТОВ «Тест»', edrpou: '12345678', tax_number: '123456789012', is_vat: true });
    expect(req.point).toEqual({ name: 'Кав’ярня', address: 'вул. Тестова, 1' });
    expect(req.register.fiscal_number).toBe('4000000004');
    expect(req.taxes).toEqual([{ code: 'A', symbol: 'А', label: 'ПДВ 20 %', rate: 20, no_vat: false, is_default: true }]);
  });
});

describe('cashalotProvider — shifts', () => {
  it('opens a fiscal or a test shift as configured, and treats «already open» as open', async () => {
    const opened = await cashalotProvider.openShift(ctx());
    expect(opened).toMatchObject({ status: 'open', providerShiftId: '701', openedAt: '2026-10-24T09:00:00.000Z' });
    expect(fake.commands('OpenShift')[0].body.TESTING).toBeUndefined();

    const again = await cashalotProvider.openShift(ctx());
    expect(again.status).toBe('open');

    const testFake = new FakeCashalot();
    vi.stubGlobal('fetch', testFake.fetch);
    fake = testFake;
    await cashalotProvider.openShift(ctx(creds({ taxes: [], testing: true })));
    expect(testFake.commands('OpenShift')[0].body.TESTING).toBe(true);
  });

  it('stops before selling into a shift of the other mode', async () => {
    fake.shiftOpen = true;
    fake.testing = true;
    const error = await kindOf(cashalotProvider.getShift(ctx()));
    expect(error.kind).toBe('rejected');
    expect(error.providerCode).toBe('shift_mode_mismatch');
  });

  it('closes with an automatic Z-report, and says shift_closed when there is none', async () => {
    await cashalotProvider.openShift(ctx());
    const closed = await cashalotProvider.closeShift(ctx());
    expect(closed).toMatchObject({ status: 'closed', zReportText: 'Z-ЗВІТ', closedAt: '2026-10-24T19:00:00.000Z' });
    expect(fake.commands('CloseShift')[0].body).toMatchObject({ ZRepAuto: true, Visualization: true });

    expect((await kindOf(cashalotProvider.closeShift(ctx()))).kind).toBe('shift_closed');
  });

  it('reads the X-report as text', async () => {
    expect(await cashalotProvider.xReport(ctx())).toMatchObject({ text: 'X-ЗВІТ' });
  });
});

describe('cashalotProvider — documents', () => {
  beforeEach(async () => {
    await cashalotProvider.openShift(ctx());
    fake.calls.length = 0;
  });

  it('sends the ДПС check with the UID in the root and a copy in CHECKHEAD', async () => {
    const result = await cashalotProvider.registerSale(ctx(), sale());
    const body = fake.commands('RegisterCheck')[0].body;
    expect(body.UID).toBe('0b1e6a52-7e57-4a0e-9a8b-1f2a3b4c5d6e');
    expect(body.Check).toMatchObject({
      CHECKHEAD: { DOCTYPE: 'SaleGoods', DOCSUBTYPE: 'CheckGoods', UID: '0b1e6a52-7e57-4a0e-9a8b-1f2a3b4c5d6e', CASHIER: 'Оля' },
      CHECKTOTAL: { SUM: 60 },
      CHECKPAY: [{ PAYFORMCD: 0, SUM: 60, PROVIDED: 100, REMAINS: 40 }],
      CHECKTAX: [{ LETTER: 'А', SOURCESUM: 60, SUM: 10 }],
      CHECKBODY: [{ NAME: 'Капучино', UNITCD: 2009, UNITNM: 'шт', LETTERS: 'А', COST: 60 }],
    });
    expect((body.Check as { CHECKHEAD: { TESTING?: boolean } }).CHECKHEAD.TESTING).toBeUndefined();
    expect(result).toMatchObject({
      providerDocId: '100002',
      fiscalCode: '100002',
      fiscalDate: '2026-10-24T09:05:00.000Z',
      vatCents: 1000,
      controlNumber: null,
    });
    expect(result.taxUrl).toMatch(/^https:\/\/cabinet\.tax\.gov\.ua\//);
    expect(result.mode).toBeUndefined();
  });

  it('marks a document Cashalot registered offline, with its control number', async () => {
    fake.nextOffline = true;
    const result = await cashalotProvider.registerSale(ctx(), sale());
    expect(result).toMatchObject({ fiscalCode: '82563.2.6127', controlNumber: '6127', mode: 'provider_offline' });
  });

  it('builds the tax link itself when Cashalot sends none', async () => {
    fake.omitUrl = true;
    const result = await cashalotProvider.registerSale(ctx(), sale());
    expect(result.taxUrl).toContain('fn=4000000004');
    expect(result.taxUrl).toContain('id=100002');
    expect(result.taxUrl).toContain('sm=60.00');
  });

  it('finds the document a repeated UID already made, instead of sending it again', async () => {
    const first = await cashalotProvider.registerSale(ctx(), sale());
    const error = await kindOf(cashalotProvider.registerSale(ctx(), sale()));
    expect(error.kind).toBe('duplicate');
    expect(error.existingProviderDocId).toBe(first.providerDocId);

    // And `resolveDuplicate` can read it back.
    const read = await cashalotProvider.fetchDocument(ctx(), first.providerDocId);
    expect(read).toMatchObject({ fiscalCode: first.fiscalCode, fiscalDate: '2026-10-24T09:05:00.000Z' });
  });

  it('says duplicate without a number when the UID is not found among the newest documents', async () => {
    fake.uids.set('lost-uid', '1');
    const error = await kindOf(cashalotProvider.registerSale(ctx(), sale({ requestId: 'lost-uid' })));
    expect(error.kind).toBe('duplicate');
    expect(error.existingProviderDocId).toBeNull();
  });

  it('returns against the sale’s fiscal number and registers service documents', async () => {
    const sold = await cashalotProvider.registerSale(ctx(), sale());
    const refund: FiscalRefundDoc = {
      kind: 'refund',
      requestId: '5c1d2e3f-0000-4a0e-9a8b-1f2a3b4c5d6e',
      ourNumber: 'RF-00001',
      cashierName: 'Оля',
      lines: sale().lines,
      payments: [{ method: 'cash', amountCents: 6000 }],
      totalCents: 6000,
      discountCents: 0,
      relatedProviderDocId: sold.providerDocId,
      relatedOurNumber: 'R-00042',
    };
    await cashalotProvider.registerRefund(ctx(), refund);
    expect(fake.commands('RegisterCheck').at(-1)?.body.Check).toMatchObject({
      CHECKHEAD: { DOCSUBTYPE: 'CheckReturn', ORDERRETNUM: sold.providerDocId },
    });

    await cashalotProvider.registerService(ctx(), { kind: 'service_out', requestId: 's-1', ourNumber: 'S-1', cashierName: 'Оля', amountCents: 5000 });
    expect(fake.commands('RegisterCheck').at(-1)?.body.Check).toEqual({
      CHECKHEAD: { DOCTYPE: 'SaleGoods', DOCSUBTYPE: 'ServiceIssue', UID: 's-1', CASHIER: 'Оля' },
      CHECKTOTAL: { SUM: 50 },
    });
  });

  it('refuses before sending a line whose rate is not in the table', async () => {
    const error = await kindOf(cashalotProvider.registerSale(ctx(), sale({ lines: [{ ...sale().lines[0], taxCode: 'Z' }] })));
    expect(error.kind).toBe('rejected');
    expect(fake.commands('RegisterCheck')).toHaveLength(0);
  });

  it('reads a document that does not exist as null', async () => {
    expect(await cashalotProvider.fetchDocument(ctx(), '999')).toBeNull();
  });
});
