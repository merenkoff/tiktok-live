// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product list as the café's marketer sees it (track МР, phase МР5): the
// dishes only — ingredients and preps are the kitchen's — each row saying what
// the guest is still missing, and filters that read as a to-do list.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CAFE = { id: 'cafe', title: 'Кав’ярня', attributes: [], units: ['шт', 'г', 'мл'], defaultUnit: 'шт', maxCompositionDepth: 3, dishFacts: true };
let role: 'marketer' | 'owner' = 'marketer';
const state = () => ({ auth: { staff: { role }, store: { vertical: CAFE } } });

const getProducts = vi.fn<[], Promise<Product[]>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CAFE,
    useAuthStore: (select?: (s: ReturnType<typeof state>) => unknown) => (select ? select(state()) : state()),
    api: {
      getProducts: () => getProducts(),
      posRequest: () => Promise.resolve([]),
      getTags: () =>
        Promise.resolve([
          { id: 1, name: 'Гаряче', parent_id: null, color: null, show_in_catalog_bar: false },
          { id: 2, name: 'Інгредієнти', parent_id: null, color: null, show_in_catalog_bar: false },
        ]),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function card(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    composition: null,
    image_url: null,
    is_active: true,
    sellable: true,
    tag_ids: [],
    variants: [
      { id: id * 10, product_id: id, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 10000, is_active: true },
    ],
    ...extra,
  } as Product;
}

beforeEach(() => {
  role = 'marketer';
  vi.clearAllMocks();
  getProducts.mockResolvedValue([
    card(1, 'Борщ', { tag_ids: [1], description: 'Наваристий', composition: 'Буряк, яловичина', image_url: '/pos-uploads/a.jpg' }),
    card(2, 'Деруни', { tag_ids: [1] }),
    card(3, 'Бекон', { tag_ids: [2], sellable: false }),
    card(4, 'Корковий збір', { menu_hidden: true }),
  ]);
});

function open(route = '/admin/products') {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products" element={<ProductsPage />} />
    </Routes>,
    { route }
  );
}

describe('the product list for the marketer', () => {
  it('lists the dishes only, and no tag that holds none', async () => {
    open();
    await screen.findByText('Борщ');
    expect(screen.queryByText('Бекон')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Інгредієнти/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Гаряче/ })).toBeInTheDocument();
  });

  it('marks what the guest is missing, and nothing of the kitchen’s', async () => {
    open();
    const row = (await screen.findByText('Деруни')).closest('[role="listitem"]') as HTMLElement;
    expect(within(row).getByTestId('missing-photo')).toBeInTheDocument();
    expect(within(row).getByTestId('missing-description')).toBeInTheDocument();
    expect(within(row).getByTestId('missing-composition')).toBeInTheDocument();
    const borshch = screen.getByText('Борщ').closest('[role="listitem"]') as HTMLElement;
    expect(within(borshch).queryByTestId(/^missing-/)).toBeNull();
    // A product hidden from the menu has nothing to fill for the guest.
    const cork = screen.getByText('Корковий збір').closest('[role="listitem"]') as HTMLElement;
    expect(within(cork).queryByTestId(/^missing-/)).toBeNull();
    expect(within(cork).getByText('Не в QR-меню')).toBeInTheDocument();
    expect(screen.queryByText('Не на касі')).toBeNull();
  });

  it('filters by what is missing', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('Борщ');
    await user.click(screen.getByTestId('filter-no-composition'));
    expect(screen.getByText('Деруни')).toBeInTheDocument();
    expect(screen.queryByText('Борщ')).toBeNull();
    await user.click(screen.getByTestId('filter-no-description'));
    expect(screen.getByText('Деруни')).toBeInTheDocument();
    expect(screen.queryByText('Борщ')).toBeNull();
  });

  it('the owner still sees every product, and in a café gets the same filters, counted over the dishes', async () => {
    role = 'owner';
    const user = userEvent.setup();
    open();
    await screen.findByText('Борщ');
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Товари');
    expect(screen.getByText('Бекон')).toBeInTheDocument();
    // Деруни only: the bacon is an ingredient and the cork fee is hidden from the menu.
    expect(screen.getByTestId('filter-no-composition')).toHaveTextContent('1');
    expect(screen.getByTestId('filter-no-description')).toHaveTextContent('1');
    await user.click(screen.getByTestId('filter-no-composition'));
    expect(screen.getByText('Деруни')).toBeInTheDocument();
    expect(screen.queryByText('Бекон')).toBeNull();
    // The rows stay plain for the owner.
    expect(screen.queryByTestId('missing-composition')).toBeNull();
  });

  it('is called «Меню» for the marketer', async () => {
    open();
    await screen.findByText('Борщ');
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toHaveTextContent('Меню');
  });
});
