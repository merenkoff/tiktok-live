// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's home screen from the owner's list (migration 112): a row «На
// головній каси» with its count, «На головну» / «Прибрати з головної» for
// the ticked cards — only where the till draws a home screen (clothing).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1, dishFacts: false };
const CAFE = { id: 'cafe', title: 'Кав’ярня', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 3, dishFacts: true };
let vertical: typeof CLOTHING | typeof CAFE = CLOTHING;

const getProducts = vi.fn<[], Promise<Product[]>>();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => vertical,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      posRequest: (...a: unknown[]) => posRequest(...a),
      getTags: () => Promise.resolve([]),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function card(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [
      { id: id * 10, product_id: id, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 10000, cost_cents: 0, is_active: true, quantity: 1 },
    ],
    ...extra,
  } as Product;
}

function open(route = '/admin/products') {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products" element={<ProductsPage />} />
    </Routes>,
    { route }
  );
}

beforeEach(() => {
  vertical = CLOTHING;
  getProducts.mockReset();
  posRequest.mockReset();
  getProducts.mockResolvedValue([card(1, 'Боді', { till_home: true }), card(2, 'Кофта'), card(3, 'Шапка')]);
});

describe('ProductsPage — the till home screen', () => {
  it('lists the cards on the home screen under their own row', async () => {
    open('/admin/products?tag=home');
    const row = await screen.findByTestId('filter-till-home');
    expect(row).toHaveTextContent('1');
    const list = await screen.findByRole('list', { name: 'Товари' });
    expect(within(list).getByText('Боді')).toBeInTheDocument();
    expect(within(list).queryByText('Кофта')).toBeNull();
    expect(screen.getByTestId('till-home-hint')).toHaveTextContent('касир бачить одразу');
  });

  it('puts the ticked cards on the home screen in one request', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValue({ changed: 2, product_ids: [2, 3] });
    open();
    await user.click(await screen.findByRole('button', { name: /Обрати всі показані/ }));
    await user.click(screen.getByTestId('bulk-till-home-on'));
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('post', '/products/till-home', { product_ids: [1, 2, 3], on: true })
    );
    expect(await screen.findByText('На головний екран каси — 2 товари')).toBeInTheDocument();
  });

  it('says what the home screen shows while nothing is ticked', async () => {
    getProducts.mockResolvedValue([card(2, 'Кофта')]);
    open('/admin/products?tag=home');
    expect(await screen.findByTestId('till-home-hint')).toHaveTextContent('24 товари, що продаються найчастіше');
  });

  it('offers none of it in a café, whose till has no home screen', async () => {
    vertical = CAFE;
    open();
    await screen.findByRole('list', { name: 'Товари' });
    expect(screen.queryByTestId('filter-till-home')).toBeNull();
  });
});
