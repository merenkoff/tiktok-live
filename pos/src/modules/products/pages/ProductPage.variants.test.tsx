// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Adding variants to a card from its own page (TechDocs/POS_CLOTHING.md, C1 → C1e):
// the size × colour matrix now lives in a dialog, and the rows the owner has
// open keep what was typed into them while it adds.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
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
const addVariant = vi.fn();
const addVariants = vi.fn();
const updateVariant = vi.fn(() => Promise.resolve({}));

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
      addVariant: (id: number, payload: unknown) => addVariant(id, payload),
      addVariants: (id: number, payload: unknown) => addVariants(id, payload),
      updateProduct: () => Promise.resolve({}),
      updateVariant: (id: number, payload: unknown) => updateVariant(id, payload),
      setProductTags: () => Promise.resolve([]),
      setProductModifierGroups: () => Promise.resolve([]),
      generateInternalBarcode: () => Promise.resolve('2900000000011'),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

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
    tag_ids: [],
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

async function openCard(id = 7) {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: `/admin/products/${id}` }
  );
  await screen.findByRole('button', { name: 'Зберегти' });
}

async function openAdd(id = 7) {
  await openCard(id);
  await userEvent.click(screen.getByRole('button', { name: /Додати варіант/ }));
  return within(await screen.findByRole('dialog', { name: 'Додати варіанти' }));
}

const sizes = (scope: ReturnType<typeof within>) => within(scope.getByRole('group', { name: 'Розміри' }));
const articles = () => screen.getAllByRole('textbox', { name: /^Артикул · / });

describe('adding sizes and colours to a card', () => {
  it('opens the matrix in a dialog that hangs off the body', async () => {
    const dialog = await openAdd();
    expect(dialog.getByTestId('variant-matrix')).toBeInTheDocument();
    const overlay = screen.getByTestId('add-variants-dialog');
    expect(overlay.parentElement).toBe(document.body);
  });

  it('lists what the card already has as «вже є» and adds only the rest, in one request — then closes', async () => {
    const user = userEvent.setup();
    const dialog = await openAdd();
    addVariants.mockResolvedValue({
      ...ZAICHYK,
      variants: [...ZAICHYK.variants, variant(72, 7, 'блакитний', '92')],
    });

    await user.type(dialog.getByLabelText('Новий колір'), 'блакитний{Enter}');
    await user.click(sizes(dialog).getByRole('button', { name: '86' }));
    await user.click(sizes(dialog).getByRole('button', { name: '92' }));
    const matrix = within(dialog.getByTestId('variant-matrix'));
    await user.type(matrix.getByPlaceholderText('Ціна, грн'), '400');

    expect(matrix.getByText('вже є')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Додати варіантів: 1' }));

    await waitFor(() => expect(addVariants).toHaveBeenCalledTimes(1));
    expect(addVariants.mock.calls[0]![0]).toBe(7);
    expect(addVariants.mock.calls[0]![1]).toEqual([
      { attributes: { color: 'блакитний', size: '92' }, unit: 'шт', price_cents: 40000, quantity: 0 },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // The new row is on the card at once, in the server's order.
    expect(screen.getByRole('textbox', { name: 'Артикул · блакитний / 92' })).toBeInTheDocument();
  });

  it('keeps what was typed into another row of the card while it adds', async () => {
    const user = userEvent.setup();
    await openCard();
    addVariants.mockResolvedValue({
      ...ZAICHYK,
      variants: [...ZAICHYK.variants, variant(72, 7, 'рожевий', '86')],
    });

    // An unsaved edit of the first existing variant's article…
    await user.type(articles()[0]!, 'MY-SKU');

    await user.click(screen.getByRole('button', { name: /Додати варіант/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Додати варіанти' }));
    await user.type(dialog.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(dialog).getByRole('button', { name: '86' }));
    await user.type(within(dialog.getByTestId('variant-matrix')).getByPlaceholderText('Ціна, грн'), '400');
    await user.click(dialog.getByRole('button', { name: 'Додати варіантів: 1' }));

    await waitFor(() => expect(addVariants).toHaveBeenCalledTimes(1));
    // …is still on screen afterwards (the list used to be replaced by the server's).
    await waitFor(() => expect(articles()).toHaveLength(3));
    expect(articles()[0]).toHaveValue('MY-SKU');
    // And the card knows it is still unsaved.
    expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled();
  });

  it('shows the server\'s own words when an article or barcode is taken, and stays open', async () => {
    const user = userEvent.setup();
    const dialog = await openAdd();
    addVariants.mockRejectedValue({
      response: { status: 409, data: { error: 'Артикул «KZ-86» вже є в магазині' } },
    });

    await user.type(dialog.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(dialog).getByRole('button', { name: '86' }));
    await user.type(within(dialog.getByTestId('variant-matrix')).getByPlaceholderText('Ціна, грн'), '400');
    await user.click(dialog.getByRole('button', { name: 'Додати варіантів: 1' }));

    expect(await dialog.findByText('Артикул «KZ-86» вже є в магазині')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Додати варіанти' })).toBeInTheDocument();
  });

  it('will not add a blank variant when nothing is chosen', async () => {
    const user = userEvent.setup();
    const dialog = await openAdd();

    await user.click(dialog.getByRole('button', { name: 'Додати варіанти' }));

    expect((await screen.findAllByText('Оберіть кольори й розміри')).length).toBeGreaterThan(0);
    expect(addVariants).not.toHaveBeenCalled();
  });
});

describe('a vertical with no size — the one-variant form', () => {
  beforeEach(() => {
    setVertical('flowers');
    getProducts.mockResolvedValue([card(1, 'Троянда', [variant(10, 1, 'червона', '60')])]);
  });

  it('keeps the one-variant form instead of the matrix, and asks for its price', async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(1);

    expect(dialog.queryByTestId('variant-matrix')).toBeNull();
    await user.click(dialog.getByRole('button', { name: 'Додати варіант' }));

    expect(await dialog.findByText('Вкажіть ціну')).toBeInTheDocument();
    expect(addVariant).not.toHaveBeenCalled();
  });

  it('adds one variant with its price, opening stock, article and barcode', async () => {
    const user = userEvent.setup();
    const dialog = await openAdd(1);
    addVariant.mockResolvedValue(card(1, 'Троянда', [variant(10, 1, 'червона', '60'), variant(11, 1, 'біла', '60')]));

    await user.type(dialog.getByPlaceholderText('Колір'), 'біла');
    await user.type(dialog.getByPlaceholderText('Ціна, грн'), '250');
    await user.clear(dialog.getByPlaceholderText('Залишок'));
    await user.type(dialog.getByPlaceholderText('Залишок'), '12');
    await user.click(dialog.getByRole('button', { name: 'Додати варіант' }));

    await waitFor(() => expect(addVariant).toHaveBeenCalledTimes(1));
    expect(addVariant.mock.calls[0]![0]).toBe(1);
    expect(addVariant.mock.calls[0]![1]).toMatchObject({
      attributes: { color: 'біла' },
      price_cents: 25000,
      quantity: 12,
      pack_qty: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Артикул · біла / 60' })).toBeInTheDocument();
  });
});
