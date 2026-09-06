// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it, vi } from 'vitest';
import { allModules, applyModuleRemotes, injectModuleStyle, MODULES, remoteModules } from './registry';
import { getAppliedRemotes, sameRemoteMap } from './appliedRemotes';
import { selectNavItems } from './selectNav';
import { moduleVisible, type RouteContext } from './renderRoutes';
import { onModuleEvent, type ModuleEvent } from './telemetry';

/**
 * `applyModuleRemotes` swaps a bundled module descriptor for one fetched at boot
 * from `VITE_MODULE_REMOTES` (build override) or the per-store `module_remotes`
 * off the cached `pos_auth` (roadmap #9). It must never leave `MODULES` broken —
 * offline, a 404, or a malformed remote should fall back to the bundled
 * descriptor, since this runs before the first render on every boot.
 */
describe('applyModuleRemotes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('is a no-op when VITE_MODULE_REMOTES is unset', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    const before = [...MODULES];
    await applyModuleRemotes();
    expect(MODULES).toEqual(before);
  });

  it('falls back to the bundled descriptor when the remote fetch fails (verify skipped)', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    expect(returnsBefore).toBeDefined();

    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));
    vi.stubEnv('VITE_MODULE_REMOTES', 'returns@http://localhost:1/does-not-exist.js');
    vi.stubEnv('VITE_MODULE_REMOTES_INSECURE', '1');
    await applyModuleRemotes();
    off();

    const returnsAfter = MODULES.find((m) => m.id === 'returns');
    expect(returnsAfter).toBe(returnsBefore);
    expect(events.map((e) => e.type)).toEqual([
      'remote_load_error',
      'remote_load_fallback',
      'session_manifest',
    ]);
  });

  it('falls back with remote_verify_error when the signed manifest is missing', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));
    vi.stubEnv('VITE_MODULE_REMOTES', 'returns@https://cdn.example.test/returns/remote-entry.js');
    // No fetch stub → manifest.json fetch rejects → verify fails before import().
    await applyModuleRemotes();
    off();

    expect(MODULES.find((m) => m.id === 'returns')).toBe(returnsBefore);
    expect(events.map((e) => e.type)).toEqual([
      'remote_verify_error',
      'remote_load_fallback',
      'session_manifest',
    ]);
  });

  it('ignores a malformed entry (no "@")', async () => {
    const before = [...MODULES];
    vi.stubEnv('VITE_MODULE_REMOTES', 'not-a-valid-entry');
    await applyModuleRemotes();
    expect(MODULES).toEqual(before);
  });

  it('reads the per-store module_remotes off the cached pos_auth when no env', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    localStorage.setItem(
      'pos_auth',
      JSON.stringify({
        store: { module_remotes: { returns: 'http://localhost:1/does-not-exist.js' } },
      })
    );
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));
    const returnsBefore = MODULES.find((m) => m.id === 'returns');

    await applyModuleRemotes();
    off();

    // Down remote → verify fails → falls back, but the attempt is still recorded.
    expect(MODULES.find((m) => m.id === 'returns')).toBe(returnsBefore);
    expect(getAppliedRemotes().get('returns')).toEqual({
      url: 'http://localhost:1/does-not-exist.js',
    });
    expect(events.map((e) => e.type)).toEqual([
      'remote_verify_error',
      'remote_load_fallback',
      'session_manifest',
    ]);
  });

  it('ignores a cached module_remotes entry with a disallowed URL', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    localStorage.setItem(
      'pos_auth',
      JSON.stringify({ store: { module_remotes: { returns: 'http://evil.com/x.js' } } })
    );
    const before = [...MODULES];
    await applyModuleRemotes();
    expect(MODULES).toEqual(before);
    expect(getAppliedRemotes().size).toBe(0);
  });

  it('emits a session_manifest with a version + source for every module', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));
    await applyModuleRemotes();
    off();

    const manifest = events.find((e) => e.type === 'session_manifest');
    expect(manifest).toBeDefined();
    if (manifest?.type !== 'session_manifest') throw new Error('unreachable');

    expect(manifest.modules).toHaveLength(MODULES.length);
    for (const m of manifest.modules) {
      expect(m.version).toBeTruthy();
      expect(m.source).toBe('bundled');
      expect(m.url).toBeUndefined();
    }
    expect(typeof manifest.appVersion).toBe('string');
    expect(typeof manifest.apiClientVersion).toBe('number');
  });
});

