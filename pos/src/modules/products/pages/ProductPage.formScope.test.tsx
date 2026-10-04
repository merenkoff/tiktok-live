// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The card asks what the store sells (TechDocs/POS_CLOTHING.md, phase C0), on
// its own page now — new and old alike: a boutique is not asked what a
// composite is nor for a dish's words, and a card that already holds them
// keeps them on screen.

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

type Scope = { productKinds?: Array<'simple' | 'composite'>; dishFacts?: boolean };
const base = { title: 'Магазин', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };
let vertical: Record<string, unknown> = { id: 'clothing', ...base };
const setVertical = (id: string, scope: Scope) => {
  vertical = { id, ...base, ...scope };
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
      createProduct: () => Promise.resolve({ id: 1 }),
      updateProduct: () => Promise.resolve({}),
      updateVariant: () => Promise.resolve({}),
      setProductTags: () => Promise.resolve([]),
      setProductModifierGroups: () => Promise.resolve([]),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function card(overrides: Partial<Product> = {}): Product {
  return {
    id: 7,
    name: 'Футболка',
    description: null,
    composition: null,
    allergens: [],
    kind: 'simple',
    stock_mode: 'own',
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [
      { id: 70, product_id: 7, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 69000, cost_cents: 0, is_active: true, quantity: 3 },
    ],
    ...overrides,
  } as Product;
}

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([card()]);
});

async function openCard() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: '/admin/products/7' }
  );
  await screen.findByRole('button', { name: 'Зберегти' });
}

async function openCreate() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/new" element={<ProductPage />} />
    </Routes>,
    { route: '/admin/products/new' }
  );
  return within(await screen.findByRole('form', { name: 'Новий товар' }));
}

const SHAPE = 'Що це за товар';
const FACTS = /Склад для гостя/;

describe('the create page — by what the store sells', () => {
  it('asks a boutique for neither, and keeps the description', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    const form = await openCreate();

    expect(form.queryByText(SHAPE)).toBeNull();
    expect(form.queryByLabelText(FACTS)).toBeNull();
    expect(form.queryByTestId('allergen-chip-milk')).toBeNull();
    expect(form.getByPlaceholderText('Опис')).toBeInTheDocument();
  });

  it('asks a florist about composites but not allergens', async () => {
    setVertical('flowers', { productKinds: ['simple', 'composite'], dishFacts: false });
    const form = await openCreate();

    expect(form.getByText(SHAPE)).toBeInTheDocument();
    expect(form.queryByLabelText(FACTS)).toBeNull();
  });

  it('asks a café about both', async () => {
    setVertical('cafe', { productKinds: ['simple', 'composite'], dishFacts: true });
    const form = await openCreate();

    expect(form.getByText(SHAPE)).toBeInTheDocument();
    expect(form.getByLabelText(FACTS)).toBeInTheDocument();
  });

  it('asks about both when the vertical says nothing — an older cached auth', async () => {
    setVertical('clothing', {});
    const form = await openCreate();

    expect(form.getByText(SHAPE)).toBeInTheDocument();
    expect(form.getByLabelText(FACTS)).toBeInTheDocument();
  });
});

describe('the card — by what the store sells, and never hiding what it holds', () => {
  it('shows a boutique\'s simple card neither question', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    await openCard();
    expect(screen.queryByText(SHAPE)).toBeNull();
    expect(screen.queryByLabelText(FACTS)).toBeNull();
  });

  it('keeps the shape question on a card that is already a composite (a store that changed its vertical)', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    getProducts.mockResolvedValue([card({ kind: 'composite', stock_mode: 'derived' } as Partial<Product>)]);
    await openCard();
    expect(screen.getByText(SHAPE)).toBeInTheDocument();
  });

  it('keeps a composition already written on a card, and its allergens', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    getProducts.mockResolvedValue([card({ composition: 'Бавовна 100%', allergens: [] })]);
    await openCard();
    expect(screen.getByLabelText(FACTS)).toHaveValue('Бавовна 100%');
  });

  it('keeps ticked allergens on a card, even where the store asks for none', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    getProducts.mockResolvedValue([card({ allergens: ['milk'] })]);
    await openCard();
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not make a field vanish mid-edit: clearing a stored composition leaves the box on screen', async () => {
    setVertical('clothing', { productKinds: ['simple'], dishFacts: false });
    getProducts.mockResolvedValue([card({ composition: 'Бавовна' })]);
    await openCard();
    await userEvent.clear(screen.getByLabelText(FACTS));
    expect(screen.getByLabelText(FACTS)).toHaveValue('');
  });

  it('shows a café both', async () => {
    setVertical('cafe', { productKinds: ['simple', 'composite'], dishFacts: true });
    await openCard();
    expect(screen.getByText(SHAPE)).toBeInTheDocument();
    expect(screen.getByLabelText(FACTS)).toBeInTheDocument();
  });

  it('asks about both when the vertical says nothing — an older cached auth', async () => {
    setVertical('clothing', {});
    await openCard();
    expect(screen.getByText(SHAPE)).toBeInTheDocument();
    expect(screen.getByLabelText(FACTS)).toBeInTheDocument();
  });
});
