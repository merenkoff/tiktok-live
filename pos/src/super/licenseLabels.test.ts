// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { devLabel, licenseTitle, originLabel, originNote } from './licenseLabels';

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

describe('devLabel', () => {
  it('says «розробка» when every copy of the group is a development run', () => {
    expect(devLabel({ installs: 1, dev_installs: 1 })).toBe('розробка');
    expect(devLabel({ installs: 3, dev_installs: 3 })).toBe('розробка');
  });

  it('counts them when only some are, so a real copy beside them is not hidden', () => {
    expect(devLabel({ installs: 5, dev_installs: 2 })).toBe('розробка: 2 з 5');
  });

  it('says nothing for none, and for a server older than the mark', () => {
    expect(devLabel({ installs: 4, dev_installs: 0 })).toBe('');
    expect(devLabel({ installs: 4 })).toBe('');
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
