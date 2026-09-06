// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { Gift, Package } from 'lucide-react';
import { FALLBACK_NAV_ICON, NAV_ICONS, isNavIconName, resolveNavIcon } from './icons';
import { MODULES } from '../modules/registry';

describe('resolveNavIcon', () => {
  it('maps a known lucide name to its component', () => {
    expect(resolveNavIcon('Package')).toBe(Package);
    expect(resolveNavIcon('Gift')).toBe(Gift);
  });

  it('falls back for a name this build does not ship — never a blank nav entry', () => {
    expect(resolveNavIcon('NoSuchIconInThisBuild')).toBe(FALLBACK_NAV_ICON);
  });

  it('passes a component reference through untouched', () => {
    expect(resolveNavIcon(Package)).toBe(Package);
  });

  it('returns undefined for no icon (admin-sidebar entries are label-only)', () => {
    expect(resolveNavIcon(undefined)).toBeUndefined();
    expect(resolveNavIcon('')).toBeUndefined();
  });

  it('does not treat inherited Object keys as icon names', () => {
    expect(isNavIconName('toString')).toBe(false);
    expect(resolveNavIcon('constructor')).toBe(FALLBACK_NAV_ICON);
  });
});

describe('NAV_ICONS', () => {
  it('covers every icon the bundled manifests name', () => {
    const named = MODULES.flatMap((m) => m.nav)
      .map((n) => n.icon)
      .filter((icon): icon is string => typeof icon === 'string');

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !isNavIconName(name))).toEqual([]);
  });

  it('ships the placeholder fallback name used by registry.placeholderDescriptor', () => {
    expect(NAV_ICONS.CloudOff).toBeDefined();
  });
});
