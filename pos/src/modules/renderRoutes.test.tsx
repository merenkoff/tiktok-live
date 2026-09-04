// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../hooks/useAuth';
import { makeAuthResponse, renderWithProviders } from '../test/utils';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';
import type { ModuleDescriptor, ModuleId } from './types';

/**
 * A four-module stand-in for the real registry: one core root route, an
 * owner-only `/admin` index, an owner-only `/admin` child, and a cashier-only
 * root route. Enough to exercise every branch of the mount logic without
 * dragging the real pages (and their lazy chunks) into the test.
 */
vi.mock('./registry', () => {
  const page = (label: string) => () => <div>{label}</div>;
  const modules: ModuleDescriptor[] = [
    {
      id: 'catalog-checkout',
      title: 'Каса',
      core: true,
      shells: ['web', 'cashier'],
      routes: [{ path: '/register', element: page('Каса'), eager: true }],
      nav: [],
    },
    {
      id: 'analytics',
      title: 'Аналітика',
      shells: ['web'],
      ownerOnly: true,
      routes: [{ index: true, mount: 'admin', element: page('Сьогодні') }],
      nav: [],
    },
    {
      id: 'stock',
      title: 'Склад',
      shells: ['web'],
      ownerOnly: true,
      routes: [{ path: 'stock', mount: 'admin', element: page('Склад') }],
      nav: [],
    },
    {
      id: 'hardware',
      title: 'Обладнання',
      shells: ['cashier'],
      routes: [{ path: '/hardware', element: page('Обладнання') }],
      nav: [],
    },
  ];
  return { MODULES: modules };
});

vi.mock('../pages/admin/AdminLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return {
    AdminLayout: () => (
      <div>
        <span>Кабінет</span>
        <Outlet />
      </div>
    ),
  };
});

vi.mock('../pages/LoginPage', () => ({ LoginPage: () => <div>Вхід</div> }));

const { renderModuleRoutes } = await import('./renderRoutes');

const ALL = new Set<ModuleId>(['catalog-checkout', 'analytics', 'stock', 'hardware']);

function renderAt(
  route: string,
  {
    shell = 'web',
    role = 'owner',
    isAuthenticated = true,
    enabled = ALL,
  }: {
    shell?: PosShell;
    role?: PosRole | null;
    isAuthenticated?: boolean;
    enabled?: ReadonlySet<ModuleId>;
  } = {}
) {
  if (isAuthenticated && role) {
    useAuthStore.setState({
      auth: makeAuthResponse({ staff: { id: 1, display_name: 'Тест', role } }),
      isAuthenticated: true,
    });
  }
  return renderWithProviders(renderModuleRoutes({ shell, role, enabled, isAuthenticated }), {
    route,
    shell,
  });
}

describe('the /admin area', () => {
  it('mounts the layout and its index for a web owner', async () => {
    renderAt('/admin');

    expect(await screen.findByText('Кабінет')).toBeInTheDocument();
    expect(await screen.findByText('Сьогодні')).toBeInTheDocument();
  });

  it('mounts an enabled admin child page', async () => {
    renderAt('/admin/stock');

    expect(await screen.findByText('Склад')).toBeInTheDocument();
  });

  it('falls back to the first admin page when no module owns the index', async () => {
    renderAt('/admin', { enabled: new Set<ModuleId>(['catalog-checkout', 'stock']) });

    expect(await screen.findByText('Склад')).toBeInTheDocument();
  });

  it('sends a seller back to the till', async () => {
    renderAt('/admin/stock', { role: 'seller' });

    expect(await screen.findByText('Каса')).toBeInTheDocument();
    expect(screen.queryByText('Склад')).not.toBeInTheDocument();
  });

  it('is not mounted at all in the cashier shell', async () => {
    renderAt('/admin/stock', { shell: 'cashier' });

    // No `/admin` route matches, so the catch-all takes over.
    expect(await screen.findByText('Каса')).toBeInTheDocument();
    expect(screen.queryByText('Кабінет')).not.toBeInTheDocument();
  });
});

describe('module gating of root routes', () => {
  it('mounts a cashier-only route in the cashier shell', async () => {
    renderAt('/hardware', { shell: 'cashier', role: 'seller' });

    expect(await screen.findByText('Обладнання')).toBeInTheDocument();
  });

  it('does not mount a cashier-only route on the web', async () => {
    renderAt('/hardware', { shell: 'web' });

    expect(await screen.findByText('Сьогодні')).toBeInTheDocument();
  });

  it('drops a route whose module the store turned off', async () => {
    renderAt('/hardware', {
      shell: 'cashier',
      role: 'seller',
      enabled: new Set<ModuleId>(['catalog-checkout']),
    });

    expect(await screen.findByText('Каса')).toBeInTheDocument();
    expect(screen.queryByText('Обладнання')).not.toBeInTheDocument();
  });
});

describe('authentication redirects', () => {
  it('guards a root route behind the login screen', async () => {
    renderAt('/register', { isAuthenticated: false, role: null });

    expect(await screen.findByText('Вхід')).toBeInTheDocument();
  });

  it('sends an unknown path to the login screen when signed out', async () => {
    renderAt('/nope', { isAuthenticated: false, role: null });

    expect(await screen.findByText('Вхід')).toBeInTheDocument();
  });

  it('bounces a signed-in web owner off /login into the admin area', async () => {
    renderAt('/login');

    expect(await screen.findByText('Кабінет')).toBeInTheDocument();
  });

  it('bounces a signed-in cashier off /login into the till', async () => {
    renderAt('/login', { shell: 'cashier', role: 'seller' });

    expect(await screen.findByText('Каса')).toBeInTheDocument();
  });
});
