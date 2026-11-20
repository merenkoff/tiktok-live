// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The super admin's settings for the notice of copies without a key
// (TechDocs/POS_LICENSING.md, phase 2G): a threshold, a text, whether guests
// read it — and nothing drawn at all on a server that has no such settings.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuperNoticePolicy, SuperNoticeSettings } from './superApi';

const getLicenseNotice = vi.fn<() => Promise<SuperNoticeSettings>>();
const setLicenseNotice = vi.fn<(policy: SuperNoticePolicy) => Promise<SuperNoticePolicy>>();

vi.mock('./superApi', async () => {
  const real = await vi.importActual<typeof import('./superApi')>('./superApi');
  return {
    ...real,
    superApi: {
      getLicenseNotice: () => getLicenseNotice(),
      setLicenseNotice: (policy: SuperNoticePolicy) => setLicenseNotice(policy),
    },
  };
});

const { LicenseNoticeSettings } = await import('./LicenseNoticeSettings');

const DEFAULT_TEXT = 'Ця копія працює без ліцензійного ключа. Комерційне використання потребує ліцензії — the-live.shop';
const settings = (policy: Partial<SuperNoticePolicy> = {}): SuperNoticeSettings => ({
  policy: { warn_after: 30, text: null, guests: false, ...policy },
  defaults: { warn_after: 30, text: DEFAULT_TEXT, text_max: 300 },
});

afterEach(() => vi.clearAllMocks());

describe('LicenseNoticeSettings', () => {
  it('shows what applies today — 30 launches, the built-in text in grey, guests off — and saves a change', async () => {
    const user = userEvent.setup();
    getLicenseNotice.mockResolvedValue(settings());
    setLicenseNotice.mockImplementation(async (policy) => policy);
    render(<LicenseNoticeSettings />);

    const threshold = await screen.findByLabelText('Поріг запусків клієнтів');
    expect(threshold).toHaveValue(30);
    const text = screen.getByLabelText('Текст попередження');
    expect(text).toHaveValue('');
    expect(text).toHaveAttribute('placeholder', DEFAULT_TEXT);
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    await user.clear(threshold);
    await user.type(threshold, '50');
    await user.type(text, '  Свій текст  ');
    await user.click(screen.getByRole('button', { name: 'Зберегти' }));

    await waitFor(() => expect(setLicenseNotice).toHaveBeenCalledTimes(1));
    expect(setLicenseNotice).toHaveBeenCalledWith({ warn_after: 50, text: 'Свій текст', guests: false });
    expect(await screen.findByText(/Збережено/)).toBeInTheDocument();
  });

  it('says that guests are for every copy without a key, and that a copy without a key is not yet an offender', async () => {
    getLicenseNotice.mockResolvedValue(settings());
    render(<LicenseNoticeSettings />);
    expect(await screen.findByText(/Для ВСІХ копій без ключа/)).toBeInTheDocument();
    expect(screen.getByText(/ще не порушник/)).toBeInTheDocument();
    expect(screen.getByText(/Нічого не блокує і не вимикає/)).toBeInTheDocument();
  });

  it('will not send a threshold that is not a whole number from 0 up, or a text that is too long', async () => {
    const user = userEvent.setup();
    getLicenseNotice.mockResolvedValue(settings());
    render(<LicenseNoticeSettings />);
    const threshold = await screen.findByLabelText('Поріг запусків клієнтів');
    const save = screen.getByRole('button', { name: 'Зберегти' });

    await user.clear(threshold);
    expect(save).toBeDisabled();
    await user.type(threshold, '-3');
    expect(save).toBeDisabled();
    await user.clear(threshold);
    await user.type(threshold, '0');
    expect(save).toBeEnabled();
    expect(screen.getByText(/попередження вимкнено для всіх/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Текст попередження'));
    await user.paste('x'.repeat(301));
    expect(save).toBeDisabled();
    expect(setLicenseNotice).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal and keeps what was typed', async () => {
    const user = userEvent.setup();
    getLicenseNotice.mockResolvedValue(settings({ warn_after: 12, text: 'було' }));
    setLicenseNotice.mockRejectedValue(new Error('Network Error'));
    render(<LicenseNoticeSettings />);
    await user.click(await screen.findByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText(/Network Error|мереж/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Текст попередження')).toHaveValue('було');
  });

  it('draws nothing on a server older than the notice', async () => {
    getLicenseNotice.mockRejectedValue(new Error('404'));
    const { container } = render(<LicenseNoticeSettings />);
    await waitFor(() => expect(getLicenseNotice).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
