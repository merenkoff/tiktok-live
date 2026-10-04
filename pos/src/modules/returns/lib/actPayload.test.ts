// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { SaleDetail } from '../../../types';
import { buildActPayload } from './actPayload';

const sale = {
  id: 7,
  receipt_number: 'R-00042',
  created_at: '2026-10-04T10:15:00.000Z',
  staff_name: 'Касирка',
  customer_name: null,
  items: [
    { id: 1, product_name: 'Пальто', variant_label: 'Синій · M', quantity: 2, refunded_quantity: 1, line_total_cents: 100000 },
    { id: 2, product_name: 'Шарф', variant_label: 'Сірий', quantity: 1, refunded_quantity: 0, line_total_cents: 20000 },
  ],
  payments: [{ id: 1, method: 'card', amount_cents: 120000 }],
  refunds: [],
  fiscal: { status: 'done', fiscal_code: 'ФН-111', fiscal_date: null, tax_url: null, qr_payload: null, receipt_text: null, error_code: null, error_message: null },
} as unknown as SaleDetail;

const refund: SaleDetail['refunds'][number] = {
  id: 9,
  refund_number: 'RF-00007',
  client_uuid: null,
  method: 'card',
  total_cents: 50000,
  reason: null,
  staff_name: 'Касирка',
  created_at: '2026-10-05T12:00:00.000Z',
  buyer_name: ' Коваль Олена ',
  buyer_document: 'паспорт КВ 123456',
  items: [{ sale_item_id: 1, variant_id: 11, quantity: 1, unit_price_cents: 50000, line_total_cents: 50000 }],
  fiscal: { status: 'done', fiscal_code: 'ФН-222', fiscal_date: null, tax_url: null, qr_payload: null, receipt_text: null, error_code: null, error_message: null },
};

const store = {
  name: 'Demo Kids',
  fiscal: {
    enabled: true,
    provider: 'checkbox' as const,
    requisites: {
      organization: { name: 'ФОП Коваль О. О.', edrpou: null, tax_number: '1234567890', is_vat: false },
      point: { name: 'Магазин', address: 'м. Київ, вул. Хрещатик, 1' },
      register: { fiscal_number: '4000000001', title: null, address: null },
      taxes: [],
    },
  },
};

describe('buildActPayload', () => {
  it('names the buyer, the goods, the sum and the receipt the goods were bought on', () => {
    const act = buildActPayload(sale, refund, store);
    expect(act.store_name).toBe('Demo Kids');
    expect(act.org_name).toBe('ФОП Коваль О. О.');
    expect(act.address).toBe('м. Київ, вул. Хрещатик, 1');
    expect(act.tax_id_line).toBe('ІД 1234567890');
    expect(act.act_number).toBe('RF-00007');
    expect(act.act_date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(act.buyer_name).toBe('Коваль Олена');
    expect(act.buyer_document).toBe('паспорт КВ 123456');
    expect(act.goods).toEqual([{ name: 'Пальто', label: 'Синій · M', quantity: 1, amount_cents: 50000 }]);
    expect(act.total_cents).toBe(50000);
    expect(act.returned_by).toBe('на платіжну картку');
    expect(act.original.receipt_number).toBe('R-00042');
    expect(act.original.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(act.original.time).toMatch(/^\d{2}:\d{2}$/);
    expect(act.original.fiscal_code).toBe('ФН-111');
    expect(act.refund_fiscal_code).toBe('ФН-222');
    expect(act.cashier).toBe('Касирка');
  });

  it('prints blanks for a buyer who declined, and nothing legal for a store without ПРРО', () => {
    const act = buildActPayload(
      { ...sale, fiscal: null },
      { ...refund, buyer_name: null, buyer_document: '  ', items: undefined, method: null, fiscal: undefined },
      { name: 'Demo Kids', fiscal: { enabled: false, provider: null } }
    );
    expect(act.buyer_name).toBeNull();
    expect(act.buyer_document).toBeNull();
    expect(act.goods).toEqual([]);
    expect(act.returned_by).toBeNull();
    expect(act.org_name).toBeNull();
    expect(act.tax_id_line).toBeNull();
    expect(act.original.fiscal_code).toBeNull();
    expect(act.refund_fiscal_code).toBeNull();
  });

  it('takes the fiscal number handed in from the immediate response over the re-read one', () => {
    expect(buildActPayload(sale, refund, store, 'ФН-333').refund_fiscal_code).toBe('ФН-333');
    expect(buildActPayload(sale, { ...refund, refund_number: null }, store).act_number).toBe('RF-9');
  });
});
