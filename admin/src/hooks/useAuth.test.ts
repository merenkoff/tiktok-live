import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { useAuthStore } from './useAuth';
import { mockUser } from '../test/utils';
import { server } from '../test/msw/server';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isHydrating: false,
    });
    localStorage.clear();
  });

  it('login persists token/user and authenticates', async () => {
    await useAuthStore.getState().login('evelin_kids');

    expect(localStorage.getItem('token')).toBe('test-token');
    expect(JSON.parse(localStorage.getItem('user')!).tiktok_username).toBe(
      'evelin_kids'
    );
    expect(useAuthStore.getState()).toMatchObject({
      token: 'test-token',
      isAuthenticated: true,
      isHydrating: false,
    });
  });

  it('logout clears storage even when API fails', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify(mockUser));
    useAuthStore.setState({
      token: 'tok',
      user: mockUser,
      isAuthenticated: true,
      isHydrating: false,
    });

    server.use(
      http.post('/api/auth/logout', () =>
        HttpResponse.json({ error: 'fail' }, { status: 500 })
      )
    );

    await useAuthStore.getState().logout();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('loadUser with empty storage finishes unauthenticated', async () => {
    await useAuthStore.getState().loadUser();
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      isHydrating: false,
      token: null,
    });
  });

  it('loadUser clears malformed user JSON', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', '{bad');

    await useAuthStore.getState().loadUser();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('loadUser validates via getMe and updates user', async () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify(mockUser));
    const updated = { ...mockUser, tiktok_username: 'updated' };

    server.use(http.get('/api/auth/me', () => HttpResponse.json(updated)));

    await useAuthStore.getState().loadUser();

    expect(useAuthStore.getState().user).toEqual(updated);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().isHydrating).toBe(false);
  });

  it('loadUser clears auth when getMe fails', async () => {
    localStorage.setItem('token', 'stale');
    localStorage.setItem('user', JSON.stringify(mockUser));

    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    );

    await useAuthStore.getState().loadUser();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      isHydrating: false,
      token: null,
      user: null,
    });
  });

  it('clearAuth resets store and storage', () => {
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', '{}');
    useAuthStore.setState({
      token: 'tok',
      user: mockUser,
      isAuthenticated: true,
      isHydrating: true,
    });

    useAuthStore.getState().clearAuth();

    expect(localStorage.getItem('token')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isHydrating).toBe(false);
  });
});
