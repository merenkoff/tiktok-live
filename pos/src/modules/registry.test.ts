// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';
import { MODULES } from './registry';
import type { ModuleId, NavLocation } from './types';

const ids = MODULES.map((m) => m.id);

/**
 * The registry is declarative data that drives routing, nav and the Settings
 * checklist, so its invariants are the cheapest bugs to catch: a duplicated id
 * or a clashing path silently shadows a whole screen.
 */
describe('MODULES', () => {
  it('declares every module exactly once', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks exactly the core modules as core', () => {
    const core = MODULES.filter((m) => m.core).map((m) => m.id);
    expect(core.sort()).toEqual([...CORE_MODULE_IDS].sort());
  });

  it('marks exactly the default-on modules as defaultEnabled', () => {
    const defaults = MODULES.filter((m) => m.defaultEnabled).map((m) => m.id);
    expect(defaults.sort()).toEqual([...DEFAULT_ENABLED_MODULE_IDS].sort());
  });

  it('never marks a module both core and defaultEnabled', () => {
    for (const m of MODULES) {
      expect(m.core && m.defaultEnabled).toBeFalsy();
    }
  });

  it('runs in at least one shell', () => {
    for (const m of MODULES) {
      expect(m.shells.length).toBeGreaterThan(0);
    }
  });

  it('only pins coreInShell to a shell the module actually runs in', () => {
    for (const m of MODULES) {
      if (m.coreInShell) expect(m.shells).toContain(m.coreInShell);
    }
  });

  it('depends only on modules that exist, and never on itself', () => {
    for (const m of MODULES) {
      for (const dep of m.requires ?? []) {
        expect(dep).not.toBe(m.id);
        expect(ids).toContain(dep);
      }
    }
  });
});

describe('MODULES routes', () => {
  it('gives every admin route either an index flag or a path, never both', () => {
    for (const m of MODULES) {
      for (const r of m.routes.filter((x) => x.mount === 'admin')) {
        expect(Boolean(r.index) !== Boolean(r.path)).toBe(true);
      }
    }
  });

  it('anchors every root route at an absolute path', () => {
    for (const m of MODULES) {
      for (const r of m.routes.filter((x) => (x.mount ?? 'root') === 'root')) {
        expect(r.path).toBeDefined();
        expect(r.path?.startsWith('/')).toBe(true);
      }
    }
  });

  it('keeps admin child paths relative to the /admin mount', () => {
    for (const m of MODULES) {
      for (const r of m.routes.filter((x) => x.mount === 'admin' && x.path)) {
        expect(r.path?.startsWith('/')).toBe(false);
      }
    }
  });

  it('claims each path only once per mount', () => {
    const seen = new Set<string>();
    for (const m of MODULES) {
      for (const r of m.routes) {
        if (!r.path) continue;
        const key = `${r.mount ?? 'root'}:${r.path}`;
        expect(seen.has(key), `duplicate route ${key} (${m.id})`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('declares at most one /admin index route', () => {
    const indexes = MODULES.flatMap((m) => m.routes.filter((r) => r.index).map(() => m.id));
    expect(indexes.length).toBeLessThanOrEqual(1);
  });
});

describe('MODULES nav', () => {
  const locations: NavLocation[] = ['admin-sidebar', 'cashier-primary'];

  it('uses only known nav locations', () => {
    for (const m of MODULES) {
      for (const n of m.nav) expect(locations).toContain(n.location);
    }
  });

  it('gives every nav entry a target and a label', () => {
    for (const m of MODULES) {
      for (const n of m.nav) {
        expect(n.to.startsWith('/')).toBe(true);
        expect(n.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('only reuses an order key between mutually-exclusive entries', () => {
    // `returns` deliberately parks two entries on the same slot — the admin one
    // and the till one, each behind a `visible()` guard. Anything sharing an
    // order without such a guard would render two links in the same position.
    for (const m of MODULES) {
      for (const location of locations) {
        const entries = m.nav.filter((n) => n.location === location);
        const byOrder = new Map<number, typeof entries>();
        for (const n of entries) byOrder.set(n.order, [...(byOrder.get(n.order) ?? []), n]);
        for (const [order, sharing] of byOrder) {
          if (sharing.length === 1) continue;
          for (const n of sharing) {
            expect(n.visible, `${m.id} / ${location} / order ${order}`).toBeDefined();
          }
        }
      }
    }
  });

  it('only offers nav for a shell the module runs in', () => {
    for (const m of MODULES) {
      if (m.nav.some((n) => n.location === 'admin-sidebar')) {
        expect(m.shells).toContain('web');
      }
    }
  });

  it('covers every module id declared in the union', () => {
    const union: ModuleId[] = [
      'catalog-checkout',
      'returns',
      'customers',
      'products',
      'stock',
      'analytics',
      'staff',
      'settings',
      'gtin-enrichment',
      'qr-payment',
      'hardware',
      'live-selling',
    ];
    expect([...ids].sort()).toEqual([...union].sort());
  });
});
