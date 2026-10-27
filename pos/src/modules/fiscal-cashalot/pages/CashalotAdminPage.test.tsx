// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/admin/fiscal` for Cashalot — the three credentials, the tax table with
// the default rate chosen from it, the test-mode banner, the server's own
// refusal shown verbatim.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { AttentionDoc, FiscalProbe, OfflineSessionView } from '../../fiscal-core/types';
import type { FiscalSettingsView } from '../../../types';

const getFiscalSettingsView = vi.fn<[], Promise<FiscalSettingsView>>();
const saveFiscalSecrets = vi.fn<[Record<string, string | null>], Promise<FiscalSettingsView>>();
const saveFiscalConfig =
  vi.fn<[Record<string, unknown>, string | null | undefined], Promise<FiscalSettingsView>>();
const testFiscalConnection = vi.fn<[], Promise<FiscalProbe>>();
const listFiscalAttention =
  vi.fn<[], Promise<{ documents: AttentionDoc[]; sessions?: OfflineSessionView[] }>>();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalSettingsView: () => getFiscalSettingsView(),
  saveFiscalSecrets: (v: Record<string, string | null>) => saveFiscalSecrets(v),
  saveFiscalConfig: (c: Record<string, unknown>, d?: string | null) => saveFiscalConfig(c, d),
  testFiscalConnection: () => testFiscalConnection(),
  listFiscalAttention: () => listFiscalAttention(),
}));

const { CashalotAdminPage } = await import('./CashalotAdminPage');

function settingsView(over: Partial<FiscalSettingsView> = {}): FiscalSettingsView {
  return {
    enabled: false,
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

const withTable = (over: Partial<FiscalSettingsView> = {}) =>
  settingsView({
    config: { taxes: [{ letter: 'А', name: 'ПДВ', rate: 20, type: 0 }], testing: false },
    default_tax_code: 'A',
    ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  listFiscalAttention.mockResolvedValue({ documents: [], sessions: [] });
});

describe('CashalotAdminPage', () => {
  it('asks for the three Cashalot credentials and sends only what was typed', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    saveFiscalSecrets.mockResolvedValue(settingsView({ secrets_set: ['keyGuid', 'keyPin', 'numFiscal'] }));
    renderWithProviders(<CashalotAdminPage />);

    expect(await screen.findByText('Фіскалізація — Cashalot')).toBeInTheDocument();
    const user = userEvent.setup();
    // The labels carry the required «*» after the caption.
    await user.type(screen.getByLabelText(/Ідентифікатор ключа \(KeyGuid\)/), 'guid-1');
    await user.type(screen.getByLabelText(/PIN касира/), '9911');
    await user.type(screen.getByLabelText(/Фіскальний номер ПРРО/), '4000000004');
    await user.click(screen.getByRole('button', { name: 'Зберегти дані доступу' }));

    expect(saveFiscalSecrets).toHaveBeenCalledWith({ keyGuid: 'guid-1', keyPin: '9911', numFiscal: '4000000004' });
  });

  it('saves the table, the mode and the default code in one call, the code as the letter’s ASCII', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    saveFiscalConfig.mockResolvedValue(withTable());
    renderWithProviders(<CashalotAdminPage />);
    await screen.findByText('Фіскалізація — Cashalot');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '+ Додати ставку' }));
    await user.type(screen.getByLabelText('Назва ставки 1'), 'ПДВ');
    await user.type(screen.getByLabelText('Відсоток ставки 1'), '20');
    await user.click(screen.getByRole('button', { name: '+ Додати ставку' }));
    await user.selectOptions(screen.getByLabelText('Літера ставки 2'), 'Є');
    await user.type(screen.getByLabelText('Назва ставки 2'), 'ПДВ');
    await user.type(screen.getByLabelText('Відсоток ставки 2'), '7');
    await user.click(screen.getByLabelText('Ставка 2 за замовчуванням'));
    await user.click(screen.getByLabelText('Тестовий режим'));
    await user.click(screen.getByRole('button', { name: 'Зберегти ставки й режим' }));

    expect(saveFiscalConfig).toHaveBeenCalledWith(
      {
        taxes: [
          { letter: 'А', name: 'ПДВ', rate: 20 },
          { letter: 'Є', name: 'ПДВ', rate: 7 },
        ],
        testing: true,
      },
      'YE'
    );
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
    // Not enabled yet — no connection test to refresh the requisites.
    expect(testFiscalConnection).not.toHaveBeenCalled();
  });

  it('with no rows sends an empty table and clears the default code', async () => {
    getFiscalSettingsView.mockResolvedValue(withTable());
    saveFiscalConfig.mockResolvedValue(settingsView());
    renderWithProviders(<CashalotAdminPage />);
    await screen.findByText('Фіскалізація — Cashalot');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Прибрати ставку 1'));
    expect(screen.getByText(/Таблиця порожня/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Зберегти ставки й режим' }));
    expect(saveFiscalConfig).toHaveBeenCalledWith({ taxes: [], testing: false }, null);
  });

  it('shows the server’s refusal in its own words', async () => {
    getFiscalSettingsView.mockResolvedValue(withTable());
    saveFiscalConfig.mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Ставки податку й тестовий режим змінюються лише при закритій зміні — закрийте зміну й збережіть знову' },
      },
    });
    renderWithProviders(<CashalotAdminPage />);
    await screen.findByText('Фіскалізація — Cashalot');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти ставки й режим' }));
    expect(await screen.findByText(/закрийте зміну й збережіть знову/)).toBeInTheDocument();
  });

  it('refreshes the requisites after a save on a store that already fiscalises', async () => {
    getFiscalSettingsView.mockResolvedValue(withTable({ enabled: true }));
    saveFiscalConfig.mockResolvedValue(withTable({ enabled: true }));
    testFiscalConnection.mockResolvedValue({ ok: true, cashierName: null, cashRegister: null, shiftOpen: false, message: null });
    renderWithProviders(<CashalotAdminPage />);
    await screen.findByText('Фіскалізація — Cashalot');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти ставки й режим' }));
    await waitFor(() => expect(testFiscalConnection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getFiscalSettingsView).toHaveBeenCalledTimes(2));
  });

  it('warns a VAT payer whose table is empty, and about a saved code the table lacks', async () => {
    getFiscalSettingsView.mockResolvedValue(
      settingsView({
        requisites: {
          organization: { name: 'ТОВ', edrpou: '1', tax_number: '1', is_vat: true },
          point: { name: null, address: null },
          register: { fiscal_number: '1', title: null, address: null },
          taxes: [],
        },
      })
    );
    const { unmount } = renderWithProviders(<CashalotAdminPage />);
    expect(await screen.findByText(/платник ПДВ, а таблиця ставок порожня/)).toBeInTheDocument();
    unmount();

    getFiscalSettingsView.mockResolvedValue(withTable({ default_tax_code: 'B' }));
    renderWithProviders(<CashalotAdminPage />);
    expect(await screen.findByText(/код ставки «B» не з цієї таблиці/)).toBeInTheDocument();
  });

  it('says out loud that the register runs in test mode', async () => {
    getFiscalSettingsView.mockResolvedValue(withTable({ config: { taxes: [], testing: true } }));
    renderWithProviders(<CashalotAdminPage />);
    const banner = await screen.findByRole('status');
    expect(within(banner).getByText('Тестовий режим.')).toBeInTheDocument();
    expect(screen.getByLabelText('Тестовий режим')).toBeChecked();
  });
});
