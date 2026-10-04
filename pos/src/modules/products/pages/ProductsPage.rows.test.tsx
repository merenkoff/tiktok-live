// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product list as rows (C1e, PR3): one line per product, the variants a
// tap away, the name a link to the card, «Архів» behind a question.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
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
const archiveProduct = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CLOTHING,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      getTags: () =>
        Promise.resolve([{ id: 1, name: 'Новинки', parent_id: null, color: 'teal', show_in_catalog_bar: false }]),
      archiveProduct: (...a: unknown[]) => archiveProduct(...a),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function variant(id: number, product_id: number, color: string, size: string, price_cents: number, quantity: number) {
  return {
    id,
    product_id,
    attributes: { color, size },
    label: `${color} / ${size}`,
    unit: 'шт',
    sku: `SKU-${id}`,
    barcode: null,
    price_cents,
    cost_cents: 0,
    is_active: true,
    quantity,
  };
}

const ZAICHYK = {
  id: 7,
  name: 'Костюмчик Зайчик',
  description: null,
  image_url: null,
  is_active: true,
  kind: 'simple',
  stock_mode: 'own',
  tag_ids: [1],
  variants: [variant(70, 7, 'блакитний', '86', 40000, 2), variant(71, 7, 'блакитний', '92', 45000, 1)],
} as unknown as Product;

const BOUQUET = {
  id: 3,
  name: 'Букет «Ніжність»',
  description: null,
  image_url: null,
  is_active: true,
  kind: 'composite',
  stock_mode: 'derived',
  tag_ids: [],
  variants: [variant(30, 3, 'рожевий', 'M', 65000, 16)],
} as unknown as Product;

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([ZAICHYK, BOUQUET]);
});

async function openList() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products" element={<ProductsPage />} />
      <Route path="/admin/products/:id" element={<p>Картка</p>} />
    </Routes>,
    { route: '/admin/products' }
  );
  await screen.findByRole('list', { name: 'Товари' });
}

const row = (name: string) => within(screen.getByRole('link', { name }).closest('article')!);

describe('the rows', () => {
  it('say the three figures under the name, and the tag', async () => {
    await openList();
    expect(row('Костюмчик Зайчик').getByText('2 варіанти · 400–450 ₴ · 3 шт')).toBeInTheDocument();
    expect(row('Костюмчик Зайчик').getByText('Новинки')).toBeInTheDocument();
    expect(row('Букет «Ніжність»').getByText('1 варіант · 650 ₴ · Можна зібрати: 16')).toBeInTheDocument();
    expect(row('Букет «Ніжність»').getByText('Складений · при продажу')).toBeInTheDocument();
  });

  it('link the name to the card', async () => {
    await openList();
    expect(screen.getByRole('link', { name: 'Костюмчик Зайчик' })).toHaveAttribute('href', '/admin/products/7');
    // No variant table on the row until it is asked for.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('unfold the variants in place on the chevron, and fold them back', async () => {
    const user = userEvent.setup();
    await openList();
    const chevron = screen.getByRole('button', { name: 'Варіанти «Костюмчик Зайчик»' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    await user.click(chevron);
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    const table = within(row('Костюмчик Зайчик').getByRole('table'));
    expect(table.getByText('блакитний / 86')).toBeInTheDocument();
    expect(table.getByText('SKU-71')).toBeInTheDocument();
    // The other row stays folded.
    expect(row('Букет «Ніжність»').queryByRole('table')).toBeNull();

    await user.click(chevron);
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('say «Можна зібрати» over a derived composite\'s unfolded variants', async () => {
    const user = userEvent.setup();
    await openList();
    await user.click(screen.getByRole('button', { name: 'Варіанти «Букет «Ніжність»»' }));
    expect(row('Букет «Ніжність»').getByRole('columnheader', { name: 'Можна зібрати' })).toBeInTheDocument();
  });
});

describe('archiving from the list', () => {
  it('asks first, archives on the answer, and drops the row', async () => {
    const user = userEvent.setup();
    archiveProduct.mockImplementation(() => {
      getProducts.mockResolvedValue([BOUQUET]);
      return Promise.resolve(ZAICHYK);
    });
    await openList();

    await user.click(row('Костюмчик Зайчик').getByRole('button', { name: 'Архів' }));
    expect(await screen.findByTestId('confirm-sheet')).toHaveTextContent('Архівувати «Костюмчик Зайчик»?');
    expect(archiveProduct).not.toHaveBeenCalled();

    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'Скасувати' }));
    await waitFor(() => expect(screen.queryByTestId('confirm-sheet')).toBeNull());
    expect(archiveProduct).not.toHaveBeenCalled();

    await user.click(row('Костюмчик Зайчик').getByRole('button', { name: 'Архів' }));
    await user.click(await screen.findByTestId('confirm-sheet-ok'));
    await waitFor(() => expect(archiveProduct).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Костюмчик Зайчик' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Букет «Ніжність»' })).toBeInTheDocument();
  });

  it('says so when the server refuses', async () => {
    const user = userEvent.setup();
    archiveProduct.mockRejectedValue(new Error('boom'));
    await openList();
    await user.click(row('Костюмчик Зайчик').getByRole('button', { name: 'Архів' }));
    await user.click(await screen.findByTestId('confirm-sheet-ok'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не вдалося архівувати «Костюмчик Зайчик»');
    expect(screen.getByRole('link', { name: 'Костюмчик Зайчик' })).toBeInTheDocument();
  });
});
