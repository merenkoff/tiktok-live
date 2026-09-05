// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyModuleRemotes, MODULES } from './registry';

/**
 * `applyModuleRemotes` (Task B PoC) swaps a bundled module descriptor for one
 * fetched at boot from `VITE_MODULE_REMOTES`. It must never leave `MODULES`
 * broken — offline, a 404, or a malformed remote should fall back to the
 * bundled descriptor, since this runs before the first render on every boot.
 */
describe('applyModuleRemotes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is a no-op when VITE_MODULE_REMOTES is unset', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    const before = [...MODULES];
    await applyModuleRemotes();
    expect(MODULES).toEqual(before);
  });

  it('falls back to the bundled descriptor when the remote fetch fails', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    expect(returnsBefore).toBeDefined();

    vi.stubEnv('VITE_MODULE_REMOTES', 'returns@http://localhost:1/does-not-exist.js');
    await applyModuleRemotes();

    const returnsAfter = MODULES.find((m) => m.id === 'returns');
    expect(returnsAfter).toBe(returnsBefore);
  });

  it('ignores a malformed entry (no "@")', async () => {
    const before = [...MODULES];
    vi.stubEnv('VITE_MODULE_REMOTES', 'not-a-valid-entry');
    await applyModuleRemotes();
    expect(MODULES).toEqual(before);
  });
});