/**
 * Desktop cashier seam (roadmap #13 Part B): when `applyModuleRemotes` is given
 * a `syncRemote`, each remote is resolved through the Rust download/verify/cache
 * (`liveshopmodule://`) instead of the web CDN verify+`import()` path.
 */
describe('applyModuleRemotes — desktop syncRemote seam', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  const STORE_URL = 'https://cdn.example.test/returns/remote-entry.js';

  it('skips the module this boot when syncRemote returns null (offline, nothing cached)', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    vi.stubEnv('VITE_MODULE_REMOTES', `returns@${STORE_URL}`);
    const syncRemote = vi.fn().mockResolvedValue(null);
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));

    await applyModuleRemotes({ syncRemote });
    off();

    expect(syncRemote).toHaveBeenCalledWith('returns', STORE_URL);
    expect(MODULES.find((m) => m.id === 'returns')).toBe(returnsBefore);
    expect(events.map((e) => e.type)).toEqual(['remote_load_fallback', 'session_manifest']);
    // Intent is still recorded so the roadmap #9 reload-banner check stays right.
    expect(getAppliedRemotes().get('returns')).toEqual({ url: STORE_URL });
  });

  it('imports the cache URL from syncRemote and skips the web verify path', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    vi.stubEnv('VITE_MODULE_REMOTES', `returns@${STORE_URL}`);
    const syncRemote = vi.fn().mockResolvedValue({
      importUrl: 'liveshopmodule://localhost/returns/remote-entry.js',
    });
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));

    await applyModuleRemotes({ syncRemote });
    off();

    // The cache import rejects under jsdom → a load error, NOT a verify error
    // (no `remote_verify_error` — `verifyRemoteEntry` was never called).
    expect(MODULES.find((m) => m.id === 'returns')).toBe(returnsBefore);
    expect(events.map((e) => e.type)).toEqual([
      'remote_load_error',
      'remote_load_fallback',
      'session_manifest',
    ]);
  });

  it('falls back with remote_verify_error when syncRemote itself throws', async () => {
    const returnsBefore = MODULES.find((m) => m.id === 'returns');
    vi.stubEnv('VITE_MODULE_REMOTES', `returns@${STORE_URL}`);
    const syncRemote = vi.fn().mockRejectedValue(new Error('rust: bad signature'));
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));

    await applyModuleRemotes({ syncRemote });
    off();

    expect(MODULES.find((m) => m.id === 'returns')).toBe(returnsBefore);
    expect(events.map((e) => e.type)).toEqual([
      'remote_verify_error',
      'remote_load_fallback',
      'session_manifest',
    ]);
  });
});

/**
 * Roadmap #13 Part C: an object entry in `store.module_remotes` declares a NEW
 * online-only module (arbitrary id, self-describing). When the desktop can't
 * download it, `applyModuleRemotes` still puts a greyed placeholder in
 * `remoteModules` so it shows in the nav + gets an "unavailable" screen.
 */
