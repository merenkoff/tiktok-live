// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './Header';
import { renderWithProviders } from '../test/utils';
import { useAuthStore } from '../hooks/useAuth';

describe('Header', () => {
  beforeEach(() => {
    useAuthStore.setState({
      logout: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: true,
      isHydrating: false,
    } as any);
  });

  it('highlights Live Session on /', () => {
    renderWithProviders(<Header />, { route: '/' });
    expect(screen.getByRole('button', { name: /Live Session/i })).toBeInTheDocument();
  });

  it('calls logout', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ logout } as any);

    renderWithProviders(<Header />, { route: '/' });
    await user.click(screen.getByRole('button', { name: /Logout/i }));
    expect(logout).toHaveBeenCalled();
  });
});
