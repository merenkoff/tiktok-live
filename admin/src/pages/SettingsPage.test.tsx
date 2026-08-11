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
