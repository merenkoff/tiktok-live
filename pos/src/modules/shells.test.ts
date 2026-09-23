// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { runsInShell } from './shells';

describe('runsInShell', () => {
  it('reads an explicit shell list as declared', () => {
    expect(runsInShell({ shells: ['web'] }, 'web')).toBe(true);
    expect(runsInShell({ shells: ['web'] }, 'cashier')).toBe(false);
    expect(runsInShell({ shells: ['cashier'] }, 'tablet')).toBe(false);
    expect(runsInShell({ shells: ['web', 'cashier', 'tablet'] }, 'tablet')).toBe(true);
  });

  it('lets a bundle published before the tablet existed onto the tablet', () => {
    // A CDN bundle carries `['web', 'cashier']` baked in until it is rebuilt.
    expect(runsInShell({ shells: ['web', 'cashier'] }, 'tablet')).toBe(true);
  });

  it('keeps admin-only and till-only modules off the tablet', () => {
    expect(runsInShell({ shells: ['web'] }, 'tablet')).toBe(false);
    expect(runsInShell({ shells: ['cashier'] }, 'tablet')).toBe(false);
  });

  it('never widens the older shells', () => {
    expect(runsInShell({ shells: ['web', 'tablet'] }, 'cashier')).toBe(false);
    expect(runsInShell({ shells: ['cashier', 'tablet'] }, 'web')).toBe(false);
  });
});
