// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A receipt that closes goods money was taken toward earlier as «внески»
// (078) prints the unit price over a smaller sum; the line says why.

import { describe, expect, it } from 'vitest';
import { buildReceiptPayload } from '@pos/platform';
import type { SaleDetail } from '@pos/platform';
import { chainRefundReceipt, withPrepaidNotes, withPrepaymentLine } from './useReceiptPrint';

function sale(items: Array<Partial<SaleDetail['items'][number]> & { debt_prepaid_cents?: number }>): SaleDetail {
  return {
    id: 55,
    receipt_number: 'R-0000055',
    status: 'completed',
    subtotal_cents: 29000,
    total_cents: 29000,
    rounding_cents: 0,
    payments: [{ id: 1, method: 'cash', amount_cents: 29000 }],
    refunds: [],
    created_at: '2026-10-25T10:00:00Z',
    staff_name: 'Олена',
    fiscal_status: 'none',
    fiscal: null,
    items: items.map((item, index) => ({
      id: index + 1,
      variant_id: 10 + index,
      product_name: 'Кепка',
      variant_label: '',
      quantity: 1,
      unit_price_cents: 59000,
      line_total_cents: 29000,
      refunded_quantity: 0,
      ...item,
    })),
  } as unknown as SaleDetail;
}

const store = { name: 'Крамниця', fiscal: null, vertical: null };

describe('withPrepaidNotes', () => {
  it('says under a line how much was paid toward it earlier, in the receipt’s own figures', () => {
    const detail = sale([{ debt_prepaid_cents: 30000 }, { product_name: 'Хліб', unit_price_cents: 3200, line_total_cents: 3200 }]);
    const receipt = withPrepaidNotes(buildReceiptPayload(detail, store), detail);
    expect(receipt.items[0].note).toBe('Внесено раніше: 300.00');
    expect(receipt.items[1].note).toBeUndefined();
  });

  it('keeps a note the line already had — a hand-typed weight', () => {
    const detail = sale([
      { debt_prepaid_cents: 5000, quantity: 350, unit: 'г', price_per: 1000, weight_source: 'manual' },
    ]);
    const receipt = withPrepaidNotes(buildReceiptPayload(detail, store), detail);
    expect(receipt.items[0].note).toBe('вагу введено вручну · Внесено раніше: 50.00');
  });

  it('leaves an ordinary receipt exactly as the host built it', () => {
    const detail = sale([{ line_total_cents: 59000 }]);
    const built = buildReceiptPayload(detail, store);
    expect(withPrepaidNotes(built, detail)).toBe(built);
  });
});

describe('withPrepaymentLine', () => {
  const prepayment = {
    ...sale([]),
    id: 57,
    receipt_number: 'R-0000057',
    subtotal_cents: 30000,
    total_cents: 30000,
    items: [],
    fiscal_chain_id: 'ls-1-000003-1',
    debt_prepayment: { line_id: 3, product_name: 'Кепка', variant_label: 'L', amount_cents: 30000 },
  } as unknown as SaleDetail;

  it('gives a «внесок» our layout prints one line for the money, the goods and the chain', () => {
    const receipt = withPrepaymentLine(buildReceiptPayload(prepayment, store), prepayment);
    expect(receipt.items).toEqual([
      {
        name: 'Передплата за «Кепка · L»',
        variant_label: '',
        quantity: 1,
        unit_price_cents: 30000,
        line_total_cents: 30000,
        note: 'Замовлення № ls-1-000003-1',
      },
    ]);
  });

  it('leaves the provider’s own text alone, and every receipt with goods', () => {
    const withText = { ...buildReceiptPayload(prepayment, store), provider_text: 'ЧЕК ПЕРЕДПЛАТИ' };
    expect(withPrepaymentLine(withText, prepayment).items).toEqual([]);
    const detail = sale([{ line_total_cents: 59000 }]);
    const receipt = buildReceiptPayload(detail, store);
    expect(withPrepaymentLine(receipt, detail)).toBe(receipt);
  });
});

describe('chainRefundReceipt — the return receipts of a chain given back (2-Б)', () => {
  const store = { name: 'Крамниця', fiscal: null, vertical: null };
  const refund = {
    id: 9,
    refund_number: 'RF-0000009',
    client_uuid: null,
    method: 'cash',
    total_cents: 30000,
    cash_rounding: 0,
    rounding_cents: 0,
    reason: 'Скасування внеску',
    staff_name: 'Олена',
    created_at: '2026-10-25T12:00:00Z',
    fiscal_status: 'done',
    fiscal: null,
    items: [],
  };
  const prepayment = {
    ...sale([]),
    id: 57,
    receipt_number: 'R-0000057',
    total_cents: 30000,
    items: [],
    status: 'refunded',
    refunds: [refund],
    fiscal_chain_id: 'ls-1-000003-1',
    debt_prepayment: { line_id: 3, product_name: 'Кепка', variant_label: 'L', amount_cents: 30000 },
  } as unknown as SaleDetail;

  it('prints a «внесок» given back as a return receipt with one line for its money', () => {
    const receipt = chainRefundReceipt(prepayment, 9, store)!;
    expect(receipt.kind).toBe('refund');
    expect(receipt.receipt_number).toBe('RF-0000009');
    expect(receipt.refund_of_receipt).toBe('R-0000057');
    expect(receipt.items).toEqual([expect.objectContaining({ name: 'Передплата за «Кепка · L»', line_total_cents: 30000 })]);
    expect(receipt.payments).toEqual([{ method: 'cash', amount_cents: 30000 }]);
  });

  it('carries the provider’s text of the return document this call registered', () => {
    const fiscal = {
      status: 'done',
      fiscal_code: 'FAKE000042',
      fiscal_date: '2026-10-25T12:00:00Z',
      tax_url: 'https://cabinet.tax.gov.ua/x',
      qr_payload: null,
      receipt_text: 'ВИДАТКОВИЙ ЧЕК',
      error_code: null,
      message: null,
    };
    const receipt = chainRefundReceipt(prepayment, 9, store, fiscal)!;
    expect(receipt.provider_text).toBe('ВИДАТКОВИЙ ЧЕК');
    expect(receipt.items).toEqual([]);
  });

  it('knows no refund it was not given', () => {
    expect(chainRefundReceipt(prepayment, 99, store)).toBeNull();
  });
});
