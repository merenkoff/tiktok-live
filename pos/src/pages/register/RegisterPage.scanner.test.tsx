// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The scanner on the sell screen of a clothing shop, where it rings up most
// of the day. Reported 2026-10-19: after «Очистити чек» → «Очистити» the
// scanner did nothing until someone clicked into the search box — the hidden
// input it typed into had lost the focus and nothing gave it back.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, makeAuthResponse, makeCatalogItem } from '../../test/utils';
import { cashierApi } from '../../offline/cashierApi';
import { api } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';

vi.mock('../../offline/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../offline/db')>()),
  getMeta: vi.fn(async () => undefined),
}));

const jeans = makeCatalogItem({
  variant_id: 7,
  product_id: 3,
  product_name: 'Джинси slim',
  label: 'Синій / 28',
  barcode: '4820002000213',
});
const shirt = makeCatalogItem({ variant_id: 8, product_id: 4, product_name: 'Сорочка', barcode: '4820002000220' });

beforeEach(() => {
  const auth = makeAuthResponse();
  useAuthStore.setState({ auth, isAuthenticated: true });
  vi.spyOn(cashierApi, 'getTags').mockResolvedValue([]);
  vi.spyOn(cashierApi, 'getCatalog').mockImplementation(async (opts) => {
    if (opts?.barcode) return [jeans, shirt].filter((i) => i.barcode === opts.barcode);
    return [jeans, shirt];
  });
  vi.spyOn(api, 'listParkedCarts').mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

function receiptLines(): string[] {
  return useCartStore.getState().lines.map((l) => l.product_name);
}

describe('the scanner on the sell screen', () => {
  it('still rings up after «Очистити чек» → «Очистити»', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByText('Джинси slim');

    await user.keyboard('4820002000213{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Джинси slim']));

    await user.click(screen.getByRole('button', { name: 'Меню чека' }));
    await user.click(screen.getByRole('button', { name: 'Очистити кошик' }));
    const sheet = await screen.findByRole('alertdialog', { name: 'Очистити чек?' });
    await user.click(within(sheet).getByRole('button', { name: 'Очистити' }));
    expect(receiptLines()).toEqual([]);

    await user.keyboard('4820002000220{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Сорочка']));
  });

  it('does not ring up behind «Очистити чек?» while it is asked', async () => {
    const user = userEvent.setup();
    useCartStore.getState().addItem(jeans);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await screen.findByText('Сорочка');

    await user.click(screen.getByRole('button', { name: 'Меню чека' }));
    await user.click(screen.getByRole('button', { name: 'Очистити кошик' }));
    await screen.findByRole('alertdialog', { name: 'Очистити чек?' });

    await user.keyboard('4820002000220{Enter}');
    // Nothing looked up: the question is still on screen and the receipt as it was.
    expect(cashierApi.getCatalog).not.toHaveBeenCalledWith(expect.objectContaining({ barcode: '4820002000220' }));
    expect(screen.getByRole('alertdialog', { name: 'Очистити чек?' })).toBeInTheDocument();
    expect(receiptLines()).toEqual(['Джинси slim']);
  });

  it('rings up the scanned item, not the tile that was tapped last', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await user.click(await screen.findByRole('button', { name: /Сорочка/ }));
    expect(receiptLines()).toEqual(['Сорочка']);

    // The tile keeps the focus after the tap; the scanner's Enter used to press it.
    await user.keyboard('4820002000213{Enter}');
    await waitFor(() => expect(receiptLines()).toEqual(['Сорочка', 'Джинси slim']));
  });
});
