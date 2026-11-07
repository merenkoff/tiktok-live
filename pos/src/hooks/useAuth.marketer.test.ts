// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The café's marketer works in the web cabinet only (track МР): the desktop till
// and the waiter's tablet — the shells that read offline — refuse its PIN in
// words, end the session the server just opened and keep nothing of it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../test/msw/server';
import { makeAuthResponse } from '../test/utils';
import { posApiBase } from '../lib/urls';

vi.mock('../offline/enabled', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offline/enabled')>()),
  isOfflineReadsEnabled: () => true,
}));

const url = (path: string) => `${posApiBase()}${path}`;

describe('useAuth — a marketer outside the browser', () => {
  afterEach(() => vi.resetModules());

  it('refuses the login at the till or the tablet and logs the session out', async () => {
    let loggedOut = false;
    server.use(
      http.post(url('/auth/staff/pin'), () =>
        HttpResponse.json(makeAuthResponse({ staff: { id: 7, display_name: 'Оля', role: 'marketer' } }))
      ),
      http.post(url('/auth/logout'), () => {
        loggedOut = true;
        return HttpResponse.json({ ok: true });
      })
    );
    vi.resetModules();
    const { useAuthStore } = await import('./useAuth');
    await expect(useAuthStore.getState().loginPin('shablya', '135790')).rejects.toMatchObject({
      name: 'MarketerShellError',
      message: expect.stringMatching(/веб-кабінеті/),
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(loggedOut).toBe(true);
    expect(localStorage.getItem('pos_auth')).toBeNull();
  });
});
