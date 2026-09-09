// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { CheckboxReceipt } from '../pos/fiscal/providers/checkbox/client.js';
import {
  mapSellPayload,
  mapServicePayload,
  toFiscalResult,
} from '../pos/fiscal/providers/checkbox/payload.js';
import type { FiscalDocLine, FiscalRefundDoc, FiscalSaleDoc, FiscalServiceDoc } from '../pos/fiscal/types.js';

function line(overrides: Partial<FiscalDocLine> = {}): FiscalDocLine {
  return {
    name: 'Футболка (M)',
    quantityMilli: 1000,
    unitPriceCents: 20000,
    lineTotalCents: 18000, // discounted from 20000
    discountCents: 2000,
    taxCode: '8',
    barcode: null,
    uktzed: null,
    sourceLineRef: '1',
    ...overrides,
  };
}

function saleDoc(overrides: Partial<FiscalSaleDoc> = {}): FiscalSaleDoc {
  return {
    kind: 'sale',
    requestId: 'req-1',
    ourNumber: 'R-00001',
    cashierName: 'Оля',
    lines: [line()],
    payments: [{ method: 'cash', amountCents: 18000 }],
    totalCents: 18000,
    discountCents: 2000,
    ...overrides,
  };
}

describe('mapSellPayload — sale', () => {
  it('sends the pre-discount price plus a derived VALUE discount, not total_sum', () => {
    // total_sum (Checkbox's price×quantity override) is organization-gated —
    // a real sandbox sell failed live with `organization.option_disabled`
    // when this test org had it off. discounts[{mode:'VALUE'}] is the base
    // mechanism every organization supports.
    const payload = mapSellPayload(saleDoc());
    expect(payload.goods[0].good.price).toBe(20000);
    expect(payload.goods[0]).not.toHaveProperty('total_sum');
    expect(payload.goods[0].discounts).toEqual([{ type: 'DISCOUNT', mode: 'VALUE', value: 2000 }]);
  });

  it('omits discounts entirely when the line has none', () => {
    const payload = mapSellPayload(saleDoc({ lines: [line({ unitPriceCents: 18000, lineTotalCents: 18000, discountCents: 0 })] }));
    expect(payload.goods[0]).not.toHaveProperty('discounts');
  });

  it('derives the discount from the price/total delta, not from discountCents — matters for refunds', () => {
    // mapping.ts always zeroes discountCents on a refund line even when the
    // original sale had one; trusting it here would understate the discount.
    const payload = mapSellPayload(
      saleDoc({ lines: [line({ unitPriceCents: 20000, lineTotalCents: 15000, discountCents: 0 })] })
    );
    expect(payload.goods[0].discounts).toEqual([{ type: 'DISCOUNT', mode: 'VALUE', value: 5000 }]);
  });

  it('carries the requestId as the receipt id and the cashier name', () => {
    const payload = mapSellPayload(saleDoc({ requestId: 'abc-123', cashierName: 'Іван' }));
    expect(payload.id).toBe('abc-123');
    expect(payload.cashier_name).toBe('Іван');
  });

  it('converts a string tax code to a numeric array', () => {
    const payload = mapSellPayload(saleDoc({ lines: [line({ taxCode: '8' })] }));
    expect(payload.goods[0].good.tax).toEqual([8]);
  });

  it('omits tax entirely when the line has no resolved tax code', () => {
    const payload = mapSellPayload(saleDoc({ lines: [line({ taxCode: null })] }));
    expect(payload.goods[0].good).not.toHaveProperty('tax');
  });

  it('does not mark sale lines as returns', () => {
    const payload = mapSellPayload(saleDoc());
    expect(payload.goods[0].is_return).toBeUndefined();
  });

  it('maps card and qr payments both to CASHLESS', () => {
    const card = mapSellPayload(saleDoc({ payments: [{ method: 'card', amountCents: 18000 }] }));
    const qr = mapSellPayload(saleDoc({ payments: [{ method: 'qr', amountCents: 18000 }] }));
    expect(card.payments[0]).toEqual({ type: 'CASHLESS', value: 18000 });
    expect(qr.payments[0]).toEqual({ type: 'CASHLESS', value: 18000 });
  });

  it('maps cash payments to CASH', () => {
    const payload = mapSellPayload(saleDoc());
    expect(payload.payments[0]).toEqual({ type: 'CASH', value: 18000 });
  });
});

