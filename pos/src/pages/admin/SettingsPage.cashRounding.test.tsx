// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's «Заокруглення готівки» (TechDocs/POS_CASH_ROUNDING.md): the step
// arrives with the store, goes back as a number, and a backend older than
// migration 070 — which sends no field at all — reads as «not rounded».

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
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

const { SettingsPage } = await import('./SettingsPage');

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
    module_remotes: {},
    live_tiktok_username: null,
    ...over,
  } as StoreConfig;
}

beforeEach(() => {
  updateStore.mockImplementation(async (patch) => storeConfig(patch as Partial<StoreConfig>));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Settings — cash rounding', () => {
  it('shows the stored step and sends the new one as a number', async () => {
    getStore.mockResolvedValue(storeConfig({ cash_rounding: 10 }));
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const ten = await screen.findByTestId('cash-rounding-10');
    await waitFor(() => expect(ten).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText(/1–4 коп\. — вниз/)).toBeInTheDocument();

    await user.click(screen.getByTestId('cash-rounding-50'));
    expect(screen.getByText(/1–24 коп\. — вниз до 00/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Зберегти/ }));

    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls.at(-1)![0].cash_rounding).toBe(50);
  });

  it('reads a store without the field as not rounded, and saves 0', async () => {
    getStore.mockResolvedValue(storeConfig());
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const off = await screen.findByTestId('cash-rounding-0');
    await waitFor(() => expect(off).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText(/Готівку приймають до копійки/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Зберегти/ }));
    await waitFor(() => expect(updateStore).toHaveBeenCalled());
    expect(updateStore.mock.calls.at(-1)![0].cash_rounding).toBe(0);
  });
});
