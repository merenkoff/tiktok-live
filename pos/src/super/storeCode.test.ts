// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { STORE_CODE_RE, suggestStoreCode } from './storeCode';

describe('suggestStoreCode', () => {
  // The national transliteration, not a brand's own spelling: «Шабля» signs
  // itself `shablya`, and the super admin types that over the suggestion.
  it.each([
    ['Шабля', 'shablia'],
    ['Кав’ярня «Ранок»', 'kaviarnia-ranok'],
    ['Sun City', 'sun-city'],
    ['Щедрий Їжак 2', 'shchedryi-izhak-2'],
    ['  --Ґанок--  ', 'ganok'],
  ])('%s → %s', (name, code) => {
    expect(suggestStoreCode(name)).toBe(code);
    expect(STORE_CODE_RE.test(code)).toBe(true);
  });

  it('never ends on a hyphen when cut to length', () => {
    const code = suggestStoreCode('а'.repeat(40) + ' б');
    expect(code.length).toBeLessThanOrEqual(41);
    expect(code.endsWith('-')).toBe(false);
  });
});
