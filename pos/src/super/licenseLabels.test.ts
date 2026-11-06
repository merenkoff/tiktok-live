// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { licenseTitle, originLabel, originNote } from './licenseLabels';

describe('licenseTitle', () => {
  it('shows the licensee for a verified token', () => {
    expect(licenseTitle({ fingerprint: 'abc', verified: true, licensee: 'Acme LLC' })).toBe('Acme LLC');
  });

  it('calls a keyless ping «Без ключа»', () => {
    expect(licenseTitle({ fingerprint: '', verified: false, licensee: null })).toBe('Без ключа');
  });

  it('calls a present-but-unverifiable token «Ключ не підтверджено»', () => {
    expect(licenseTitle({ fingerprint: 'deadbeef', verified: false, licensee: null })).toBe('Ключ не підтверджено');
  });

  it('does not trust a licensee name when the token did not verify', () => {
    // A forged token could carry any licensee string; without verification it is not shown as licensed.
    expect(licenseTitle({ fingerprint: 'deadbeef', verified: false, licensee: 'Pirate' })).toBe('Ключ не підтверджено');
  });
});

describe('originLabel', () => {
  it('passes a real origin through', () => {
    expect(originLabel('https://shop.example.com')).toBe('https://shop.example.com');
  });

  it('names an empty origin', () => {
    expect(originLabel('')).toBe('(невідомо)');
  });

  it('names a copy that reported no origin by the address its ping came from', () => {
    expect(originLabel('', '203.0.113.7')).toBe('IP 203.0.113.7');
    expect(originLabel('https://shop.example.com', '203.0.113.7')).toBe('https://shop.example.com');
  });

  it('notes the address beside a named origin, and nothing otherwise', () => {
    expect(originNote('https://shop.example.com', '203.0.113.7')).toBe('з IP 203.0.113.7');
    expect(originNote('', '203.0.113.7')).toBe('');
    expect(originNote('https://shop.example.com', null)).toBe('');
  });
});
