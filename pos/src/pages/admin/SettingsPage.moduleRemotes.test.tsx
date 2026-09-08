// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The online-only module ("Прямий ефір"-style) half of Settings.
//
// Releasing a new version of such a module means repointing its entry at a new
// tag, and the entry has to carry title/route/nav because the desktop cashier
// renders them from the store row before the module is ever downloaded. So the
// two things pinned here are: an existing entry can be repointed WITHOUT losing
// the rest of it, and the id/version come from the source's signed manifest
// instead of being retyped.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import type { ModuleRemoteEntry, StoreConfig } from '../../types';

const getStore = vi.fn<[], Promise<StoreConfig>>();
const updateStore = vi.fn<[Partial<StoreConfig>], Promise<StoreConfig>>();
const inspectRemoteManifest = vi.fn<[string], Promise<unknown>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: { getStore: () => getStore(), updateStore: (p: Partial<StoreConfig>) => updateStore(p) },
  };
});

vi.mock('../../modules/remoteVerify', async () => {
  const real = await vi.importActual<typeof import('../../modules/remoteVerify')>(
    '../../modules/remoteVerify'
  );
  return { ...real, inspectRemoteManifest: (url: string) => inspectRemoteManifest(url) };
});

const { SettingsPage } = await import('./SettingsPage');

const V107 = 'https://cdn.example.test/tiktok-live@v1.0.7/remote-entry.js';
const V108 = 'https://cdn.example.test/tiktok-live@v1.0.8/remote-entry.js';

const liveEntry: ModuleRemoteEntry = {
  url: V107,
  title: 'Прямий ефір',
  routePath: '/live',
  nav: [{ label: 'Ефір', location: 'cashier-primary', order: 85, match: '/live', icon: 'Video' }],
  icon: 'Video',
};

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
    gtin_api_key_set: false,
    gtin_daily_limit: null,
    auto_print_receipt: false,
    enabled_modules: [],
    module_remotes: { 'tiktok-live': liveEntry },
    live_tiktok_username: null,
    ...over,
  } as StoreConfig;
}

/** The card for one online-only module, found by its id text. */
async function moduleCard(id: string): Promise<HTMLElement> {
  const label = await screen.findByText(`(${id})`);
  return label.closest('div.rounded-sq') as HTMLElement;
}

beforeEach(() => {
  getStore.mockResolvedValue(storeConfig());
  updateStore.mockImplementation(async (patch) => storeConfig(patch as Partial<StoreConfig>));
  inspectRemoteManifest.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Settings — repointing an online-only module', () => {
  it('sends the new URL and keeps title, route and nav untouched', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const card = await moduleCard('tiktok-live');
    await user.click(within(card).getByRole('button', { name: 'Оновити джерело' }));

    const input = within(card).getByLabelText('Джерело модуля tiktok-live');
    expect(input).toHaveValue(V107);
    await user.clear(input);
    await user.type(input, V108);
    await user.click(within(card).getByRole('button', { name: 'Застосувати' }));
    await user.click(screen.getByRole('button', { name: /Зберегти/ }));

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    const sent = updateStore.mock.calls.at(-1)![0].module_remotes as Record<
      string,
      ModuleRemoteEntry
    >;
    expect(sent['tiktok-live']).toEqual({ ...liveEntry, url: V108 });
  });

  it('rejects a source URL the backend would not accept', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const card = await moduleCard('tiktok-live');
    await user.click(within(card).getByRole('button', { name: 'Оновити джерело' }));
    const input = within(card).getByLabelText('Джерело модуля tiktok-live');
    await user.clear(input);
    await user.type(input, 'ftp://example.test/remote-entry.js');
    await user.click(within(card).getByRole('button', { name: 'Застосувати' }));

    expect(await within(card).findByText(/Джерело: https/)).toBeInTheDocument();
    // Still showing the old URL — nothing was applied.
    expect(within(card).getByText(new RegExp(V107.slice(8, 40)))).toBeInTheDocument();
  });

  it('refuses a source that describes a different module', async () => {
    const user = userEvent.setup();
    inspectRemoteManifest.mockResolvedValue({
      moduleId: 'returns',
      version: '2.0.0',
      keyId: 'k',
      builtAt: 'now',
    });
    renderWithProviders(<SettingsPage />);

    const card = await moduleCard('tiktok-live');
    await user.click(within(card).getByRole('button', { name: 'Оновити джерело' }));
    const input = within(card).getByLabelText('Джерело модуля tiktok-live');
    await user.clear(input);
    await user.type(input, V108);
    await user.click(within(card).getByRole('button', { name: 'Перевірити' }));

    expect(await within(card).findByText(/описує модуль «returns»/)).toBeInTheDocument();
  });

  it('confirms a matching source with its version', async () => {
    const user = userEvent.setup();
    inspectRemoteManifest.mockResolvedValue({
      moduleId: 'tiktok-live',
      version: '1.0.8',
      keyId: 'k',
      builtAt: 'now',
    });
    renderWithProviders(<SettingsPage />);

    const card = await moduleCard('tiktok-live');
    await user.click(within(card).getByRole('button', { name: 'Оновити джерело' }));
    const input = within(card).getByLabelText('Джерело модуля tiktok-live');
    await user.clear(input);
    await user.type(input, V108);
    await user.click(within(card).getByRole('button', { name: 'Перевірити' }));

    expect(await within(card).findByText(/tiktok-live 1\.0\.8/)).toBeInTheDocument();
  });
});

describe('Settings — adding an online-only module', () => {
  beforeEach(() => {
    getStore.mockResolvedValue(storeConfig({ module_remotes: {} }));
  });

  it('fills the id in from the source manifest', async () => {
    const user = userEvent.setup();
    inspectRemoteManifest.mockResolvedValue({
      moduleId: 'tiktok-live',
      version: '1.0.8',
      keyId: 'k',
      builtAt: 'now',
    });
    renderWithProviders(<SettingsPage />);

    const url = await screen.findByPlaceholderText('Джерело (URL remote-entry.js)');
    await user.type(url, V108);
    await user.click(screen.getByRole('button', { name: 'Перевірити джерело' }));

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Ідентифікатор (tiktok-live)')).toHaveValue('tiktok-live')
    );
    expect(screen.getByText(/Підпис дійсний · tiktok-live 1\.0\.8/)).toBeInTheDocument();
  });

  it('reports an unverifiable source without blocking the form', async () => {
    const user = userEvent.setup();
    inspectRemoteManifest.mockRejectedValue(new Error('remote verification failed: bad signature'));
    renderWithProviders(<SettingsPage />);

    const url = await screen.findByPlaceholderText('Джерело (URL remote-entry.js)');
    await user.type(url, V108);
    await user.click(screen.getByRole('button', { name: 'Перевірити джерело' }));

    expect(await screen.findByText(/bad signature/)).toBeInTheDocument();
    // The id was NOT guessed, and the form is still usable.
    expect(screen.getByPlaceholderText('Ідентифікатор (tiktok-live)')).toHaveValue('');
    expect(screen.getByRole('button', { name: '+ Додати модуль' })).toBeEnabled();
  });
});
