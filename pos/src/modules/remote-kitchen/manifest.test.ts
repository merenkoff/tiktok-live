// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Invariants of «Віддалена кухня», which arrives over the wire and so is
// invisible to the registry tests. The other side of the line — the café
// vertical carrying none of it — is `vertical-cafe/manifest.test.ts`.

import { describe, expect, it } from 'vitest';
import { remoteKitchenModule } from './manifest';
import { REMOTE_KITCHEN_MODULE_ID, REQUIRED_HOST_API } from './lib/hostPlatform';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from '@host/modules/constants';
import { MODULES } from '@host/modules/registry';

describe('remote-kitchen manifest', () => {
  it('is its own online-only module, not a vertical and not a bundled one', () => {
    expect(remoteKitchenModule.id).toBe('remote-kitchen');
    expect(remoteKitchenModule.id).toBe(REMOTE_KITCHEN_MODULE_ID);
    expect(remoteKitchenModule.id.startsWith('vertical-')).toBe(false);
    expect(MODULES.some((m) => m.id === remoteKitchenModule.id)).toBe(false);
    expect([...CORE_MODULE_IDS, ...DEFAULT_ENABLED_MODULE_IDS]).not.toContain(remoteKitchenModule.id);
    expect(remoteKitchenModule.alwaysEnabled).toBe(true);
  });

  it('runs on every till the cafe and the kitchen sell from, and is not the owner’s alone', () => {
    expect(remoteKitchenModule.shells).toEqual(['web', 'cashier', 'tablet']);
    expect(remoteKitchenModule.ownerOnly).toBeUndefined();
  });

  it('fills the two host slots — the cafe’s «З кухні» and the kitchen’s strip — and owns no page', () => {
    expect(remoteKitchenModule.checkout?.Action).toBeDefined();
    expect(remoteKitchenModule.till?.Banner).toBeDefined();
    expect(remoteKitchenModule.routes).toEqual([]);
    expect(remoteKitchenModule.nav).toEqual([]);
  });

  it('keeps no offline queue: the kitchen cooks only on the server’s word', () => {
    expect(remoteKitchenModule.offline).toBeUndefined();
  });

  it('asks the host only for what every supported host already has', () => {
    expect([...REQUIRED_HOST_API]).toEqual(['api.posRequest', 'useCartStore']);
  });
});
