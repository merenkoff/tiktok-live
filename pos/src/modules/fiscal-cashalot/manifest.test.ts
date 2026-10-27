// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The same contract `fiscal-checkbox/manifest.test.ts` pins: the
// `module_remotes` key, the icon allowlist, the route shape — and the three
// credential keys the adapter's own test pins on the backend.

import { describe, expect, it } from 'vitest';
import { isNavIconName } from '@pos/platform';
import { fiscalCashalotModule, FISCAL_CASHALOT_MODULE_ID } from './manifest';
import { manifest as remoteManifest } from './remote-entry';
import { CASHALOT_SECRET_SPECS } from './secretSpecs';

describe('fiscal-cashalot manifest', () => {
  it('uses the id the store registers it under', () => {
    expect(FISCAL_CASHALOT_MODULE_ID).toBe('fiscal-cashalot');
    expect(fiscalCashalotModule.id).toBe('fiscal-cashalot');
    expect(remoteManifest.id).toBe('fiscal-cashalot');
  });

  it('the id is fiscal-<provider id> — what the backend guard compares with the configured provider', () => {
    // src/pos/core/modules.ts `assertSingleFiscalRemote` strips `fiscal-` and
    // refuses the entry unless the rest equals `pos_fiscal_settings.provider`.
    expect(fiscalCashalotModule.id).toBe('fiscal-cashalot');
  });

  it('is online-only: always enabled, never a toggleable module id', () => {
    expect(fiscalCashalotModule.alwaysEnabled).toBe(true);
    expect(fiscalCashalotModule.pending).toBeUndefined();
  });

  it('runs in every shell', () => {
    expect(fiscalCashalotModule.shells).toEqual(['web', 'cashier', 'tablet']);
  });

  it('names icons the host actually ships', () => {
    for (const item of fiscalCashalotModule.nav) {
      if (typeof item.icon === 'string') expect(isNavIconName(item.icon)).toBe(true);
    }
  });

  it('mounts the same two paths as the Checkbox bundle — the host nav expects them', () => {
    const root = fiscalCashalotModule.routes.find((r) => (r.mount ?? 'root') === 'root');
    const admin = fiscalCashalotModule.routes.find((r) => r.mount === 'admin');
    expect(root?.path).toBe('/fiscal/*');
    expect(admin?.path).toBe('fiscal');
    expect(admin?.element).not.toBe(root?.element);
    expect(fiscalCashalotModule.nav.map((n) => n.to)).toEqual(['/fiscal', '/admin/fiscal']);
  });

  it('is not owner-only as a whole — sellers open/close the shift', () => {
    expect(fiscalCashalotModule.ownerOnly).toBeUndefined();
  });

  it('stamps the remote build version', () => {
    expect(remoteManifest.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('CASHALOT_SECRET_SPECS', () => {
  // `pos.fiscal.cashalot.provider.test.ts` pins the adapter's `secretKeys`
  // to the same three — this is the client half of that tripwire.
  it('declares exactly keyGuid, keyPin and numFiscal, all required', () => {
    expect(CASHALOT_SECRET_SPECS.map((s) => s.key).sort()).toEqual(['keyGuid', 'keyPin', 'numFiscal']);
    expect(CASHALOT_SECRET_SPECS.every((s) => s.required)).toBe(true);
  });

  it('hides the key id and the PIN, shows the fiscal number', () => {
    const kind = Object.fromEntries(CASHALOT_SECRET_SPECS.map((s) => [s.key, s.kind]));
    expect(kind).toEqual({ keyGuid: 'password', keyPin: 'password', numFiscal: 'text' });
  });
});
