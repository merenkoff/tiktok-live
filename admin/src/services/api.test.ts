import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { api } from './api';
import { server } from '../test/msw/server';

describe('ApiClient', () => {
  it('attaches Bearer token from localStorage', async () => {
    localStorage.setItem('token', 'abc123');
    let authHeader: string | null = null;

    server.use(
      http.get('/api/auth/me', ({ request }) => {
        authHeader = request.headers.get('Authorization');
        return HttpResponse.json({ id: 1, tiktok_username: 'u' });
      })
    );

    await api.getMe();
    expect(authHeader).toBe('Bearer abc123');
  });

  it('clears storage and hard-redirects on 401 for session endpoints', async () => {
    localStorage.setItem('token', 'stale');
    localStorage.setItem('user', '{}');

    server.use(
      http.get('/api/sessions/current', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    );

    await expect(api.getCurrentSession()).rejects.toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(window.location.replace).toHaveBeenCalledWith('/');
  });

  it('clears storage but does not hard-redirect on 401 for /api/auth/me', async () => {
    localStorage.setItem('token', 'stale');
    localStorage.setItem('user', '{}');

    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    );

    await expect(api.getMe()).rejects.toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('does not hard-redirect on 401 for /api/auth/login', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    );

    await expect(api.login('someone')).rejects.toBeTruthy();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('login returns token and user', async () => {
    const result = await api.login('evelin_kids');
    expect(result.token).toBe('test-token');
    expect(result.user.tiktok_username).toBe('evelin_kids');
  });

  it('calls settings and session helper endpoints', async () => {
    await expect(api.getSettings()).resolves.toMatchObject({ user_id: 1 });
    await expect(
      api.updateSettings({ novaposhta_merchant_name: 'X' })
    ).resolves.toMatchObject({ novaposhta_merchant_name: 'X' });
    await expect(api.testTelegram()).resolves.toMatchObject({ ok: true });
    await expect(api.getSessionLogs(50)).resolves.toEqual([]);
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it('getSessionStats hits stats endpoint', async () => {
    server.use(
      http.get('/api/sessions/stats', () =>
        HttpResponse.json({ isActive: false })
      )
    );
    await expect(api.getSessionStats()).resolves.toMatchObject({
      isActive: false,
    });
  });

  it('start and stop session endpoints', async () => {
    await expect(api.startSession()).resolves.toMatchObject({ status: 'running' });
    await expect(api.stopSession()).resolves.toMatchObject({ success: true });
  });

  describe('getWebSocketUrl', () => {
    it('throws without token', () => {
      expect(() => api.getWebSocketUrl()).toThrow('No auth token for WebSocket');
    });

    it('builds localhost ws url with encoded token', () => {
      localStorage.setItem('token', 'a+b/c');
      expect(api.getWebSocketUrl()).toBe(
        'ws://localhost:3000/api/sessions/logs/stream?token=a%2Bb%2Fc'
      );
    });

    it('builds wss url for production host', () => {
      localStorage.setItem('token', 'prod-token');
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          ...window.location,
          hostname: 'the-live.shop',
          host: 'the-live.shop',
          protocol: 'https:',
          replace: vi.fn(),
        },
      });

      expect(api.getWebSocketUrl()).toBe(
        'wss://the-live.shop/api/sessions/logs/stream?token=prod-token'
      );
    });
  });
});
