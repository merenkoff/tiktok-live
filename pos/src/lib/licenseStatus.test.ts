// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { licenseLine, licenseeWords, type LicenseStatusView } from './licenseStatus';

const view = (over: Partial<LicenseStatusView> = {}): LicenseStatusView => ({
  status: 'licensed',
  instance_id: '36ec4ed9-1dbc-4e81-9af1-6f1afbb9e283',
  licensee: 'The Live Shop (SaaS)',
  plan: 'saas',
  expires_at: null,
  last_ok_at: '2026-11-06T11:35:31.227Z',
  last_checked_at: '2026-11-06T20:39:36.072Z',
  server_url: 'https://the-live.shop',
  token_reason: null,
  ...over,
});

describe('licenseLine', () => {
  it('a licensed copy is green and names the licensee and the plan', () => {
    expect(licenseLine(view())).toEqual({
      tone: 'ok',
      title: 'Копія ліцензована',
      detail: 'The Live Shop (SaaS) · план saas',
    });
  });

  it('adds the expiry day when the claim has one', () => {
    expect(licenseeWords(view({ expires_at: '2027-01-01T00:00:00Z' }))).toBe(
      'The Live Shop (SaaS) · план saas · до 1 січня 2027 р.'
    );
  });

  it('an absent key is red and says the key is not set', () => {
    expect(licenseLine(view({ status: 'unlicensed', licensee: null, plan: null, token_reason: 'absent' }))).toEqual({
      tone: 'bad',
      title: 'Копія не ліцензована',
      detail: 'ключ ліцензії не задано',
    });
  });

  it('an expired key is red and says so', () => {
    expect(licenseLine(view({ status: 'unlicensed', token_reason: 'expired' })).detail).toBe('термін дії ключа минув');
  });

  it('a valid key with a silent server is amber and dates the last contact', () => {
    const line = licenseLine(view({ status: 'unreachable' }));
    expect(line.tone).toBe('warn');
    expect(line.title).toBe('Ключ дійсний, сервер активації не відповідає');
    expect(line.detail).toBe("The Live Shop (SaaS) · план saas · останній зв'язок 6 листопада 2026 р.");
  });

  it('a valid key that never reached the server says so', () => {
    expect(licenseLine(view({ status: 'unreachable', last_ok_at: null })).detail).toBe(
      "The Live Shop (SaaS) · план saas · зв'язку ще не було"
    );
  });
});