describe('applyModuleRemotes — online-only module placeholder', () => {
  const ENTRY = {
    url: 'https://cdn.example.test/loyalty/remote-entry.js',
    title: 'Бонуси',
    routePath: '/loyalty',
    nav: [{ label: 'Бонуси', location: 'cashier-primary', order: 80 }],
  };

  function cacheAuth(entry: unknown = ENTRY) {
    localStorage.setItem(
      'pos_auth',
      JSON.stringify({ store: { module_remotes: { loyalty: entry }, enabled_modules: [] } })
    );
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    remoteModules.length = 0;
  });

  it('renders a pending placeholder when syncRemote returns null', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth();
    const syncRemote = vi.fn().mockResolvedValue(null);
    const events: ModuleEvent[] = [];
    const off = onModuleEvent((e) => events.push(e));

    await applyModuleRemotes({ syncRemote });
    off();

    const placeholder = remoteModules.find((m) => m.id === 'loyalty');
    expect(placeholder).toMatchObject({ id: 'loyalty', title: 'Бонуси', pending: true });
    expect(allModules().some((m) => m.id === 'loyalty')).toBe(true);

    const ctx = { shell: 'cashier', role: 'seller', variant: 'rail' } as const;
    const navItems = selectNavItems(allModules(), new Set(), ctx, 'cashier-primary');
    const loyaltyNav = navItems.find((n) => n.label === 'Бонуси');
    expect(loyaltyNav).toMatchObject({ to: '/loyalty', indicator: 'pending' });

    expect(events.some((e) => e.type === 'remote_load_fallback' && e.reason === 'not downloaded')).toBe(
      true
    );
  });

  it('is visible though its id is not in enabled_modules', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth();
    await applyModuleRemotes({ syncRemote: vi.fn().mockResolvedValue(null) });

    const routeCtx: RouteContext = {
      shell: 'cashier',
      role: 'seller',
      enabled: new Set(),
      isAuthenticated: true,
    };
    const placeholder = allModules().find((m) => m.id === 'loyalty')!;
    expect(moduleVisible(placeholder, routeCtx)).toBe(true);
  });

  it('keeps the placeholder when syncRemote resolves but the import fails', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth();
    const syncRemote = vi.fn().mockResolvedValue({
      importUrl: 'liveshopmodule://localhost/loyalty/remote-entry.js',
    });

    await applyModuleRemotes({ syncRemote });

    expect(remoteModules.find((m) => m.id === 'loyalty')).toMatchObject({ pending: true });
  });

  it('keeps the module\u2019s own icon on the placeholder, per nav entry (roadmap #13 Part D)', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth({
      ...ENTRY,
      icon: 'Gift',
      nav: [
        { label: '\u0411\u043e\u043d\u0443\u0441\u0438', location: 'cashier-primary', order: 80 },
        { label: '\u041a\u0430\u0440\u0442\u043a\u0438', location: 'cashier-primary', order: 81, icon: 'CreditCard' },
      ],
    });
    await applyModuleRemotes({ syncRemote: vi.fn().mockResolvedValue(null) });

    const nav = remoteModules.find((m) => m.id === 'loyalty')!.nav;
    // No per-entry icon -> the module-level default; per-entry icon wins.
    expect(nav.map((n) => n.icon)).toEqual(['Gift', 'CreditCard']);
  });

  it('falls back to CloudOff only when the module names no icon at all', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth();
    await applyModuleRemotes({ syncRemote: vi.fn().mockResolvedValue(null) });

    expect(remoteModules.find((m) => m.id === 'loyalty')!.nav[0].icon).toBe('CloudOff');
  });

  it('does NOT synthesize a placeholder on the web (no syncRemote)', async () => {
    vi.stubEnv('VITE_MODULE_REMOTES', undefined);
    cacheAuth();
    await applyModuleRemotes();
    expect(remoteModules.find((m) => m.id === 'loyalty')).toBeUndefined();
  });

  it('sameRemoteMap ignores a presentation-only change to an object entry', () => {
    const before = new Map([['loyalty', { url: ENTRY.url }]]);
    const serverMap = {
      loyalty: { ...ENTRY, title: 'Бонусна програма', nav: [{ ...ENTRY.nav[0], order: 5 }] },
    };
    expect(sameRemoteMap(serverMap, before)).toBe(true);
  });
});

describe('injectModuleStyle', () => {
  afterEach(() => {
    document.head.querySelectorAll('style[data-module-remote]').forEach((el) => el.remove());
  });

  it('appends one <style data-module-remote> with the verified CSS', () => {
    injectModuleStyle('stock', '.text-\\[\\#006AFF\\]{color:#006aff}');
    const els = document.head.querySelectorAll('style[data-module-remote="stock"]');
    expect(els).toHaveLength(1);
    expect(els[0].textContent).toContain('#006aff');
  });

  it('is a no-op on a second call for the same module', () => {
    injectModuleStyle('stock', '.a{color:red}');
    injectModuleStyle('stock', '.a{color:blue}');
    expect(document.head.querySelectorAll('style[data-module-remote="stock"]')).toHaveLength(1);
  });

  it('does nothing when css is undefined', () => {
    injectModuleStyle('returns', undefined);
    expect(document.head.querySelector('style[data-module-remote="returns"]')).toBeNull();
  });
});
