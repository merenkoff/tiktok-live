// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The sell screen's frame renders the catalog its store's vertical supplies —
// and keeps selling when that module is missing or broken.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, makeAuthResponse } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
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

function signIn(vertical: 'clothing' | 'flowers'): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({
    auth: {
      ...auth,
      store: {
        ...auth.store,
        vertical: {
          id: vertical,
          title: vertical === 'flowers' ? 'Квіти' : 'Одяг',
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
