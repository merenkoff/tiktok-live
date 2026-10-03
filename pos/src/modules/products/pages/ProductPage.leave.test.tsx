// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Leaving a card with unsaved changes (C1e): the old inline form threw them
// away on «Сховати» or on any click elsewhere, without a word.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { Product } from '../../../types';

const CLOTHING = { id: 'clothing', title: 'Одяг', attributes: [], units: ['шт'], defaultUnit: 'шт', maxCompositionDepth: 1 };

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    useVertical: () => CLOTHING,
    useAuthStore: () => null,
    api: {
      getProducts: () =>
        Promise.resolve([
          {
            id: 42,
            name: 'Борщ',
            description: null,
            image_url: null,
            is_active: true,
            tag_ids: [],
            variants: [
              { id: 420, product_id: 42, attributes: {}, label: '', unit: 'шт', sku: null, barcode: null, price_cents: 20000, cost_cents: 0, is_active: true, quantity: 3 },
            ],
          } as unknown as Product,
        ]),
      getTags: () => Promise.resolve([]),
      listModifierGroups: () => Promise.resolve([]),
      posRequest: () => Promise.resolve([]),
    },
  };
});

const { ProductPage } = await import('./ProductPage');

function Probe() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

async function openCard() {
  renderWithProviders(
    <>
      <Probe />
      <Routes>
        <Route path="/admin/products/:id" element={<ProductPage />} />
        <Route path="/admin/products" element={<p>Список</p>} />
      </Routes>
    </>,
    { route: '/admin/products/42' }
  );
  await screen.findByRole('button', { name: 'Зберегти' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('leaving the card', () => {
  it('goes at once when nothing changed', async () => {
    await openCard();
    await userEvent.click(screen.getByRole('link', { name: 'Товари' }));
    expect(await screen.findByText('Список')).toBeInTheDocument();
    expect(screen.queryByTestId('confirm-sheet')).toBeNull();
  });

  it('asks when something is unsaved, and goes only on «Піти»', async () => {
    const user = userEvent.setup();
    await openCard();
    await user.type(screen.getByPlaceholderText('Назва'), '!');

    await user.click(screen.getByRole('link', { name: 'Товари' }));
    expect(await screen.findByTestId('confirm-sheet')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products/42');

    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'Скасувати' }));
    await waitFor(() => expect(screen.queryByTestId('confirm-sheet')).toBeNull());
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products/42');

    await user.click(screen.getByRole('link', { name: 'Товари' }));
    await user.click(await screen.findByTestId('confirm-sheet-ok'));
    expect(await screen.findByText('Список')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/products');
  });

  it('holds the browser back while dirty, and lets it go when clean', async () => {
    const user = userEvent.setup();
    await openCard();
    const fire = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(fire()).toBe(false);
    await user.type(screen.getByPlaceholderText('Назва'), '!');
    expect(fire()).toBe(true);
    await user.type(screen.getByPlaceholderText('Назва'), '{Backspace}');
    expect(fire()).toBe(false);
  });
});
