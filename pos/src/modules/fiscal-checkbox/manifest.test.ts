// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Same three-place contract `tiktok-live/manifest.test.ts` pins: the
// `module_remotes` key (`applyModuleRemotes` drops a descriptor whose `id`
// doesn't match), the icon allowlist, and the route shape.

import { describe, expect, it } from 'vitest';
import { isNavIconName } from '@pos/platform';
import { fiscalCheckboxModule, FISCAL_CHECKBOX_MODULE_ID } from './manifest';
import { manifest as remoteManifest } from './remote-entry';
import { CHECKBOX_SECRET_SPECS } from './secretSpecs';

describe('fiscal-checkbox manifest', () => {
  it('uses the id the store registers it under', () => {
    expect(FISCAL_CHECKBOX_MODULE_ID).toBe('fiscal-checkbox');
    expect(fiscalCheckboxModule.id).toBe('fiscal-checkbox');
    expect(remoteManifest.id).toBe('fiscal-checkbox');
  });

  it('the id starts with fiscal- — the prefix the backend guard and the client fallback both key on', () => {
    // src/pos/core/modules.ts's assertSingleFiscalRemote and registry.ts's
    // "keep the first fiscal-*" both filter on this prefix.
    expect(fiscalCheckboxModule.id).toMatch(/^fiscal-/);
  });

  it('is online-only: always enabled, never a toggleable module id', () => {
    expect(fiscalCheckboxModule.alwaysEnabled).toBe(true);
    expect(fiscalCheckboxModule.pending).toBeUndefined();
  });

  it('runs in both shells', () => {
    expect(fiscalCheckboxModule.shells).toEqual(['web', 'cashier']);
  });

  it('names icons the host actually ships', () => {
    for (const item of fiscalCheckboxModule.nav) {
      if (typeof item.icon === 'string') expect(isNavIconName(item.icon)).toBe(true);
    }
  });

  it('mounts /fiscal in the cashier shell and admin fiscal in the web admin', () => {
    const root = fiscalCheckboxModule.routes.find((r) => (r.mount ?? 'root') === 'root');
    const admin = fiscalCheckboxModule.routes.find((r) => r.mount === 'admin');
    expect(root?.path).toBe('/fiscal/*');
    expect(admin?.path).toBe('fiscal');
  });

  it('renders a different screen per mount', () => {
    const root = fiscalCheckboxModule.routes.find((r) => (r.mount ?? 'root') === 'root');
    const admin = fiscalCheckboxModule.routes.find((r) => r.mount === 'admin');
    expect(root?.element).toBeDefined();
    expect(admin?.element).toBeDefined();
    expect(admin?.element).not.toBe(root?.element);
  });

  // `ownerOnly` is MODULE-scoped: setting it would take the till's shift
  // screen away from every seller. The admin mount already carries the owner
  // gate on its own.
  it('is not owner-only as a whole — sellers open/close the shift', () => {
    expect(fiscalCheckboxModule.ownerOnly).toBeUndefined();
  });

  it('points every nav entry at a path the routes cover', () => {
    const targets = fiscalCheckboxModule.nav.map((n) => n.to);
    expect(targets).toContain('/fiscal');
    expect(targets).toContain('/admin/fiscal');
  });

  it('stamps the remote build version', () => {
    expect(remoteManifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('CHECKBOX_SECRET_SPECS', () => {
  // Pins the two fields the OpenAPI spec confirms Checkbox needs
  // (CashierSignInPinCode.pin_code + the X-License-Key header). When the real
  // adapter ships in phase 2b, its FiscalProvider.secretKeys must match this
  // list — this test is the tripwire if it drifts.
  it('declares exactly licenceKey and cashierPin, both required', () => {
    const keys = CHECKBOX_SECRET_SPECS.map((s) => s.key).sort();
    expect(keys).toEqual(['cashierPin', 'licenceKey']);
    expect(CHECKBOX_SECRET_SPECS.every((s) => s.required)).toBe(true);
  });

  it('never marks a credential field as plain text', () => {
    expect(CHECKBOX_SECRET_SPECS.every((s) => s.kind === 'password')).toBe(true);
  });
});
