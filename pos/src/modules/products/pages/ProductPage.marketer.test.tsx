// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product card as the café's marketer sees it (track МР, phase МР5): the
// menu and nothing of the kitchen's or the shelf's. What these tests hold:
//   · no article, barcode or «Продається на касі»;
//   · under «Склад для гостя» the recipe's parts as words (no grams), each
//     appended on a tap, the text staying hers;
//   · «Як бачить гість» opens this dish on the published menu;
//   · the store's cork-fee product says what it is;
//   · a save never sends the recipe.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CAFE = { id: 'cafe', title: 'Кав’ярня', attributes: [], units: ['шт', 'г', 'мл'], defaultUnit: 'шт', maxCompositionDepth: 3, dishFacts: true };
let role: 'marketer' | 'owner' = 'marketer';
const state = () => ({ auth: { staff: { role }, store: { vertical: CAFE } } });

const getProducts = vi.fn<[], Promise<Product[]>>();
const updateProduct = vi.fn();
const updateVariant = vi.fn();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CAFE,
    useAuthStore: (select?: (s: ReturnType<typeof state>) => unknown) => (select ? select(state()) : state()),
    api: {
      getProducts: () => getProducts(),
      getTags: () => Promise.resolve([]),
      listModifierGroups: () => Promise.resolve([]),
      posRequest: (...a: unknown[]) => posRequest(...a),
      updateProduct: (...a: unknown[]) => updateProduct(...a),
      updateVariant: (...a: unknown[]) => updateVariant(...a),
      setProductTags: () => Promise.resolve([]),
      setProductModifierGroups: () => Promise.resolve([]),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function steak(): Product {
  return {
    id: 42,
    name: 'Стейк рібай',
    description: 'Соковитий',
    composition: '',
    allergens: [],
    image_url: null,
    is_active: true,
    sellable: true,
    tag_ids: [],
    kind: 'composite',
    stock_mode: 'derived',
    variants: [
      {
        id: 420,
        product_id: 42,
        attributes: {},
        label: '',
        unit: 'шт',
        sku: 'R-1',
        barcode: '2900000000420',
        price_cents: 69000,
        is_active: true,
        // As the server sends it to a marketer: names, no grams.
        components: [
          { id: 1, component_variant_id: 501, product_name: 'Рібай', label: '' },
          { id: 2, component_variant_id: 502, product_name: 'Масло вершкове', label: '' },
          { id: 3, component_variant_id: 503, product_name: 'Соус демі-глас, порція', label: '' },
        ],
      },
    ],
  } as unknown as Product;
}

function corkFee(): Product {
  return {
    id: 77,
    name: 'Корковий збір',
    description: null,
    image_url: null,
    is_active: true,
    sellable: true,
    menu_hidden: true,
    tag_ids: [],
    variants: [{ id: 770, product_id: 77, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 10000, is_active: true }],
  } as unknown as Product;
}

beforeEach(() => {
  vi.clearAllMocks();
  role = 'marketer';
  getProducts.mockResolvedValue([steak(), corkFee()]);
  updateProduct.mockResolvedValue(steak());
  updateVariant.mockResolvedValue(steak());
  posRequest.mockImplementation((_method: string, path: string) => {
    if (path === '/store/public-menu') return Promise.resolve({ enabled: true, url: 'https://the-live.shop/m/shablya' });
    if (path === '/store/profile') return Promise.resolve({ corkage_product: { id: 77 } });
    return Promise.resolve([]);
  });
});

async function openCard(id = 42) {
  renderWithProviders(
    <Routes>
      <Route path="/admin/products/:id" element={<ProductPage />} />
    </Routes>,
    { route: `/admin/products/${id}` }
  );
  await screen.findByDisplayValue(id === 42 ? 'Стейк рібай' : 'Корковий збір');
}

describe('the product card for the marketer', () => {
  it('shows no article, barcode or till switch', async () => {
    await openCard();
    await screen.findByLabelText(/Склад для гостя/);
    expect(screen.queryByText(/Артикул/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Штрихкод/)).not.toBeInTheDocument();
    expect(screen.queryByText('Продається на касі')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('2900000000420')).not.toBeInTheDocument();
  });

  it('offers the recipe’s parts as words for the guest composition, appended on a tap', async () => {
    await openCard();
    const field = await screen.findByLabelText(/Склад для гостя/);
    const words = await screen.findAllByTestId('composition-hint-word');
    expect(words.map((w) => w.textContent)).toEqual(['+ рібай', '+ масло вершкове', '+ соус демі-глас']);
    await userEvent.click(words[1]!);
    expect(field).toHaveValue('Масло вершкове');
    await userEvent.click(screen.getByTestId('composition-hint-all'));
    expect(field).toHaveValue('Масло вершкове, рібай, соус демі-глас');
  });

  it('links this dish on the published guest menu', async () => {
    await openCard();
    const link = await screen.findByTestId('guest-view');
    expect(link).toHaveAttribute('href', 'https://the-live.shop/m/shablya/d/42');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('says the cork-fee product is the fee the guest reads', async () => {
    await openCard(77);
    expect(await screen.findByTestId('corkage-note')).toBeInTheDocument();
  });

  it('never sends the recipe when saving', async () => {
    await openCard();
    const name = await screen.findByDisplayValue('Стейк рібай');
    await userEvent.type(name, ' з маслом');
    const price = screen.getByDisplayValue('690');
    await userEvent.clear(price);
    await userEvent.type(price, '720');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updateVariant).toHaveBeenCalled());
    const payload = updateVariant.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({ price_cents: 72000 });
    expect(payload).not.toHaveProperty('components');
    expect(payload).not.toHaveProperty('cost_milli');
  });
});
