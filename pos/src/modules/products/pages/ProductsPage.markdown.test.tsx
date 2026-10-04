// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The list's half of a mass markdown (clothing D2): «Обрати всі показані»
// selects what the filter shows, «Уцінити» opens the dialog over exactly that
// selection, and a finished markdown is said once above the list.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = {
  id: 'clothing',
  title: 'Одяг',
  attributes: [
    { key: 'color', label: 'Колір', type: 'text', inLabel: true, inSearch: true },
    { key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true },
  ],
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
      posRequest: (...a: unknown[]) => posRequest(...a),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function product(id: number, name: string): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    kind: 'simple',
    stock_mode: 'own',
    one_off: false,
    sellable: true,
    needs_review: false,
    tags: [],
    tag_ids: [],
    modifier_group_ids: [],
    variants: [
      {
        id: id * 10,
        product_id: id,
        attributes: { color: 'Синій', size: 'M' },
        label: 'Синій / M',
        unit: 'шт',
        sku: null,
        barcode: null,
        price_cents: 100000,
        cost_cents: 0,
        is_active: true,
        quantity: 3,
      },
    ],
  } as unknown as Product;
}

beforeEach(() => {
  getProducts.mockReset();
  getProducts.mockResolvedValue([product(1, 'Пальто'), product(2, 'Кепка'), product(3, 'Шарф')]);
  posRequest.mockReset();
  posRequest.mockImplementation((_m: string, path: string) => {
    if (path === '/markdowns/preview') {
      return Promise.resolve({
        items: [
          {
            variant_id: 10,
            product_id: 1,
            product_name: 'Пальто',
            label: 'Синій / M',
            price_before: 100000,
            compare_at_before: null,
            price_after: 70000,
            compare_at_after: 100000,
          },
        ],
        skipped: [],
        products: 1,
      });
    }
    if (path === '/markdowns') return Promise.resolve({ markdown: { id: 9, products: 3 }, applied: 3, skipped: [] });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
});

describe('ProductsPage — mass markdown', () => {
  it('selects everything the filter shows, opens the dialog over it, and says what was done', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);
    await screen.findByRole('link', { name: 'Пальто' });

    await user.click(screen.getByRole('button', { name: 'Обрати всі показані (3)' }));
    expect(screen.getByText('Обрано: 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Уцінити' }));
    const dialog = screen.getByRole('dialog', { name: 'Уцінити' });
    expect(dialog).toHaveTextContent('Обрано товарів: 3');

    await user.type(within(dialog).getByLabelText('Знижка, %'), '30');
    await waitFor(() => expect(within(dialog).getByTestId('markdown-apply')).toBeEnabled());
    expect(posRequest.mock.calls.find((c) => c[1] === '/markdowns/preview')![2]).toMatchObject({ product_ids: [1, 2, 3] });

    await user.click(within(dialog).getByTestId('markdown-apply'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Уцінено варіантів: 3 у 3 товарах'));
    expect(screen.queryByRole('dialog', { name: 'Уцінити' })).toBeNull();
    expect(screen.queryByText(/^Обрано: /)).toBeNull();
    expect(getProducts).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Переглянути уцінки' })).toHaveAttribute('href', '/admin/products/markdowns');
  });

  it('narrows «всі показані» to the search, and «Зняти вибір» clears it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />);
    await screen.findByRole('link', { name: 'Пальто' });

    await user.type(screen.getByLabelText('Пошук товарів'), 'кепка');
    await user.click(screen.getByRole('button', { name: 'Обрати всі показані (1)' }));
    expect(screen.getByText('Обрано: 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Зняти вибір' }));
    expect(screen.queryByText(/^Обрано: /)).toBeNull();
  });
});
