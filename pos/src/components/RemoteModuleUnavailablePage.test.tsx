// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { syncModuleRemote } = vi.hoisted(() => ({ syncModuleRemote: vi.fn() }));
vi.mock('../lib/moduleRemotes', () => ({ syncModuleRemote }));

import { RemoteModuleUnavailablePage } from './RemoteModuleUnavailablePage';

const props = {
  moduleId: 'loyalty',
  title: 'Бонуси',
  url: 'https://cdn.example.test/loyalty/remote-entry.js',
};

describe('RemoteModuleUnavailablePage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the module title and the offline explanation', () => {
    render(<RemoteModuleUnavailablePage {...props} />);
    expect(screen.getByText(/Бонуси/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Спробувати зараз' })).toBeEnabled();
  });

  it('reloads when a retry succeeds (a version is now cached)', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    syncModuleRemote.mockResolvedValue({ status: 'updated', active: '1.0.0' });

    render(<RemoteModuleUnavailablePage {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Спробувати зараз' }));

    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(syncModuleRemote).toHaveBeenCalledWith('loyalty', props.url);
  });

  it('shows a "no connection" note when the retry still finds nothing', async () => {
    syncModuleRemote.mockResolvedValue({ status: 'offline', active: null });

    render(<RemoteModuleUnavailablePage {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Спробувати зараз' }));

    expect(await screen.findByText(/немає з'єднання/)).toBeInTheDocument();
  });
});
