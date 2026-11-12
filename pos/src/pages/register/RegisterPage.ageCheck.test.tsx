// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Покупцю є 18 років?» (migration 102, TechDocs/POS_AGE_CHECK.md): asked once
// per receipt with goods sold to an adult only, before the payment screen,
// where the owner switched it on — and «так» goes with the sale.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse, makeSaleDetail } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore, type CartLine } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));

function signIn(ageCheck: boolean): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({ auth: { ...auth, store: { ...auth.store, age_check: ageCheck } }, isAuthenticated: true });
}

const BEER: CartLine = {
  uid: '7',
  variant_id: 7,
  product_name: 'Пиво світле',
  variant_label: '0,5',
  unit: 'шт',
  unit_price_cents: 6000,
  quantity: 1,
  max_quantity: 9,
  age_restricted: true,
};
const WATER: CartLine = {
  uid: '8',
  variant_id: 8,
  product_name: 'Вода',
  variant_label: '',
  unit: 'шт',
  unit_price_cents: 2000,
  quantity: 1,
  max_quantity: 9,
};

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => {
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

async function openPay(): Promise<void> {
  renderWithProviders(<RegisterPage />, { shell: 'cashier' });
  await screen.findByPlaceholderText(/^Пошук/);
  fireEvent.click(screen.getAllByRole('button', { name: /^Оплатити/ })[0]);
}

describe('RegisterPage — the buyer’s age', () => {
  it('asks before the payment screen, once, and sends «так» with the sale', async () => {
    signIn(true);
    useCartStore.getState().restore({ lines: [BEER, WATER] });
    const completeSale = vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(makeSaleDetail());
    await openPay();

    const sheet = await screen.findByTestId('age-check-sheet');
    expect(sheet).toHaveTextContent('Пиво світле · 0,5');
    expect(sheet).not.toHaveTextContent('Вода');
    expect(screen.queryByRole('dialog', { name: 'Оплата' })).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByTestId('age-check-yes'));
    const dialog = await screen.findByRole('dialog', { name: 'Оплата' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готівка' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Прийняти/ }));
    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0]).toMatchObject({ age_confirmed: true });
  });

  it('«Ні» takes the alcohol off the receipt and keeps the rest', async () => {
    signIn(true);
    useCartStore.getState().restore({ lines: [BEER, WATER] });
    await openPay();
    fireEvent.click(await screen.findByTestId('age-check-no'));
    expect(useCartStore.getState().lines.map((l) => l.product_name)).toEqual(['Вода']);
    expect(screen.queryByTestId('age-check-sheet')).not.toBeInTheDocument();
  });

  it('does not ask where the owner has not switched it on, nor for a receipt without such goods', async () => {
    signIn(false);
    useCartStore.getState().restore({ lines: [BEER] });
    const completeSale = vi.spyOn(cashierApi, 'completeSale').mockResolvedValue(makeSaleDetail());
    await openPay();
    const dialog = await screen.findByRole('dialog', { name: 'Оплата' });
    expect(screen.queryByTestId('age-check-sheet')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Готівка' }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^Прийняти/ }));
    await waitFor(() => expect(completeSale).toHaveBeenCalledTimes(1));
    expect(completeSale.mock.calls[0][0]).not.toHaveProperty('age_confirmed');
  });

  it('does not ask for water even where it is switched on', async () => {
    signIn(true);
    useCartStore.getState().restore({ lines: [WATER] });
    await openPay();
    expect(await screen.findByRole('dialog', { name: 'Оплата' })).toBeInTheDocument();
    expect(screen.queryByTestId('age-check-sheet')).not.toBeInTheDocument();
  });
});
