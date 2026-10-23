// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { SuperApi, getSuperToken, setSuperToken, superErrorText } from './superApi';

function adapterReplying(handler: (config: InternalAxiosRequestConfig) => { status: number; data: unknown }): AxiosAdapter {
  return async (config) => {
    const { status, data } = handler(config);
    const response = { status, statusText: String(status), data, headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(`HTTP ${status}`, String(status), config, undefined, response);
    }
    return response;
  };
}

afterEach(() => setSuperToken(null));

describe('SuperApi', () => {
  it('stores the token from /login in sessionStorage and sends it in X-POS-Super-Token', async () => {
    const seen: Array<{ url?: string; header?: string }> = [];
    const api = new SuperApi(
      adapterReplying((c) => {
        seen.push({ url: c.url, header: AxiosHeaders.from(c.headers).get('X-POS-Super-Token') as string | undefined });
        if (c.url === '/login') return { status: 200, data: { token: 't.0k', expires_at: '2099-01-01' } };
        return { status: 200, data: [] };
      })
    );
    await api.login('correct horse battery staple');
    expect(getSuperToken()).toBe('t.0k');
    await api.listStores();
    expect(seen[1]).toEqual({ url: '/stores', header: 't.0k' });
  });

  it('a 401 on any call but /login clears the token and notifies listeners', async () => {
    setSuperToken('stale');
    const api = new SuperApi(adapterReplying(() => ({ status: 401, data: { error: 'Super access required' } })));
    const onUnauthorized = vi.fn();
    api.onUnauthorized(onUnauthorized);
    await expect(api.listStores()).rejects.toBeInstanceOf(AxiosError);
    expect(getSuperToken()).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('a wrong password (401 on /login) does not fire the listener', async () => {
    const api = new SuperApi(adapterReplying(() => ({ status: 401, data: { error: 'Invalid password' } })));
    const onUnauthorized = vi.fn();
    api.onUnauthorized(onUnauthorized);
    await expect(api.login('nope')).rejects.toBeInstanceOf(AxiosError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('turns server errors into operator-readable text', async () => {
    const api = new SuperApi(adapterReplying(() => ({ status: 503, data: { error: 'super_not_configured' } })));
    await api.login('x').catch((e) => expect(superErrorText(e)).toMatch(/POS_SUPER_PASSWORD/));
    const api429 = new SuperApi(adapterReplying(() => ({ status: 429, data: {} })));
    await api429.login('x').catch((e) => expect(superErrorText(e)).toMatch(/Забагато спроб/));
  });

  it('lists leads with only the filters that are set, and patches status and note with the token', async () => {
    setSuperToken('t.0k');
    const seen: Array<{ method?: string; url?: string; params?: unknown; data?: unknown; header?: string }> = [];
    const api = new SuperApi(
      adapterReplying((c) => {
        seen.push({
          method: c.method,
          url: c.url,
          params: c.params,
          data: c.data ? JSON.parse(String(c.data)) : undefined,
          header: AxiosHeaders.from(c.headers).get('X-POS-Super-Token') as string | undefined,
        });
        return { status: 200, data: { items: [], total: 0, counts: {} } };
      })
    );
    await api.listLeads({ status: 'new', interest: '', q: 'Олена', offset: 0 });
    await api.patchLead(7, { status: 'demo', note: 'показати' });
    expect(seen[0]).toEqual({
      method: 'get',
      url: '/leads',
      params: { status: 'new', q: 'Олена', offset: 0 },
      data: undefined,
      header: 't.0k',
    });
    expect(seen[1]).toMatchObject({ method: 'patch', url: '/leads/7', data: { status: 'demo', note: 'показати' }, header: 't.0k' });
  });
});

