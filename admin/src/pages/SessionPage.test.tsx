import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionPage } from './SessionPage';
import { renderWithProviders, makeLog, mockSession } from '../test/utils';

const start = vi.fn();
const stop = vi.fn();
const reconnect = vi.fn();

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(),
}));

vi.mock('../hooks/useLogs', () => ({
  useLogs: vi.fn(),
}));

vi.mock('../components/Header', () => ({
  Header: () => <div data-testid="header" />,
}));

import { useSession } from '../hooks/useSession';
import { useLogs } from '../hooks/useLogs';

describe('SessionPage', () => {
  beforeEach(() => {
    start.mockReset();
    stop.mockReset();
    reconnect.mockReset();
    vi.mocked(useLogs).mockReturnValue({
      logs: [],
      isConnected: true,
      reconnect,
      addLog: vi.fn(),
      clear: vi.fn(),
    });
  });

  it('shows loading spinner', () => {
    vi.mocked(useSession).mockReturnValue({
      session: undefined,
      isLoading: true,
      isError: false,
      isActive: false,
      start,
      stop,
      isStarting: false,
      isStopping: false,
    } as any);

    renderWithProviders(<SessionPage />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useSession).mockReturnValue({
      session: undefined,
      isLoading: false,
      isError: true,
      isActive: false,
      start,
      stop,
      isStarting: false,
      isStopping: false,
    } as any);

    renderWithProviders(<SessionPage />);
    expect(screen.getByText(/Не вдалося підключитись/i)).toBeInTheDocument();
  });

  it('renders active session and counts log types', () => {
    vi.mocked(useSession).mockReturnValue({
      session: mockSession,
      isLoading: false,
      isError: false,
      isActive: true,
      start,
      stop,
      isStarting: false,
      isStopping: false,
    } as any);
    vi.mocked(useLogs).mockReturnValue({
      logs: [
        makeLog({ id: 1, log_type: 'order' }),
        makeLog({ id: 2, log_type: 'order' }),
        makeLog({ id: 3, log_type: 'error' }),
        makeLog({ id: 4, log_type: 'tiktok_comment' }),
      ],
      isConnected: true,
      reconnect,
      addLog: vi.fn(),
      clear: vi.fn(),
    });

    renderWithProviders(<SessionPage />);
    expect(screen.getByText(/Активна/i)).toBeInTheDocument();
    expect(screen.getByTestId('session-stop')).toBeInTheDocument();
    // Stat values appear as numbers in the stats cards
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('wires Start button', async () => {
    const user = userEvent.setup();
    vi.mocked(useSession).mockReturnValue({
      session: null,
      isLoading: false,
      isError: false,
      isActive: false,
      start,
      stop,
      isStarting: false,
      isStopping: false,
    } as any);

    renderWithProviders(<SessionPage />);
    await user.click(screen.getByTestId('session-start'));
    expect(start).toHaveBeenCalled();
  });
});
