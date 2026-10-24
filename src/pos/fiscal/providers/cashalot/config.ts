// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/cashalot/config.ts
//
// The store's non-secret Cashalot settings (`pos_fiscal_settings.config`):
// the tax table and the test mode. Both are written by the owner and both
// must not change inside an open shift — Cashalot's developers warn against
// a letter changing mid-shift (answer 9), and a shift is either all test or
// all fiscal documents (answer 6).

import { normalizeTaxTable, DpsTaxTableError, type DpsTaxRate } from '../../dps/index.js';
import type { FiscalConfigContext } from '../../types.js';

export interface CashalotConfig {
  taxes: DpsTaxRate[];
  testing: boolean;
}

/** The config as the adapter uses it. Already normalised at save time; read defensively anyway. */
export function readConfig(config: Readonly<Record<string, unknown>>): CashalotConfig {
  return {
    taxes: normalizeTaxTable(config.taxes),
    testing: config.testing === true,
  };
}

function sameTaxes(a: readonly DpsTaxRate[], b: readonly DpsTaxRate[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * `FiscalProvider.normalizeConfig` for Cashalot: canonical `taxes` and
 * `testing`, the register key kept, anything else dropped — and no change of
 * the first two while a shift is open.
 */
export function normalizeCashalotConfig(
  next: Readonly<Record<string, unknown>>,
  ctx: FiscalConfigContext
): Record<string, unknown> {
  if (next.testing !== undefined && typeof next.testing !== 'boolean') {
    throw new DpsTaxTableError('Тестовий режим має бути так або ні');
  }
  const taxes = normalizeTaxTable(next.taxes);
  const testing = next.testing === true;

  if (ctx.shiftOpen) {
    const before = readConfigSafe(ctx.previous);
    if (!sameTaxes(before.taxes, taxes) || before.testing !== testing) {
      throw new DpsTaxTableError(
        'Ставки податку й тестовий режим змінюються лише при закритій зміні — закрийте зміну й збережіть знову'
      );
    }
  }

  return {
    taxes,
    testing,
    ...(typeof next.cashRegisterKey === 'string' && next.cashRegisterKey.trim()
      ? { cashRegisterKey: next.cashRegisterKey.trim() }
      : {}),
  };
}

/** A previous config that no longer validates counts as empty — never blocks a fix. */
function readConfigSafe(config: Readonly<Record<string, unknown>> | null): CashalotConfig {
  if (!config) return { taxes: [], testing: false };
  try {
    return readConfig(config);
  } catch {
    return { taxes: [], testing: false };
  }
}
