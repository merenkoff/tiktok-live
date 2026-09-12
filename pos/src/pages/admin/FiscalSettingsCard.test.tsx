// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/FiscalSettingsCard.test.tsx
//
// This card is what makes shipping the fiscal backend safe before any provider
// adapter exists: a store that switches ПРРО on with no adapter would get an
// error on every single sale, and nothing else in the product would say why.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/utils';
import type { FiscalSettingsView } from '../../types';

const fiscalSettings = vi.fn<[], Promise<FiscalSettingsView>>();
const updateFiscalSettings = vi.fn<[unknown], Promise<FiscalSettingsView>>();
const posRequest = vi.fn<[string, string], Promise<unknown>>();

vi.mock('@pos/platform', async () => {
  const real = await vi.importActual<typeof import('@pos/platform')>('@pos/platform');
  return {
    ...real,
    api: {
      fiscalSettings: () => fiscalSettings(),
      updateFiscalSettings: (p: unknown) => updateFiscalSettings(p),
      posRequest: (m: string, p: string) => posRequest(m, p),
    },
  };
});

const REQUISITES = {
  organization: { name: 'ТОВ «Тестова організація»', edrpou: '44082020', tax_number: '440820207777', is_vat: true },
  point: { name: 'Магазин «Сонечко»', address: 'м. Київ, вул. Сонячна, 27' },
  register: { fiscal_number: '4000002411', title: 'Каса 1', address: null },
  taxes: [{ code: '1', symbol: 'А', label: 'ПДВ 20%', rate: 20, no_vat: false, is_default: true }],
};

const { FiscalSettingsCard } = await import('./FiscalSettingsCard');

function view(over: Partial<FiscalSettingsView> = {}): FiscalSettingsView {
  return {
    enabled: false,
    provider: null,
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
    requisites: null,
    requisites_fetched_at: null,
    updated_at: null,
    secrets_key_configured: true,
    adapter_available: true,
    ...over,
  };
}

const toggle = () => screen.getByLabelText('Реєструвати чеки в ПРРО');
const offlineToggle = () => screen.getByLabelText('Офлайн-режим ПРРО');

