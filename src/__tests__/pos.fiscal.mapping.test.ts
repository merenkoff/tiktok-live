// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.mapping.test.ts
//
// `src/pos/fiscal/mapping.ts` — our sale/refund rows → a provider-neutral
// fiscal document. No database, no provider.
//
// The assertion that matters most is arithmetic: the lines of a fiscal document
// must sum to its total, exactly, including on a receipt whose cart discount
// did not divide evenly. A provider answers a mismatch with an opaque 422 at
// the till, mid-checkout, so it has to be impossible before it leaves here.

import { describe, expect, it } from 'vitest';
import {
  allocateCartDiscount,
  refundLineAmount,
} from '../pos/sales.service.js';
import {
  buildRefundDoc,
  buildSaleDoc,
  buildServiceDoc,
  fiscalLineName,
  type SaleInput,
} from '../pos/fiscal/mapping.js';
import { FiscalError } from '../pos/fiscal/errors.js';

const NO_TAX = { byItemId: {}, fallback: null };

function sale(overrides: Partial<SaleInput> = {}): SaleInput {
  return {
    receipt_number: 'R-00042',
    staff_name: 'Оля',
    total_cents: 30000,
    cart_discount_cents: 0,
    items: [
      {
        id: 1,
        product_name: 'Сукня',
        variant_label: 'M / чорна',
        quantity: 2,
        unit_price_cents: 10000,
        line_total_cents: 20000,
        line_discount_cents: 0,
      },
      {
        id: 2,
        product_name: 'Пояс',
        variant_label: '',
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
        line_discount_cents: 0,
      },
    ],
    payments: [{ method: 'cash', amount_cents: 30000 }],
    ...overrides,
  };
}

