// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { makeSaleDetail } from '../test/utils';
import {
  buildReceiptPayload,
  buildRefundReceiptPayload,
  fiscalBlockComplete,
  taxIdLine,
  type ReceiptStoreInfo,
} from './receipt';
import type { FiscalPublicConfig, FiscalRequisites, SaleDetail } from '../types';

const DEMO: ReceiptStoreInfo = { name: 'Demo' };

const REQUISITES: FiscalRequisites = {
  organization: { name: 'ТОВ «Тест»', edrpou: '12345678', tax_number: '123456789012', is_vat: true },
  point: { name: 'Магазин №1', address: 'м. Київ, вул. Хрещатик, 1' },
  register: { fiscal_number: '4001118166', title: 'Каса 1', address: null },
  taxes: [
    { code: '1', symbol: 'А', label: 'ПДВ 20%', rate: 20, no_vat: false, is_default: true },
    { code: '2', symbol: 'Б', label: 'Без ПДВ', rate: 0, no_vat: true, is_default: false },
  ],
};

function fiscalStore(over: Partial<FiscalPublicConfig> = {}): ReceiptStoreInfo {
  return {
    name: 'Demo',
    fiscal: {
      enabled: true,
      provider: 'checkbox',
      register_fiscal_number: '4001118166',
      requisites: REQUISITES,
      ...over,
    } as FiscalPublicConfig,
  };
}

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
    const payload = buildReceiptPayload(sale, { name: 'Demo Store' });

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
        tax_symbol: null,
      },
    ]);
    expect(payload.created_at).toEqual(expect.any(String));
    // Nothing of the fiscal header for a store that does not fiscalise —
    // but change is arithmetic, not fiscal: 450.00 cash against 445.00.
    expect(payload.header).toBeNull();
    expect(payload.vat_lines).toEqual([]);
    expect(payload.change_cents).toBe(500);
  });

  it('prefers the explicitly passed customer over the one on the sale', () => {
    const sale = makeSaleDetail({ customer_name: 'Із чека' });
    expect(buildReceiptPayload(sale, { name: 'Demo Store' }, 'Явний').customer_name).toBe('Явний');
    expect(buildReceiptPayload(sale, { name: 'Demo Store' }).customer_name).toBe('Із чека');
  });

  it('falls back to null when the sale carries no cart discount', () => {
    const { cart_discount_cents: _unused, ...rest } = makeSaleDetail();
    expect(buildReceiptPayload(rest as SaleDetail, { name: 'Demo Store' }).discount_cents).toBeNull();
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
    const payload = buildReceiptPayload(makeSaleDetail(), DEMO);
    expect(payload.provider_text).toBeNull();
    expect(payload.fiscal).toBeNull();
  });

  it('adds the fiscal block from a done document', () => {
    const payload = buildReceiptPayload(makeSaleDetail({ fiscal: doneDoc }), DEMO);
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
      DEMO
    );
    expect(payload.provider_text).toBe('=== ЧЕК ===\nСУМА 450.00');
    // The block is still there: the ESC/POS side ignores it when text is
    // present, and an older Rust build that predates `provider_text` gets it.
    expect(payload.fiscal?.fiscal_code).toBe('TEST-fKbevQ');
  });

  it('treats a failed or still-registering document as no fiscal data at all', () => {
    const failed = buildReceiptPayload(
      makeSaleDetail({ fiscal: { ...doneDoc, status: 'failed', fiscal_code: null } }),
      DEMO
    );
    expect(failed.fiscal).toBeNull();
    expect(failed.provider_text).toBeNull();

    // An ONLINE pending document has no number of its own yet — nothing to print.
    const pending = buildReceiptPayload(
      makeSaleDetail({ fiscal: { ...doneDoc, status: 'pending', mode: 'online' } }),
      DEMO
    );
    expect(pending.fiscal).toBeNull();
  });

  // ── Offline receipts (TechDocs/POS_FISCAL_OFFLINE.md §4) ──────────────────
  //
  // An offline document is `pending` like the one above, and yet the opposite
  // case: its fiscal number is a real tax-office code from the reserve, and the
  // paper the customer is handed must carry it with the «ОФЛАЙН» mark.

  const offlineDoc = {
    ...doneDoc,
    status: 'pending',
    mode: 'offline' as const,
    fiscal_code: 'OFF-0002',
    control_number: null,
    tax_url: null,
  };

  it('prints an offline-stamped receipt, marked as offline', () => {
    const payload = buildReceiptPayload(makeSaleDetail({ fiscal: offlineDoc }), DEMO);
    expect(payload.fiscal).toMatchObject({
      fiscal_code: 'OFF-0002',
      offline: true,
      control_number: null,
      tax_url: null,
    });
  });

  it('carries the control number once the replay brought it back', () => {
    const payload = buildReceiptPayload(
      makeSaleDetail({
        fiscal: { ...offlineDoc, control_number: '9933', tax_url: 'https://cabinet.tax.gov.ua/x' },
      }),
      DEMO
    );
    expect(payload.fiscal).toMatchObject({ offline: true, control_number: '9933' });
  });

  it('does not mark an ordinary online receipt as offline', () => {
    const payload = buildReceiptPayload(makeSaleDetail({ fiscal: doneDoc }), DEMO);
    expect(payload.fiscal?.offline).toBe(false);
  });

  it('attaches the refund document to a refund receipt', () => {
    const sale = makeSaleDetail();
    const payload = buildRefundReceiptPayload(
      sale,
      makeRefund(),
      [{ sale_item_id: 100, quantity: 1 }],
      DEMO,
      { ...doneDoc, fiscal_code: 'TEST-gnNGVj', message: null, receipt_text: 'REFUND TEXT' }
    );
    expect(payload.provider_text).toBe('REFUND TEXT');
    expect(payload.fiscal?.fiscal_code).toBe('TEST-gnNGVj');
  });
});

