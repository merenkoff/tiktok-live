import { http, HttpResponse } from 'msw';
import { mockSession, mockSettings, mockUser } from '../utils';

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { tiktok_username?: string };
    if (!body.tiktok_username || body.tiktok_username.length < 3) {
      return HttpResponse.json({ error: 'Invalid username' }, { status: 400 });
    }
    return HttpResponse.json({
      token: 'test-token',
      user: { ...mockUser, tiktok_username: body.tiktok_username },
    });
  }),

  http.post('/api/auth/logout', () => HttpResponse.json({ ok: true })),

  http.get('/api/auth/me', ({ request }) => {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return HttpResponse.json(mockUser);
  }),

  http.get('/api/settings', () => HttpResponse.json(mockSettings)),

  http.put('/api/settings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...mockSettings, ...body });
  }),

  http.post('/api/settings/test-telegram', () =>
    HttpResponse.json({ ok: true, message: 'Telegram bot is working' })
  ),

  http.get('/api/sessions/current', () => HttpResponse.json(null)),

  http.post('/api/sessions/start', () => HttpResponse.json(mockSession)),

  http.post('/api/sessions/stop', () => HttpResponse.json({ success: true })),

  http.get('/api/sessions/logs', () => HttpResponse.json([])),
];
