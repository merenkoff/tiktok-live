// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Вигляд меню» — the owner's menu-appearance editor.
//
// What is pinned here is what the feature promises: a rename and a reorder
// reach the server as a **sparse** override map (never a full copy of the menu,
// or a module could never rename its own entry again), moving an entry back
// where it started leaves no trace, and the page edits one menu at a time
// without disturbing the other.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../hooks/useAuth';
import { makeAuthResponse, renderWithProviders } from '../../test/utils';
import type { StoreConfig } from '../../types';

const getStore = vi.fn<[], Promise<StoreConfig>>();
const updateStore = vi.fn<[Partial<StoreConfig>], Promise<StoreConfig>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { getStore: () => getStore(), updateStore: (p: Partial<StoreConfig>) => updateStore(p) },
  };
});

const { AppearancePage } = await import('./AppearancePage');

function storeConfig(over: Partial<StoreConfig> = {}): StoreConfig {
  return {
    id: 1,
    name: 'Demo',
    slug: 'demo',
    currency: 'UAH',
    qr_payment_enabled: false,
    qr_payment_mode: 'static',
    qr_static_image_url: null,
    qr_iban: null,
    qr_edrpou: null,
    qr_recipient: null,
    qr_purpose_template: null,
    gtin_lookup_enabled: true,
    auto_print_receipt: false,
    enabled_modules: [],
    module_remotes: {},
    nav_overrides: {},
    live_tiktok_username: null,
    ...over,
  } as StoreConfig;
}

/** The row for one menu entry, found by the label its module declares. */
async function row(defaultLabel: string): Promise<HTMLElement> {
  const input = await screen.findByLabelText(`Назва пункту «${defaultLabel}»`);
  return input.closest('li') as HTMLElement;
}

const saveButton = () => screen.getByRole('button', { name: 'Зберегти' });

beforeEach(() => {
  getStore.mockResolvedValue(storeConfig());
  updateStore.mockImplementation(async (patch) => storeConfig(patch as Partial<StoreConfig>));
  useAuthStore.setState({ auth: makeAuthResponse(), isAuthenticated: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppearancePage', () => {
  it('lists the till menu in its current order', async () => {
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    const labels = (await screen.findAllByLabelText(/^Назва пункту/)).map((el) =>
      el.getAttribute('placeholder')
    );
    expect(labels.slice(0, 3)).toEqual(['Каса', 'Замовлення', 'Клієнти']);
  });

  it('saves a rename as a sparse override, not a copy of the menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.type(await screen.findByLabelText('Назва пункту «Каса»'), 'Продаж');
    await user.click(saveButton());

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls[0][0]).toEqual({
      nav_overrides: { 'catalog-checkout:cashier-primary:/register': { label: 'Продаж' } },
    });
  });

  it('writes an explicit order for the menu it reordered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.click(within(await row('Каса')).getByRole('button', { name: 'Нижче' }));
    await user.click(saveButton());

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    const sent = (updateStore.mock.calls[0][0] as { nav_overrides: Record<string, unknown> })
      .nav_overrides;
    // «Каса» swaps with whatever sits under it, which is «Замовлення» now.
    expect(sent['catalog-checkout:cashier-primary:/orders']).toEqual({ order: 0 });
    expect(sent['catalog-checkout:cashier-primary:/register']).toEqual({ order: 10 });
  });

  it('leaves no trace when an entry is moved back where it started', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.click(within(await row('Каса')).getByRole('button', { name: 'Нижче' }));
    await user.click(within(await row('Каса')).getByRole('button', { name: 'Вище' }));

    // Nothing to save — the draft matches what the server gave us.
    expect(saveButton()).toBeDisabled();
  });

  it('restores one entry without touching the rest of the menu', async () => {
    getStore.mockResolvedValue(
      storeConfig({
        nav_overrides: {
          'catalog-checkout:cashier-primary:/register': { label: 'Продаж' },
          'customers:cashier-primary:/customers': { label: 'Гості' },
        },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.click(
      within(await row('Каса')).getByRole('button', {
        name: 'Відновити типовий вигляд пункту «Каса»',
      })
    );
    await user.click(saveButton());

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls[0][0]).toEqual({
      nav_overrides: { 'customers:cashier-primary:/customers': { label: 'Гості' } },
    });
  });

  it('edits the admin sidebar separately from the till menu', async () => {
    getStore.mockResolvedValue(
      storeConfig({
        nav_overrides: { 'catalog-checkout:cashier-primary:/register': { label: 'Продаж' } },
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.click(await screen.findByRole('tab', { name: 'Адмінка' }));
    await user.type(await screen.findByLabelText('Назва пункту «Склад»'), 'Залишки');
    await user.click(saveButton());

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls[0][0]).toEqual({
      nav_overrides: {
        'catalog-checkout:cashier-primary:/register': { label: 'Продаж' },
        'stock:admin-sidebar:/admin/stock': { label: 'Залишки' },
      },
    });
  });

  it('offers icons only where the menu actually draws them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    expect(await screen.findByLabelText('Іконка пункту «Каса»')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Адмінка' }));
    await waitFor(() => expect(screen.queryByLabelText(/^Іконка пункту/)).not.toBeInTheDocument());
  });

  it('picks an icon from the ones this build can actually draw', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    await user.click(await screen.findByLabelText('Іконка пункту «Каса»'));
    await user.type(screen.getByLabelText('Пошук іконки'), 'ShoppingC');
    await user.click(screen.getByRole('button', { name: 'ShoppingCart' }));
    await user.click(saveButton());

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls[0][0]).toEqual({
      nav_overrides: { 'catalog-checkout:cashier-primary:/register': { icon: 'ShoppingCart' } },
    });
  });

  it('says which entries only some people see', async () => {
    renderWithProviders(<AppearancePage />, { route: '/admin/appearance' });

    const shortcut = await row('Товари');
    expect(shortcut).toHaveTextContent('лише власник');
    expect(shortcut).toHaveTextContent('лише бічна панель');
  });
});
