// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sell screen as the sale half of an exchange (clothing R1): the strip
// that says whose goods are coming back, the exchange checkout instead of the
// payment modal, one request with both halves — the same keys on a retry — and
// what the screen says when only the return half went through.

import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse, makeSaleDetail } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { api } from '../../services/api';
import { FiscalSaleUnknownError } from '../../offline/errors';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import type { ExchangeDraft, ExchangeResult, SaleDetail } from '../../types';
import { RegisterPage } from './RegisterPage';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));
vi.mock('../../offline/kitchenTickets', () => ({
  printKitchenTickets: vi.fn(async () => 'printed'),
}));

function httpError(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed', 'ERR_BAD_RESPONSE');
  error.response = { status, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() } };
  return error;
}

const draft: ExchangeDraft = {
  saleId: 7,
  saleClientUuid: 'u7',
  receiptNumber: 'R-00042',
  saleCreatedAt: '2026-10-04T10:00:00Z',
  refund: {
    items: [{ sale_item_id: 1, quantity: 1 }],
    method: 'card',
    reason_code: 'size',
    reason: null,
    buyer_name: null,
    buyer_document: null,
    client_uuid: 'rf-uuid',
  },
  returnedCents: 45000,
  returnedLines: [{ name: 'Пальто', label: 'Синій · M', quantity: 1, amount_cents: 45000 }],
};

/** The original receipt as the server answers it, the new refund on it. */
function refundedOriginal(): ExchangeResult['refund'] {
  return {
    ...makeSaleDetail({ id: 7, receipt_number: 'R-00042', status: 'refunded', refunded_cents: 45000 }),
    refunds: [
      {
        id: 9,
        refund_number: 'RF-00007',
        client_uuid: 'rf-uuid',
        method: 'card',
        total_cents: 45000,
        reason: null,
        staff_name: 'Касирка',
        created_at: '2026-10-04T12:00:00Z',
        items: [{ sale_item_id: 1, variant_id: 11, quantity: 1, unit_price_cents: 45000, line_total_cents: 45000 }],
      },
    ],
    refund_id: 9,
    refund_fiscal: null,
  };
}

function newSale(): SaleDetail {
  return makeSaleDetail({
    id: 50,
    receipt_number: 'R-00050',
    total_cents: 70000,
    subtotal_cents: 70000,
    payments: [{ id: 2, method: 'card', amount_cents: 70000 }],
  });
}

function done(): ExchangeResult {
  return { refund: refundedOriginal(), sale: newSale(), difference_cents: 25000 };
}

function ringNewCoat(): void {
  useCartStore.setState({
    exchange: draft,
    lines: [
      {
        uid: '5',
        variant_id: 5,
        product_name: 'Пальто',
        variant_label: 'Синій · L',
        unit: 'шт',
        unit_price_cents: 70000,
        quantity: 1,
        max_quantity: 3,
      },
    ],
  });
}

async function openExchangeCheckout() {
  fireEvent.click(screen.getAllByRole('button', { name: /^Оплатити/ })[0]);
  return screen.findByRole('dialog', { name: 'Обмін' });
}

