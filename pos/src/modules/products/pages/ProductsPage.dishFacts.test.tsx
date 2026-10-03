// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the create form sends about a dish's guest-facing words (migration 060,
// phase Q3b): it has a description at all — it never did — and carries the
// composition line and the ticked allergens. A field that is on screen but not
// in the request is the failure this pins. The card's own page is covered by
// `ProductPage.dishFacts.test.tsx` (C1e).

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CAFE = {
  id: 'cafe',
  title: 'Кав’ярня',
  attributes: [],
  units: ['шт'],
  defaultUnit: 'шт',
  maxCompositionDepth: 3,
};

const getProducts = vi.fn<[], Promise<Product[]>>();
const createProduct = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CAFE,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      getTags: () => Promise.resolve([]),
      listModifierGroups: () => Promise.resolve([]),
      posRequest: () => Promise.resolve([]),
      createProduct: (...a: unknown[]) => createProduct(...a),
      setProductTags: () => Promise.resolve([]),
      setProductModifierGroups: () => Promise.resolve([]),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

/** The «Новий товар» form: its placeholders («Назва», «Опис») also appear elsewhere on the page. */
async function openCreateForm() {
  renderWithProviders(<ProductsPage />, { route: '/admin/products' });
  await screen.findByText('Латте');
  await userEvent.click(screen.getByRole('button', { name: /Додати товар/ }));
  const form = screen.getByRole('heading', { name: 'Новий товар' }).closest('form')!;
  return within(form);
}

function latte(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    name: 'Латте',
    description: 'Ніжний',
    composition: 'Еспресо, молоко',
    allergens: ['milk'],
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
        price_cents: 6000,
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
  getProducts.mockResolvedValue([latte()]);
  createProduct.mockResolvedValue({ id: 99 });
});

describe('the create form', () => {
  it('sends the description, the composition and the ticked allergens', async () => {
    const form = await openCreateForm();

    await userEvent.type(form.getByPlaceholderText('Назва'), 'Круасан');
    await userEvent.type(form.getByPlaceholderText('Ціна, грн'), '75');
    await userEvent.type(form.getByPlaceholderText('Опис'), 'Масляний');
    await userEvent.type(form.getByLabelText(/Склад для гостя/), 'Борошно, масло, яйця');
    await userEvent.click(form.getByTestId('allergen-chip-milk'));
    await userEvent.click(form.getByTestId('allergen-chip-gluten'));
    await userEvent.click(form.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct.mock.calls[0]![0]).toMatchObject({
      name: 'Круасан',
      description: 'Масляний',
      composition: 'Борошно, масло, яйця',
      // In the list's own order, however the chips were tapped.
      allergens: ['gluten', 'milk'],
    });
  });

  it('sends «not said» for what was left alone: an empty composition and no allergens', async () => {
    const form = await openCreateForm();
    await userEvent.type(form.getByPlaceholderText('Назва'), 'Чай');
    await userEvent.type(form.getByPlaceholderText('Ціна, грн'), '40');
    await userEvent.click(form.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct.mock.calls[0]![0]).toMatchObject({ composition: '', allergens: [] });
  });
});