beforeEach(() => {
  fiscalSettings.mockReset();
  updateFiscalSettings.mockReset();
  posRequest.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe('FiscalSettingsCard', () => {
  it('refuses to enable when the store has no adapter for its provider', async () => {
    // The state every store is in until phase 2b ships an adapter.
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', adapter_available: false })
    );
    renderWithProviders(<FiscalSettingsCard />);

    expect(await screen.findByText(/немає модуля/i)).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
  });

  it('refuses to enable when the server cannot store credentials', async () => {
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', secrets_key_configured: false })
    );
    renderWithProviders(<FiscalSettingsCard />);

    expect(await screen.findByText(/POS_SECRETS_KEY/)).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
  });

  it('allows enabling once a provider, an adapter and a key are all present', async () => {
    fiscalSettings.mockResolvedValue(view({ provider: 'checkbox' }));
    updateFiscalSettings.mockResolvedValue(view({ provider: 'checkbox', enabled: true }));
    renderWithProviders(<FiscalSettingsCard />);

    await waitFor(() => expect(toggle()).not.toBeDisabled());
    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    await waitFor(() =>
      expect(updateFiscalSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, provider: 'checkbox' })
      )
    );
    expect(await screen.findByText('Збережено')).toBeInTheDocument();
  });

  it('sends the receipt source and roll width the owner picked', async () => {
    fiscalSettings.mockResolvedValue(view({ provider: 'checkbox' }));
    updateFiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', receipt_source: 'provider', receipt_width: 48 })
    );
    renderWithProviders(<FiscalSettingsCard />);

    await userEvent.selectOptions(await screen.findByLabelText('Джерело чека'), 'provider');
    await userEvent.selectOptions(screen.getByLabelText('Ширина чекової стрічки'), '48');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    await waitFor(() =>
      expect(updateFiscalSettings).toHaveBeenCalledWith(
        expect.objectContaining({ receipt_source: 'provider', receipt_width: 48 })
      )
    );
  });

  it('hydrates both receipt controls from the saved settings', async () => {
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', receipt_source: 'provider', receipt_width: 48 })
    );
    renderWithProviders(<FiscalSettingsCard />);

    expect(await screen.findByLabelText('Джерело чека')).toHaveValue('provider');
    expect(screen.getByLabelText('Ширина чекової стрічки')).toHaveValue('48');
  });

  it('keeps the no-adapter warning after a save', async () => {
    // The PATCH response does not carry `adapter_available`, so replacing state
    // instead of merging would make the warning blink out of existence on save
    // and reappear on the next reload.
    const saved = view({ provider: 'checkbox' });
    delete (saved as Partial<FiscalSettingsView>).adapter_available;
    fiscalSettings.mockResolvedValue(view({ provider: 'checkbox', adapter_available: false }));
    updateFiscalSettings.mockResolvedValue(saved as FiscalSettingsView);

    renderWithProviders(<FiscalSettingsCard />);
    await screen.findByText(/немає модуля/i);
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    await screen.findByText('Збережено');
    expect(screen.getByText(/немає модуля/i)).toBeInTheDocument();
  });

  it('explains a missing server key instead of "Помилка збереження"', async () => {
    // The page-wide save handler swallows every error into one generic string;
    // that is exactly why this card owns its own save button.
    fiscalSettings.mockResolvedValue(view({ provider: 'checkbox' }));
    updateFiscalSettings.mockRejectedValue({
      response: { status: 503, data: { error: 'secrets_key_missing' } },
    });

    renderWithProviders(<FiscalSettingsCard />);
    await waitFor(() => expect(toggle()).not.toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    expect(await screen.findByText(/зверніться до адміністратора/i)).toBeInTheDocument();
  });

  // ── Offline mode (TechDocs/POS_FISCAL_OFFLINE.md, phase 4) ────────────────
  //
  // This block is the ONLY way to switch offline mode on or off. It lives in
  // the host, not in the provider's bundle, precisely so that a bundle that
  // fails to load cannot strand a store in offline mode.

  it('does not offer offline mode for a provider that cannot do it', async () => {
    fiscalSettings.mockResolvedValue(view({ provider: 'vchasno', offline_capable: false }));
    renderWithProviders(<FiscalSettingsCard />);

    await waitFor(() => expect(toggle()).toBeInTheDocument());
    expect(screen.queryByLabelText('Офлайн-режим ПРРО')).not.toBeInTheDocument();
  });

  it('keeps offline mode locked until fiscalisation itself is on', async () => {
    // The backend refuses `offline_mode` without `enabled`; showing an enabled
    // checkbox that always errors would be the worse half of that contract.
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', enabled: false, offline_capable: true })
    );
    renderWithProviders(<FiscalSettingsCard />);

    await waitFor(() => expect(offlineToggle()).toBeDisabled());
    expect(screen.getByText(/Спершу увімкніть реєстрацію чеків/i)).toBeInTheDocument();

    await userEvent.click(toggle());
    await waitFor(() => expect(offlineToggle()).not.toBeDisabled());
  });

  it('saves the switch and the reserve size together', async () => {
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', enabled: true, offline_capable: true })
    );
    updateFiscalSettings.mockResolvedValue(
      view({
        provider: 'checkbox',
        enabled: true,
        offline_capable: true,
        offline_mode: true,
        offline_codes_target: 500,
      })
    );
    renderWithProviders(<FiscalSettingsCard />);

    await waitFor(() => expect(offlineToggle()).not.toBeDisabled());
    await userEvent.click(offlineToggle());
    const target = screen.getByLabelText('Запас фіскальних кодів');
    await userEvent.clear(target);
    await userEvent.type(target, '500');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    await waitFor(() =>
      expect(updateFiscalSettings).toHaveBeenCalledWith(
        expect.objectContaining({ offline_mode: true, offline_codes_target: 500 })
      )
    );
  });

  it('refuses a reserve size outside the bounds without calling the API', async () => {
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', enabled: true, offline_capable: true })
    );
    renderWithProviders(<FiscalSettingsCard />);

    const target = await screen.findByLabelText('Запас фіскальних кодів');
    await userEvent.clear(target);
    await userEvent.type(target, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    expect(await screen.findByText(/ціле число від 50 до 2000/i)).toBeInTheDocument();
    expect(updateFiscalSettings).not.toHaveBeenCalled();
  });

  it('shows the backend reason when offline mode cannot be switched off yet', async () => {
    // A live offline session outlives the owner's click: the receipts it holds
    // still have to reach the tax office.
    fiscalSettings.mockResolvedValue(
      view({
        provider: 'checkbox',
        enabled: true,
        offline_capable: true,
        offline_mode: true,
      })
    );
    updateFiscalSettings.mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Триває офлайн-сесія — дочекайтесь її завершення перед вимкненням офлайн-режиму' },
      },
    });
    renderWithProviders(<FiscalSettingsCard />);

    await waitFor(() => expect(offlineToggle()).toBeChecked());
    await userEvent.click(offlineToggle());
    await userEvent.click(screen.getByRole('button', { name: 'Зберегти ПРРО' }));

    expect(await screen.findByText(/Триває офлайн-сесія/i)).toBeInTheDocument();
  });

  it('promises a different thing on a lost connection once offline mode is on', async () => {
    fiscalSettings.mockResolvedValue(
      view({ provider: 'checkbox', enabled: true, offline_capable: true, offline_mode: true })
    );
    renderWithProviders(<FiscalSettingsCard />);

    expect(await screen.findByText(/продаж триває, чеки надсилаються пізніше/i)).toBeInTheDocument();
    expect(screen.queryByText(/продаж блокується/i)).not.toBeInTheDocument();
  });

  // ── Requisites (phase 8в) ─────────────────────────────────────────────────
  //
  // The owner types nothing: the block fills itself from the provider. What
  // this card owes is to show what came, say when nothing has yet, and give
  // one button to fetch it now.

  it('shows what the provider reported, with the tax id in receipt wording', async () => {
    fiscalSettings.mockResolvedValue(
      view({
        provider: 'checkbox',
        enabled: true,
        requisites: REQUISITES,
        requisites_fetched_at: '2026-09-12T08:00:00.000Z',
      })
    );
    renderWithProviders(<FiscalSettingsCard />);

    expect(await screen.findByText('ТОВ «Тестова організація»')).toBeInTheDocument();
    // A VAT payer prints «ПН <ІПН>», not the ЄДРПОУ.
    expect(screen.getByText('ПН 440820207777')).toBeInTheDocument();
    expect(screen.getByText('м. Київ, вул. Сонячна, 27')).toBeInTheDocument();
    expect(screen.getByText('4000002411')).toBeInTheDocument();
    expect(screen.getByText(/А — ПДВ 20%/)).toBeInTheDocument();
  });

  it('says the requisites are still to come before the first online contact', async () => {
    fiscalSettings.mockResolvedValue(view({ provider: 'checkbox', requisites: null }));
    renderWithProviders(<FiscalSettingsCard />);
    expect(await screen.findByText(/Ще не отримано/)).toBeInTheDocument();
  });

  it('«Оновити з ПРРО» runs the connection test and re-reads the card', async () => {
    fiscalSettings
      .mockResolvedValueOnce(view({ provider: 'checkbox', enabled: true, requisites: null }))
      .mockResolvedValueOnce(
        view({ provider: 'checkbox', enabled: true, requisites: REQUISITES })
      );
    posRequest.mockResolvedValue({ ok: true });
    renderWithProviders(<FiscalSettingsCard />);

    await userEvent.click(await screen.findByRole('button', { name: 'Оновити з ПРРО' }));

    await waitFor(() => expect(posRequest).toHaveBeenCalledWith('post', '/fiscal/test-connection'));
    expect(await screen.findByText('ТОВ «Тестова організація»')).toBeInTheDocument();
  });

  it('does not offer requisites before a provider is chosen', async () => {
    fiscalSettings.mockResolvedValue(view({ provider: null }));
    renderWithProviders(<FiscalSettingsCard />);
    await waitFor(() => expect(toggle()).toBeInTheDocument());
    expect(screen.queryByText('Реквізити ПРРО')).not.toBeInTheDocument();
  });

  it('renders nothing for a seller', async () => {
    fiscalSettings.mockRejectedValue({ response: { status: 403 } });
    const { container } = renderWithProviders(<FiscalSettingsCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('offers a retry rather than blanking when the load fails', async () => {
    fiscalSettings.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<FiscalSettingsCard />);
    expect(await screen.findByRole('button', { name: 'Спробувати ще раз' })).toBeInTheDocument();
  });
});
