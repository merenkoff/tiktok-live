// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Saving the card (C1e): only what changed is written, a failed row is named,
// the price can be typed, and the shape's ordering rules still hold.

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
const base = { title: 'Магазин', units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };
let vertical: Record<string, unknown> = {};
const setVertical = (id: 'clothing' | 'flowers') => {
  vertical =
    id === 'clothing'
      ? { id, ...base, attributes: CLOTHING_ATTRS, productKinds: ['simple'], dishFacts: false, autoBarcode: true }
      : { id, ...base, attributes: [], productKinds: ['simple', 'composite'], dishFacts: false };
};

let catalog: Product[] = [];
const getProducts = vi.fn(() => Promise.resolve(catalog));
const updateProduct = vi.fn();
const updateVariant = vi.fn();
const archiveVariant = vi.fn();
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
      listModifierGroups: () => Promise.resolve([]),
      posRequest: () => Promise.resolve([]),
      updateProduct: (...a: unknown[]) => updateProduct(...a),
      updateVariant: (...a: unknown[]) => updateVariant(...a),
      archiveVariant: (...a: unknown[]) => archiveVariant(...a),
      setProductTags: (...a: unknown[]) => setProductTags(...a),
      setProductModifierGroups: (...a: unknown[]) => setProductModifierGroups(...a),
      generateInternalBarcode: () => Promise.resolve('2900000000011'),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function variant(id: number, product_id: number, label: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    product_id,
    attributes: {},
    label,
    unit: 'шт',
    sku: null,
    barcode: null,
    price_cents: 40000,
    cost_cents: 0,
    is_active: true,
    quantity: 1,
    ...extra,
  };
}

function card(over: Partial<Product> = {}): Product {
  return {
    id: 7,
    name: 'Костюмчик Зайчик',
    description: null,
    composition: null,
    allergens: [],
    kind: 'simple',
    stock_mode: 'own',
    image_url: null,
    is_active: true,
    tag_ids: [],
    modifier_group_ids: [],
    variants: [variant(70, 7, 'блакитний / 86'), variant(71, 7, 'блакитний / 92')],
    ...over,
  } as unknown as Product;
}

/** The server as a mutable fixture: a write lands in the catalogue the next read returns. */
function serveWrites() {
  updateProduct.mockImplementation((id: number, patch: Record<string, unknown>) => {
    catalog = catalog.map((p) => (p.id === id ? ({ ...p, ...patch } as Product) : p));
    return Promise.resolve(catalog.find((p) => p.id === id));
  });
  updateVariant.mockImplementation((id: number, patch: Record<string, unknown>) => {
    catalog = catalog.map((p) => ({
      ...p,
      variants: p.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
    return Promise.resolve(catalog[0]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setVertical('clothing');
  catalog = [card()];
  serveWrites();
});

async function openCard(id = 7) {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: `/admin/products/${id}` }
  );
  return screen.findByRole('button', { name: 'Зберегти' });
}

const price = (name: string) => screen.getByRole('textbox', { name: `Ціна · ${name}` });
const sku = (name: string) => screen.getByRole('textbox', { name: `Артикул · ${name}` });

describe('what a save writes', () => {
  it('is dark while nothing changed', async () => {
    const save = await openCard();
    expect(save).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Скасувати' })).toBeNull();
  });

  it('writes ONE variant when one price changed — and nothing about the product', async () => {
    const user = userEvent.setup();
    const save = await openCard();

    await user.clear(price('блакитний / 86'));
    await user.type(price('блакитний / 86'), '450');
    expect(price('блакитний / 86')).toHaveValue('450');
    await user.click(save);

    await waitFor(() => expect(updateVariant).toHaveBeenCalledTimes(1));
    expect(updateVariant.mock.calls[0]![0]).toBe(70);
    expect(updateVariant.mock.calls[0]![1]).toMatchObject({ price_cents: 45000, sku: '', barcode: '' });
    expect(updateVariant.mock.calls[0]![1]).not.toHaveProperty('components');
    expect(updateProduct).not.toHaveBeenCalled();
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled());
  });

  it('lets a price be typed digit by digit, the way it never could', async () => {
    const user = userEvent.setup();
    await openCard();
    const field = price('блакитний / 86');
    await user.clear(field);
    await user.type(field, '4');
    expect(field).toHaveValue('4');
    await user.type(field, '5,5');
    expect(field).toHaveValue('45,5');
  });

  it('writes the product when its name changed — and no variant', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.type(screen.getByPlaceholderText('Назва'), ' Люкс');
    await user.click(save);

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1));
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ name: 'Костюмчик Зайчик Люкс' });
    expect(updateVariant).not.toHaveBeenCalled();
  });

  it('sends the tags and the questions only when they changed', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.click(screen.getByRole('checkbox', { name: /Новинки/ }));
    await user.click(save);
    await waitFor(() => expect(setProductTags).toHaveBeenCalledWith(7, [1]));
    expect(setProductModifierGroups).not.toHaveBeenCalled();
  });

  it('refuses a changed row without a price, saying so on the row', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.clear(price('блакитний / 92'));
    await user.click(save);
    expect((await screen.findAllByText('Вкажіть ціну')).length).toBeGreaterThanOrEqual(2);
    expect(updateVariant).not.toHaveBeenCalled();
  });
});

