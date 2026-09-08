// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { renderWithProviders, mockSettings } from '../test/utils';

vi.mock('../services/api', () => ({
  api: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    testTelegram: vi.fn(),
  },
}));

vi.mock('../components/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

import { api } from '../services/api';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockReset();
    vi.mocked(api.updateSettings).mockReset();
    vi.mocked(api.testTelegram).mockReset();
    vi.mocked(api.getSettings).mockResolvedValue(mockSettings);
    vi.mocked(api.updateSettings).mockResolvedValue(mockSettings);
    vi.mocked(api.testTelegram).mockResolvedValue({
      ok: true,
      message: 'Telegram bot is working',
    });
  });

  it('loads settings into the form', async () => {
    renderWithProviders(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Shop')).toBeInTheDocument()
    );
  });

  it('saves settings and shows success toast', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Shop')).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(await screen.findByText(/Налаштування збережено/i)).toBeInTheDocument();
  });

  // The regression that mattered: the API used to return secrets masked as
  // '***', this form hydrated that into its inputs, and saving wrote the mask
  // over the real credential. Asserting only "save was called" missed it, so
  // these assert the payload.
  it('omits an untouched secret so the stored one survives', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Shop')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    const patch = vi.mocked(api.updateSettings).mock.calls.at(-1)![0];
    expect(patch).not.toHaveProperty('telegram_bot_token');
    expect(patch).not.toHaveProperty('novaposhta_api_key');
    expect(JSON.stringify(patch)).not.toContain('***');
  });

  it('never renders a stored secret back into the input', async () => {
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Shop')).toBeInTheDocument());

    const token = document.querySelector<HTMLInputElement>('input[name="telegram_bot_token"]')!;
    expect(token.value).toBe('');
    expect(screen.getByText(/Збережено\. Введіть новий/i)).toBeInTheDocument();
  });

  it('sends a newly typed secret', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Shop')).toBeInTheDocument());

    await user.type(
      document.querySelector<HTMLInputElement>('input[name="telegram_bot_token"]')!,
      '999:NEW'
    );
    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(vi.mocked(api.updateSettings).mock.calls.at(-1)![0]).toMatchObject({
      telegram_bot_token: '999:NEW',
    });
  });

  it('sends null when the owner explicitly clears a stored secret', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Shop')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: /Видалити збережене/i })[0]);
    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(vi.mocked(api.updateSettings).mock.calls.at(-1)![0]).toMatchObject({
      telegram_bot_token: null,
    });
  });

  it('keeps the channel id a string and clears it when blanked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const channel = await screen.findByDisplayValue('-100123');

    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(vi.mocked(api.updateSettings).mock.calls.at(-1)![0]).toMatchObject({
      telegram_channel_id: '-100123',
    });

    await user.clear(channel);
    await user.click(screen.getByRole('button', { name: /Зберегти зміни/i }));
    await waitFor(() => expect(vi.mocked(api.updateSettings).mock.calls.length).toBe(2));
    expect(vi.mocked(api.updateSettings).mock.calls.at(-1)![0]).toMatchObject({
      telegram_channel_id: null,
    });
  });

  it('no longer offers the payment timer, which nothing read', async () => {
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByDisplayValue('Shop')).toBeInTheDocument());
    expect(screen.queryByText(/Таймер оплати/i)).not.toBeInTheDocument();
    expect(
      document.querySelector('select[name="payment_timeout_minutes"]')
    ).toBeNull();
  });

  it('tests telegram connection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Перевірити/i })).toBeEnabled()
    );

    await user.click(screen.getByRole('button', { name: /Перевірити/i }));
    expect(await screen.findByText(/Telegram bot is working/i)).toBeInTheDocument();
  });
});
