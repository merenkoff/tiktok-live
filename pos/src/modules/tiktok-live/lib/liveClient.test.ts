// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The token bridge is the part of this module that can loop or leak if it is
// wrong: too eager and every screen mints a token per request, too lazy and an
// expired token wedges the feed. These tests pin the mint count.

import { beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../test/msw/server';
import { posApiBase } from '../../../lib/urls';
import {
  bridgeToken,
  liveClient,
  LiveApiError,
  LiveNotConfiguredError,
  liveUsername,
  resetLiveAuth,
} from './liveClient';

const MINT_URL = `${posApiBase()}/live/session-token`;
const DAY = 24 * 60 * 60 * 1000;

let mints = 0;

/** The bridge endpoint, minting a token that expires `ttlMs` from now. */
function mintHandler(ttlMs = 7 * DAY) {
  return http.post(MINT_URL, () => {
    mints += 1;
    return HttpResponse.json({
      token: `live-token-${mints}`,
      user: { id: 42, tiktok_username: 'demo_live' },
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    });
  });
}

beforeEach(() => {
  mints = 0;
  resetLiveAuth();
});

describe('bridgeToken', () => {
  it('mints once and reuses the token across calls', async () => {
    server.use(mintHandler());
    expect(await bridgeToken()).toBe('live-token-1');
    expect(await bridgeToken()).toBe('live-token-1');
    expect(mints).toBe(1);
  });

  it('shares one in-flight mint between concurrent callers', async () => {
    server.use(mintHandler());
    const [a, b, c] = await Promise.all([bridgeToken(), bridgeToken(), bridgeToken()]);
    expect([a, b, c]).toEqual(['live-token-1', 'live-token-1', 'live-token-1']);
    expect(mints).toBe(1);
  });

  it('re-mints pre-emptively when the cached token expires within a day', async () => {
    server.use(mintHandler(2 * 60 * 60 * 1000));
    expect(await bridgeToken()).toBe('live-token-1');
    expect(await bridgeToken()).toBe('live-token-2');
    expect(mints).toBe(2);
  });

  it('reuses a token cached in localStorage across a fresh module state', async () => {
    server.use(mintHandler());
    await bridgeToken();
    expect(liveUsername()).toBe('demo_live');

    // Simulate a remount: in-memory state cleared, localStorage intact.
    const stored = localStorage.getItem('live_token');
    resetLiveAuth();
    localStorage.setItem('live_token', stored as string);

    expect(await bridgeToken()).toBe('live-token-1');
    expect(mints).toBe(1);
  });

  it('surfaces a 409 as LiveNotConfiguredError and caches nothing', async () => {
    server.use(
      http.post(MINT_URL, () => {
        mints += 1;
        return HttpResponse.json({ error: 'live_not_configured' }, { status: 409 });
      })
    );
    await expect(bridgeToken()).rejects.toBeInstanceOf(LiveNotConfiguredError);
    expect(localStorage.getItem('live_token')).toBeNull();
    expect(liveUsername()).toBeNull();
  });
});

describe('liveClient', () => {
  it('attaches the bridged token to LIVE API calls', async () => {
    let seen: string | null = null;
    server.use(
      mintHandler(),
      http.get('/api/sessions/current', ({ request }) => {
        seen = request.headers.get('Authorization');
        return HttpResponse.json(null);
      })
    );
    await expect(liveClient.getCurrentSession()).resolves.toBeNull();
    expect(seen).toBe('Bearer live-token-1');
  });

  it('re-mints exactly once on a 401 and retries the request', async () => {
    let calls = 0;
    server.use(
      mintHandler(),
      http.get('/api/sessions/logs', ({ request }) => {
        calls += 1;
        if (request.headers.get('Authorization') === 'Bearer live-token-1') {
          return new HttpResponse(null, { status: 401 });
        }
        return HttpResponse.json([]);
      })
    );

    await expect(liveClient.getSessionLogs(100)).resolves.toEqual([]);
    expect(calls).toBe(2);
    expect(mints).toBe(2);
  });

  it('gives up after a second 401 rather than looping', async () => {
    let calls = 0;
    server.use(
      mintHandler(),
      http.post('/api/sessions/start', () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      })
    );

    await expect(liveClient.startSession()).rejects.toBeInstanceOf(LiveApiError);
    expect(calls).toBe(2);
    expect(mints).toBe(2);
  });

  it('reports a non-401 failure as LiveApiError with the status', async () => {
    server.use(
      mintHandler(),
      http.post('/api/sessions/stop', () =>
        HttpResponse.json({ error: 'No active session' }, { status: 400 })
      )
    );
    await expect(liveClient.stopSession()).rejects.toMatchObject({
      name: 'LiveApiError',
      status: 400,
    });
  });
});
