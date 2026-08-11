import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { renderWithProviders, mockUser } from '../test/utils';
import { useAuthStore } from '../hooks/useAuth';

vi.mock('../hooks/useAuth', async () => {
  const actual = await vi.importActual<typeof import('../hooks/useAuth')>('../hooks/useAuth');
  return {
    ...actual,
    useAuthStore: actual.useAuthStore,
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrating: false,
      login: vi.fn(),
      logout: vi.fn(),
      loadUser: vi.fn(),
      clearAuth: vi.fn(),
    });
  });

  it('disables submit when username empty', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByTestId('login-submit')).toBeDisabled();
  });

  it('trims username and calls login', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login });

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByTestId('login-username'), '  evelin_kids  ');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => expect(login).toHaveBeenCalledWith('evelin_kids'));
  });

  it('shows API error message', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue({
      response: { data: { error: 'Invalid username' } },
    });
    useAuthStore.setState({ login });

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByTestId('login-username'), 'ab');
    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByText(/Invalid username/i)).toBeInTheDocument();
  });

  it('falls back to Login failed', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue({});
    useAuthStore.setState({ login });

    renderWithProviders(<LoginPage />);
    await user.type(screen.getByTestId('login-username'), mockUser.tiktok_username);
    await user.click(screen.getByTestId('login-submit'));

    expect(await screen.findByText(/Login failed/i)).toBeInTheDocument();
  });
});