beforeEach(() => {
  const auth = makeAuthResponse();
  useAuthStore.setState({ auth, isAuthenticated: true });
  vi.spyOn(api, 'listParkedCarts').mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

describe('RegisterPage — the sale half of an exchange', () => {
  it('names the receipt the goods come back from, and cancelling keeps the cart as a plain sale', async () => {
    ringNewCoat();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    const strip = await screen.findByTestId('exchange-strip');
    expect(strip.textContent).toContain('Обмін за чеком R-00042');
    expect(strip.textContent).toContain('450,00 ₴');
    // An exchange is paid or abandoned — never parked.
    expect(screen.getAllByTestId('park-cart')[0]).toBeDisabled();

    fireEvent.click(within(strip).getByRole('button', { name: 'Скасувати обмін' }));
    await waitFor(() => expect(screen.queryByTestId('exchange-strip')).toBeNull());
    expect(useCartStore.getState().exchange).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(1);
    expect(screen.getAllByTestId('park-cart')[0]).toBeEnabled();
  });

  it('pays through the exchange checkout: both halves in one request, then the exchange’s own success screen', async () => {
    ringNewCoat();
    const exchangeSale = vi.spyOn(cashierApi, 'exchangeSale').mockResolvedValue(done());
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByTestId('exchange-strip');

    const dialog = await openExchangeCheckout();
    expect(within(dialog).getByTestId('exchange-difference').textContent).toContain('Клієнт доплачує 250,00 ₴ карткою');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Оформити обмін' }));

    await waitFor(() => expect(exchangeSale).toHaveBeenCalledTimes(1));
    const [sentDraft, body] = exchangeSale.mock.calls[0];
    expect(sentDraft).toMatchObject({ receiptNumber: 'R-00042', refund: { client_uuid: 'rf-uuid' } });
    expect(body.refund).toEqual(draft.refund);
    expect(body.sale).toMatchObject({
      items: [{ variant_id: 5, quantity: 1 }],
      payments: [{ method: 'card', amount_cents: 70000 }],
      cart_discount: null,
    });
    // No customer picked → the key is absent and the server keeps the receipt's own.
    expect(body.sale).not.toHaveProperty('customer_id');
    expect(body.sale.client_uuid).toMatch(/^[0-9a-f-]{36}$/);

    expect(await screen.findByText('Обмін оформлено')).toBeInTheDocument();
    expect(screen.getByText('R-00050')).toBeInTheDocument();
    expect(screen.getByTestId('exchange-summary').textContent).toContain(
      'Повернення RF-00007 за чеком R-00042 · Клієнт доплатив 250,00 ₴'
    );
    expect(screen.getByTestId('print-return-receipt')).toBeInTheDocument();
    // 450 ₴ went back: the act is offered.
    expect(screen.getByTestId('print-exchange-act')).toBeInTheDocument();
    expect(useCartStore.getState().exchange).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it('re-sends the very same keys after a lost answer, so the server replays instead of selling twice', async () => {
    ringNewCoat();
    const exchangeSale = vi
      .spyOn(cashierApi, 'exchangeSale')
      .mockRejectedValueOnce(new FiscalSaleUnknownError('sale-uuid'))
      .mockResolvedValueOnce(done());
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByTestId('exchange-strip');

    const dialog = await openExchangeCheckout();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Оформити обмін' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('стан чека невідомий');
    fireEvent.click(within(alert).getByRole('button', { name: 'Перевірити ще раз' }));

    await waitFor(() => expect(exchangeSale).toHaveBeenCalledTimes(2));
    expect(exchangeSale.mock.calls[1][1].sale.client_uuid).toBe(exchangeSale.mock.calls[0][1].sale.client_uuid);
    expect(exchangeSale.mock.calls[1][1].refund.client_uuid).toBe('rf-uuid');
    expect(await screen.findByText('Обмін оформлено')).toBeInTheDocument();
  });

  it('when ПРРО voided the new receipt, names the refund that stands and turns the cart into a plain sale', async () => {
    ringNewCoat();
    vi.spyOn(cashierApi, 'exchangeSale').mockRejectedValue(
      httpError(502, {
        error: 'fiscal_failed',
        code: 'provider_rejected',
        message: 'ПРРО відхилив чек.',
        sale_id: 50,
        sale_voided: true,
        refund_id: 9,
        refund: refundedOriginal(),
        difference_cents: 25000,
      })
    );
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByTestId('exchange-strip');

    const dialog = await openExchangeCheckout();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Оформити обмін' }));

    const banner = await screen.findByText(/Пробийте товар окремим чеком/);
    expect(banner.textContent).toContain('Повернення RF-00007 за чеком R-00042 оформлено');
    expect(banner.textContent).toContain('ПРРО відхилив чек.');
    expect(screen.queryByRole('dialog', { name: 'Обмін' })).toBeNull();
    expect(screen.queryByTestId('exchange-strip')).toBeNull();
    expect(useCartStore.getState().exchange).toBeNull();
    expect(useCartStore.getState().lines).toHaveLength(1);
  });

  it('when the new receipt stands un-fiscalised, shows the exchange with the ПРРО warning', async () => {
    ringNewCoat();
    vi.spyOn(cashierApi, 'exchangeSale').mockRejectedValue(
      httpError(502, {
        error: 'fiscal_failed',
        code: 'timeout',
        message: 'Сервер ПРРО не відповів.',
        sale_id: 50,
        sale_voided: false,
        sale_kept: true,
        refund_id: 9,
        refund: refundedOriginal(),
        difference_cents: 25000,
      })
    );
    vi.spyOn(api, 'getSale').mockResolvedValue(newSale());
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByTestId('exchange-strip');

    const dialog = await openExchangeCheckout();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Оформити обмін' }));

    expect(await screen.findByText('Обмін оформлено')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toContain('Чек не зареєстровано в ПРРО');
    expect(screen.getByTestId('exchange-summary').textContent).toContain('RF-00007');
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});
