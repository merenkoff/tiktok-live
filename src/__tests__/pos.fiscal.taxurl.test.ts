// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.fiscal.taxurl.test.ts
//
// The link a customer scans off an offline receipt. Pure — no DB, no provider.
//
// The shape is pinned against two real links: the provider's own example
// (TechDocs/checkbox-api/receipts-offline.md) and a receipt from a working shop
// that verifies in the tax cabinet with no `mac` at all. The second is why this
// file exists: it is what makes the QR ours to build offline.

import { describe, expect, it } from 'vitest';
import { buildTaxUrl } from '../pos/fiscal/taxUrl.js';

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildTaxUrl', () => {
  it('carries exactly the five fields the cabinet looks the receipt up by', () => {
    const url = buildTaxUrl({
      fiscalCode: 'OFF-0002',
      // 14:07 UTC — the shop, and the receipt, are on Kyiv time.
      fiscalDate: new Date('2023-11-29T14:07:28.000Z'),
      registerFiscalNumber: 'TEST551151',
      totalCents: 56300,
    });
    expect(url).not.toBeNull();
    const p = params(url as string);
    expect(new URL(url as string).pathname).toBe('/cashregs/check');
    expect(p.get('id')).toBe('OFF-0002');
    expect(p.get('fn')).toBe('TEST551151');
    expect(p.get('sm')).toBe('563.00');
    // Local time, not UTC: the printed fiscal time and the link must agree.
    // `HHmm` — the regulation's template (Положення № 13, розділ II п. 2).
    expect(p.get('date')).toBe('20231129');
    expect(p.get('time')).toBe('1607');
    // `mac` is the provider's chain hash — an extra we cannot compute and the
    // cabinet does not ask for.
    expect(p.get('mac')).toBeNull();
  });

  it('follows Kyiv daylight saving rather than a fixed offset', () => {
    // Same UTC hour, six months apart: +03:00 in summer, +02:00 in winter.
    const summer = params(
      buildTaxUrl({
        fiscalCode: 'OFF-1',
        fiscalDate: new Date('2026-07-15T10:30:00.000Z'),
        registerFiscalNumber: 'FN',
        totalCents: 100,
      }) as string
    );
    const winter = params(
      buildTaxUrl({
        fiscalCode: 'OFF-1',
        fiscalDate: new Date('2026-01-15T10:30:00.000Z'),
        registerFiscalNumber: 'FN',
        totalCents: 100,
      }) as string
    );
    expect(summer.get('time')).toBe('1330');
    expect(winter.get('time')).toBe('1230');
  });

  it('prints midnight as 00, not 24', () => {
    const p = params(
      buildTaxUrl({
        fiscalCode: 'OFF-1',
        // 22:10 UTC = 00:10 next day in Kyiv (winter).
        fiscalDate: new Date('2026-01-15T22:10:05.000Z'),
        registerFiscalNumber: 'FN',
        totalCents: 100,
      }) as string
    );
    expect(p.get('date')).toBe('20260116');
    expect(p.get('time')).toBe('0010');
  });

  it('reports a refund by its absolute sum', () => {
    // Refund ledger rows carry a negative total; `sm=-143.50` identifies nothing.
    const p = params(
      buildTaxUrl({
        fiscalCode: 'OFF-7',
        fiscalDate: new Date('2026-09-07T15:40:00.000Z'),
        registerFiscalNumber: '4001118166',
        totalCents: -14350,
      }) as string
    );
    expect(p.get('sm')).toBe('143.50');
  });

  it('builds nothing without the register number', () => {
    // A link with no `fn` points at no document — a QR that opens an error page
    // is worse than the printed line saying the QR is coming.
    const input = {
      fiscalCode: 'OFF-0002',
      fiscalDate: new Date('2026-09-11T09:00:00.000Z'),
      totalCents: 100,
    };
    expect(buildTaxUrl({ ...input, registerFiscalNumber: '' })).toBeNull();
    expect(buildTaxUrl({ ...input, registerFiscalNumber: '   ' })).toBeNull();
    expect(buildTaxUrl({ ...input, fiscalCode: '', registerFiscalNumber: 'FN' })).toBeNull();
  });
});
