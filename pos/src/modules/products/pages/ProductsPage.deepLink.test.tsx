// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The other half of «Техкарти» (К5d): the row there links to
// `/admin/products?edit=<id>`, and this is what makes that link land on an
// open card. A screen that names the dish eating the profit and cannot take
// the owner to it is half a screen.

import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = {
  id: 'clothing',
  title: 'Одяг',
  attributes: [],
  units: ['шт'],
  defaultUnit: 'шт',
  maxCompositionDepth: 1,
};

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

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    name: 'Борщ',
    description: null,
    image_url: null,
    is_active: true,
    variants: [
      {
        id: 420,
        product_id: 42,
        attributes: {},
        label: '',
        unit: 'шт',
        sku: null,
        barcode: null,
        price_cents: 20000,
        cost_cents: 0,
        is_active: true,
        quantity: 3,
      },
    ],
    ...overrides,
  } as Product;
}

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([product()]);
  posRequest.mockResolvedValue([]);
});

describe('?edit= from «Техкарти»', () => {
  it('opens that product already in edit mode', async () => {
    renderWithProviders(<ProductsPage />, { route: '/admin/products?edit=42' });
    // The edit form is the only place with a «Сховати» button.
    expect(await screen.findByRole('button', { name: 'Сховати' })).toBeInTheDocument();
  });

  it('leaves the list alone without the param', async () => {
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await screen.findByText('Борщ');
    expect(screen.queryByRole('button', { name: 'Сховати' })).not.toBeInTheDocument();
  });

  // A stale or hand-typed link must not leave the page blank with the param
  // still on it.
  it('ignores an id this owner cannot see', async () => {
    renderWithProviders(<ProductsPage />, { route: '/admin/products?edit=999' });
    await screen.findByText('Борщ');
    expect(screen.queryByRole('button', { name: 'Сховати' })).not.toBeInTheDocument();
  });

  it('asks the server for the tech cards it shows beside a recipe', async () => {
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await waitFor(() =>
      expect(posRequest).toHaveBeenCalledWith('get', '/products/tech-cards')
    );
  });
});
