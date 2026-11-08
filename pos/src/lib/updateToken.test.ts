// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The desktop asks its own server for the deployment's delivery token at the
// moment of the press (TechDocs/POS_LICENSING.md 2D-B). A missing token must
// never stop an update.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@pos/platform';
import { fetchUpdateToken } from './updateToken';

const TOKEN = 'v1.q83vEjRWeJq83vEjRWeJqwNd5g7O.AbCdEfGhIjKlMnOpQrStUv';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchUpdateToken', () => {
  it('asks the deployment’s own server and returns its token', async () => {
    const read = vi.spyOn(api, 'posRequest').mockResolvedValue({ token: TOKEN });
    expect(await fetchUpdateToken()).toBe(TOKEN);
    expect(read).toHaveBeenCalledWith('get', '/license/update-token');
  });

  it.each([
    ['a copy that holds none', { token: null }],
    ['an empty token', { token: '' }],
    ['a token that is not a string', { token: 42 }],
    ['an answer with no token field', {}],
    ['no answer body', undefined],
  ])('is null for %s', async (_label, answer) => {
    vi.spyOn(api, 'posRequest').mockResolvedValue(answer);
    expect(await fetchUpdateToken()).toBeNull();
  });

  it('is null — not a throw — when the server cannot be asked (offline, an older server)', async () => {
    vi.spyOn(api, 'posRequest').mockRejectedValue(new Error('Network Error'));
    expect(await fetchUpdateToken()).toBeNull();
  });
});