describe('fiscal document mapping', () => {
  describe('line names', () => {
    it('appends the variant label only when there is one', () => {
      expect(fiscalLineName('Сукня', 'M / чорна')).toBe('Сукня (M / чорна)');
      // pos_sale_items.variant_label defaults to '', so this is the common case.
      expect(fiscalLineName('Пояс', '')).toBe('Пояс');
      expect(fiscalLineName(' Пояс ', '   ')).toBe('Пояс');
    });
  });

  describe('buildSaleDoc', () => {
    it('maps a plain sale', () => {
      const doc = buildSaleDoc({ requestId: 'req-1', sale: sale(), tax: NO_TAX });

      expect(doc.kind).toBe('sale');
      expect(doc.requestId).toBe('req-1');
      expect(doc.ourNumber).toBe('R-00042');
      expect(doc.cashierName).toBe('Оля');
      expect(doc.totalCents).toBe(30000);
      expect(doc.lines).toHaveLength(2);
      expect(doc.lines[0]).toMatchObject({
        name: 'Сукня (M / чорна)',
        quantityMilli: 2000,
        unitPriceCents: 10000,
        lineTotalCents: 20000,
        sourceLineRef: '1',
      });
      expect(doc.payments).toEqual([
        { method: 'cash', amountCents: 30000, providerRef: null },
      ]);
    });

    it('expresses whole units as thousandths', () => {
      const doc = buildSaleDoc({ requestId: 'r', sale: sale(), tax: NO_TAX });
      expect(doc.lines.map((l) => l.quantityMilli)).toEqual([2000, 1000]);
    });

    it('resolves the tax code per product, falling back to the store default', () => {
      const doc = buildSaleDoc({
        requestId: 'r',
        sale: sale(),
        tax: { byItemId: { 1: 'B' }, fallback: 'A' },
      });
      expect(doc.lines.map((l) => l.taxCode)).toEqual(['B', 'A']);
    });

    it('treats an empty per-product code as absent', () => {
      const doc = buildSaleDoc({
        requestId: 'r',
        sale: sale(),
        tax: { byItemId: { 1: '', 2: null }, fallback: 'A' },
      });
      expect(doc.lines.map((l) => l.taxCode)).toEqual(['A', 'A']);
    });

    it('leaves the tax code null when nothing resolves it', () => {
      const doc = buildSaleDoc({ requestId: 'r', sale: sale(), tax: NO_TAX });
      expect(doc.lines.every((l) => l.taxCode === null)).toBe(true);
    });

    it('carries barcodes and УКТЗЕД when supplied', () => {
      const doc = buildSaleDoc({
        requestId: 'r',
        sale: sale(),
        tax: NO_TAX,
        codes: { byItemId: { 1: '4820000000017' }, uktzedByItemId: { 2: '6217109000' } },
      });
      expect(doc.lines[0].barcode).toBe('4820000000017');
      expect(doc.lines[0].uktzed).toBeNull();
      expect(doc.lines[1].uktzed).toBe('6217109000');
    });

    it('refuses a sale with no items', () => {
      expect(() =>
        buildSaleDoc({ requestId: 'r', sale: sale({ items: [] }), tax: NO_TAX })
      ).toThrow(FiscalError);
    });

    it('refuses an unsupported payment method', () => {
      expect(() =>
        buildSaleDoc({
          requestId: 'r',
          sale: sale({ payments: [{ method: 'bitcoin', amount_cents: 30000 }] }),
          tax: NO_TAX,
        })
      ).toThrow(/Unsupported payment method/);
    });

    it('refuses a document whose lines do not sum to its total', () => {
      expect(() =>
        buildSaleDoc({ requestId: 'r', sale: sale({ total_cents: 29999 }), tax: NO_TAX })
      ).toThrow(/lines sum to 30000 but the document total is 29999/);
    });
  });

  describe('cart-discount rounding', () => {
    // The real hazard: `allocateCartDiscount` gives the LAST eligible line the
    // rounding remainder (sales.service.ts). If the mapping recomputed line
    // money from unit price × quantity instead of reading line_total_cents, the
    // document would be off by a cent or two and the provider would reject it.
    it('survives a 33% cart discount split across three uneven lines', () => {
      const pre = [3333, 6667, 10000];
      const { lineDiscounts, cartDiscountCents } = allocateCartDiscount(
        pre.map((p) => ({ pre_discount_total: p, has_product_discount: false })),
        { type: 'percent', value: 33 }
      );

      const items = pre.map((p, i) => ({
        id: i + 1,
        product_name: `Товар ${i + 1}`,
        variant_label: '',
        quantity: 1,
        unit_price_cents: p,
        line_total_cents: p - lineDiscounts[i],
        line_discount_cents: lineDiscounts[i],
      }));
      const total = items.reduce((a, i) => a + i.line_total_cents, 0);
      // Sanity: the allocation really did leave an awkward remainder.
      expect(total).toBe(pre.reduce((a, b) => a + b, 0) - cartDiscountCents);

      const doc = buildSaleDoc({
        requestId: 'r',
        sale: sale({
          items,
          total_cents: total,
          cart_discount_cents: cartDiscountCents,
          payments: [{ method: 'card', amount_cents: total }],
        }),
        tax: NO_TAX,
      });

      expect(doc.lines.reduce((a, l) => a + l.lineTotalCents, 0)).toBe(doc.totalCents);
      expect(doc.discountCents).toBe(cartDiscountCents);
    });
  });

  describe('buildRefundDoc', () => {
    const original = sale();

    it('maps a partial refund against the fiscalised sale', () => {
      const doc = buildRefundDoc({
        requestId: 'req-r1',
        relatedProviderDocId: 'provider-doc-9',
        sale: original,
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-00001',
          staff_name: 'Оля',
          method: 'cash',
          total_cents: 10000,
          reason: 'не підійшов розмір',
          lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
        },
      });

      expect(doc.kind).toBe('refund');
      expect(doc.relatedProviderDocId).toBe('provider-doc-9');
      expect(doc.relatedOurNumber).toBe('R-00042');
      expect(doc.ourNumber).toBe('RF-00001');
      expect(doc.lines).toEqual([
        expect.objectContaining({
          name: 'Сукня (M / чорна)',
          quantityMilli: 1000,
          lineTotalCents: 10000,
          discountCents: 0,
          sourceLineRef: '1',
        }),
      ]);
      expect(doc.payments).toEqual([{ method: 'cash', amountCents: 10000 }]);
    });

    it('uses the amounts the refund document recorded, not a recomputation', () => {
      // A discounted line: 3 units for 10000 total. Refunding one unit is 3333,
      // and refundLineAmount is the single source of that number.
      const discounted = sale({
        total_cents: 10000,
        items: [
          {
            id: 7,
            product_name: 'Худі',
            variant_label: 'L',
            quantity: 3,
            unit_price_cents: 5000,
            line_total_cents: 10000,
            line_discount_cents: 5000,
          },
        ],
        payments: [{ method: 'card', amount_cents: 10000 }],
      });
      const amount = refundLineAmount(10000, 3, 0, 1);
      expect(amount).toBe(3333);

      const doc = buildRefundDoc({
        requestId: 'req-r2',
        relatedProviderDocId: 'provider-doc-9',
        sale: discounted,
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-00002',
          staff_name: 'Оля',
          method: 'card',
          total_cents: amount,
          lines: [{ sale_item_id: 7, quantity: 1, amount_cents: amount }],
        },
      });

      expect(doc.lines[0].lineTotalCents).toBe(3333);
      expect(doc.totalCents).toBe(3333);
    });

    it('falls back to cash for a refund row that predates pos_refunds.method', () => {
      const doc = buildRefundDoc({
        requestId: 'r',
        relatedProviderDocId: 'd',
        sale: original,
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-1',
          staff_name: 'Оля',
          method: null,
          total_cents: 10000,
          lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
        },
      });
      expect(doc.payments[0].method).toBe('cash');
    });

    it('refuses a refund with no original fiscal document', () => {
      expect(() =>
        buildRefundDoc({
          requestId: 'r',
          relatedProviderDocId: '',
          sale: original,
          tax: NO_TAX,
          refund: {
            refund_number: 'RF-1',
            staff_name: 'Оля',
            method: 'cash',
            total_cents: 10000,
            lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
          },
        })
      ).toThrow(/without the original receipt/);
    });

    it('refuses a line that is not on the sale', () => {
      expect(() =>
        buildRefundDoc({
          requestId: 'r',
          relatedProviderDocId: 'd',
          sale: original,
          tax: NO_TAX,
          refund: {
            refund_number: 'RF-1',
            staff_name: 'Оля',
            method: 'cash',
            total_cents: 100,
            lines: [{ sale_item_id: 999, quantity: 1, amount_cents: 100 }],
          },
        })
      ).toThrow(/not on the sale/);
    });

    it('refuses a refund whose lines do not sum to its total', () => {
      expect(() =>
        buildRefundDoc({
          requestId: 'r',
          relatedProviderDocId: 'd',
          sale: original,
          tax: NO_TAX,
          refund: {
            refund_number: 'RF-1',
            staff_name: 'Оля',
            method: 'cash',
            total_cents: 9999,
            lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
          },
        })
      ).toThrow(/lines sum to 10000 but the document total is 9999/);
    });
  });

  describe('buildServiceDoc', () => {
    it('picks the direction from the sign of the amount', () => {
      const base = { requestId: 'r', ourNumber: 'SV-1', cashierName: 'Оля' };
      expect(buildServiceDoc({ ...base, amountCents: 50000 })).toMatchObject({
        kind: 'service_in',
        amountCents: 50000,
      });
      expect(buildServiceDoc({ ...base, amountCents: -50000 })).toMatchObject({
        kind: 'service_out',
        amountCents: 50000,
      });
    });

    it('refuses a zero amount', () => {
      expect(() =>
        buildServiceDoc({ requestId: 'r', ourNumber: 'SV-1', cashierName: 'Оля', amountCents: 0 })
      ).toThrow(FiscalError);
    });
  });
});
