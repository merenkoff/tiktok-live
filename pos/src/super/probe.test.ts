// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Перевірити джерело» in the super admin (TechDocs/POS_SUPER_ADMIN.md): the
// manifest is read from the address a till of this copy gets — a private
// module's bare URL answers 403 behind the delivery gate — and its signature is
// still checked in the browser.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteVerifyError } from '../modules/remoteVerify';

const inspect = vi.fn();
vi.mock('../modules/remoteVerify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/remoteVerify')>();
  return { ...actual, inspectRemoteManifest: (url: string) => inspect(url) };
});

const { probeRemoteUrl } = await import('./probe');

const BARE = 'https://the-live.shop/api/modules/fiscal-checkbox/2.9.4/remote-entry.js';
const WITH_TOKEN = 'https://the-live.shop/api/modules/t/v1.abc.def/fiscal-checkbox/2.9.4/remote-entry.js';
const INFO = { moduleId: 'fiscal-checkbox', version: '2.9.4', minHostPlatform: 24, keyId: 'k', builtAt: '' };

beforeEach(() => {
  inspect.mockReset();
});

describe('probeRemoteUrl', () => {
  it('reads the manifest from the address a till gets, and reports what the signed manifest says', async () => {
    inspect.mockResolvedValue(INFO);
    const resolve = vi.fn().mockResolvedValue(WITH_TOKEN);
    const res = await probeRemoteUrl(BARE, 'fiscal-checkbox', resolve);
    expect(resolve).toHaveBeenCalledWith(BARE);
    expect(inspect).toHaveBeenCalledWith(WITH_TOKEN);
    expect(res).toEqual({ state: 'ok', info: INFO });
  });

  it('checks the bare URL when the server cannot say where a till reads from', async () => {
    inspect.mockResolvedValue(INFO);
    const res = await probeRemoteUrl(BARE, 'fiscal-checkbox', () => Promise.reject(new Error('Network Error')));
    expect(inspect).toHaveBeenCalledWith(BARE);
    expect(res.state).toBe('ok');
  });

  it('still refuses a build that describes another module', async () => {
    inspect.mockResolvedValue({ ...INFO, moduleId: 'tables' });
    const res = await probeRemoteUrl(BARE, 'fiscal-checkbox', async () => WITH_TOKEN);
    expect(res).toEqual({ state: 'error', message: 'Джерело описує модуль «tables», а запис — «fiscal-checkbox».' });
  });

  it('says in words that a closed module needs this copy\'s delivery token', async () => {
    inspect.mockRejectedValue(new RemoteVerifyError('manifest HTTP 403'));
    const res = await probeRemoteUrl(BARE, 'fiscal-checkbox', async (u) => u);
    expect(res.state).toBe('error');
    if (res.state === 'error') {
      expect(res.message).toContain('модуль закритий');
      expect(res.message).toContain('manifest HTTP 403');
    }
  });

  it('passes every other refusal through as the loader words it', async () => {
    const error = new RemoteVerifyError('bad signature');
    inspect.mockRejectedValue(error);
    const res = await probeRemoteUrl(BARE, 'fiscal-checkbox', async () => WITH_TOKEN);
    expect(res).toEqual({ state: 'error', message: error.message });
  });

  it('asks the server nothing for a URL it would not load', async () => {
    const resolve = vi.fn();
    const res = await probeRemoteUrl('ftp://example.com/remote-entry.js', null, resolve);
    expect(res.state).toBe('error');
    expect(resolve).not.toHaveBeenCalled();
    expect(inspect).not.toHaveBeenCalled();
  });
});
