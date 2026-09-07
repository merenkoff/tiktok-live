// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The manifest is a contract with three other places, and getting any of them
// wrong fails silently at runtime: the `module_remotes` key in the store
// settings (`applyModuleRemotes` drops a descriptor whose `id` doesn't match),
// the host's icon allowlist (an unknown name renders the generic `Puzzle`), and
// `placeholderDescriptor`'s route shape (the URL must be the same before and
// after the module is downloaded).

import { describe, expect, it } from 'vitest';
import { isNavIconName } from '@pos/platform';
import { tiktokLiveModule, TIKTOK_LIVE_MODULE_ID } from './manifest';
import { manifest as remoteManifest } from './remote-entry';

describe('tiktok-live manifest', () => {
  it('uses the id the store registers it under', () => {
    expect(TIKTOK_LIVE_MODULE_ID).toBe('tiktok-live');
    expect(tiktokLiveModule.id).toBe('tiktok-live');
    expect(remoteManifest.id).toBe('tiktok-live');
  });

  it('is online-only: always enabled, never a toggleable module id', () => {
    // Being in `module_remotes` IS the opt-in — there is no Settings checkbox
    // and no `enabled_modules` entry to match.
    expect(tiktokLiveModule.alwaysEnabled).toBe(true);
    expect(tiktokLiveModule.pending).toBeUndefined();
  });

  it('runs in both shells', () => {
    expect(tiktokLiveModule.shells).toEqual(['web', 'cashier']);
  });

  it('names icons the host actually ships', () => {
    for (const item of tiktokLiveModule.nav) {
      if (typeof item.icon === 'string') expect(isNavIconName(item.icon)).toBe(true);
    }
  });

  it('mounts /live in the cashier shell and /admin/live in the web admin', () => {
    const root = tiktokLiveModule.routes.find((r) => (r.mount ?? 'root') === 'root');
    const admin = tiktokLiveModule.routes.find((r) => r.mount === 'admin');
    // Splat: same URL as the `pending` placeholder renders before download.
    expect(root?.path).toBe('/live/*');
    expect(admin?.path).toBe('live');
  });

  it('points every nav entry at a path the routes cover', () => {
    const targets = tiktokLiveModule.nav.map((n) => n.to);
    expect(targets).toContain('/live');
    expect(targets).toContain('/admin/live');
  });

  it('stamps the remote build version', () => {
    expect(remoteManifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
