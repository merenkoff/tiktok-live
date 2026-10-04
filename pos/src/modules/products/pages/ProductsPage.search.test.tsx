// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The search box the admin's product list never had (TechDocs/POS_CLOTHING.md,
// phase C1): words, every one of which has to match. The product form itself
// lives on its own page now — `ProductPage.create.test.tsx` and
// `ProductPage.variants.test.tsx` (C1e).

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING_ATTRS = [
  { key: 'color', label: 'Колір', type: 'text', inLabel: true, inSearch: true },
  { key: 'size', label: 'Розмір', type: 'text', inLabel: true, inSearch: true },
];
const FLOWER_ATTRS = [
  { key: 'color', label: 'Колір', type: 'text', inLabel: true, inSearch: true },
  { key: 'length_cm', label: 'Довжина', type: 'number', inLabel: true },
];

const base = { title: 'Магазин', units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };
let vertical: Record<string, unknown> = {};
const setVertical = (id: 'clothing' | 'flowers') => {
  vertical =
    id === 'clothing'
      ? { id, ...base, attributes: CLOTHING_ATTRS, productKinds: ['simple'], dishFacts: false, autoBarcode: true }
      : { id, ...base, attributes: FLOWER_ATTRS, productKinds: ['simple', 'composite'], dishFacts: false, autoBarcode: false };
};

const getProducts = vi.fn<[], Promise<Product[]>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => vertical,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      getTags: () => Promise.resolve([]),
      listModifierGroups: () => Promise.resolve([]),
      posRequest: () => Promise.resolve([]),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function variant(id: number, product_id: number, color: string, size: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    product_id,
    attributes: { color, size },
    label: `${color} / ${size}`,
    unit: 'шт',
    sku: null,
    barcode: `29000000${String(id).padStart(4, '0')}`,
    price_cents: 40000,
    cost_cents: 0,
    is_active: true,
    quantity: 1,
    ...extra,
  };
}

function card(id: number, name: string, variants: ReturnType<typeof variant>[]): Product {
  return {
    id,
    name,
    description: null,
    composition: null,
    allergens: [],
    kind: 'simple',
    stock_mode: 'own',
    image_url: null,
    is_active: true,
    variants,
  } as unknown as Product;
}

const ZAICHYK = card(7, 'Костюмчик Зайчик', [
  variant(70, 7, 'блакитний', '86'),
  variant(71, 7, 'блакитний', '98-104'),
]);
const DRESS = card(8, 'Сукня Свято', [variant(80, 8, 'біла', '92-98')]);

beforeEach(() => {
  vi.clearAllMocks();
  setVertical('clothing');
  getProducts.mockResolvedValue([ZAICHYK, DRESS]);
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this run */
  }
});

describe('the product list — search', () => {
  it('finds a card by a name and a size that live on different rows of it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await screen.findByText('Костюмчик Зайчик');

    await user.type(screen.getByLabelText('Пошук товарів'), 'зайчик 86');

    expect(screen.getByText('Костюмчик Зайчик')).toBeInTheDocument();
    expect(screen.queryByText('Сукня Свято')).toBeNull();
  });

  it('reads a pair typed with a slash, and says so when nothing is found', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await screen.findByText('Костюмчик Зайчик');

    await user.type(screen.getByLabelText('Пошук товарів'), '98/104');
    expect(screen.getByText('Костюмчик Зайчик')).toBeInTheDocument();
    expect(screen.queryByText('Сукня Свято')).toBeNull();

    await user.clear(screen.getByLabelText('Пошук товарів'));
    await user.type(screen.getByLabelText('Пошук товарів'), 'халат');
    expect(screen.getByText('Нічого не знайдено за «халат»')).toBeInTheDocument();
  });

  it('shows everything again when the box is cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await screen.findByText('Костюмчик Зайчик');

    await user.type(screen.getByLabelText('Пошук товарів'), 'сукня');
    expect(screen.queryByText('Костюмчик Зайчик')).toBeNull();
    await user.clear(screen.getByLabelText('Пошук товарів'));

    expect(screen.getByText('Костюмчик Зайчик')).toBeInTheDocument();
    expect(screen.getByText('Сукня Свято')).toBeInTheDocument();
  });
});
