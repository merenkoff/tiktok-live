import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { useAuthStore } from './hooks/useAuth';
import { mockUser } from './test/utils';

vi.mock('./pages/SessionPage', () => ({
  SessionPage: () => <div data-testid="session-page">Session</div>,
}));

vi.mock('./pages/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page">Settings</div>,
}));

vi.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">Login</div>,
}));

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

describe('App auth gate', () => {
  it('shows spinner while hydrating', () => {
    useAuthStore.setState({ isHydrating: true, isAuthenticated: false });
    vi.spyOn(useAuthStore.getState(), 'loadUser').mockResolvedValue();

    renderApp();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows login when not authenticated', async () => {
    useAuthStore.setState({ isHydrating: false, isAuthenticated: false });
    vi.spyOn(useAuthStore.getState(), 'loadUser').mockResolvedValue();

    renderApp();
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });

  it('shows session routes when authenticated', async () => {
    useAuthStore.setState({
      isHydrating: false,
      isAuthenticated: true,
      user: mockUser,
      token: 'tok',
    });
    vi.spyOn(useAuthStore.getState(), 'loadUser').mockResolvedValue();

    renderApp();
    expect(await screen.findByTestId('session-page')).toBeInTheDocument();
  });

  it('calls loadUser on mount', async () => {
    const loadUser = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      isHydrating: false,
      isAuthenticated: false,
      loadUser,
    });

    renderApp();
    await waitFor(() => expect(loadUser).toHaveBeenCalled());
  });
});
