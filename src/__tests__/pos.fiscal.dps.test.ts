// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.dps.test.ts
//
// The ДПС check model (`src/pos/fiscal/dps/`) against the official examples
// (TechDocs/prro/dps/examples/, read in TechDocs/prro/dps/document-structures.md):
// their figures are the only ground truth we have before a live register, and
// the tax office refuses a check whose tax sums disagree with its lines.

import { describe, expect, it } from 'vitest';
import {
  buildRefundCheck,
  buildSaleCheck,
  buildServiceCheck,
  dpsErrorKind,
  DpsTaxTableError,
  includedTaxCents,
  letterCode,
  normalizeTaxTable,
  resolveLetter,
  unitFields,
  type DpsTaxRate,
} from '../pos/fiscal/dps/index.js';
import { FiscalError } from '../pos/fiscal/errors.js';
import type {
  FiscalDocLine,
  FiscalRefundDoc,
  FiscalSaleDoc,
  FiscalServiceDoc,
} from '../pos/fiscal/types.js';

const VAT20: DpsTaxRate = { letter: 'А', name: 'ПДВ', type: 0, rate: 20 };
const VAT7: DpsTaxRate = { letter: 'Б', name: 'ПДВ', type: 0, rate: 7 };

function line(overrides: Partial<FiscalDocLine> = {}): FiscalDocLine {
  return {
    name: 'Товар',
    quantityMilli: 1000,
    unitPriceCents: 10000,
    lineTotalCents: 10000,
    discountCents: 0,
    taxCode: 'A',
    barcode: null,
    uktzed: null,
    sourceLineRef: '1',
    ...overrides,
  };
}

function sale(overrides: Partial<FiscalSaleDoc> = {}): FiscalSaleDoc {
  return {
    kind: 'sale',
    requestId: '6d69bd4d-8cb8-4838-81d9-1265998ff2e4',
    ourNumber: 'R-00042',
    cashierName: 'Оля',
    lines: [line()],
    payments: [{ method: 'cash', amountCents: 10000 }],
    totalCents: 10000,
    discountCents: 0,
    ...overrides,
  };
}

function refund(overrides: Partial<FiscalRefundDoc> = {}): FiscalRefundDoc {
  return {
    kind: 'refund',
    requestId: 'b3b1b8a4-0a1e-4c39-9f0b-6a7f2a3b0c11',
    ourNumber: 'RF-00001',
    cashierName: 'Оля',
    lines: [line()],
    payments: [{ method: 'cash', amountCents: 10000 }],
    totalCents: 10000,
    discountCents: 0,
    relatedProviderDocId: '177086',
    relatedOurNumber: 'R-00042',
    ...overrides,
  };
}

