// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the product card sends about a dish's guest-facing words (migration 060,
// phase Q3b), now on the card's own page — new and old alike: the create page
// has a description at all (it never did), the composition line and the ticked
// allergens travel with the save, and «taking every allergen away» is sent as
// an empty list rather than left out.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CAFE = { id: 'cafe', title: 'Кав’ярня', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 3 };

const getProducts = vi.fn<[], Promise<Product[]>>();
const createProduct = vi.fn();
const updateProduct = vi.fn();
const updateVariant = vi.fn();

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
      updateProduct: (...a: unknown[]) => updateProduct(...a),
      updateVariant: (...a: unknown[]) => updateVariant(...a),
      setProductTags: () => Promise.resolve([]),
      setProductModifierGroups: () => Promise.resolve([]),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function latte(overrides: Partial<Product> = {}): Product {
  return {
    id: 42,
    name: 'Латте',
    description: 'Ніжний',
    composition: 'Еспресо, молоко',
    allergens: ['milk'],
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [
      { id: 420, product_id: 42, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 6000, cost_cents: 0, is_active: true, quantity: 3 },
    ],
    ...overrides,
  } as Product;
}

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([latte()]);
  createProduct.mockResolvedValue({ id: 99 });
  updateProduct.mockResolvedValue(latte());
  updateVariant.mockResolvedValue(latte());
});

async function openCard() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: '/admin/products/42' }
  );
  return screen.findByLabelText(/Склад для гостя/);
}

async function openCreate() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/new" element={<ProductPage />} />
      <Route path="/admin/products/:id" element={<p>Картка</p>} />
    </Routes>,
    { route: '/admin/products/new' }
  );
  return within(await screen.findByRole('form', { name: 'Новий товар' }));
}

describe('the create page', () => {
  it('sends the description, the composition and the ticked allergens', async () => {
    const form = await openCreate();

    await userEvent.type(form.getByPlaceholderText('Назва'), 'Круасан');
    await userEvent.type(form.getByPlaceholderText('Ціна, грн'), '75');
    await userEvent.type(form.getByPlaceholderText('Опис'), 'Масляний');
    await userEvent.type(form.getByLabelText(/Склад для гостя/), 'Борошно, масло, яйця');
    await userEvent.click(form.getByTestId('allergen-chip-milk'));
    await userEvent.click(form.getByTestId('allergen-chip-gluten'));
    await userEvent.click(form.getByRole('button', { name: 'Створити' }));

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
    const form = await openCreate();
    await userEvent.type(form.getByPlaceholderText('Назва'), 'Чай');
    await userEvent.type(form.getByPlaceholderText('Ціна, грн'), '40');
    await userEvent.click(form.getByRole('button', { name: 'Створити' }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct.mock.calls[0]![0]).toMatchObject({ composition: '', allergens: [] });
  });
});

describe('the card', () => {
  it('opens with what is stored, and saves a change to either field', async () => {
    const composition = await openCard();
    expect(composition).toHaveValue('Еспресо, молоко');
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('allergen-chip-eggs')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.clear(composition);
    await userEvent.type(composition, 'Еспресо, вівсяне молоко');
    await userEvent.click(screen.getByTestId('allergen-chip-eggs'));
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]![0]).toBe(42);
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({
      name: 'Латте',
      description: 'Ніжний',
      composition: 'Еспресо, вівсяне молоко',
      allergens: ['eggs', 'milk'],
    });
    // The words changed, the variant did not — so the variant is not written.
    expect(updateVariant).not.toHaveBeenCalled();
  });

  it('takes a card from an older backend — no such fields — as «not said»', async () => {
    getProducts.mockResolvedValue([latte({ composition: undefined, allergens: undefined })]);
    expect(await openCard()).toHaveValue('');
    expect(screen.getByTestId('allergen-chip-milk')).toHaveAttribute('aria-pressed', 'false');
  });

  it('can take every allergen away: an empty set is sent, not left out', async () => {
    await openCard();
    await userEvent.click(screen.getByTestId('allergen-chip-milk'));
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalled());
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ allergens: [] });
  });
});
