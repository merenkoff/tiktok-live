// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The QR a customer scans off a receipt this till printed with no network.
// The same five fields the server's builder uses (`src/pos/fiscal/taxUrl.ts`),
// because the two links have to be the same link — the till prints it at the
// moment of sale and the server stores it when the receipt is filed.

import { describe, expect, it } from 'vitest';
import { buildTaxUrl } from './taxUrl';

const params = (url: string) => new URL(url).searchParams;

describe('buildTaxUrl', () => {
  it('carries the five fields the tax cabinet looks a receipt up by', () => {
    const url = buildTaxUrl({
      fiscalCode: 'OFF-0002',
      fiscalDate: new Date('2023-11-29T14:07:28.000Z'),
      registerFiscalNumber: 'TEST551151',
      totalCents: 56300,
    }) as string;
    const p = params(url);
    expect(new URL(url).pathname).toBe('/cashregs/check');
    expect(p.get('id')).toBe('OFF-0002');
    expect(p.get('fn')).toBe('TEST551151');
    expect(p.get('sm')).toBe('563.00');
    // Local time, not UTC: the printed fiscal time and the link must agree.
    expect(p.get('date')).toBe('20231129');
    expect(p.get('time')).toBe('1607');
    // `mac` belongs to receipts the ПРРО itself created offline.
    expect(p.get('mac')).toBeNull();
  });

  it('follows Kyiv daylight saving rather than a fixed offset', () => {
    const at = (iso: string) =>
      params(
        buildTaxUrl({
          fiscalCode: 'OFF-1',
          fiscalDate: new Date(iso),
          registerFiscalNumber: 'FN',
          totalCents: 100,
        }) as string
      ).get('time');
    expect(at('2026-07-15T10:30:00.000Z')).toBe('1330');
    expect(at('2026-01-15T10:30:00.000Z')).toBe('1230');
  });

  it('prints midnight as 00 and rolls the date', () => {
    const p = params(
      buildTaxUrl({
        fiscalCode: 'OFF-1',
        fiscalDate: new Date('2026-01-15T22:10:05.000Z'),
        registerFiscalNumber: 'FN',
        totalCents: 100,
      }) as string
    );
    expect(p.get('date')).toBe('20260116');
    expect(p.get('time')).toBe('0010');
  });

  it('builds nothing without the register number', () => {
    // A link with no `fn` points at no document, and a QR that opens an error
    // page is worse than the printed line saying the QR is coming.
    const input = { fiscalCode: 'OFF-0002', fiscalDate: new Date(), totalCents: 100 };
    expect(buildTaxUrl({ ...input, registerFiscalNumber: null })).toBeNull();
    expect(buildTaxUrl({ ...input, registerFiscalNumber: '  ' })).toBeNull();
    expect(buildTaxUrl({ ...input, fiscalCode: '', registerFiscalNumber: 'FN' })).toBeNull();
  });
});