describe('when a row is refused', () => {
  it('names the row with the server\'s words, keeps the others clean, and retries only what failed', async () => {
    const user = userEvent.setup();
    let refuse = true;
    const good = updateVariant.getMockImplementation()!;
    updateVariant.mockImplementation((id: number, patch: Record<string, unknown>) => {
      if (id === 71 && refuse) {
        refuse = false;
        return Promise.reject({ response: { status: 409, data: { error: 'Артикул «KZ-92» вже є в магазині' } } });
      }
      return good(id, patch);
    });
    const save = await openCard();

    await user.type(sku('блакитний / 86'), 'KZ-86');
    await user.type(sku('блакитний / 92'), 'KZ-92');
    await user.click(save);

    // The row says why, and the banner names the row.
    expect(await screen.findAllByText(/Артикул «KZ-92» вже є в магазині/)).toHaveLength(2);
    expect(screen.getByText(/^блакитний \/ 92: /)).toBeInTheDocument();
    expect(updateVariant).toHaveBeenCalledTimes(2);
    // Still unsaved, so the button stays lit…
    expect(save).toBeEnabled();

    // …and the second attempt writes only the row that failed: the first one
    // went through and the snapshot was re-read, so it is clean now.
    await user.click(save);
    await waitFor(() => expect(updateVariant).toHaveBeenCalledTimes(3));
    expect(updateVariant.mock.calls[2]![0]).toBe(71);
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
  });
});

describe('the sheet of one variant', () => {
  it('hands the purchase price to the card, which sends it as cost_cents', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.click(screen.getByRole('button', { name: 'Ще · блакитний / 86' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'блакитний / 86' }));
    await user.type(sheet.getByPlaceholderText('Не вказано'), '120');
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(save);
    await waitFor(() => expect(updateVariant).toHaveBeenCalledTimes(1));
    expect(updateVariant.mock.calls[0]![1]).toMatchObject({ cost_cents: 12000, price_cents: 40000 });
  });

  it('throws its copy away on Скасувати', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.click(screen.getByRole('button', { name: 'Ще · блакитний / 86' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'блакитний / 86' }));
    await user.type(sheet.getByPlaceholderText('Не вказано'), '120');
    await user.click(sheet.getByRole('button', { name: 'Скасувати' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save).toBeDisabled();
  });

  it('archives a variant after asking, and the neighbour keeps its unsaved article', async () => {
    const user = userEvent.setup();
    archiveVariant.mockImplementation((id: number) => {
      catalog = catalog.map((p) => ({ ...p, variants: p.variants.filter((v) => v.id !== id) }));
      return Promise.resolve(catalog[0]);
    });
    await openCard();
    await user.type(sku('блакитний / 86'), 'MY-SKU');

    await user.click(screen.getByRole('button', { name: 'Ще · блакитний / 92' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'блакитний / 92' }));
    await user.click(sheet.getByRole('button', { name: 'Архівувати варіант' }));
    await screen.findByTestId('confirm-sheet');
    expect(archiveVariant).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('confirm-sheet-ok'));

    await waitFor(() => expect(archiveVariant).toHaveBeenCalledWith(71));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Артикул · блакитний / 92' })).toBeNull());
    expect(sku('блакитний / 86')).toHaveValue('MY-SKU');
  });
});

