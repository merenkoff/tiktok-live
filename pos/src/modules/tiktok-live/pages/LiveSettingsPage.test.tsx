// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The module's admin surface. The behaviour worth pinning is the secret
// handling: the API deliberately never returns a stored token, so a blank field
// must mean "keep it" and clearing must be explicit. Getting that wrong is what
// destroyed real credentials before this change.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { resetReportedFailures } from '../lib/diagnostics';
import type { LiveSettings, LiveSettingsPatch } from '../types';

const hasSettingsApi = vi.fn<[], boolean>();
const missingSettingsApi = vi.fn<[], string[]>();
const liveSettings = vi.fn<[], Promise<LiveSettings>>();
const updateLiveSettings = vi.fn<[LiveSettingsPatch], Promise<LiveSettings>>();
const testLiveTelegram = vi.fn<[], Promise<{ ok: boolean; username: string | null }>>();

vi.mock('../lib/hostPlatform', async () => {
  const real = await vi.importActual<typeof import('../lib/hostPlatform')>('../lib/hostPlatform');
  return {
    ...real,
    hasSettingsApi: () => hasSettingsApi(),
    missingSettingsApi: () => missingSettingsApi(),
    liveSettings: () => liveSettings(),
    updateLiveSettings: (p: LiveSettingsPatch) => updateLiveSettings(p),
    testLiveTelegram: () => testLiveTelegram(),
  };
});

// The desk's session poll is irrelevant here; keep it quiet and controllable.
const isActive = { value: false };
vi.mock('../hooks/useLiveSession', () => ({
  useLiveSession: () => ({ isActive: isActive.value }),
}));

const { LiveSettingsPage } = await import('./LiveSettingsPage');

const STORED: LiveSettings = {
  user_id: 1,
  tiktok_username: 'evelin_kids',
  telegram_bot_token_set: true,
  telegram_channel_id: '-1001234567890',
  novaposhta_api_key_set: true,
  novaposhta_merchant_name: 'Shop',
  reservation_timeout_minutes: 5,
};

function tokenInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[name="telegram_bot_token"]')!;
}

async function renderReady() {
  renderWithProviders(<LiveSettingsPage />);
  await screen.findByDisplayValue('Shop');
}

beforeEach(() => {
  resetReportedFailures();
  isActive.value = false;
  hasSettingsApi.mockReturnValue(true);
  missingSettingsApi.mockReturnValue([]);
  liveSettings.mockResolvedValue(STORED);
  updateLiveSettings.mockResolvedValue(STORED);
  testLiveTelegram.mockResolvedValue({ ok: true, username: 'shop_bot' });
});

