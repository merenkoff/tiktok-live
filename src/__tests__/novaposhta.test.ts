// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/novaposhta.test.ts
//
// The Nova Poshta client is built per seller from `user_settings`. It used to
// be a process-wide singleton reading NOVAPOSHTA_API_KEY / _MERCHANT_NAME from
// the environment, which meant every seller's waybills went to one account and
// the values in the admin Settings page did nothing at all. These tests pin the
// replacement: credentials come from the settings object and only from there.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNovaPoshtaClient } from '../novaposhta.js';

describe('createNovaPoshtaClient', () => {
  const saved = {
    key: process.env.NOVAPOSHTA_API_KEY,
    name: process.env.NOVAPOSHTA_MERCHANT_NAME,
  };

  beforeEach(() => {
    // Deliberately hostile: if anything still fell back to the environment,
    // the "unconfigured" cases below would report themselves as configured.
    process.env.NOVAPOSHTA_API_KEY = 'env-key-must-be-ignored';
    process.env.NOVAPOSHTA_MERCHANT_NAME = 'env-name-must-be-ignored';
  });

  afterEach(() => {
    if (saved.key === undefined) delete process.env.NOVAPOSHTA_API_KEY;
    else process.env.NOVAPOSHTA_API_KEY = saved.key;
    if (saved.name === undefined) delete process.env.NOVAPOSHTA_MERCHANT_NAME;
    else process.env.NOVAPOSHTA_MERCHANT_NAME = saved.name;
  });

  it('is configured when the seller saved both fields', () => {
    const np = createNovaPoshtaClient({
      novaposhta_api_key: 'seller-key',
      novaposhta_merchant_name: 'Seller Shop',
    });
    expect(np.isConfigured()).toBe(true);
  });

  it('ignores the environment entirely when settings are empty', () => {
    expect(createNovaPoshtaClient({}).isConfigured()).toBe(false);
    expect(
      createNovaPoshtaClient({
        novaposhta_api_key: null,
        novaposhta_merchant_name: null,
      }).isConfigured()
    ).toBe(false);
  });

  it('treats a blank or whitespace-only key as unconfigured', () => {
    expect(
      createNovaPoshtaClient({
        novaposhta_api_key: '   ',
        novaposhta_merchant_name: 'Seller Shop',
      }).isConfigured()
    ).toBe(false);
  });

  it('needs the merchant name too — a key alone cannot create a waybill', () => {
    expect(
      createNovaPoshtaClient({ novaposhta_api_key: 'seller-key' }).isConfigured()
    ).toBe(false);
  });

  it('gives each seller an independent client', () => {
    const a = createNovaPoshtaClient({
      novaposhta_api_key: 'a',
      novaposhta_merchant_name: 'A',
    });
    const b = createNovaPoshtaClient({});
    expect(a).not.toBe(b);
    expect(a.isConfigured()).toBe(true);
    expect(b.isConfigured()).toBe(false);
  });
});