describe('the shape\'s ordering rules', () => {
  const STEM = card({
    id: 1,
    name: 'Троянда',
    variants: [variant(10, 1, 'Червона')],
  });

  it('simple → derived goes through «own», writes the recipe, then flips the mode', async () => {
    setVertical('flowers');
    catalog = [card({ id: 2, name: 'Крафт', variants: [variant(20, 2, '')] }), STEM];
    const user = userEvent.setup();
    const save = await openCard(2);

    await user.selectOptions(screen.getByLabelText('Що це за товар'), 'derived');
    await user.click(screen.getByRole('button', { name: 'Ще · Варіант' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Варіант' }));
    await user.selectOptions(sheet.getByLabelText('Складник', { exact: true }), '10');
    await user.clear(sheet.getByLabelText('Кількість складника'));
    await user.type(sheet.getByLabelText('Кількість складника'), '5');
    await user.click(sheet.getByRole('button', { name: 'Додати', exact: true }));
    await user.click(sheet.getByRole('button', { name: 'Готово' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(save);
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(2));
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ kind: 'composite', stock_mode: 'own' });
    expect(updateVariant.mock.calls[0]![1]).toMatchObject({ components: [{ component_variant_id: 10, quantity: 5 }] });
    expect(updateProduct.mock.calls[1]![1]).toMatchObject({ stock_mode: 'derived' });
    const order = [
      updateProduct.mock.invocationCallOrder[0]!,
      updateVariant.mock.invocationCallOrder[0]!,
      updateProduct.mock.invocationCallOrder[1]!,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('composite → simple clears every composed variant first, touched or not', async () => {
    setVertical('flowers');
    const recipe = [
      { id: 1, component_variant_id: 10, quantity: 6, sort_order: 0, product_name: 'Троянда', label: 'Червона', unit: 'шт' },
    ];
    catalog = [
      card({
        id: 3,
        name: 'Букет',
        kind: 'composite',
        stock_mode: 'own',
        variants: [variant(30, 3, 'S', { components: recipe }), variant(31, 3, 'M', { components: recipe })],
      }),
      STEM,
    ];
    const user = userEvent.setup();
    const save = await openCard(3);

    await user.selectOptions(screen.getByLabelText('Що це за товар'), '');
    await user.click(save);

    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1));
    expect(updateVariant).toHaveBeenCalledTimes(2);
    expect(updateVariant.mock.calls.map((c) => c[0])).toEqual([30, 31]);
    for (const call of updateVariant.mock.calls) expect(call[1]).toMatchObject({ components: [] });
    expect(updateProduct.mock.calls[0]![1]).toMatchObject({ kind: 'simple' });
    expect(Math.max(...updateVariant.mock.invocationCallOrder)).toBeLessThan(updateProduct.mock.invocationCallOrder[0]!);
  });
});

describe('Скасувати', () => {
  it('asks, then puts the card back to what is saved', async () => {
    const user = userEvent.setup();
    const save = await openCard();
    await user.type(screen.getByPlaceholderText('Назва'), ' Люкс');
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    await user.click(screen.getByTestId('confirm-sheet-ok'));
    expect(screen.getByPlaceholderText('Назва')).toHaveValue('Костюмчик Зайчик');
    expect(save).toBeDisabled();
  });
});