describe('LiveSettingsPage', () => {
  it('shows the connected account read-only, with a link to change it', async () => {
    await renderReady();
    expect(screen.getByText('@evelin_kids')).toBeInTheDocument();
    // The nickname must not be editable here — its only editor lives in code
    // the shell always ships, or a module that failed to load could not be fixed.
    expect(document.querySelector('input[name="live_tiktok_username"]')).toBeNull();
    expect(screen.getByRole('link', { name: /Налаштуваннях магазину/i })).toHaveAttribute(
      'href',
      '/admin/settings'
    );
  });

  it('links to the broadcast desk', async () => {
    await renderReady();
    expect(screen.getByRole('link', { name: /Відкрити екран ефіру/i })).toHaveAttribute(
      'href',
      '/live'
    );
  });

  it('never renders a stored secret into its input', async () => {
    await renderReady();
    expect(tokenInput().value).toBe('');
    expect(screen.getAllByText(/Збережено\. Введіть новий/i).length).toBeGreaterThan(0);
  });

  it('omits an untouched secret on save, so the stored one survives', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updateLiveSettings).toHaveBeenCalled());

    const patch = updateLiveSettings.mock.calls.at(-1)![0];
    expect(patch).not.toHaveProperty('telegram_bot_token');
    expect(patch).not.toHaveProperty('novaposhta_api_key');
    expect(patch).toMatchObject({
      telegram_channel_id: '-1001234567890',
      novaposhta_merchant_name: 'Shop',
      reservation_timeout_minutes: 5,
    });
  });

  it('sends a newly typed secret', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.type(tokenInput(), '999:NEW');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateLiveSettings).toHaveBeenCalled());
    expect(updateLiveSettings.mock.calls.at(-1)![0]).toMatchObject({
      telegram_bot_token: '999:NEW',
    });
  });

  it('sends null only when the owner explicitly clears a secret', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getAllByRole('button', { name: /Видалити збережене/i })[0]);
    expect(screen.getByText(/Буде видалено при збереженні/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(updateLiveSettings).toHaveBeenCalled());
    expect(updateLiveSettings.mock.calls.at(-1)![0]).toMatchObject({
      telegram_bot_token: null,
    });
  });

  it('lets the owner change their mind about clearing', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getAllByRole('button', { name: /Видалити збережене/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateLiveSettings).toHaveBeenCalled());
    expect(updateLiveSettings.mock.calls.at(-1)![0]).not.toHaveProperty('telegram_bot_token');
  });

  it('clears the channel id when the field is blanked', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.clear(screen.getByDisplayValue('-1001234567890'));
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(updateLiveSettings).toHaveBeenCalled());
    expect(updateLiveSettings.mock.calls.at(-1)![0]).toMatchObject({
      telegram_channel_id: null,
    });
  });

  it('surfaces a validation message from the backend', async () => {
    const user = userEvent.setup();
    updateLiveSettings.mockRejectedValue({
      response: { data: { error: 'telegram_channel_id must be an integer' } },
    });
    await renderReady();

    await user.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be an integer/);
  });

  it('warns that a running broadcast keeps its own snapshot', async () => {
    isActive.value = true;
    await renderReady();
    expect(screen.getByText(/зупиніть і запустіть ефір знову/i)).toBeInTheDocument();
  });

  it('says nothing about restarting when no broadcast is running', async () => {
    await renderReady();
    expect(screen.queryByText(/зупиніть і запустіть ефір знову/i)).not.toBeInTheDocument();
  });

  it('reports a working Telegram bot', async () => {
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByRole('button', { name: /Перевірити зʼєднання/i }));
    expect(await screen.findByText(/Бот працює — @shop_bot/i)).toBeInTheDocument();
  });

  it('explains a rejected Telegram token', async () => {
    const user = userEvent.setup();
    testLiveTelegram.mockRejectedValue({
      response: { data: { error: 'telegram_token_invalid' } },
    });
    await renderReady();

    await user.click(screen.getByRole('button', { name: /Перевірити зʼєднання/i }));
    expect(await screen.findByText(/Telegram відхилив цей токен/i)).toBeInTheDocument();
  });

  it('sends the owner to store settings when no account is connected', async () => {
    liveSettings.mockRejectedValue({ response: { status: 409 } });
    renderWithProviders(<LiveSettingsPage />);

    expect(await screen.findByText(/не підʼєднано до TikTok LIVE/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Перейти до Налаштувань/i })).toHaveAttribute(
      'href',
      '/admin/settings'
    );
  });

  it('explains an old shell instead of dead-ending, and asks for no network', async () => {
    hasSettingsApi.mockReturnValue(false);
    missingSettingsApi.mockReturnValue(['api.liveSettings']);
    renderWithProviders(<LiveSettingsPage />);

    expect(await screen.findByText(/Застосунок каси застарів/i)).toBeInTheDocument();
    expect(liveSettings).not.toHaveBeenCalled();
  });

  it('offers a retry after a load failure', async () => {
    const user = userEvent.setup();
    liveSettings.mockRejectedValueOnce({ response: { status: 500 } });
    renderWithProviders(<LiveSettingsPage />);

    expect(await screen.findByText(/Не вдалося завантажити налаштування/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Спробувати ще раз/i }));
    expect(await screen.findByDisplayValue('Shop')).toBeInTheDocument();
  });

  it('does not offer the payment timer, which nothing reads', async () => {
    await renderReady();
    expect(document.querySelector('select[name="payment_timeout_minutes"]')).toBeNull();
    expect(screen.queryByText(/Таймер оплати/i)).not.toBeInTheDocument();
  });
});
