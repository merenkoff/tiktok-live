// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The other half of «Техкарти» (К5d): its rows used to link to
// `/admin/products?edit=<id>`, and that address must keep landing on an open
// card now that the card has a page of its own (C1e) — by redirecting there.
// A screen that names the dish eating the profit and cannot take the owner to
// it is half a screen.

import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };

const getProducts = vi.fn<[], Promise<Product[]>>();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CLOTHING,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      getTags: () => Promise.resolve([]),
      listModifierGroups: () => Promise.resolve([]),
      posRequest: (...a: unknown[]) => posRequest(...a),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');
const { ProductPage } = await import('./ProductPage');

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    name: 'Борщ',
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [
      { id: 420, product_id: 42, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 20000, cost_cents: 0, is_active: true, quantity: 3 },
    ],
    ...overrides,
  } as Product;
}

function open(route: string) {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products" element={<ProductsPage />} />
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([product()]);
  posRequest.mockResolvedValue([]);
});

describe('?edit= from «Техкарти»', () => {
  it('opens that product\'s card', async () => {
    open('/admin/products?edit=42');
    // The card is the only place with a «Зберегти» button.
    expect(await screen.findByRole('button', { name: 'Зберегти' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Борщ' })).toBeInTheDocument();
  });

  it('leaves the list alone without the param', async () => {
    open('/admin/products');
    await screen.findByText('Борщ');
    expect(screen.queryByRole('button', { name: 'Зберегти' })).not.toBeInTheDocument();
  });

  // A stale or hand-typed link must not leave the page blank.
  it('says so for an id this owner cannot see, with a way back', async () => {
    open('/admin/products?edit=999');
    expect(await screen.findByText('Такого товару немає')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'До списку товарів' })).toHaveAttribute('href', '/admin/products');
  });

  it('asks the server for the tech cards the card shows beside a recipe', async () => {
    open('/admin/products/42');
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('get', '/products/tech-cards'));
  });
});
