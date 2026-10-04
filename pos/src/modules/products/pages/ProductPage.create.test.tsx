// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Новий товар» on its own page (TechDocs/POS_CLOTHING.md, C1 → C1e): a
// garment is a size × colour matrix in one request — and no invented «690» —
// and the page leaves for the card the moment the product exists, so a failed
// follow-up can never turn a second «Створити» into a duplicate.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
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
const createProduct = vi.fn();
const setProductTags = vi.fn(() => Promise.resolve([]));
const setProductModifierGroups = vi.fn(() => Promise.resolve([]));

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => vertical,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      getTags: () => Promise.resolve([{ id: 1, name: 'Новинки', parent_id: null, color: null, show_in_catalog_bar: false }]),
      listModifierGroups: () =>
        Promise.resolve([{ id: 7, name: 'Молоко', min_select: 1, max_select: 1, is_active: true, modifiers: [] }]),
      posRequest: () => Promise.resolve([]),
      createProduct: (payload: unknown) => createProduct(payload),
      setProductTags: (...a: unknown[]) => setProductTags(...a),
      setProductModifierGroups: (...a: unknown[]) => setProductModifierGroups(...a),
      generateInternalBarcode: () => Promise.resolve('2900000000011'),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function variant(id: number, product_id: number, color: string, size: string) {
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

function Probe() {
  const location = useLocation();
  return (
    <p data-testid="where">
      {location.pathname}|{(location.state as { flash?: string } | null)?.flash ?? ''}
    </p>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setVertical('clothing');
  getProducts.mockResolvedValue([card(7, 'Костюмчик Зайчик', [variant(70, 7, 'блакитний', '86')])]);
  createProduct.mockResolvedValue({ id: 99 });
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this run */
  }
});

async function openCreate() {
  renderWithProviders(
    <>
      <Probe />
      <Routes>
        <Route path="/admin/products/new" element={<ProductPage />} />
        <Route path="/admin/products/:id" element={<p>Картка</p>} />
      </Routes>
    </>,
    { route: '/admin/products/new' }
  );
  return within(await screen.findByRole('form', { name: 'Новий товар' }));
}

const sizes = (scope: ReturnType<typeof within>) => within(scope.getByRole('group', { name: 'Розміри' }));