describe('buildReceiptPayload — Положення № 13 layout (TechDocs/POS_FISCAL_OFFLINE.md, «Фаза 8в»)', () => {
  const doneDoc = {
    status: 'done',
    fiscal_code: 'TEST-fKbevQ',
    fiscal_date: '2026-09-09T11:59:03.000Z',
    tax_url: 'https://cabinet.tax.gov.ua/x',
    qr_payload: null,
    receipt_text: null,
    error_code: null,
    error_message: null,
  };

  it('prints the header (рядки 1–5) from the cached requisites', () => {
    const payload = buildReceiptPayload(makeSaleDetail(), fiscalStore());
    expect(payload.header).toEqual({
      org_name: 'ТОВ «Тест»',
      point_name: 'Магазин №1',
      address: 'м. Київ, вул. Хрещатик, 1',
      tax_id_line: 'ПН 123456789012',
    });
    // The trade sign stays on top; the header is the legal entity under it.
    expect(payload.store_name).toBe('Demo');
  });

  it('falls back to the register title/address when the point has none', () => {
    const payload = buildReceiptPayload(
      makeSaleDetail(),
      fiscalStore({
        requisites: {
          ...REQUISITES,
          point: { name: null, address: null },
          register: { fiscal_number: 'FN', title: 'Каса 1', address: 'вул. Інша, 2' },
        },
      })
    );
    expect(payload.header).toMatchObject({ point_name: 'Каса 1', address: 'вул. Інша, 2' });
  });

  it('marks every line with the default rate letter and adds the VAT line (рядки 11, 21)', () => {
    const sale = makeSaleDetail({ total_cents: 45000 });
    const payload = buildReceiptPayload(sale, fiscalStore());
    expect(payload.items.map((i) => i.tax_symbol)).toEqual(['А']);
    // Prices include VAT: 450.00 × 20 / 120 = 75.00.
    expect(payload.vat_lines).toEqual([{ symbol: 'А', rate: 20, amount_cents: 7500 }]);
  });

  it('prints no VAT line for a non-VAT default rate', () => {
    const payload = buildReceiptPayload(
      makeSaleDetail(),
      fiscalStore({
        requisites: {
          ...REQUISITES,
          taxes: [{ code: '2', symbol: 'Б', label: 'Без ПДВ', rate: 0, no_vat: true, is_default: true }],
        },
      })
    );
    expect(payload.items[0].tax_symbol).toBe('Б');
    expect(payload.vat_lines).toEqual([]);
  });

  it('follows the store\'s default tax code over the provider\'s default rate', () => {
    // The sale was fiscalised under code 2 («Б», no VAT): that is the letter
    // the paper must show, whatever Checkbox marks as its default.
    const payload = buildReceiptPayload(makeSaleDetail(), fiscalStore({ default_tax_code: '2' }));
    expect(payload.items[0].tax_symbol).toBe('Б');
    expect(payload.vat_lines).toEqual([]);
    // An unknown code falls back to the provider's default.
    expect(
      buildReceiptPayload(makeSaleDetail(), fiscalStore({ default_tax_code: '99' })).items[0]
        .tax_symbol
    ).toBe('А');
  });

  it('computes the change for a cash overpayment (рядок 25)', () => {
    const sale = makeSaleDetail({
      total_cents: 45000,
      payments: [{ id: 200, method: 'cash', amount_cents: 50000 }],
    });
    expect(buildReceiptPayload(sale, DEMO).change_cents).toBe(5000);
    // Card is exact by construction; a split with cash still returns change.
    const card = makeSaleDetail({
      total_cents: 45000,
      payments: [{ id: 200, method: 'card', amount_cents: 50000 }],
    });
    expect(buildReceiptPayload(card, DEMO).change_cents).toBeNull();
  });

  it('carries the mode, the register number and the producer in the fiscal block (рядки 31, 34, 35)', () => {
    const payload = buildReceiptPayload(makeSaleDetail({ fiscal: doneDoc }), fiscalStore());
    expect(payload.fiscal).toMatchObject({
      mode: 'online',
      offline: false,
      register_fiscal_number: '4001118166',
      producer: 'ПРРО Checkbox',
    });
  });

  it('takes the register number from the requisites when the column is not filled yet', () => {
    const payload = buildReceiptPayload(
      makeSaleDetail({ fiscal: doneDoc }),
      fiscalStore({ register_fiscal_number: null })
    );
    expect(payload.fiscal?.register_fiscal_number).toBe('4001118166');
  });

  it('prints no header, letters or VAT when fiscalisation is switched off', () => {
    // Requisites may still be cached from before; the paper follows the switch.
    const payload = buildReceiptPayload(makeSaleDetail(), fiscalStore({ enabled: false }));
    expect(payload.header).toBeNull();
    expect(payload.items[0].tax_symbol).toBeNull();
    expect(payload.vat_lines).toEqual([]);
  });

  it('a refund carries the header and letters, never change', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail({
        payments: [{ id: 200, method: 'cash', amount_cents: 45000 }],
      }),
      makeRefund({ total_cents: 22500 }),
      [{ sale_item_id: 100, quantity: 1 }],
      fiscalStore()
    );
    expect(payload.header?.org_name).toBe('ТОВ «Тест»');
    expect(payload.items[0].tax_symbol).toBe('А');
    expect(payload.vat_lines).toEqual([{ symbol: 'А', rate: 20, amount_cents: 3750 }]);
    expect(payload.change_cents).toBeNull();
  });
});

