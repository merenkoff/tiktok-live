// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Обмін» on the till's receipts (clothing R1): the refund dialog in exchange
// mode drafts the return half into the cart store and the till goes to the
// sell screen to ring the new goods — unless something is already on the till.

import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, makeCatalogItem } from '../../../test/utils';
import type { LocalSaleRow } from '../../../offline/db';
import type { SaleDetail } from '../../../types';

const listSales = vi.fn();
const getSale = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => ({ id: 'clothing' }),
    usePosShell: () => 'cashier',
    cashierApi: {
      ...real.cashierApi,
      listSales: (...a: unknown[]) => listSales(...a),
      getSale: (...a: unknown[]) => getSale(...a),
    },
  };
});

const { TillReceiptsPage } = await import('./TillReceiptsPage');
const { useCartStore } = await import('@pos/platform');

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
  payments: [{ id: 1, method: 'card', amount_cents: 45000 }],
  refunds: [],
  fiscal_status: 'none',
} as SaleDetail;

const row: LocalSaleRow = {
  client_uuid: 'u1',
  server_id: 1,
  receipt_number: 'R-00001',
  status: 'completed',
  total_cents: 45000,
  refunded_cents: 0,
  staff_name: 'Касирка',
  customer_name: null,
  created_at: '2026-10-04T10:00:00Z',
  fiscal_status: 'none',
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<TillReceiptsPage />} />
      <Route path="/register" element={<div>SELL SCREEN</div>} />
    </Routes>
  );
}

beforeEach(() => {
  listSales.mockReset().mockResolvedValue([row]);
  getSale.mockReset().mockResolvedValue(detail);
  useCartStore.getState().clear();
});

afterEach(() => {
  useCartStore.getState().clear();
});

describe('TillReceiptsPage — «Обмін»', () => {
  it('drafts the return half into the cart and goes to the sell screen', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /R-00001/ }));
    await screen.findAllByText('Разом');

    await user.click(screen.getAllByRole('button', { name: 'Обмін' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Обмін' });
    expect(within(dialog).getByText('Обмін: що повертаємо?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Повернути все' }));
    await user.click(within(dialog).getByRole('button', { name: 'Не підійшов колір' }));
    await user.click(within(dialog).getByRole('button', { name: 'Далі: новий товар' }));

    expect(await screen.findByText('SELL SCREEN')).toBeInTheDocument();
    const draft = useCartStore.getState().exchange;
    expect(draft).toMatchObject({
      saleId: 1,
      saleClientUuid: 'u1',
      receiptNumber: 'R-00001',
      returnedCents: 45000,
      refund: { items: [{ sale_item_id: 11, quantity: 1 }], method: 'card', reason_code: 'color' },
    });
  });

  it('refuses over a half-rung sale in the dialog’s own words and stays put', async () => {
    const user = userEvent.setup();
    useCartStore.getState().addItem(makeCatalogItem({ variant_id: 9, quantity: 3 }), 1);
    renderPage();
    await user.click(await screen.findByRole('button', { name: /R-00001/ }));
    await screen.findAllByText('Разом');

    await user.click(screen.getAllByRole('button', { name: 'Обмін' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Обмін' });
    await user.click(within(dialog).getByRole('button', { name: 'Повернути все' }));
    await user.click(within(dialog).getByRole('button', { name: 'Далі: новий товар' }));

    expect(await within(dialog).findByText(/обмін починається з порожнього кошика/)).toBeInTheDocument();
    expect(screen.queryByText('SELL SCREEN')).toBeNull();
    expect(useCartStore.getState().exchange).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(1);
  });

  it('is disabled while the till has no connection', async () => {
    const user = userEvent.setup();
    const { useOfflineStatus } = await import('@pos/platform');
    useOfflineStatus.setState({ online: false });
    try {
      renderPage();
      await user.click(await screen.findByRole('button', { name: /R-00001/ }));
      await screen.findAllByText('Разом');
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Обмін' })[0]).toBeDisabled());
      expect(screen.getAllByRole('button', { name: 'Обмін' })[0]).toHaveAttribute('title', 'Потрібна мережа');
    } finally {
      useOfflineStatus.setState({ online: true });
    }
  });
});
