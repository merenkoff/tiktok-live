// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  CORE_MODULE_IDS,
  DEFAULT_ENABLED_MODULES,
  TOGGLEABLE_MODULE_IDS,
  effectiveEnabledModules,
  isAllowedRemoteUrl,
  isCoreModuleId,
  isKnownToggleableModuleId,
  isModuleEnabled,
  sanitizeEnabledModules,
  sanitizeModuleRemotes,
} from '../pos/core/modules.js';

describe('POS module id sets', () => {
  it('keeps core ids out of the toggleable set', () => {
    for (const id of CORE_MODULE_IDS) {
      expect(TOGGLEABLE_MODULE_IDS).not.toContain(id);
    }
  });

  it('treats every default as toggleable', () => {
    for (const id of DEFAULT_ENABLED_MODULES) {
      expect(isKnownToggleableModuleId(id)).toBe(true);
    }
  });

  it('classifies ids', () => {
    expect(isCoreModuleId('settings')).toBe(true);
    expect(isCoreModuleId('returns')).toBe(false);
    expect(isKnownToggleableModuleId('live-selling')).toBe(true);
    expect(isKnownToggleableModuleId('settings')).toBe(false);
    expect(isKnownToggleableModuleId('nope')).toBe(false);
  });
});

describe('effectiveEnabledModules', () => {
  it('gives a never-configured store the defaults', () => {
    expect(effectiveEnabledModules(null)).toEqual([...DEFAULT_ENABLED_MODULES]);
    expect(effectiveEnabledModules(undefined)).toEqual([...DEFAULT_ENABLED_MODULES]);
    expect(effectiveEnabledModules([])).toEqual([...DEFAULT_ENABLED_MODULES]);
  });

  it('passes a configured set through untouched', () => {
    expect(effectiveEnabledModules(['returns'])).toEqual(['returns']);
  });

  it('returns a fresh array so callers cannot mutate the defaults', () => {
    const first = effectiveEnabledModules(null);
    first.push('mutated');
    expect(effectiveEnabledModules(null)).toEqual([...DEFAULT_ENABLED_MODULES]);
  });
});

describe('isModuleEnabled', () => {
  it('always allows core modules, whatever the store stored', () => {
    expect(isModuleEnabled([], 'settings')).toBe(true);
    expect(isModuleEnabled(['returns'], 'catalog-checkout')).toBe(true);
    expect(isModuleEnabled(null, 'hardware')).toBe(true);
  });

  it('follows the stored set for toggleable modules', () => {
    expect(isModuleEnabled(['returns'], 'returns')).toBe(true);
    expect(isModuleEnabled(['returns'], 'stock')).toBe(false);
  });

  it('falls back to the defaults for a never-configured store', () => {
    expect(isModuleEnabled(null, 'stock')).toBe(true);
    expect(isModuleEnabled(null, 'live-selling')).toBe(false);
  });

  it('refuses an unknown id', () => {
    expect(isModuleEnabled(null, 'nope')).toBe(false);
  });
});

describe('sanitizeEnabledModules', () => {
  it('rejects anything that is not an array', () => {
    expect(sanitizeEnabledModules(null)).toEqual([]);
    expect(sanitizeEnabledModules('returns')).toEqual([]);
    expect(sanitizeEnabledModules({ returns: true })).toEqual([]);
  });

  it('keeps only known toggleable ids', () => {
    expect(sanitizeEnabledModules(['returns', 'nope', 'stock'])).toEqual(['returns', 'stock']);
  });

  it('never persists a core id', () => {
    expect(sanitizeEnabledModules(['settings', 'hardware', 'catalog-checkout'])).toEqual([]);
  });

  it('trims and de-duplicates', () => {
    expect(sanitizeEnabledModules([' returns ', 'returns'])).toEqual(['returns']);
  });

  it('ignores non-string entries', () => {
    expect(sanitizeEnabledModules([1, null, undefined, {}, 'stock'])).toEqual(['stock']);
  });

  it('accepts the full default set unchanged', () => {
    expect(sanitizeEnabledModules([...DEFAULT_ENABLED_MODULES])).toEqual([
      ...DEFAULT_ENABLED_MODULES,
    ]);
  });
});

describe('isAllowedRemoteUrl', () => {
  it('accepts https, root-relative, and localhost/127.0.0.1 http', () => {
    expect(isAllowedRemoteUrl('https://cdn.example.com/stock/remote-entry.js')).toBe(true);
    expect(isAllowedRemoteUrl('/remotes/stock/remote-entry.js')).toBe(true);
    expect(isAllowedRemoteUrl('http://localhost:5002/remote-entry.js')).toBe(true);
    expect(isAllowedRemoteUrl('http://127.0.0.1:5002/remote-entry.js')).toBe(true);
  });

  it('rejects plain http, protocol-relative, other schemes, and non-strings', () => {
    expect(isAllowedRemoteUrl('http://evil.com/x.js')).toBe(false);
    expect(isAllowedRemoteUrl('//evil.com/x.js')).toBe(false);
    expect(isAllowedRemoteUrl('data:text/javascript,alert(1)')).toBe(false);
    expect(isAllowedRemoteUrl('ftp://host/x.js')).toBe(false);
    expect(isAllowedRemoteUrl('')).toBe(false);
    expect(isAllowedRemoteUrl(42)).toBe(false);
    expect(isAllowedRemoteUrl(null)).toBe(false);
  });
});

describe('sanitizeModuleRemotes', () => {
  it('keeps known non-core ids with allowed URLs', () => {
    expect(
      sanitizeModuleRemotes({
        stock: 'https://cdn.example.com/stock.js',
        products: 'http://localhost:5003/remote-entry.js',
      })
    ).toEqual({
      stock: 'https://cdn.example.com/stock.js',
      products: 'http://localhost:5003/remote-entry.js',
    });
  });

  it('drops unknown ids, core ids, bad URLs, and non-string values', () => {
    expect(
      sanitizeModuleRemotes({
        stock: 'http://evil.com/x.js',
        settings: 'https://ok.example.com/x.js',
        nope: 'https://ok.example.com/x.js',
        products: 123,
      })
    ).toEqual({});
  });

  it('trims URL whitespace', () => {
    expect(sanitizeModuleRemotes({ stock: '  https://cdn.example.com/s.js  ' })).toEqual({
      stock: 'https://cdn.example.com/s.js',
    });
  });

  it('returns {} for non-object input', () => {
    expect(sanitizeModuleRemotes(null)).toEqual({});
    expect(sanitizeModuleRemotes(['stock@https://x'])).toEqual({});
    expect(sanitizeModuleRemotes('stock')).toEqual({});
  });
});