describe('mapSellPayload — refund', () => {
  function refundDoc(overrides: Partial<FiscalRefundDoc> = {}): FiscalRefundDoc {
    return {
      kind: 'refund',
      requestId: 'req-2',
      ourNumber: 'RF-00001',
      cashierName: 'Оля',
      lines: [line({ discountCents: 0 })],
      payments: [{ method: 'cash', amountCents: 18000 }],
      totalCents: 18000,
      discountCents: 0,
      relatedProviderDocId: 'orig-receipt-id',
      relatedOurNumber: 'R-00001',
      ...overrides,
    };
  }

  it('marks every line as a return', () => {
    const payload = mapSellPayload(refundDoc());
    expect(payload.goods[0].is_return).toBe(true);
  });

  it('references the original sale via related_receipt_id', () => {
    const payload = mapSellPayload(refundDoc({ relatedProviderDocId: 'orig-id-xyz' }));
    expect(payload.related_receipt_id).toBe('orig-id-xyz');
  });
});

describe('mapServicePayload', () => {
  function serviceDoc(overrides: Partial<FiscalServiceDoc> = {}): FiscalServiceDoc {
    return {
      kind: 'service_in',
      requestId: 'req-3',
      ourNumber: 'S-00001',
      cashierName: 'Оля',
      amountCents: 5000,
      ...overrides,
    };
  }

  it('sends a positive value for service_in (cash deposited)', () => {
    const payload = mapServicePayload(serviceDoc({ kind: 'service_in', amountCents: 5000 }));
    expect(payload.payment).toEqual({ type: 'CASH', value: 5000 });
  });

  it('sends a negative value for service_out (cash withdrawn)', () => {
    const payload = mapServicePayload(serviceDoc({ kind: 'service_out', amountCents: 5000 }));
    expect(payload.payment).toEqual({ type: 'CASH', value: -5000 });
  });

  it('carries the requestId as the receipt id', () => {
    const payload = mapServicePayload(serviceDoc({ requestId: 'svc-req-9' }));
    expect(payload.id).toBe('svc-req-9');
  });
});

describe('toFiscalResult', () => {
  function receipt(overrides: Partial<CheckboxReceipt> = {}): CheckboxReceipt {
    return {
      id: 'receipt-1',
      status: 'DONE',
      fiscal_code: 'TEST-abc123',
      fiscal_date: '2026-09-09T10:28:55.512968+00:00',
      tax_url: 'https://cabinet.tax.gov.ua/cashregs/check?id=TEST-abc123',
      transaction: null,
      ...overrides,
    };
  }

  it('maps the provider doc id, fiscal code, and date', () => {
    const result = toFiscalResult(receipt());
    expect(result.providerDocId).toBe('receipt-1');
    expect(result.fiscalCode).toBe('TEST-abc123');
    expect(result.fiscalDate).toBe('2026-09-09T10:28:55.512968+00:00');
  });

  it('uses tax_url as both taxUrl and qrPayload — Checkbox gives no separate raw QR data', () => {
    const result = toFiscalResult(receipt({ tax_url: 'https://cabinet.tax.gov.ua/x' }));
    expect(result.taxUrl).toBe('https://cabinet.tax.gov.ua/x');
    expect(result.qrPayload).toBe('https://cabinet.tax.gov.ua/x');
  });

  it('keeps the raw receipt for support diagnosis', () => {
    const r = receipt();
    expect(toFiscalResult(r).raw).toBe(r);
  });

  it('accepts a still-CREATED receipt with a null fiscal code, honestly reflecting that state', () => {
    const result = toFiscalResult(receipt({ status: 'CREATED', fiscal_code: null, tax_url: null }));
    expect(result.fiscalCode).toBeNull();
  });
});