describe('the create page — a garment is a matrix', () => {
  it('draws the matrix in place of the one-variant fields, keeps the description, and starts dark', async () => {
    const form = await openCreate();

    expect(form.getByTestId('variant-matrix')).toBeInTheDocument();
    expect(form.queryByText(/Артикул \(SKU\)/)).toBeNull();
    expect(form.queryByText(/Штрихкод — те, що читає сканер/)).toBeNull();
    expect(form.getByPlaceholderText('Опис')).toBeInTheDocument();
    expect(form.getByRole('button', { name: 'Створити' })).toBeDisabled();
  });

  it('creates ONE card with every colour × size in a single request, no article and no barcode — and goes to it', async () => {
    const user = userEvent.setup();
    const form = await openCreate();

    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.type(form.getByLabelText('Новий колір'), 'блакитний{Enter}');
    await user.type(form.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.click(sizes(form).getByRole('button', { name: '92' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByRole('button', { name: 'Створити' }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    const payload = createProduct.mock.calls[0]![0] as { name: string; variants: Array<Record<string, unknown>> };
    expect(payload.name).toBe('Реглан');
    expect(payload.variants).toHaveLength(4);
    expect(payload.variants.map((v) => v.attributes)).toEqual([
      { color: 'блакитний', size: '86' },
      { color: 'блакитний', size: '92' },
      { color: 'рожевий', size: '86' },
      { color: 'рожевий', size: '92' },
    ]);
    for (const v of payload.variants) {
      expect(v.price_cents).toBe(35000);
      expect(v).not.toHaveProperty('barcode');
      expect(v).not.toHaveProperty('sku');
    }
    expect(await screen.findByText('Картка')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products/99|');
    // Nothing was chosen on the side, so nothing was sent for it.
    expect(setProductTags).not.toHaveBeenCalled();
    expect(setProductModifierGroups).not.toHaveBeenCalled();
  });

  it('suggests the colours the store already has, and reuses their spelling', async () => {
    const user = userEvent.setup();
    const form = await openCreate();

    await user.type(form.getByLabelText('Новий колір'), 'Блакитний{Enter}');

    // «блакитний» is how the store's own variants spell it.
    expect(form.getByRole('button', { name: 'Прибрати колір блакитний' })).toBeInTheDocument();
  });

  it('will not save without a price: it says so and sends nothing', async () => {
    const user = userEvent.setup();
    const form = await openCreate();

    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.click(form.getByRole('button', { name: 'Створити' }));

    // Said twice on purpose: under the rows it concerns, and in the page's banner where a save's errors go.
    expect(await screen.findAllByText('Вкажіть ціну: загальну або в кожному рядку')).toHaveLength(2);
    expect(createProduct).not.toHaveBeenCalled();
  });
});

describe('the create page — what follows the one request', () => {
  it('opens the new card ready to edit, not stuck in «Створюємо…»', async () => {
    // `/new` and `/:id` are one route element: without a key on the card the
    // instance survived the navigation with `saving` still true, and the new
    // card came up with every field disabled.
    const user = userEvent.setup();
    getProducts.mockResolvedValue([card(99, 'Реглан', [variant(990, 99, 'блакитний', '86')])]);
    renderWithProviders(
      <Routes>
        <Route path="/admin/products/new" element={<ProductPage />} />
        <Route path="/admin/products/:id" element={<ProductPage />} />
      </Routes>,
      { route: '/admin/products/new' }
    );
    const form = within(await screen.findByRole('form', { name: 'Новий товар' }));
    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByRole('button', { name: 'Створити' }));

    const save = await screen.findByRole('button', { name: 'Зберегти' });
    expect(save).toBeDisabled();
    expect(screen.getByPlaceholderText('Назва')).toBeEnabled();
    expect(screen.getByPlaceholderText('Назва')).toHaveValue('Реглан');
    expect(screen.getByRole('textbox', { name: 'Ціна · блакитний / 86' })).toBeEnabled();
  });

  it('sends the chosen tags and questions after the product exists', async () => {
    const user = userEvent.setup();
    const form = await openCreate();
    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByRole('checkbox', { name: /Новинки/ }));
    await user.click(form.getByTestId('modifier-group-chip-7'));
    await user.click(form.getByRole('button', { name: 'Створити' }));

    await waitFor(() => expect(setProductTags).toHaveBeenCalledWith(99, [1]));
    expect(setProductModifierGroups).toHaveBeenCalledWith(99, [7]);
    expect(createProduct.mock.invocationCallOrder[0]).toBeLessThan(setProductTags.mock.invocationCallOrder[0]!);
  });

  it('leaves for the card even when a follow-up fails — and says what to redo, so nothing is created twice', async () => {
    const user = userEvent.setup();
    setProductModifierGroups.mockRejectedValueOnce(new Error('boom'));
    const form = await openCreate();
    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByTestId('modifier-group-chip-7'));
    await user.click(form.getByRole('button', { name: 'Створити' }));

    expect(await screen.findByText('Картка')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(/\/admin\/products\/99\|Товар створено, але не збережено: модифікатори/);
    expect(createProduct).toHaveBeenCalledTimes(1);
  });

  it('stays, with the server\'s words, when the one request is refused', async () => {
    const user = userEvent.setup();
    createProduct.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Штрихкод «4820000000001» вже є в магазині' } },
    });
    const form = await openCreate();
    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByRole('button', { name: 'Створити' }));

    expect(await screen.findByText('Штрихкод «4820000000001» вже є в магазині')).toBeInTheDocument();
    expect(screen.queryByText('Картка')).toBeNull();
    expect(screen.getByRole('button', { name: 'Створити' })).toBeEnabled();
  });
});

describe('the create page — the price is never invented', () => {
  it('starts a florist\'s price empty and required, where it used to say 690', async () => {
    setVertical('flowers');
    getProducts.mockResolvedValue([card(1, 'Троянда', [])]);
    const form = await openCreate();

    // The one-variant form stays for a vertical with no size (no matrix here).
    expect(form.queryByTestId('variant-matrix')).toBeNull();
    const field = form.getByPlaceholderText('Ціна, грн');
    expect(field).toHaveValue('');
    expect(field).toBeRequired();
    expect(form.getByText(/Артикул \(SKU\)/)).toBeInTheDocument();
  });

  it('creates a florist\'s one variant with its stock and article', async () => {
    setVertical('flowers');
    getProducts.mockResolvedValue([card(1, 'Троянда', [])]);
    const user = userEvent.setup();
    const form = await openCreate();
    await user.type(form.getByPlaceholderText('Назва'), 'Півонія');
    await user.type(form.getByPlaceholderText('Колір'), 'рожева');
    await user.type(form.getByPlaceholderText('Ціна, грн'), '120');
    await user.clear(form.getByPlaceholderText('Залишок'));
    await user.type(form.getByPlaceholderText('Залишок'), '30');
    await user.click(form.getByRole('button', { name: 'Створити' }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct.mock.calls[0]![0]).toMatchObject({
      name: 'Півонія',
      variants: [{ attributes: { color: 'рожева' }, price_cents: 12000, quantity: 30 }],
    });
  });
});
