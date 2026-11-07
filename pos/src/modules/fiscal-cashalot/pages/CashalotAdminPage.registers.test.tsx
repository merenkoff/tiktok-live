// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/admin/fiscal` with a second register (track ДК): a tab per register, each
// reading and writing its own register, and register 2's name and switch.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@host/test/utils';
import type { FiscalSettingsView } from '@host/types';

const getFiscalSettingsView = vi.fn<[number?], Promise<FiscalSettingsView>>();
const saveFiscalSecrets = vi.fn<[Record<string, string | null>, number?], Promise<FiscalSettingsView>>();
const saveRegisterBasics = vi.fn<[number, { label?: string | null; enabled?: boolean }], Promise<FiscalSettingsView>>();
const listFiscalAttention = vi.fn<[number?], Promise<{ documents: never[]; sessions: never[] }>>();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalSettingsView: (n?: number) => getFiscalSettingsView(n),
  saveFiscalSecrets: (v: Record<string, string | null>, n?: number) => saveFiscalSecrets(v, n),
  saveFiscalConfig: vi.fn(),
  saveRegisterBasics: (n: number, p: { label?: string | null; enabled?: boolean }) => saveRegisterBasics(n, p),
  testFiscalConnection: vi.fn(),
  listFiscalAttention: (n?: number) => listFiscalAttention(n),
}));

const { CashalotAdminPage } = await import('./CashalotAdminPage');

function view(over: Partial<FiscalSettingsView> = {}): FiscalSettingsView {
  return {
    enabled: true,
    provider: 'cashalot',
    config: {},
    secrets_set: [],
    default_tax_code: null,
    auto_open_shift: true,
    fail_mode: 'block',
    receipt_source: 'local',
    receipt_width: 32,
    offline_mode: false,
    offline_codes_target: 200,
    offline_capable: false,
    receipt_text_capable: false,
    requisites: null,
    requisites_fetched_at: null,
    updated_at: null,
    secrets_key_configured: true,
    adapter_available: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listFiscalAttention.mockResolvedValue({ documents: [], sessions: [] });
});

describe('CashalotAdminPage — two registers', () => {
  it('opens register 2 on its tab and saves its keys and its name to register 2', async () => {
    getFiscalSettingsView.mockImplementation(async (n) =>
      n === 2
        ? view({ register_no: 2, label: 'Бар', enabled: false })
        : view({ extra_registers: [{ register_no: 2, label: 'Бар', enabled: false, provider: 'cashalot', configured: false }] })
    );
    saveFiscalSecrets.mockResolvedValue(view({ register_no: 2, label: 'Бар', enabled: false, secrets_set: ['keyGuid'] }));
    saveRegisterBasics.mockResolvedValue(view({ register_no: 2, label: 'Бар', enabled: true }));
    renderWithProviders(<CashalotAdminPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Каса 2 · Бар' }));
    expect(await screen.findByTestId('register-basics')).toBeInTheDocument();
    expect(getFiscalSettingsView).toHaveBeenCalledWith(2);
    expect(listFiscalAttention).toHaveBeenCalledWith(2);

    await user.type(screen.getByLabelText(/Ідентифікатор ключа \(KeyGuid\)/), 'guid-2');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані доступу' }));
    expect(saveFiscalSecrets).toHaveBeenCalledWith(expect.objectContaining({ keyGuid: 'guid-2' }), 2);

    await user.click(screen.getByTestId('register-enabled'));
    await user.click(screen.getByTestId('register-basics-save'));
    expect(saveRegisterBasics).toHaveBeenCalledWith(2, { label: 'Бар', enabled: true });
  });

  it('offers a second register beside a working Cashalot register 1, and only there', async () => {
    getFiscalSettingsView.mockResolvedValue(view());
    renderWithProviders(<CashalotAdminPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Додати другу касу' }));
    expect(await screen.findByRole('tab', { name: 'Каса 2' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers no second register while register 1 is off', async () => {
    getFiscalSettingsView.mockResolvedValue(view({ enabled: false }));
    renderWithProviders(<CashalotAdminPage />);
    expect(await screen.findByText('Дані доступу')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Додати другу касу' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-tabs')).not.toBeInTheDocument();
  });
});
