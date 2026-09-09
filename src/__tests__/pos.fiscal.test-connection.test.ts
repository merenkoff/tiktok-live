// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.test-connection.test.ts
//
// `POST /api/pos/fiscal/test-connection` — "Перевірити з'єднання" on the
// settings screen. The property that matters: it must work BEFORE the owner
// flips `enabled` on, since testing credentials is how they decide whether to
// flip it at all. `getFiscalCredentials` normally requires `enabled: true`
// (the checkout/shift paths must never talk to a provider a store turned
// off) — this route is the one deliberate exception.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generateSecretsKey } from '../pos/core/secrets.js';
import { registerProvider, resetProviders } from '../pos/fiscal/providers/index.js';
import { updateFiscalSettings } from '../pos/fiscal/settings.service.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { FakeFiscalProvider } from './helpers/fake-fiscal-provider.js';

describe.skipIf(!hasDb)('POS fiscal test-connection', () => {
  let app: FastifyInstance;
  let store: TestStore;
  let fake: FakeFiscalProvider;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.POS_SECRETS_KEY;
    process.env.POS_SECRETS_KEY = generateSecretsKey();
    await applyPosMigrations();
    store = await createTestStore('rtestconn');
    app = await buildPosTestApp();
  }, 120000);

  afterAll(async () => {
    await app?.close();
    await dropTestStore(store?.storeId);
    resetProviders();
    if (previousKey === undefined) delete process.env.POS_SECRETS_KEY;
    else process.env.POS_SECRETS_KEY = previousKey;
  });

  beforeEach(() => {
    fake = new FakeFiscalProvider();
    registerProvider(fake);
  });

  afterEach(() => resetProviders());

  const testConnection = () =>
    app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/test-connection',
      headers: auth(store.ownerToken),
    });

  it('works while fiscalisation is still disabled — that is the whole point', async () => {
    await updateFiscalSettings(store.storeId, {
      enabled: false,
      provider: 'checkbox',
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });

    const res = await testConnection();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, cashierName: 'Fake Cashier' });
    expect(fake.calls.map((c) => c.method)).toEqual(['probe']);
  });

  it('never mutates anything at the provider', async () => {
    await updateFiscalSettings(store.storeId, {
      enabled: false,
      provider: 'checkbox',
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    await testConnection();
    // No shift was opened, no document registered — probe is read-only.
    expect(fake.calls.every((c) => c.method === 'probe')).toBe(true);
  });

  it('answers 409 when no provider is selected yet', async () => {
    await updateFiscalSettings(store.storeId, { enabled: false, provider: null });
    const res = await testConnection();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('not_configured');
  });

  it('reports ok:false, not an error, when no credentials are saved yet', async () => {
    // No hard-coded "which keys are required" check at the route level — that
    // is provider-specific, and the provider's own probe already validates it.
    // An empty credential bag is a normal, answerable probe.
    await updateFiscalSettings(store.storeId, { enabled: false, provider: 'checkbox' });
    const res = await testConnection();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: false });
  });

  it('degrades gracefully when the build ships no adapter for the provider', async () => {
    // vchasno/echeck have no adapter yet — checkbox itself is always built
    // in now, so this is the real scenario the fallback exists for.
    await updateFiscalSettings(store.storeId, {
      enabled: false,
      provider: 'vchasno',
      secrets: { licenceKey: 'x', cashierPin: '0000' },
    });
    const res = await testConnection();
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('not_configured');
  });

  it('reports a failed probe without throwing', async () => {
    await updateFiscalSettings(store.storeId, {
      enabled: false,
      provider: 'checkbox',
      secrets: { licenceKey: 'fake-licence', cashierPin: '0000' },
    });
    fake.queueError('auth_rejected', 'bad licence');
    const res = await testConnection();
    expect(res.statusCode).toBe(502);
    expect(res.json().support_code).toBeTruthy();
  });

  it('is owner-only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pos/fiscal/test-connection',
      headers: auth(store.sellerToken),
    });
    expect(res.statusCode).toBe(403);
  });
});
