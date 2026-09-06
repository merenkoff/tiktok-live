// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAuthStore } from '../hooks/useAuth';
import { useUpdateStore } from '../hooks/useUpdateCheck';
import { makeAuthResponse, renderWithProviders } from '../test/utils';
import type { PosRole } from '../types';
import { Nav } from './Nav';

function signIn(role: PosRole, enabled_modules?: string[]) {
  useAuthStore.setState({
    auth: makeAuthResponse({
      staff: { id: 1, display_name: 'Тест', role },
      store: { enabled_modules },
    }),
    isAuthenticated: true,
  });
}

const hrefs = () =>
  screen.getAllByRole('link').map((el) => el.getAttribute('href'));

describe('Nav — admin sidebar', () => {
  it('renders the owner sections as labelled links', () => {
    signIn('owner');
    renderWithProviders(<Nav location="admin-sidebar" />, { route: '/admin' });

    expect(hrefs()).toEqual([
      '/admin',
      '/admin/products',
      '/admin/stock',
      '/admin/customers',
      '/admin/sales',
      '/admin/staff',
      '/admin/settings',
    ]);
    expect(screen.getByRole('link', { name: 'Сьогодні' })).toBeInTheDocument();
  });

  it('drops the sections of a disabled module', () => {
    signIn('owner', ['returns', 'customers', 'products', 'analytics', 'staff']);
    renderWithProviders(<Nav location="admin-sidebar" />, { route: '/admin' });

    expect(hrefs()).not.toContain('/admin/stock');
    expect(screen.queryByRole('link', { name: 'Склад' })).not.toBeInTheDocument();
  });
});

describe('Nav — cashier rail', () => {
  it('shows the till, customers, receipts and hardware in the desktop shell', () => {
    signIn('seller');
    renderWithProviders(<Nav location="cashier-primary" variant="rail" />, {
      route: '/register',
      shell: 'cashier',
    });

    expect(hrefs()).toEqual(['/register', '/customers', '/sales', '/hardware']);
  });

  it('gives a web owner the catalog shortcut and the admin sales page', () => {
    signIn('owner');
    renderWithProviders(<Nav location="cashier-primary" variant="rail" />, { route: '/register' });

    expect(hrefs()).toContain('/admin/products');
    expect(hrefs()).toContain('/admin/sales');
    expect(hrefs()).not.toContain('/sales');
  });

  it('hides the catalog shortcut in the bottom bar', () => {
    signIn('owner');
    renderWithProviders(<Nav location="cashier-primary" variant="bottom" />, { route: '/register' });

    expect(hrefs()).not.toContain('/admin/products');
  });

  it('renders the icon a manifest names as a string (roadmap #13 Part D)', () => {
    signIn('seller');
    const { container } = renderWithProviders(
      <Nav location="cashier-primary" variant="rail" />,
      { route: '/register', shell: 'cashier' }
    );

    // Every rail entry names its icon by lucide export name; the host resolves it.
    const till = container.querySelector('a[href="/register"] svg');
    expect(till).toBeInTheDocument();
    expect(till).toHaveClass('lucide-grid3x3');
  });

  it('marks the hardware entry when an app update is waiting', () => {
    signIn('seller');
    useUpdateStore.setState({
      updateInfo: {
        current_version: '1.0.4',
        latest_version: '1.0.5',
        update_available: true,
        download_url: null,
        release_url: null,
        notes: null,
      },
      checked: true,
    });
    renderWithProviders(<Nav location="cashier-primary" variant="rail" />, {
      route: '/register',
      shell: 'cashier',
    });

    expect(
      screen.getByRole('link', { name: 'Обладнання · доступне оновлення' })
    ).toBeInTheDocument();
  });

  it('leaves the hardware entry unmarked when the app is current', () => {
    signIn('seller');
    renderWithProviders(<Nav location="cashier-primary" variant="rail" />, {
      route: '/register',
      shell: 'cashier',
    });

    expect(screen.getByRole('link', { name: 'Обладнання' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /оновлення/ })).not.toBeInTheDocument();
  });
});
