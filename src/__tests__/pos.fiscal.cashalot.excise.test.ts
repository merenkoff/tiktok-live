// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.cashalot.excise.test.ts
//
// The retail excise and the stamps through the Cashalot adapter (track ДК,
// ДК4, TechDocs/POS_DUAL_REGISTER.md §4.3): the check goes out with «АГ» and
// the stamp, the tax rows come back as the result's `taxRows` (sent, or read
// from a found document's XML), and the requisites list the excise row without
// ever making it the default letter. Fake WEB API only.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cashalotProvider } from '../pos/fiscal/providers/cashalot/index.js';
import { fromOriginalXml } from '../pos/fiscal/providers/cashalot/payload.js';
import { mapSellPayload } from '../pos/fiscal/providers/checkbox/payload.js';
import type { FiscalCallCtx, FiscalDocLine, FiscalSaleDoc } from '../pos/fiscal/types.js';
import { FakeCashalot } from './helpers/fake-cashalot.js';

let fake: FakeCashalot;

beforeEach(() => {
  fake = new FakeCashalot();
  vi.stubGlobal('fetch', fake.fetch);
});
afterEach(() => vi.unstubAllGlobals());

const VAT_AND_EXCISE = {
  taxes: [
    { letter: 'А', name: 'ПДВ', type: 0, rate: 20 },
    { letter: 'Г', name: 'Акциз', type: 1, rate: 5 },
  ],
};

function ctx(config: Record<string, unknown> = VAT_AND_EXCISE): FiscalCallCtx {
  return {
    storeId: 1,
    creds: {
      provider: 'cashalot',
      config,
      secrets: { keyGuid: fake.keyGuid, keyPin: fake.keyPin, numFiscal: fake.numFiscal },
    },
    session: { token: '', expiresAt: null },
    clientName: 'the-live-shop-pos',
    clientVersion: '1',
    signal: AbortSignal.timeout(5000),
  };
}

const bottle: FiscalDocLine = {
  name: 'Горілка 0,5 л',
  quantityMilli: 1000,
  unitPriceCents: 25_990,
  lineTotalCents: 25_990,
  discountCents: 0,
  taxCode: 'A',
  barcode: null,
  uktzed: '2208601100',
  sourceLineRef: '1',
  unit: 'шт',
  excise: true,
  exciseLabels: ['AATE508932 0000412168'],
};

function sale(lines: FiscalDocLine[] = [bottle]): FiscalSaleDoc {
  const total = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  return {
    kind: 'sale',
    requestId: '7c3c1d1a-0d6d-4b6e-9c2e-5a0e4f1b2c3d',
    ourNumber: 'R-00077',
    cashierName: 'Бармен',
    lines,
    payments: [{ method: 'card', amountCents: total }],
    totalCents: total,
    discountCents: 0,
  };
}

describe('Cashalot — the retail excise (ДК4)', () => {
  beforeEach(async () => {
    await cashalotProvider.openShift(ctx());
    fake.calls.length = 0;
  });

  it('sends the excise line with both letters and its stamp, and reports both tax rows', async () => {
    const result = await cashalotProvider.registerSale(ctx(), sale());
    const check = fake.commands('RegisterCheck')[0].body.Check as {
      CHECKBODY: Array<Record<string, unknown>>;
      CHECKTAX: Array<Record<string, unknown>>;
    };
    expect(check.CHECKBODY[0]).toMatchObject({
      LETTERS: 'АГ',
      UKTZED: '2208601100',
      EXCISELABELS: [{ EXCISELABEL: 'AATE508932 0000412168' }],
    });
    expect(check.CHECKTAX.map((row) => [row.TYPE, row.LETTER, row.SUM])).toEqual([
      [0, 'А', 41.25],
      [1, 'Г', 12.38],
    ]);
    expect(result.vatCents).toBe(4125);
    expect(result.taxRows).toEqual([
      { kind: 'vat', name: 'ПДВ', letter: 'А', rate: 20, amount_cents: 4125 },
      { kind: 'excise', name: 'Акциз', letter: 'Г', rate: 5, amount_cents: 1238 },
    ]);
  });

  it('gives a seller who is not a VAT payer the excise alone', async () => {
    const result = await cashalotProvider.registerSale(
      ctx({ taxes: [{ letter: 'Г', name: 'Акциз', type: 1, rate: 5 }] }),
      sale([{ ...bottle, taxCode: null }])
    );
    expect(result.taxRows).toEqual([{ kind: 'excise', name: 'Акциз', letter: 'Г', rate: 5, amount_cents: 1238 }]);
    expect(result.vatCents).toBe(0);
  });

  it('lists the excise row in the requisites, never as the default letter', async () => {
    const req = await cashalotProvider.fetchRequisites(ctx());
    expect(req.taxes).toEqual([
      { code: 'A', symbol: 'А', label: 'ПДВ 20 %', rate: 20, no_vat: false, is_default: true },
      { code: 'G', symbol: 'Г', label: 'Акциз 5 %', rate: 5, no_vat: true, is_default: false, excise: true },
    ]);
  });
});

describe('Cashalot — the tax rows of a document found again', () => {
  it('reads every CHECKTAX row from the original XML, VAT alone into vatCents', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><CHECK><CHECKHEAD><ORDERDATE>03112026</ORDERDATE><ORDERTIME>201500</ORDERTIME></CHECKHEAD>' +
      '<CHECKTOTAL><SUM>259.90</SUM></CHECKTOTAL><CHECKTAX>' +
      '<ROW ROWNUM="1"><TYPE>0</TYPE><NAME>ПДВ</NAME><LETTER>А</LETTER><PRC>20.00</PRC><SUM>41.25</SUM></ROW>' +
      '<ROW ROWNUM="2"><TYPE>1</TYPE><NAME>Акциз</NAME><LETTER>Г</LETTER><PRC>5.00</PRC><SUM>12.38</SUM></ROW>' +
      '</CHECKTAX></CHECK>';
    const result = fromOriginalXml(xml, { fiscalCode: '100077', registerFiscalNumber: '4000000099' });
    expect(result.vatCents).toBe(4125);
    expect(result.taxRows).toEqual([
      { kind: 'vat', name: 'ПДВ', letter: 'А', rate: 20, amount_cents: 4125 },
      { kind: 'excise', name: 'Акциз', letter: 'Г', rate: 5, amount_cents: 1238 },
    ]);
  });
});

describe('Checkbox — the stamps of the goods', () => {
  it('sends a line’s stamps as excise_barcodes, and nothing for a line without', () => {
    const payload = mapSellPayload(sale([bottle, { ...bottle, excise: false, exciseLabels: undefined, sourceLineRef: '2' }]));
    expect(payload.goods[0].good.excise_barcodes).toEqual(['AATE508932 0000412168']);
    expect(payload.goods[1].good).not.toHaveProperty('excise_barcodes');
  });
});
