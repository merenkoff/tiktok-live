// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { FiscalPublicConfig, FiscalRequisites } from '@pos/platform';
import { assignRegister, registerChoices } from './registerChoices';

const req = (name: string): FiscalRequisites => ({
  organization: { name, edrpou: null, tax_number: null, is_vat: false },
  point: { name: null, address: null },
  register: { fiscal_number: null, title: null, address: null },
  taxes: [],
});

describe('registerChoices', () => {
  it('offers nothing to a store with one register', () => {
    expect(registerChoices(null)).toEqual([]);
    expect(registerChoices({ enabled: true, provider: 'cashalot' } as FiscalPublicConfig)).toEqual([]);
    expect(
      registerChoices({
        enabled: false,
        provider: 'cashalot',
        registers: [{ register_no: 2, label: 'Бар', register_fiscal_number: null, default_tax_code: null, requisites: null }],
      } as FiscalPublicConfig)
    ).toEqual([]);
  });

  it('names each register by the owner’s label, else the ФОП', () => {
    const fiscal = {
      enabled: true,
      provider: 'cashalot',
      requisites: req('ФОП Іваненко'),
      registers: [{ register_no: 2, label: ' ', register_fiscal_number: null, default_tax_code: null, requisites: req('ФОП Петренко') }],
    } as FiscalPublicConfig;
    expect(registerChoices(fiscal)).toEqual([
      { registerNo: 1, label: 'Каса 1 · ФОП Іваненко' },
      { registerNo: 2, label: 'Каса 2 · ФОП Петренко' },
    ]);
    fiscal.registers![0].label = 'Бар';
    expect(registerChoices(fiscal)[1].label).toBe('Каса 2 · Бар');
  });
});

describe('assignRegister', () => {
  it('writes each product in turn and counts a refusal without stopping', async () => {
    const seen: Array<[number, number]> = [];
    const result = await assignRegister([1, 2, 3], 2, async (id, no) => {
      seen.push([id, no]);
      if (id === 2) throw new Error('409');
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    expect(result).toEqual({ done: 2, failed: 1 });
  });
});
