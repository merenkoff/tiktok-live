// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/helpers/split-fiscal-provider.ts
//
// Two Cashalot accounts behind one adapter id (track ДК,
// TechDocs/POS_DUAL_REGISTER.md): one `cashalot` provider in front of two
// fakes, chosen by the licence in the credentials each call carries — so each
// register of a store really has its own shift and its own documents.

import type { FiscalCallCtx, FiscalCredentials, FiscalProvider } from '../../pos/fiscal/types.js';
import type { FakeFiscalProvider } from './fake-fiscal-provider.js';

/** Register 1's licence in these tests. */
export const FOOD_LICENCE = 'licence-food';
/** Register 2's licence in these tests. */
export const BAR_LICENCE = 'licence-bar';

export function splitProvider(food: FakeFiscalProvider, bar: FakeFiscalProvider): FiscalProvider {
  const pick = (arg: unknown): FakeFiscalProvider => {
    const creds =
      (arg as FiscalCallCtx | undefined)?.creds ?? (arg as FiscalCredentials | undefined);
    return creds?.secrets?.licenceKey === BAR_LICENCE ? bar : food;
  };
  return new Proxy(food, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const fake = pick(args[0]);
        return (Reflect.get(fake, prop) as (...a: unknown[]) => unknown).apply(fake, args);
      };
    },
  }) as unknown as FiscalProvider;
}
