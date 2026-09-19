// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sell screen's frame renders the catalog its store's vertical supplies —
// and keeps selling when that module is missing or broken.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { RegisterPage } from './RegisterPage';
import { remoteModules } from '../../modules/registry';
import type { SalesCatalogProps } from '../../modules/types';

function installVertical(Catalog: (props: SalesCatalogProps) => JSX.Element): void {
  remoteModules.push({
    id: 'vertical-flowers',
    title: 'Квіти',
    shells: ['web', 'cashier'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    sales: { Catalog },
  });
}

function signIn(vertical: 'clothing' | 'flowers' | 'cafe'): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({
    auth: {
      ...auth,
      store: {
        ...auth.store,
        vertical: {
          id: vertical,
          title: vertical === 'flowers' ? 'Квіти' : vertical === 'cafe' ? 'Кафе' : 'Одяг',
          attributes: [],
          units: ['шт'],
          defaultUnit: 'шт',
        },
      },
    },
    isAuthenticated: true,
  });
}

beforeEach(() => {
  // A vertical catalog that throws is a React error boundary catch; React logs
  // it regardless, and the noise buries the assertion.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  remoteModules.length = 0;
  useCartStore.getState().clear();
  vi.restoreAllMocks();
});

describe('RegisterPage as the sell-screen frame', () => {
  it('renders the bundled clothing catalog for a clothing store', async () => {
    signIn('clothing');
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();
  });

  it("renders the store vertical's own catalog when its module is loaded", async () => {
    signIn('flowers');
    installVertical(() => <div>КВІТКОВИЙ КАТАЛОГ</div>);
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByText('КВІТКОВИЙ КАТАЛОГ')).toBeInTheDocument();
  });

  it('falls back to the bundled catalog when the vertical module is not there', async () => {
    // The web shell for a remote that 404s: the module simply does not exist,
    // and the shop still has to be able to sell.
    signIn('flowers');
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();
  });

  it('falls back when the vertical catalog throws while rendering', async () => {
    signIn('flowers');
    installVertical(() => {
      throw new Error('boom');
    });
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    await waitFor(() => expect(screen.getByPlaceholderText('Пошук')).toBeInTheDocument());
  });
});

describe('RegisterPage with a café line', () => {
  function ringOatLatte(): void {
    useCartStore.getState().restore({
      lines: [
        {
          uid: '7|12|гарячіше',
          variant_id: 7,
          product_name: 'Латте',
          variant_label: 'M · вівсяне',
          unit: 'шт',
          unit_price_cents: 8000,
          quantity: 1,
          max_quantity: 9,
          modifiers: [{ id: 12, group_name: 'Молоко', name: 'вівсяне', price_delta_cents: 1500 }],
          note: 'гарячіше',
        },
      ],
    });
  }

  it('shows the kitchen note under the caption, and the caption already names the answers', async () => {
    signIn('cafe');
    ringOatLatte();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    expect(screen.getAllByText('M · вівсяне').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('cart-line-note')[0]).toHaveTextContent('гарячіше');
  });

  it('refuses to park a line with modifiers in the server’s words, without opening the sheet', async () => {
    // Parked carts have no column for them until К3; the server refuses such
    // a line, and dropping the answers on the way would be worse than refusing.
    signIn('cafe');
    ringOatLatte();
    renderWithProviders(<RegisterPage />, { shell: 'cashier' });
    expect(await screen.findByPlaceholderText('Пошук')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('park-cart')[0]);

    expect(screen.queryByTestId('park-cart-sheet')).toBeNull();
    expect(
      await screen.findByText('Позицію з модифікаторами поки не можна відкласти')
    ).toBeInTheDocument();
  });
});