describe('ДПС check — the official examples', () => {
  it('reproduces «Знижки»: cost before the discount, the tax from the base after it', () => {
    // 100.00 at −50 % under «А» 20 %, 200.00 at −20 % under «Б» 7 %.
    const { check, vatCents } = buildSaleCheck(
      sale({
        lines: [
          line({ name: 'морква', unitPriceCents: 10000, lineTotalCents: 5000, taxCode: 'A', unit: 'шт' }),
          line({ name: 'цибуля', unitPriceCents: 20000, lineTotalCents: 16000, taxCode: 'B', unit: 'шт', sourceLineRef: '2' }),
        ],
        payments: [{ method: 'cash', amountCents: 21000 }],
        totalCents: 21000,
      }),
      { taxes: [VAT20, VAT7] }
    );

    expect(check.CHECKTOTAL).toEqual({ SUM: 210, DISCOUNTSUM: 90 });
    expect(check.CHECKBODY).toEqual([
      expect.objectContaining({ NAME: 'морква', UNITCD: 2009, UNITNM: 'шт', AMOUNT: 1, PRICE: 100, LETTERS: 'А', COST: 100, DISCOUNTTYPE: 0, DISCOUNTSUM: 50 }),
      expect.objectContaining({ NAME: 'цибуля', PRICE: 200, LETTERS: 'Б', COST: 200, DISCOUNTSUM: 40 }),
    ]);
    expect(check.CHECKTAX).toEqual([
      { TYPE: 0, NAME: 'ПДВ', LETTER: 'А', PRC: 20, SIGN: false, TURNOVER: 100, SOURCESUM: 50, SUM: 8.33 },
      { TYPE: 0, NAME: 'ПДВ', LETTER: 'Б', PRC: 7, SIGN: false, TURNOVER: 200, SOURCESUM: 160, SUM: 10.47 },
    ]);
    expect(check.CHECKPAY).toEqual([{ PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА', SUM: 210 }]);
    expect(vatCents).toBe(833 + 1047);
  });

  it('reproduces «Заокруглення»: SUM is paid, NORNDSUM the goods, RNDSUM signed to close the gap', () => {
    // 12.57 rounded up to 12.60, 20.00 handed over — and 2.09 of VAT, the tie
    // only the «base minus net» form gets right.
    const { check } = buildSaleCheck(
      sale({
        lines: [line({ name: 'Мыло Детское', unitPriceCents: 1257, lineTotalCents: 1257, unit: 'шт' })],
        payments: [{ method: 'cash', amountCents: 2000 }],
        totalCents: 1257,
        cashRounding: { step: 10, amountCents: 3 },
      }),
      { taxes: [VAT20] }
    );

    expect(check.CHECKTOTAL).toEqual({ SUM: 12.6, RNDSUM: -0.03, NORNDSUM: 12.57 });
    expect(check.CHECKPAY).toEqual([
      { PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА', SUM: 12.6, PROVIDED: 20, REMAINS: 7.4 },
    ]);
    expect(check.CHECKTAX).toEqual([
      expect.objectContaining({ LETTER: 'А', TURNOVER: 12.57, SOURCESUM: 12.57, SUM: 2.09 }),
    ]);
  });

  it('computes the included tax the way all five example figures do', () => {
    expect(includedTaxCents(5000, 20)).toBe(833); // «Знижки» А
    expect(includedTaxCents(16000, 7)).toBe(1047); // «Знижки» Б
    expect(includedTaxCents(1257, 20)).toBe(209); // «Заокруглення» — the tie
    expect(includedTaxCents(24752, 20)).toBe(4125); // «Два податки», ПДВ
    expect(includedTaxCents(25990, 5)).toBe(1238); // «Два податки», акциз
    // The direct form is a kopeck higher only on that tie — what the till's
    // single VAT line uses (`pos/src/lib/receipt.ts` `vatLines`).
    expect(Math.round((1257 * 20) / 120)).toBe(210);
    for (const base of [10000, 30000, 4999, 123456]) {
      expect(includedTaxCents(base, 20)).toBe(Math.round((base * 20) / 120));
    }
    expect(includedTaxCents(0, 20)).toBe(0);
    expect(includedTaxCents(10000, 0)).toBe(0);
  });

  it('reproduces «Повернення»: CheckReturn against the sale fiscal number', () => {
    // A returned line whose sale carried a discount: `mapping.ts` zeroes the
    // line's discountCents and gives the refunded amount, the discount is derived.
    const { check } = buildRefundCheck(
      refund({
        lines: [line({ unitPriceCents: 10000, lineTotalCents: 9000, discountCents: 0 })],
        payments: [{ method: 'cash', amountCents: 9000 }],
        totalCents: 9000,
      }),
      { taxes: [VAT20] }
    );
    expect(check.CHECKHEAD).toMatchObject({ DOCTYPE: 'SaleGoods', DOCSUBTYPE: 'CheckReturn', ORDERRETNUM: '177086' });
    expect(check.CHECKBODY?.[0]).toMatchObject({ COST: 100, DISCOUNTSUM: 10 });
    expect(check.CHECKTOTAL).toEqual({ SUM: 90, DISCOUNTSUM: 10 });
    expect(check.CHECKPAY).toEqual([{ PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА', SUM: 90 }]);
  });

  it('rounds a cash refund the same way: the money handed back is SUM', () => {
    const { check } = buildRefundCheck(
      refund({
        lines: [line({ unitPriceCents: 1257, lineTotalCents: 1257 })],
        payments: [{ method: 'cash', amountCents: 1260 }],
        totalCents: 1257,
        cashRounding: { step: 10, amountCents: 3 },
      }),
      { taxes: [VAT20] }
    );
    expect(check.CHECKTOTAL).toEqual({ SUM: 12.6, RNDSUM: -0.03, NORNDSUM: 12.57 });
    expect(check.CHECKPAY).toEqual([{ PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА', SUM: 12.6 }]);
  });

  it('reproduces «Службове внесення»: only the sum', () => {
    const doc: FiscalServiceDoc = { kind: 'service_in', requestId: 'r', ourNumber: 'S-1', cashierName: 'Оля', amountCents: 60053 };
    expect(buildServiceCheck(doc, { taxes: [VAT20] }).check).toEqual({
      CHECKHEAD: { DOCTYPE: 'SaleGoods', DOCSUBTYPE: 'ServiceDeposit', CASHIER: 'Оля' },
      CHECKTOTAL: { SUM: 600.53 },
    });
    expect(buildServiceCheck({ ...doc, kind: 'service_out' }, { taxes: [] }).check.CHECKHEAD.DOCSUBTYPE).toBe('ServiceIssue');
  });
});

describe('ДПС check — payments, head and units', () => {
  it('pays the cash row what the cashless rows leave, with the change', () => {
    const { check } = buildSaleCheck(
      sale({
        lines: [line({ unitPriceCents: 12000, lineTotalCents: 12000 })],
        payments: [
          { method: 'card', amountCents: 5000 },
          { method: 'cash', amountCents: 10000 },
        ],
        totalCents: 12000,
      }),
      { taxes: [] }
    );
    expect(check.CHECKPAY).toEqual([
      { PAYFORMCD: 0, PAYFORMNM: 'ГОТІВКА', SUM: 70, PROVIDED: 100, REMAINS: 30 },
      { PAYFORMCD: 1, PAYFORMNM: 'КАРТКА', SUM: 50 },
    ]);
  });

  it('sends a QR bank transfer as form 306', () => {
    const { check } = buildSaleCheck(sale({ payments: [{ method: 'qr', amountCents: 10000 }] }), { taxes: [] });
    expect(check.CHECKPAY).toEqual([{ PAYFORMCD: 306, PAYFORMNM: 'Переказ за QR-кодом (IBAN)', SUM: 100 }]);
  });

  it('refuses payments that do not cover the check, or cash on a check already paid', () => {
    expect(() => buildSaleCheck(sale({ payments: [{ method: 'cash', amountCents: 9000 }] }), { taxes: [] })).toThrow(/менше/);
    expect(() => buildSaleCheck(sale({ payments: [{ method: 'card', amountCents: 11000 }] }), { taxes: [] })).toThrow(/більші/);
    expect(() =>
      buildSaleCheck(
        sale({ payments: [{ method: 'card', amountCents: 10000 }, { method: 'cash', amountCents: 500 }] }),
        { taxes: [] }
      )
    ).toThrow(/вже сплачена/);
  });

  it('marks TESTING, copies the UID and names the cashier only when asked', () => {
    const plain = buildSaleCheck(sale(), { taxes: [] }).check.CHECKHEAD;
    expect(plain).toEqual({ DOCTYPE: 'SaleGoods', DOCSUBTYPE: 'CheckGoods', CASHIER: 'Оля' });
    const test = buildSaleCheck(sale(), { taxes: [], testing: true, uid: 'abc' }).check.CHECKHEAD;
    expect(test).toMatchObject({ TESTING: true, UID: 'abc' });
  });

  it('sends a unit only as a pair, and only one we have a code for', () => {
    expect(unitFields('шт')).toEqual({ UNITCD: 2009, UNITNM: 'шт' });
    expect(unitFields('г')).toEqual({ UNITCD: 303, UNITNM: 'г' });
    expect(unitFields('мл')).toEqual({ UNITCD: 144, UNITNM: 'мл' });
    expect(unitFields('кг')).toEqual({ UNITCD: 301, UNITNM: 'кг' });
    expect(unitFields('л')).toEqual({ UNITCD: 138, UNITNM: 'л' });
    expect(unitFields('уп')).toEqual({});
    expect(unitFields(undefined)).toEqual({});
    // A line stored before contract v2 has no unit at all.
    const row = buildSaleCheck(sale(), { taxes: [] }).check.CHECKBODY?.[0];
    expect(row && 'UNITCD' in row).toBe(false);
  });

  it('uses the barcode as CODE when there is one, and caps the name', () => {
    const long = 'Б'.repeat(200);
    const row = buildSaleCheck(sale({ lines: [line({ name: long, barcode: '4820000000017', uktzed: '2905110000' })] }), { taxes: [] })
      .check.CHECKBODY?.[0];
    expect(row).toMatchObject({ CODE: '4820000000017', BARCODE: '4820000000017', UKTZED: '2905110000' });
    expect(row?.NAME).toHaveLength(128);
  });
});

describe('ДПС check — the tax table', () => {
  it('leaves CHECKTAX and LETTERS out for a seller with no table', () => {
    const { check, vatCents } = buildSaleCheck(sale(), { taxes: [] });
    expect(check.CHECKTAX).toBeUndefined();
    expect(check.CHECKBODY?.[0].LETTERS).toBeUndefined();
    expect(vatCents).toBe(0);
  });

  it('refuses a line whose rate is not in the table, before anything is sent', () => {
    const run = (taxCode: string | null) => () => buildSaleCheck(sale({ lines: [line({ taxCode })] }), { taxes: [VAT20] });
    expect(run('G')).toThrow(/ставки «G» немає/);
    expect(run(null)).toThrow(/без ставки податку/);
    try {
      run('G')();
    } catch (error) {
      expect(error).toBeInstanceOf(FiscalError);
      expect((error as FiscalError).kind).toBe('rejected');
    }
  });

  it('refuses a line that costs more than price × quantity says', () => {
    expect(() => buildSaleCheck(sale({ lines: [line({ lineTotalCents: 10001 })], totalCents: 10001, payments: [{ method: 'cash', amountCents: 10001 }] }), { taxes: [] })).toThrow(/більша/);
  });

  it('knows each letter by its ASCII code and by itself', () => {
    expect(letterCode('А')).toBe('A');
    expect(letterCode('Є')).toBe('YE');
    expect(letterCode('Ї')).toBe('YI');
    expect(letterCode('A')).toBeNull(); // the Latin one
    expect(resolveLetter('A', [VAT20])).toBe(VAT20);
    expect(resolveLetter('А', [VAT20])).toBe(VAT20);
    expect(resolveLetter('B', [VAT20])).toBeNull();
  });

  it('normalises an owner table and refuses what the provider would choke on', () => {
    expect(normalizeTaxTable([{ letter: ' б ', name: ' ПДВ ', rate: 7 }])).toEqual([{ letter: 'Б', name: 'ПДВ', type: 0, rate: 7 }]);
    expect(normalizeTaxTable(undefined)).toEqual([]);
    expect(normalizeTaxTable([{ letter: 'А', name: 'ПДВ', rate: 7.15 }])[0].rate).toBe(7.15);

    const refuse = (raw: unknown, words: RegExp) => expect(() => normalizeTaxTable(raw)).toThrow(words);
    refuse([{ letter: 'A', name: 'ПДВ', rate: 20 }], /кириличною/);
    refuse([{ letter: 'А', name: 'ПДВ', rate: 20 }, { letter: 'а', name: 'ПДВ', rate: 7 }], /уже є/);
    refuse([{ letter: 'А', name: 'ПДВ', rate: 120 }], /від 0 до 100/);
    refuse([{ letter: 'А', name: 'ПДВ', rate: 7.155 }], /двох знаків/);
    refuse([{ letter: 'А', name: '  ', rate: 20 }], /назва/);
    refuse([{ letter: 'Г', name: 'Акциз', rate: 5, type: 1 }], /лише ПДВ/);
    refuse({ letter: 'А' }, /списком/);
    refuse(Array.from({ length: 11 }, (_, i) => ({ letter: 'А', name: `n${i}`, rate: 0 })), /не більше 10/);
    expect(() => normalizeTaxTable([{ letter: 'A', name: 'x', rate: 1 }])).toThrow(DpsTaxTableError);
  });
});

describe('ДПС error names', () => {
  it('maps by name, never by number, and defaults to unknown', () => {
    expect(dpsErrorKind('DuplicatedRequestUid')).toBe('duplicate');
    expect(dpsErrorKind('UndefinedRegistrarState')).toBe('auth_expired');
    expect(dpsErrorKind('DocumentValidationError')).toBe('rejected');
    expect(dpsErrorKind('ShiftNotOpened')).toBe('shift_closed');
    expect(dpsErrorKind('CryptographyError')).toBe('auth_rejected');
    expect(dpsErrorKind('InconsistentRegistrarState')).toBe('unknown');
    expect(dpsErrorKind('13')).toBe('unknown');
    expect(dpsErrorKind('SomethingNew')).toBe('unknown');
    expect(dpsErrorKind(null)).toBe('unknown');
  });
});
