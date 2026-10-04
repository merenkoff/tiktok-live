// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Продажі» refunds through the same dialog the till uses (clothing R1/R2/R4):
// the owner gets the reasons, the lawful methods and the act's fields, and the
// inline number inputs that sent a refund with no method are gone.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { SaleDetail, SaleListItem } from '../../../types';

const listSales = vi.fn();
const getSale = vi.fn();
const refundSale = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'clothing' }),
    api: { listSales: (...a: unknown[]) => listSales(...a), getSale: (...a: unknown[]) => getSale(...a) },
    cashierApi: { ...real.cashierApi, refundSale: (...a: unknown[]) => refundSale(...a) },
    getMeta: vi.fn().mockResolvedValue(null),
  };
});

const { AdminSalesPage } = await import('./AdminSalesPage');

const item: SaleListItem = {
  id: 1,
  receipt_number: 'R-00001',
  status: 'completed',
  total_cents: 45000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  created_at: '2026-10-04T10:00:00Z',
  fiscal_status: 'none',
  exchange_sale_number: 'R-00009',
};

const detail: SaleDetail = {
  id: 1,
  receipt_number: 'R-00001',
  status: 'completed',
  subtotal_cents: 45000,
  total_cents: 45000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  created_at: '2026-10-04T10:00:00Z',
  items: [
    {
      id: 11,
      variant_id: 5,
      product_name: 'Пальто',
      variant_label: 'Синій · M',
      quantity: 1,
      unit_price_cents: 45000,
      line_total_cents: 45000,
      refunded_quantity: 0,
    },
  ],
  payments: [{ id: 1, method: 'cash', amount_cents: 45000 }],
  refunds: [],
  fiscal_status: 'none',
} as SaleDetail;

beforeEach(() => {
  listSales.mockReset().mockResolvedValue([item]);
  getSale.mockReset().mockResolvedValue(detail);
  refundSale.mockReset();
});

describe('AdminSalesPage — refunds', () => {
  it('opens the shared dialog and sends the method, the ground and the buyer', async () => {
    const user = userEvent.setup();
    refundSale.mockImplementation(async () => ({
      client_uuid: 'srv:1',
      server_id: 1,
      receipt_number: 'R-00001',
      status: 'refunded',
      total_cents: 45000,
      refunded_cents: 45000,
      staff_name: 'Касирка',
      customer_name: null,
      created_at: detail.created_at,
      detail: {
        ...detail,
        status: 'refunded',
        refunded_cents: 45000,
        items: detail.items.map((i) => ({ ...i, refunded_quantity: 1 })),
        refunds: [
          {
            id: 3,
            refund_number: 'RF-00003',
            client_uuid: null,
            method: 'cash',
            total_cents: 45000,
            reason: null,
            reason_code: 'size',
            buyer_name: 'Коваль Олена',
            buyer_document: null,
            staff_name: 'Касирка',
            created_at: detail.created_at,
            items: [{ sale_item_id: 11, variant_id: 5, quantity: 1, unit_price_cents: 45000, line_total_cents: 45000 }],
          },
        ],
      },
      refund_fiscal: null,
    }));

    renderWithProviders(<AdminSalesPage />);
    await user.click(await screen.findByRole('button', { name: /R-00001/ }));
    await screen.findByText('Разом');
    // The list row of a receipt whose refund became an exchange says so.
    expect(screen.getByText('Обмін → R-00009')).toBeInTheDocument();
    // No inline quantity inputs any more — the dialog owns the refund.
    expect(screen.queryByLabelText('Повернути: Пальто')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повернення' }));
    const dialog = await screen.findByRole('dialog', { name: 'Повернення' });
    expect(dialog).toBeInTheDocument();
    // The page header has its own «Повернути все»; the dialog's is the one we mean.
    await user.click(within(dialog).getByRole('button', { name: 'Повернути все' }));
    await user.click(within(dialog).getByRole('button', { name: 'Не підійшов розмір' }));
    await user.type(within(dialog).getByLabelText('ПІБ покупця'), 'Коваль Олена');
    await user.click(within(dialog).getByRole('button', { name: 'Скасувати чек' }));

    await waitFor(() => expect(refundSale).toHaveBeenCalledTimes(1));
    expect(refundSale.mock.calls[0][0]).toMatchObject({ server_id: 1, receipt_number: 'R-00001' });
    expect(refundSale.mock.calls[0][2]).toMatchObject({ method: 'cash', reason_code: 'size', buyer_name: 'Коваль Олена' });

    // The card re-reads from the answer: the refund row names the ground and the buyer.
    await user.click(await screen.findByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(screen.getByTestId('refund-row')).toBeInTheDocument());
    expect(screen.getByTestId('refund-row').textContent).toContain('RF-00003 · Готівка · Не підійшов розмір');
    expect(screen.getByTestId('refund-row').textContent).toContain('Коваль Олена');
    expect(screen.getByRole('button', { name: /Акт про видачу коштів RF-00003/ })).toBeInTheDocument();
  });
});
