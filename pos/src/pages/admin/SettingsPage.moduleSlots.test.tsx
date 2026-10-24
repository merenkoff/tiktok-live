// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Since phase Г2 a feature module may put its own card on the owner's
// Settings too — after the vertical's, which stays where it always was, and
// without being able to take the page down.

import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAuthResponse, renderWithProviders } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { remoteModules } from '../../modules/registry';
import type { StoreConfig } from '../../types';

const getStore = vi.fn<[], Promise<StoreConfig>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return { ...real, api: { getStore: () => getStore(), updateStore: vi.fn() } };
});

const { SettingsPage } = await import('./SettingsPage');

function FlowerCard() {
  return <section>Картка флориста</section>;
}

function DebtsCard() {
  return <section>Картка боргів</section>;
}

function signInFlorist(): void {
  const auth = makeAuthResponse();
  useAuthStore.setState({
    auth: {
      ...auth,
      store: {
        ...auth.store,
        vertical: { id: 'flowers', title: 'Квіти', attributes: [], units: ['шт'], defaultUnit: 'шт' },
      },
    },
    isAuthenticated: true,
  });
}

beforeEach(() => {
  getStore.mockResolvedValue({
    id: 1,
    name: 'Demo',
    slug: 'demo',
    currency: 'UAH',
    enabled_modules: [],
    module_remotes: {},
  } as unknown as StoreConfig);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  remoteModules.length = 0;
  useAuthStore.setState({ auth: null, isAuthenticated: false });
  vi.restoreAllMocks();
});

function install(id: string, Card: () => JSX.Element): void {
  remoteModules.push({
    id,
    title: id,
    shells: ['web', 'cashier', 'tablet'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    settings: { Card },
  });
}

describe('Settings — module cards (Г2)', () => {
  it('draws the vertical card first and the feature module card after it', async () => {
    install('debts', DebtsCard);
    install('vertical-flowers', FlowerCard);
    signInFlorist();
    renderWithProviders(<SettingsPage />);
    const florist = await screen.findByText('Картка флориста');
    const debts = screen.getByText('Картка боргів');
    expect(florist.compareDocumentPosition(debts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the page when a module card throws', async () => {
    install('debts', () => {
      throw new Error('module bug');
    });
    install('vertical-flowers', FlowerCard);
    signInFlorist();
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Картка флориста')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Зберегти/ })).toBeInTheDocument();
  });
});
