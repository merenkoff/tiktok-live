// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The create form asks what the store sells (TechDocs/POS_CLOTHING.md, phase
// C0): a boutique owner adding a shirt was being asked what a composite is and
// for a dish's composition and allergens. The vertical said so all along
// (`productKinds`, `dishFacts`); the form now listens. The card's own page —
// which also never hides what a card already holds — is covered by
// `ProductPage.formScope.test.tsx` (C1e).

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

type Scope = { productKinds?: Array<'simple' | 'composite'>; dishFacts?: boolean };

const base = {
  title: 'Магазин',
  attributes: [],
  units: ['шт'],
  defaultUnit: 'шт',
  maxCompositionDepth: 1,
};

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

const { ProductsPage } = await import('./ProductsPage');

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
    variants: [
      {
        id: 70,
        product_id: 7,
        attributes: {},
        label: '',
        unit: 'шт',
        sku: null,
        barcode: null,
        price_cents: 69000,
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
  getProducts.mockResolvedValue([card()]);
});

async function openCreate() {
  renderWithProviders(<ProductsPage />, { route: '/admin/products' });
  await screen.findByText('Футболка');
  await userEvent.click(screen.getByRole('button', { name: /Додати товар/ }));
  return within(screen.getByRole('heading', { name: 'Новий товар' }).closest('form')!);
}

const SHAPE = 'Що це за товар';
const FACTS = /Склад для гостя/;

describe('the create form — by what the store sells', () => {
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
