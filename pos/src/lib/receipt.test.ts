// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeSaleDetail } from '../test/utils';
import { buildReceiptPayload, buildRefundReceiptPayload } from './receipt';
import type { SaleDetail } from '../types';

function makeRefund(overrides: Partial<SaleDetail['refunds'][number]> = {}): SaleDetail['refunds'][number] {
  return {
    id: 7,
    refund_number: 'RF-00007',
    client_uuid: null,
    method: 'cash',
    total_cents: 22500,
    reason: null,
    staff_name: 'Ігор',
    created_at: '2026-01-02T09:00:00.000Z',
    ...overrides,
  };
}

describe('buildReceiptPayload', () => {
  it('maps a sale onto the printer payload', () => {
    const sale = makeSaleDetail({ cart_discount_cents: 500, total_cents: 44500 });
    const payload = buildReceiptPayload(sale, 'Demo Store');

    expect(payload).toMatchObject({
      store_name: 'Demo Store',
      kind: 'sale',
      receipt_number: 'RC-00010',
      refund_of_receipt: null,
      staff_name: 'Олена',
      customer_name: null,
      subtotal_cents: 45000,
      discount_cents: 500,
      total_cents: 44500,
      payments: [{ method: 'cash', amount_cents: 45000 }],
    });
    expect(payload.items).toEqual([
      {
        name: 'Футболка',
        variant_label: 'Синій / M',
        quantity: 2,
        unit_price_cents: 22500,
        line_total_cents: 45000,
      },
    ]);
    expect(payload.created_at).toEqual(expect.any(String));
  });

  it('prefers the explicitly passed customer over the one on the sale', () => {
    const sale = makeSaleDetail({ customer_name: 'Із чека' });
    expect(buildReceiptPayload(sale, 'Demo Store', 'Явний').customer_name).toBe('Явний');
    expect(buildReceiptPayload(sale, 'Demo Store').customer_name).toBe('Із чека');
  });

  it('falls back to null when the sale carries no cart discount', () => {
    const { cart_discount_cents: _unused, ...rest } = makeSaleDetail();
    expect(buildReceiptPayload(rest as SaleDetail, 'Demo Store').discount_cents).toBeNull();
  });
});

describe('buildReceiptPayload — fiscal', () => {
  const doneDoc = {
    status: 'done',
    fiscal_code: 'TEST-fKbevQ',
    fiscal_date: '2026-09-09T11:59:03.000Z',
    tax_url: 'https://cabinet.tax.gov.ua/cashregs/check?id=TEST-fKbevQ',
    qr_payload: null,
    receipt_text: null,
    error_code: null,
    error_message: null,
  };

  it('carries nothing fiscal for a store that does not fiscalise', () => {
    const payload = buildReceiptPayload(makeSaleDetail(), 'Demo');
    expect(payload.provider_text).toBeNull();
    expect(payload.fiscal).toBeNull();
  });

  it('adds the fiscal block from a done document', () => {
    const payload = buildReceiptPayload(makeSaleDetail({ fiscal: doneDoc }), 'Demo');
    expect(payload.provider_text).toBeNull();
    expect(payload.fiscal).toMatchObject({
      fiscal_code: 'TEST-fKbevQ',
      tax_url: 'https://cabinet.tax.gov.ua/cashregs/check?id=TEST-fKbevQ',
    });
    expect(payload.fiscal?.fiscal_date).toMatch(/2026/);
  });

  it('passes the provider text through when the server shipped one', () => {
    const payload = buildReceiptPayload(
      makeSaleDetail({ fiscal: { ...doneDoc, receipt_text: '=== ЧЕК ===\nСУМА 450.00' } }),
      'Demo'
    );
    expect(payload.provider_text).toBe('=== ЧЕК ===\nСУМА 450.00');
    // The block is still there: the ESC/POS side ignores it when text is
    // present, and an older Rust build that predates `provider_text` gets it.
    expect(payload.fiscal?.fiscal_code).toBe('TEST-fKbevQ');
  });

  it('treats a failed or pending document as no fiscal data at all', () => {
    const failed = buildReceiptPayload(
      makeSaleDetail({ fiscal: { ...doneDoc, status: 'failed', fiscal_code: null } }),
      'Demo'
    );
    expect(failed.fiscal).toBeNull();
    expect(failed.provider_text).toBeNull();
  });

  it('attaches the refund document to a refund receipt', () => {
    const sale = makeSaleDetail();
    const payload = buildRefundReceiptPayload(
      sale,
      makeRefund(),
      [{ sale_item_id: 100, quantity: 1 }],
      'Demo',
      { ...doneDoc, fiscal_code: 'TEST-gnNGVj', message: null, receipt_text: 'REFUND TEXT' }
    );
    expect(payload.provider_text).toBe('REFUND TEXT');
    expect(payload.fiscal?.fiscal_code).toBe('TEST-gnNGVj');
  });
});

describe('buildRefundReceiptPayload', () => {
  it('prices returned units exactly as they were charged', () => {
    // 3 units for 10,00 ₴; one already came back, two more are going back now.
    const sale = makeSaleDetail({
      items: [
        {
          id: 100,
          variant_id: 1,
          product_name: 'Футболка',
          variant_label: 'Синій / M',
          quantity: 3,
          unit_price_cents: 334,
          line_total_cents: 1000,
          refunded_quantity: 3,
        },
      ],
    });
    const payload = buildRefundReceiptPayload(
      sale,
      makeRefund({ total_cents: 667 }),
      [{ sale_item_id: 100, quantity: 2 }],
      'Demo Store'
    );

    expect(payload.kind).toBe('refund');
    expect(payload.refund_of_receipt).toBe('RC-00010');
    expect(payload.items).toEqual([
      {
        name: 'Футболка',
        variant_label: 'Синій / M',
        quantity: 2,
        unit_price_cents: 334, // round(667 / 2)
        line_total_cents: 667,
      },
    ]);
    expect(payload.subtotal_cents).toBe(667);
    expect(payload.total_cents).toBe(667);
    expect(payload.discount_cents).toBeNull();
  });

  it('drops lines that do not belong to the sale', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail(),
      makeRefund(),
      [{ sale_item_id: 999, quantity: 1 }],
      'Demo Store'
    );
    expect(payload.items).toEqual([]);
  });

  it('reports the refund method, not the original payments', () => {
    const sale = makeSaleDetail({ payments: [{ id: 200, method: 'cash', amount_cents: 45000 }] });
    const payload = buildRefundReceiptPayload(
      sale,
      makeRefund({ method: 'card', total_cents: 22500 }),
      [{ sale_item_id: 100, quantity: 1 }],
      'Demo Store'
    );
    expect(payload.payments).toEqual([{ method: 'card', amount_cents: 22500 }]);
  });

  it('prints no payment line for a refund predating the method column', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail(),
      makeRefund({ method: null }),
      [{ sale_item_id: 100, quantity: 1 }],
      'Demo Store'
    );
    expect(payload.payments).toEqual([]);
  });

  it('falls back to RF-<id> when the refund has no document number', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail(),
      makeRefund({ refund_number: null, id: 42 }),
      [],
      'Demo Store'
    );
    expect(payload.receipt_number).toBe('RF-42');
  });
});
