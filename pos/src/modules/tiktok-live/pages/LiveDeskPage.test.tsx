// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Screen-level smoke tests: the three bootstrap states the operator can land
// in, and that the feed + controls are wired to the hooks underneath.

import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/utils';
import { FakeWebSocket, installFakeWebSocket } from '../test-support';
import { HostTooOldError } from '../lib/hostPlatform';
import { resetReportedFailures } from '../lib/diagnostics';
import type { LiveSession, SessionLog } from '../types';

const actual = await vi.importActual<typeof import('../lib/liveClient')>('../lib/liveClient');

const bridgeToken = vi.fn<[{ force?: boolean }?], Promise<string>>();
const getCurrentSession = vi.fn<[], Promise<LiveSession | null>>();
const getSessionLogs = vi.fn<[number?], Promise<SessionLog[]>>();
const startSession = vi.fn<[], Promise<LiveSession>>();
const stopSession = vi.fn<[], Promise<{ success: boolean }>>();
let username: string | null = 'demo_live';

vi.mock('../lib/liveClient', async () => {
  const real = await vi.importActual<typeof import('../lib/liveClient')>('../lib/liveClient');
  return {
    ...real,
    bridgeToken: (opts?: { force?: boolean }) => bridgeToken(opts),
    liveUsername: () => username,
    liveClient: {
      bridgeToken: (opts?: { force?: boolean }) => bridgeToken(opts),
      getCurrentSession: () => getCurrentSession(),
      getSessionLogs: (limit?: number) => getSessionLogs(limit),
      startSession: () => startSession(),
      stopSession: () => stopSession(),
    },
  };
});

const { LiveDeskPage } = await import('./LiveDeskPage');

const running: LiveSession = {
  id: 1,
  user_id: 42,
  status: 'running',
  started_at: new Date(Date.now() - 65_000).toISOString(),
};

function log(id: number, overrides: Partial<SessionLog> = {}): SessionLog {
  return {
    id,
    session_id: 1,
    user_id: 42,
    log_type: 'tiktok_comment',
    message: `коментар ${id}`,
    created_at: '2026-09-07T10:00:00.000Z',
    ...overrides,
  };
}

describe('LiveDeskPage', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installFakeWebSocket();
    resetReportedFailures();
    // Failure paths below log their support code on purpose; keep it out of the
    // suite output rather than asserting on console noise.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    username = 'demo_live';
    bridgeToken.mockReset().mockResolvedValue('live-token');
    getCurrentSession.mockReset().mockResolvedValue(null);
    getSessionLogs.mockReset().mockResolvedValue([]);
    startSession.mockReset().mockResolvedValue(running);
    stopSession.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  /** An axios-shaped rejection — what the bridge call really throws. */
  function axiosError(status: number) {
    return Object.assign(new Error(`status ${status}`), { response: { status } });
  }

  it('tells the operator to connect the store when the bridge says it is not configured', async () => {
    bridgeToken.mockRejectedValue(new actual.LiveNotConfiguredError());
    renderWithProviders(<LiveDeskPage />);

    expect(await screen.findByText(/не під.єднано до TikTok LIVE/i)).toBeInTheDocument();
    expect(screen.getByText(/Налаштуваннях/i)).toBeInTheDocument();
    // No point offering broadcast controls the store cannot use.
    expect(screen.queryByTestId('session-start')).not.toBeInTheDocument();
    // Even the "just configure it" screen carries a code — this is a very
    // likely support call, and CFG tells us it is an errand, not a fault.
    expect(screen.getByTestId('live-support-code')).toHaveTextContent(/^TL-CFG-/);
  });

  it('tells the operator to update the app when the shell is older than the module', async () => {
    bridgeToken.mockRejectedValue(new HostTooOldError(['apiOrigin', 'api.liveSessionToken']));
    renderWithProviders(<LiveDeskPage />);

    expect(await screen.findByText(/Застосунок каси застарів/i)).toBeInTheDocument();
    expect(screen.getByTestId('live-support-code')).toHaveTextContent(/^TL-HOST-/);
  });

  it('points at the server, not the till, when the bridge route is missing', async () => {
    bridgeToken.mockRejectedValue(axiosError(404));
    renderWithProviders(<LiveDeskPage />);

    expect(await screen.findByText(/Сервер не підтримує модуль ефіру/i)).toBeInTheDocument();
    expect(screen.getByTestId('live-support-code')).toHaveTextContent(/^TL-SRV404-/);
  });

  it('says the till is offline when nothing answered', async () => {
    bridgeToken.mockRejectedValue(new Error('Network Error'));
    renderWithProviders(<LiveDeskPage />);

    expect(await screen.findByText(/Немає зʼєднання з сервером/i)).toBeInTheDocument();
    expect(screen.getByTestId('live-support-code')).toHaveTextContent(/^TL-NET-/);
  });

  it('exposes the full diagnostic for pasting, without leaking the token', async () => {
    bridgeToken.mockRejectedValue(axiosError(500));
    renderWithProviders(<LiveDeskPage />);

    await screen.findByTestId('live-support-code');
    const details = screen.getByText(/"module": "tiktok-live"/);
    expect(details.textContent).toContain('"reason": "server_error"');
    expect(details.textContent).toContain('"hostVersion"');
    expect(details.textContent).not.toMatch(/live-token|Bearer/);
  });

  it('offers a retry that clears the failure once the cause is gone', async () => {
    bridgeToken.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<LiveDeskPage />);

    const retry = await screen.findByRole('button', { name: /Спробувати ще раз/i });
    bridgeToken.mockResolvedValue('live-token');
    await userEvent.click(retry);

    expect(await screen.findByTestId('session-start')).toBeInTheDocument();
    expect(screen.queryByTestId('live-support-code')).not.toBeInTheDocument();
  });

  it('shows a stopped broadcast with the start control and an empty feed', async () => {
    renderWithProviders(<LiveDeskPage />);

    expect(await screen.findByTestId('session-start')).toBeInTheDocument();
    expect(screen.getByTestId('session-status')).toHaveTextContent('Зупинена');
    expect(screen.getByText(/Повідомлень поки немає/i)).toBeInTheDocument();
    expect(screen.getByText(/@demo_live/)).toBeInTheDocument();
  });

  it('starts the broadcast and swaps in the stop control', async () => {
    renderWithProviders(<LiveDeskPage />);
    const start = await screen.findByTestId('session-start');

    getCurrentSession.mockResolvedValue(running);
    await userEvent.click(start);

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('session-stop')).toBeInTheDocument();
    expect(screen.getByTestId('session-status')).toHaveTextContent('Активна');
    // Timer counts from `started_at`, not from the click.
    expect(await screen.findByText(/^00:01:0\d$/)).toBeInTheDocument();
  });

  it('renders the backlog and live frames, and counts them by type', async () => {
    getCurrentSession.mockResolvedValue(running);
    getSessionLogs.mockResolvedValue([log(1), log(2, { log_type: 'order', message: 'Замовлення #1' })]);

    renderWithProviders(<LiveDeskPage />);
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    await act(async () => {
      FakeWebSocket.last().open();
    });

    await waitFor(() => expect(screen.getAllByTestId('live-log-row')).toHaveLength(2));
    expect(screen.getByText('Замовлення #1')).toBeInTheDocument();

    await act(async () => {
      FakeWebSocket.last().emit({
        type: 'log',
        log: log(3, { log_type: 'error', message: 'Збій' }),
      });
    });
    await waitFor(() => expect(screen.getAllByTestId('live-log-row')).toHaveLength(3));
    expect(screen.getByText('Збій')).toBeInTheDocument();
  });
});
