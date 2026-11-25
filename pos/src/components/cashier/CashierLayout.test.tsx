// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's frame draws modules' `till.Banner` strips over every page
// (platform 25): how the remote kitchen's «Запити з точок» stands over the
// kitchen's board without the board — the café vertical's page — carrying any
// of the remote kitchen's code. A store without such a module gets the frame
// exactly as it was, with no empty box, and a strip that throws takes nothing
// else down with it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { makeAuthResponse, renderWithProviders } from '../../test/utils';
import { useAuthStore } from '../../hooks/useAuth';
import { remoteModules } from '../../modules/registry';
import { CashierLayout } from './CashierLayout';

function installStrip(Banner: () => JSX.Element | null): void {
  remoteModules.push({
    id: 'remote-kitchen',
    title: 'Віддалена кухня',
    shells: ['web', 'cashier', 'tablet'],
    alwaysEnabled: true,
    routes: [],
    nav: [],
    till: { Banner },
  });
}

beforeEach(() => {
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  remoteModules.length = 0;
  vi.restoreAllMocks();
});

describe('CashierLayout — modules’ strips over the till', () => {
  it('draws a module’s strip above the page it frames', async () => {
    installStrip(() => <p>Запити з точок · 1</p>);
    renderWithProviders(
      <CashierLayout>
        <main>Дошка кухні</main>
      </CashierLayout>,
      { shell: 'cashier' }
    );
    expect(await screen.findByText('Запити з точок · 1')).toBeInTheDocument();
    const strip = screen.getByTestId('till-banners');
    const page = screen.getByText('Дошка кухні');
    // The strip comes first in the column, so it is above the page.
    expect(strip.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds nothing to the frame of a store without such a module', () => {
    renderWithProviders(
      <CashierLayout>
        <main>Сторінка під рамкою</main>
      </CashierLayout>,
      { shell: 'cashier' }
    );
    expect(screen.getByText('Сторінка під рамкою')).toBeInTheDocument();
    expect(screen.queryByTestId('till-banners')).toBeNull();
  });

  it('keeps the page when the strip throws', async () => {
    installStrip(() => {
      throw new Error('boom');
    });
    renderWithProviders(
      <CashierLayout>
        <main>Сторінка під рамкою</main>
      </CashierLayout>,
      { shell: 'cashier' }
    );
    expect(await screen.findByText('Сторінка під рамкою')).toBeInTheDocument();
  });
});