describe('taxIdLine', () => {
  it('is «ПН» for a VAT payer and «ІД» otherwise', () => {
    expect(taxIdLine(REQUISITES)).toBe('ПН 123456789012');
    expect(
      taxIdLine({ ...REQUISITES, organization: { ...REQUISITES.organization, is_vat: false } })
    ).toBe('ІД 12345678');
    expect(
      taxIdLine({
        ...REQUISITES,
        organization: { name: 'ФОП', edrpou: null, tax_number: null, is_vat: false },
      })
    ).toBeNull();
  });
});

describe('fiscalBlockComplete', () => {
  // This is what decides whether the till hands the receipt over on its own.
  const base = {
    fiscal_code: 'OFF-0002',
    fiscal_date: '2026-09-11T11:05:00.000Z',
    tax_url: null,
    qr_payload: null,
    receipt_text: null,
    error_code: null,
    error_message: null,
  };

  it('is complete for a registered receipt', () => {
    expect(fiscalBlockComplete({ ...base, status: 'done' })).toBe(true);
  });

  it('is not complete for an offline receipt still missing its control number', () => {
    // Printable on demand, but auto-printing it would quietly hand the customer
    // a receipt without a required field.
    expect(fiscalBlockComplete({ ...base, status: 'pending', mode: 'offline' })).toBe(false);
  });

  it('is complete once the offline receipt has its control number', () => {
    expect(
      fiscalBlockComplete({ ...base, status: 'pending', mode: 'offline', control_number: '9933' })
    ).toBe(true);
  });

  it('is not complete for anything still in flight or failed', () => {
    expect(fiscalBlockComplete({ ...base, status: 'pending', mode: 'online' })).toBe(false);
    expect(fiscalBlockComplete({ ...base, status: 'failed' })).toBe(false);
    expect(fiscalBlockComplete(null)).toBe(false);
    expect(fiscalBlockComplete(undefined)).toBe(false);
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
      { name: 'Demo Store' }
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
        tax_symbol: null,
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
      { name: 'Demo Store' }
    );
    expect(payload.items).toEqual([]);
  });

  it('reports the refund method, not the original payments', () => {
    const sale = makeSaleDetail({ payments: [{ id: 200, method: 'cash', amount_cents: 45000 }] });
    const payload = buildRefundReceiptPayload(
      sale,
      makeRefund({ method: 'card', total_cents: 22500 }),
      [{ sale_item_id: 100, quantity: 1 }],
      { name: 'Demo Store' }
    );
    expect(payload.payments).toEqual([{ method: 'card', amount_cents: 22500 }]);
  });

  it('prints no payment line for a refund predating the method column', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail(),
      makeRefund({ method: null }),
      [{ sale_item_id: 100, quantity: 1 }],
      { name: 'Demo Store' }
    );
    expect(payload.payments).toEqual([]);
  });

  it('falls back to RF-<id> when the refund has no document number', () => {
    const payload = buildRefundReceiptPayload(
      makeSaleDetail(),
      makeRefund({ refund_number: null, id: 42 }),
      [],
      { name: 'Demo Store' }
    );
    expect(payload.receipt_number).toBe('RF-42');
  });
});
