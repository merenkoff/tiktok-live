// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  CORE_MODULE_IDS as BACKEND_CORE,
  DEFAULT_ENABLED_MODULES as BACKEND_DEFAULTS,
  TOGGLEABLE_MODULE_IDS as BACKEND_TOGGLEABLE,
} from '../../../src/pos/core/modules';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS, isCoreModule } from './constants';
import type { ModuleId } from './types';

describe('module id sets', () => {
  it('pins the core set', () => {
    expect([...CORE_MODULE_IDS]).toEqual(['catalog-checkout', 'settings', 'hardware']);
  });

  it('pins the default-on set', () => {
    expect([...DEFAULT_ENABLED_MODULE_IDS]).toEqual([
      'returns',
      'customers',
      'products',
      'stock',
      'analytics',
      'staff',
      'gtin-enrichment',
      'qr-payment',
    ]);
  });

  it('never lists a core module as toggleable', () => {
    for (const id of DEFAULT_ENABLED_MODULE_IDS) {
      expect(CORE_MODULE_IDS).not.toContain(id);
    }
  });
});

describe('isCoreModule', () => {
  it('is true for core ids only', () => {
    expect(isCoreModule('catalog-checkout')).toBe(true);
    expect(isCoreModule('settings')).toBe(true);
    expect(isCoreModule('hardware')).toBe(true);
    expect(isCoreModule('returns')).toBe(false);
    expect(isCoreModule('live-selling')).toBe(false);
  });
});

/**
 * The backend gates its route groups off its own copy of these lists. If the two
 * drift, a store can enable a module whose API is closed (or vice versa) — so
 * assert them against each other rather than trusting the "keep in sync" comment.
 */
describe('parity with the backend registry', () => {
  it('agrees on the core set', () => {
    expect([...BACKEND_CORE]).toEqual([...CORE_MODULE_IDS]);
  });

  it('agrees on the default-on set', () => {
    expect([...BACKEND_DEFAULTS]).toEqual([...DEFAULT_ENABLED_MODULE_IDS]);
  });

  it('knows every toggleable id the backend accepts', () => {
    const frontendIds: ModuleId[] = [
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
    for (const id of BACKEND_TOGGLEABLE) {
      expect(frontendIds).toContain(id);
    }
  });
});
