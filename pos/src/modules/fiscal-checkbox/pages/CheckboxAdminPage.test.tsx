// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `/admin/fiscal` — credentials, "Перевірити з'єднання", the attention list.
// The behaviour worth pinning: a 409 from a missing adapter (the state every
// store is in until phase 2b ships one) must render as a readable card, not
// crash the page — this is what makes shipping this bundle safe right now.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import type { AttentionDoc, FiscalProbe } from '../../fiscal-core/types';
import type { FiscalSettingsView } from '../../../types';

const getFiscalSettingsView = vi.fn<[], Promise<FiscalSettingsView>>();
const saveFiscalSecrets = vi.fn<[Record<string, string | null>], Promise<FiscalSettingsView>>();
const testFiscalConnection = vi.fn<[], Promise<FiscalProbe>>();
const listFiscalAttention = vi.fn<[], Promise<{ documents: AttentionDoc[] }>>();

vi.mock('../../fiscal-core/data/fiscalApi', () => ({
  getFiscalSettingsView: () => getFiscalSettingsView(),
  saveFiscalSecrets: (v: Record<string, string | null>) => saveFiscalSecrets(v),
  testFiscalConnection: () => testFiscalConnection(),
  listFiscalAttention: () => listFiscalAttention(),
}));

const { CheckboxAdminPage } = await import('./CheckboxAdminPage');

function settingsView(over: Partial<FiscalSettingsView> = {}): FiscalSettingsView {
  return {
    enabled: false,
    provider: 'checkbox',
    config: {},
    secrets_set: [],
    default_tax_code: null,
    auto_open_shift: true,
    fail_mode: 'block',
    receipt_source: 'local',
    updated_at: null,
    secrets_key_configured: true,
    adapter_available: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listFiscalAttention.mockResolvedValue({ documents: [] });
});

describe('CheckboxAdminPage', () => {
  it('renders the credentials form once settings load', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    renderWithProviders(<CheckboxAdminPage />);
    expect(await screen.findByText('Ліцензійний ключ')).toBeInTheDocument();
    expect(screen.getByText('PIN-код касира')).toBeInTheDocument();
  });

  it('saves only the field the cashier actually typed into', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    saveFiscalSecrets.mockResolvedValue(settingsView({ secrets_set: ['licenceKey'] }));
    renderWithProviders(<CheckboxAdminPage />);

    const field = await screen.findByPlaceholderText('Кабінет Checkbox → Каси → обраний реєстратор');
    await userEvent.type(field, 'LIC-123');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти дані доступу' }));

    await waitFor(() =>
      expect(saveFiscalSecrets).toHaveBeenCalledWith({ licenceKey: 'LIC-123' })
    );
  });

  it("renders a readable error, not a crash, when the provider has no adapter yet", async () => {
    // The state every store is in until phase 2b — this is the exact 409 the
    // backend answers, and it is what makes shipping this bundle safe now.
    getFiscalSettingsView.mockResolvedValue(settingsView());
    testFiscalConnection.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'not_configured',
          message: 'ПРРО не налаштовано',
          support_code: 'FS-NOT-CONFIGURED',
        },
      },
    });
    renderWithProviders(<CheckboxAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: "Перевірити з'єднання" }));

    expect(await screen.findByText('ПРРО не налаштовано')).toBeInTheDocument();
    expect(screen.getByText('FS-NOT-CONFIGURED')).toBeInTheDocument();
  });

  it('shows a successful probe result', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    testFiscalConnection.mockResolvedValue({
      ok: true,
      cashierName: 'Оля',
      cashRegister: 'REG-1',
      shiftOpen: false,
      message: null,
    });
    renderWithProviders(<CheckboxAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: "Перевірити з'єднання" }));

    expect(await screen.findByText("З'єднання успішне")).toBeInTheDocument();
    expect(screen.getByText('Касир: Оля')).toBeInTheDocument();
  });

  it('lists documents the retry cron gave up on', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    listFiscalAttention.mockResolvedValue({
      documents: [
        {
          id: 1,
          doc_type: 'sale',
          sale_id: 10,
          refund_id: null,
          receipt_number: 'R-00042',
          total_cents: 10000,
          error_code: 'rejected',
          error_message: 'ПРРО відхилило чек',
          attempts: 8,
          created_at: '2026-09-09T10:00:00.000Z',
        },
      ],
    });
    renderWithProviders(<CheckboxAdminPage />);

    expect(await screen.findByText('R-00042')).toBeInTheDocument();
    expect(screen.getByText('ПРРО відхилило чек')).toBeInTheDocument();
  });

  it('says there is nothing to see when the attention list is empty', async () => {
    getFiscalSettingsView.mockResolvedValue(settingsView());
    renderWithProviders(<CheckboxAdminPage />);
    expect(
      await screen.findByText('Немає документів, що потребують уваги.')
    ).toBeInTheDocument();
  });
});
