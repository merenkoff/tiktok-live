// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The list's view lives in the address (C1e, PR3): the search words and the
// tag survive the trip to a card and back, and a shared link opens the same view.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };

const getProducts = vi.fn<[], Promise<Product[]>>();
const posRequest = vi.fn();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CLOTHING,
    useAuthStore: () => null,
    api: {
      getProducts: () => getProducts(),
      posRequest: (...a: unknown[]) => posRequest(...a),
      getTags: () =>
        Promise.resolve([
          { id: 1, name: 'Новинки', parent_id: null, color: null, show_in_catalog_bar: false },
          { id: 2, name: 'Розпродаж', parent_id: null, color: null, show_in_catalog_bar: false },
        ]),
    },
  };
});

const { ProductsPage } = await import('./ProductsPage');

function card(id: number, name: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    name,
    description: null,
    image_url: null,
    is_active: true,
    tag_ids: [],
    variants: [
      { id: id * 10, product_id: id, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 10000, cost_cents: 0, is_active: true, quantity: 1 },
    ],
    ...extra,
  } as Product;
}

function Probe() {
  const location = useLocation();
  return (
    <p data-testid="where">
      {location.pathname}
      {location.search}|{JSON.stringify(location.state)}
    </p>
  );
}

function open(route: string) {
  renderWithProviders(
    <>
      <Probe />
      <Routes>
        <Route path="/admin/products" element={<ProductsPage />} />
        <Route path="/admin/products/:id" element={<p>Картка</p>} />
      </Routes>
    </>,
    { route }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getProducts.mockResolvedValue([
    card(1, 'Костюмчик Зайчик', { tag_ids: [1] }),
    card(2, 'Сукня Свято', { tag_ids: [2] }),
    card(3, 'Боді з приходу', { needs_review: true }),
  ]);
});

describe('the view in the address', () => {
  it('writes the words as they are typed, replacing rather than piling up history', async () => {
    const user = userEvent.setup();
    open('/admin/products');
    await screen.findByText('Костюмчик Зайчик');
    await user.type(screen.getByLabelText('Пошук товарів'), 'сукня');
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?q=%D1%81%D1%83%D0%BA%D0%BD%D1%8F|');
    expect(screen.queryByText('Костюмчик Зайчик')).toBeNull();
    expect(screen.getByText('Сукня Свято')).toBeInTheDocument();
  });

  it('writes the tag, and the review filter by name', async () => {
    const user = userEvent.setup();
    open('/admin/products');
    await screen.findByText('Костюмчик Зайчик');
    await user.click(screen.getByRole('button', { name: /^Розпродаж/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?tag=2|');
    expect(screen.queryByText('Костюмчик Зайчик')).toBeNull();
    expect(screen.getByText('Сукня Свято')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /З приходу — перевірте/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?tag=review|');
    expect(screen.getByText('Боді з приходу')).toBeInTheDocument();
    expect(screen.queryByText('Сукня Свято')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Усі товари' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products|');
  });

  it('applies a view it was opened with', async () => {
    open('/admin/products?q=%D0%B7%D0%B0%D0%B9%D1%87%D0%B8%D0%BA&tag=1');
    expect(await screen.findByText('Костюмчик Зайчик')).toBeInTheDocument();
    expect(screen.getByLabelText('Пошук товарів')).toHaveValue('зайчик');
    expect(screen.queryByText('Сукня Свято')).toBeNull();
  });

  it('hands the view to the card, so «← Товари» can come back to it', async () => {
    const user = userEvent.setup();
    open('/admin/products?tag=2');
    await user.click(await screen.findByRole('link', { name: 'Сукня Свято' }));
    await waitFor(() => expect(screen.getByText('Картка')).toBeInTheDocument());
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products/2|{"list":"?tag=2"}');
  });

  it('keeps «Додати товар» on the same view too', async () => {
    const user = userEvent.setup();
    open('/admin/products?q=x');
    await screen.findByRole('list', { name: 'Товари' }).catch(() => null);
    await user.click(screen.getByRole('link', { name: 'Додати товар' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin/products/new|{"list":"?q=x"}'));
  });
});

describe('«Без фото» and «Архів»', () => {
  beforeEach(() => {
    getProducts.mockResolvedValue([
      card(1, 'Костюмчик Зайчик', { image_url: '/pos-uploads/a.png' }),
      card(2, 'Сукня Свято'),
      card(3, 'Костюм Polo', {
        is_active: false,
        image_url: null,
        variants: [
          { id: 30, product_id: 3, attributes: {}, label: 'блакитний · 86', unit: 'шт', sku: null, barcode: null, price_cents: 39000, cost_cents: 0, is_active: false, quantity: 1 },
        ],
      } as Partial<Product>),
    ]);
  });

  it('«Без фото» lists the live cards with no picture, counted, and keeps the archive out', async () => {
    const user = userEvent.setup();
    open('/admin/products');
    await screen.findByText('Костюмчик Зайчик');
    const filter = screen.getByRole('button', { name: /^Без фото/ });
    expect(filter).toHaveTextContent('1');
    await user.click(filter);
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?tag=no-photo|');
    expect(screen.getByText('Сукня Свято')).toBeInTheDocument();
    expect(screen.queryByText('Костюмчик Зайчик')).toBeNull();
    // Archived and photo-less is still archived: it is not in this view.
    expect(screen.queryByText('Костюм Polo')).toBeNull();
  });

  it('«Архів» is the one view that shows archived cards — summed over the variants they had, with «Повернути» and no checkbox', async () => {
    const user = userEvent.setup();
    open('/admin/products');
    await screen.findByText('Костюмчик Зайчик');
    // Hidden everywhere else.
    expect(screen.queryByText('Костюм Polo')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Архів 1$/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products?tag=archived|');
    expect(await screen.findByText('Костюм Polo')).toBeInTheDocument();
    expect(screen.queryByText('Сукня Свято')).toBeNull();
    expect(screen.getByText('В архіві')).toBeInTheDocument();
    expect(screen.getByText('1 варіант · 390 ₴ · 1 шт')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Обрати «Костюм Polo»' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Обрати всі показані/ })).toBeNull();
    // The card page opens live cards only, so the name is not a link here.
    expect(screen.queryByRole('link', { name: 'Костюм Polo' })).toBeNull();
  });

  it('«Повернути» restores the card through the server and says so', async () => {
    const user = userEvent.setup();
    posRequest.mockResolvedValue({});
    open('/admin/products?tag=archived');
    await user.click(await screen.findByRole('button', { name: 'Повернути «Костюм Polo» з архіву' }));
    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('post', '/products/3/restore'));
    expect(await screen.findByText('«Костюм Polo» повернуто з архіву')).toBeInTheDocument();
    expect(getProducts).toHaveBeenCalledTimes(2);
  });

  it('says it in words when the restore is refused', async () => {
    const user = userEvent.setup();
    posRequest.mockRejectedValue(new Error('boom'));
    open('/admin/products?tag=archived');
    await user.click(await screen.findByRole('button', { name: 'Повернути «Костюм Polo» з архіву' }));
    expect(await screen.findByText('Не вдалося повернути «Костюм Polo» з архіву')).toBeInTheDocument();
  });

  it('says what an empty archive and a store with every photo look like', async () => {
    getProducts.mockResolvedValue([card(1, 'Костюмчик Зайчик', { image_url: '/pos-uploads/a.png' })]);
    open('/admin/products?tag=archived');
    expect(await screen.findByText('В архіві нічого немає.')).toBeInTheDocument();
  });
});
