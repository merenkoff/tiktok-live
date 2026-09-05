// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { AxiosError } from 'axios';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { posApiBase } from '../lib/urls';
import { server } from '../test/msw/server';
import { makeAuthResponse } from '../test/utils';
import { POS_API_CLIENT_VERSION } from '../platform/version';
import { api, isNetworkError, isUnauthorized } from './api';

const TOKEN_KEY = 'pos_token';

describe('error classification', () => {
  it('treats a response-less axios error as a network failure', () => {
    expect(isNetworkError(new AxiosError('Network Error'))).toBe(true);
    expect(isUnauthorized(new AxiosError('Network Error'))).toBe(false);
  });

  it('recognises a 401 and does not call it a network failure', () => {
    const error = new AxiosError('Unauthorized');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error.response = { status: 401 } as any;

    expect(isUnauthorized(error)).toBe(true);
    expect(isNetworkError(error)).toBe(false);
  });

  it('ignores non-axios errors', () => {
    expect(isNetworkError(new Error('boom'))).toBe(false);
    expect(isUnauthorized(new Error('boom'))).toBe(false);
  });
});

describe('auth persistence', () => {
  it('round-trips the session through localStorage', () => {
    const auth = makeAuthResponse();
    api.saveAuth(auth);

    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
    expect(api.loadAuth()).toEqual(auth);
  });

  it('needs both the token and the payload to restore a session', () => {
    api.saveAuth(makeAuthResponse());
    localStorage.removeItem(TOKEN_KEY);
    expect(api.loadAuth()).toBeNull();
  });

  it('survives a corrupted payload', () => {
    localStorage.setItem(TOKEN_KEY, 'test-token');
    localStorage.setItem('pos_auth', '{not json');
    expect(api.loadAuth()).toBeNull();
  });

  it('clearAuth wipes both keys', () => {
    api.saveAuth(makeAuthResponse());
    api.clearAuth();

    expect(api.loadAuth()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe('hasLiveJwt', () => {
  it('is false without a session', () => {
    expect(api.hasLiveJwt()).toBe(false);
  });

  it('is true for an unexpired server token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    api.saveAuth(makeAuthResponse({ expires_at: '2026-01-02T00:00:00.000Z' }));

    expect(api.hasLiveJwt()).toBe(true);

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    expect(api.hasLiveJwt()).toBe(false);
  });

  it('is false for a local offline session', () => {
    api.saveAuth(makeAuthResponse({ token: 'offline:abc', offlineSession: true }));
    expect(api.hasLiveJwt()).toBe(false);
  });
});

describe('token interceptor', () => {
  function captureAuthHeader() {
    const seen: Array<string | null> = [];
    server.use(
      http.get(`${posApiBase()}/me`, ({ request }) => {
        seen.push(request.headers.get('Authorization'));
        return HttpResponse.json(makeAuthResponse());
      })
    );
    return seen;
  }

  it('sends the stored JWT as a Bearer token', async () => {
    const seen = captureAuthHeader();
    localStorage.setItem(TOKEN_KEY, 'jwt-123');

    await api.me();

    expect(seen).toEqual(['Bearer jwt-123']);
  });

  it('never sends a local offline token to the server', async () => {
    const seen = captureAuthHeader();
    localStorage.setItem(TOKEN_KEY, 'offline:abc');

    await api.me();

    expect(seen).toEqual([null]);
  });

  it('caches the session returned by /me', async () => {
    localStorage.setItem(TOKEN_KEY, 'jwt-123');
    const auth = await api.me();

    expect(api.loadAuth()).toEqual(auth);
  });
});

describe('API version header', () => {
  it('declares the build API version on every request', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get(`${posApiBase()}/me`, ({ request }) => {
        seen.push(request.headers.get('X-POS-API-Version'));
        return HttpResponse.json(makeAuthResponse());
      })
    );

    await api.me();

    expect(seen).toEqual([String(POS_API_CLIENT_VERSION)]);
  });
});
