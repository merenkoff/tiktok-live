// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import type { FiscalPublicConfig, FiscalRequisites } from '../types';
import { cartNeedsSplit, cartRegisterSet, registerCaption } from './cartRegisters';

const req = (name: string): FiscalRequisites => ({
  organization: { name, edrpou: null, tax_number: null, is_vat: false },
  point: { name: null, address: null },
  register: { fiscal_number: null, title: null, address: null },
  taxes: [],
});

const dual = {
  enabled: true,
  provider: 'cashalot',
  requisites: req('ФОП Іваненко'),
  registers: [{ register_no: 2, label: null, register_fiscal_number: null, default_tax_code: null, requisites: req('ФОП Петренко') }],
} as FiscalPublicConfig;

describe('cartRegisterSet / cartNeedsSplit', () => {
  it('reads a line without a register as register 1', () => {
    expect([...cartRegisterSet([{}, { fiscal_register: 1 }])]).toEqual([1]);
  });

  it('splits only food plus alcohol in a store with a register 2', () => {
    const mixed = [{ fiscal_register: 1 }, { fiscal_register: 2 }];
    expect(cartNeedsSplit(mixed, dual)).toBe(true);
    expect(cartNeedsSplit([{ fiscal_register: 2 }], dual)).toBe(false);
    expect(cartNeedsSplit(mixed, { ...dual, registers: undefined })).toBe(false);
    expect(cartNeedsSplit(mixed, { ...dual, enabled: false })).toBe(false);
    expect(cartNeedsSplit(mixed, null)).toBe(false);
  });
});

describe('registerCaption', () => {
  it('prefers the owner’s label, then the ФОП, then the bare number', () => {
    expect(registerCaption(dual, 2, 'Бар')).toBe('Каса 2 · Бар');
    expect(registerCaption(dual, 2)).toBe('Каса 2 · ФОП Петренко');
    expect(registerCaption(dual, 1, null)).toBe('Каса 1 · ФОП Іваненко');
    expect(registerCaption(null, 2)).toBe('Каса 2');
  });
});
