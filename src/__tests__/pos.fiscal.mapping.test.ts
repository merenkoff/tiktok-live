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

    it('carries the unit a line is counted in, only when the item names one', () => {
      const base = sale();
      const doc = buildSaleDoc({
        requestId: 'r',
        sale: { ...base, items: [{ ...base.items[0], unit: 'г' }, base.items[1]] },
        tax: NO_TAX,
      });
      expect(doc.lines[0].unit).toBe('г');
      // An item without a unit keeps the line exactly what it was before
      // contract v2 — what lets stored payloads and the Checkbox adapter go on.
      expect('unit' in doc.lines[1]).toBe(false);
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

  describe('cash rounding (TechDocs/POS_CASH_ROUNDING.md)', () => {
    it('leaves a sale without rounding exactly as it was', () => {
      expect(buildSaleDoc({ requestId: 'r', sale: sale(), tax: NO_TAX }).cashRounding).toBeNull();
      expect(
        buildSaleDoc({ requestId: 'r', sale: sale({ cash_rounding: 50, rounding_cents: 0 }), tax: NO_TAX })
          .cashRounding
      ).toBeNull();
    });

    it('carries the step and the amount, and keeps the lines and the total', () => {
      const doc = buildSaleDoc({
        requestId: 'r',
        sale: sale({ cash_rounding: 50, rounding_cents: -23, payments: [{ method: 'cash', amount_cents: 50000 }] }),
        tax: NO_TAX,
      });
      expect(doc.cashRounding).toEqual({ step: 50, amountCents: -23 });
      expect(doc.totalCents).toBe(30000);
      expect(doc.payments).toEqual([{ method: 'cash', amountCents: 50000, providerRef: null }]);
    });

    it('refuses a rounding with no known step rather than guess one', () => {
      expect(() =>
        buildSaleDoc({ requestId: 'r', sale: sale({ cash_rounding: 0, rounding_cents: -3 }), tax: NO_TAX })
      ).toThrow(FiscalError);
    });

    it('pays a cash refund out at the rounded sum', () => {
      const doc = buildRefundDoc({
        requestId: 'rr',
        relatedProviderDocId: 'p',
        sale: sale(),
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-1',
          staff_name: 'Оля',
          method: 'cash',
          total_cents: 10000,
          cash_rounding: 50,
          rounding_cents: -24,
          lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
        },
      });
      expect(doc.totalCents).toBe(10000);
      expect(doc.payments).toEqual([{ method: 'cash', amountCents: 9976 }]);
      expect(doc.cashRounding).toEqual({ step: 50, amountCents: -24 });
    });

    it('refuses rounding on a refund that goes back to the card', () => {
      expect(() =>
        buildRefundDoc({
          requestId: 'rr',
          relatedProviderDocId: 'p',
          sale: sale(),
          tax: NO_TAX,
          refund: {
            refund_number: 'RF-1',
            staff_name: 'Оля',
            method: 'card',
            total_cents: 10000,
            cash_rounding: 50,
            rounding_cents: -24,
            lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
          },
        })
      ).toThrow(FiscalError);
    });
  });

  describe('buildRefundDoc', () => {
    const original = sale();

    it('takes the unit of a returned line from the sale item', () => {
      const withUnit = { ...original, items: [{ ...original.items[0], unit: 'мл' }, original.items[1]] };
      const doc = buildRefundDoc({
        requestId: 'req-ru',
        relatedProviderDocId: 'provider-doc-9',
        sale: withUnit,
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-00002',
          staff_name: 'Оля',
          method: 'cash',
          total_cents: 10000,
          lines: [{ sale_item_id: 1, quantity: 1, amount_cents: 10000 }],
        },
      });
      expect(doc.lines[0].unit).toBe('мл');
    });

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

  describe('weighed lines (migration 075, TechDocs/grocery/G4_WEIGHED.md)', () => {
    // 0,350 кг сиру за 189,90 грн/кг: the sale stores 350 g at a price per
    // kilogram and the line comes to 66,47.
    const cheese: SaleInput = sale({
      total_cents: 6647,
      items: [
        {
          id: 7,
          product_name: 'Сир твердий',
          variant_label: '',
          quantity: 350,
          unit_price_cents: 18990,
          line_total_cents: 6647,
          line_discount_cents: 0,
          unit: 'г',
          price_per: 1000,
        },
      ],
      payments: [{ method: 'cash', amount_cents: 10000 }],
    });

    it('sends the grams as thousandths of the kilogram the price is for, in «кг»', () => {
      const doc = buildSaleDoc({ requestId: 'w-1', sale: cheese, tax: NO_TAX });
      expect(doc.lines[0]).toMatchObject({
        quantityMilli: 350,
        unitPriceCents: 18990,
        lineTotalCents: 6647,
        unit: 'кг',
      });
    });

    it('keeps a piece a thousand thousandths, in its own unit', () => {
      const doc = buildSaleDoc({
        requestId: 'w-2',
        sale: sale({
          total_cents: 9180,
          items: [
            {
              id: 8,
              product_name: 'Хліб',
              variant_label: '',
              quantity: 2,
              unit_price_cents: 4590,
              line_total_cents: 9180,
              line_discount_cents: 0,
              unit: 'шт',
              price_per: 1,
            },
          ],
        }),
        tax: NO_TAX,
      });
      expect(doc.lines[0]).toMatchObject({ quantityMilli: 2000, unit: 'шт' });
    });

    it('returns a weighed line whole, with the sale line\'s own quantity and price', () => {
      const doc = buildRefundDoc({
        requestId: 'w-3',
        relatedProviderDocId: 'prov-1',
        sale: cheese,
        tax: NO_TAX,
        refund: {
          refund_number: 'RF-7',
          staff_name: 'Оля',
          method: 'cash',
          total_cents: 6647,
          lines: [{ sale_item_id: 7, quantity: 350, amount_cents: 6647 }],
        },
      });
      expect(doc.lines[0]).toMatchObject({ quantityMilli: 350, unitPriceCents: 18990, lineTotalCents: 6647, unit: 'кг' });
    });

    it('refuses a quantity that is not a whole number of thousandths of the price\'s unit', () => {
      const odd = sale({
        total_cents: 100,
        items: [
          {
            id: 9,
            product_name: 'Дивний',
            variant_label: '',
            quantity: 1,
            unit_price_cents: 100,
            line_total_cents: 100,
            line_discount_cents: 0,
            unit: 'г',
            price_per: 3,
          },
        ],
      });
      expect(() => buildSaleDoc({ requestId: 'w-4', sale: odd, tax: NO_TAX })).toThrow(FiscalError);
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
