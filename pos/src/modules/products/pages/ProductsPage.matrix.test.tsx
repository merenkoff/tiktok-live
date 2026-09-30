// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product form for a garment (TechDocs/POS_CLOTHING.md, phase C1): one card,
// a size × colour matrix, one request — and no invented «690». Plus the search
// box the admin's product list never had.

import { screen, waitFor, within } from '@testing-library/react';
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
const createProduct = vi.fn();
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
      createProduct: (payload: unknown) => createProduct(payload),
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
  createProduct.mockResolvedValue({ id: 99 });
  try {
    window.localStorage.clear();
  } catch {
    /* no storage in this run */
  }
});

async function openCreate() {
  renderWithProviders(<ProductsPage />, { route: '/admin/products' });
  await screen.findByText('Костюмчик Зайчик');
  await userEvent.click(screen.getByRole('button', { name: /Додати товар/ }));
  return within(screen.getByRole('heading', { name: 'Новий товар' }).closest('form')!);
}

async function openEdit(id = 7) {
  renderWithProviders(<ProductsPage />, { route: `/admin/products?edit=${id}` });
  await screen.findByRole('button', { name: 'Зберегти' });
  return within(screen.getByRole('heading', { name: 'Редагування' }).closest('form')!);
}

const sizes = (scope: ReturnType<typeof within>) => within(scope.getByRole('group', { name: 'Розміри' }));

describe('the create form — a garment is a matrix', () => {
  it('draws the matrix in place of the one-variant fields, and keeps the description', async () => {
    const form = await openCreate();

    expect(form.getByTestId('variant-matrix')).toBeInTheDocument();
    expect(form.queryByText(/Артикул \(SKU\)/)).toBeNull();
    expect(form.queryByText(/Штрихкод — те, що читає сканер/)).toBeNull();
    expect(form.getByPlaceholderText('Опис')).toBeInTheDocument();
  });

  it('creates ONE card with every colour × size in a single request, no article and no barcode (the server mints them)', async () => {
    const user = userEvent.setup();
    const form = await openCreate();

    await user.type(form.getByPlaceholderText('Назва'), 'Реглан');
    await user.type(form.getByLabelText('Новий колір'), 'блакитний{Enter}');
    await user.type(form.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.click(sizes(form).getByRole('button', { name: '92' }));
    await user.type(form.getByPlaceholderText('Ціна, грн'), '350');
    await user.click(form.getByRole('button', { name: 'Зберегти' }));

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
    await user.click(form.getByRole('button', { name: 'Зберегти' }));

    // Said twice on purpose: under the rows it concerns, and in the page's banner where a save's errors go.
    expect(await screen.findAllByText('Вкажіть ціну: загальну або в кожному рядку')).toHaveLength(2);
    expect(createProduct).not.toHaveBeenCalled();
  });
});

describe('the create form — the price is never invented', () => {
  it('starts a florist\'s price empty and required, where it used to say 690', async () => {
    setVertical('flowers');
    getProducts.mockResolvedValue([card(1, 'Троянда', [])]);
    renderWithProviders(<ProductsPage />, { route: '/admin/products' });
    await screen.findByText('Троянда');
    await userEvent.click(screen.getByRole('button', { name: /Додати товар/ }));
    const form = within(screen.getByRole('heading', { name: 'Новий товар' }).closest('form')!);

    // The one-variant form stays for a vertical with no size (no matrix here).
    expect(form.queryByTestId('variant-matrix')).toBeNull();
    const field = form.getByPlaceholderText('Ціна, грн');
    expect(field).toHaveValue('');
    expect(field).toBeRequired();
    expect(form.getByText(/Артикул \(SKU\)/)).toBeInTheDocument();
  });
});

describe('the edit form — adding sizes and colours to a card', () => {
  it('lists what the card already has as «вже є» and adds only the rest, in one request', async () => {
    const user = userEvent.setup();
    const form = await openEdit();
    addVariants.mockResolvedValue({
      ...ZAICHYK,
      variants: [...ZAICHYK.variants, variant(72, 7, 'блакитний', '92')],
    });

    await user.type(form.getByLabelText('Новий колір'), 'блакитний{Enter}');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.click(sizes(form).getByRole('button', { name: '92' }));
    const matrix = within(form.getByTestId('variant-matrix'));
    await user.type(matrix.getByPlaceholderText('Ціна, грн'), '400');

    expect(matrix.getByText('вже є')).toBeInTheDocument();
    await user.click(form.getByRole('button', { name: 'Додати варіантів: 1' }));

    await waitFor(() => expect(addVariants).toHaveBeenCalledTimes(1));
    expect(addVariants.mock.calls[0]![0]).toBe(7);
    expect(addVariants.mock.calls[0]![1]).toEqual([
      { attributes: { color: 'блакитний', size: '92' }, unit: 'шт', price_cents: 40000, quantity: 0 },
    ]);
  });

  it('keeps what was typed into another row of the card while it adds', async () => {
    const user = userEvent.setup();
    const form = await openEdit();
    addVariants.mockResolvedValue({
      ...ZAICHYK,
      variants: [...ZAICHYK.variants, variant(72, 7, 'рожевий', '86')],
    });

    // An unsaved edit of the first existing variant's article…
    const article = form.getAllByLabelText(/Артикул \(SKU\)/)[0]!;
    await user.type(article, 'MY-SKU');

    await user.type(form.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(within(form.getByTestId('variant-matrix')).getByPlaceholderText('Ціна, грн'), '400');
    await user.click(form.getByRole('button', { name: 'Додати варіантів: 1' }));

    await waitFor(() => expect(addVariants).toHaveBeenCalledTimes(1));
    // …is still on screen afterwards (the list used to be replaced by the server's).
    await waitFor(() => expect(form.getAllByLabelText(/Артикул \(SKU\)/)).toHaveLength(3));
    expect(form.getAllByLabelText(/Артикул \(SKU\)/)[0]).toHaveValue('MY-SKU');
  });

  it('shows the server\'s own words when an article or barcode is taken', async () => {
    const user = userEvent.setup();
    const form = await openEdit();
    addVariants.mockRejectedValue({
      response: { status: 409, data: { error: 'Артикул «KZ-86» вже є в магазині' } },
    });

    await user.type(form.getByLabelText('Новий колір'), 'рожевий{Enter}');
    await user.click(sizes(form).getByRole('button', { name: '86' }));
    await user.type(within(form.getByTestId('variant-matrix')).getByPlaceholderText('Ціна, грн'), '400');
    await user.click(form.getByRole('button', { name: 'Додати варіантів: 1' }));

    expect(await screen.findByText('Артикул «KZ-86» вже є в магазині')).toBeInTheDocument();
  });

  it('will not add a blank variant when nothing is chosen', async () => {
    const user = userEvent.setup();
    const form = await openEdit();

    await user.click(form.getByRole('button', { name: 'Додати варіанти' }));

    expect((await screen.findAllByText('Оберіть кольори й розміри')).length).toBeGreaterThan(0);
    expect(addVariants).not.toHaveBeenCalled();
  });

  it('keeps the old «+ Варіант» for a vertical with no size, and asks for its price', async () => {
    setVertical('flowers');
    getProducts.mockResolvedValue([card(1, 'Троянда', [variant(10, 1, 'червона', '60')])]);
    const user = userEvent.setup();
    const form = await openEdit(1);

    expect(form.queryByTestId('variant-matrix')).toBeNull();
    await user.click(form.getByRole('button', { name: 'Варіант' }));

    expect(await screen.findByText('Вкажіть ціну')).toBeInTheDocument();
    expect(addVariant).not.toHaveBeenCalled();
  });
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
