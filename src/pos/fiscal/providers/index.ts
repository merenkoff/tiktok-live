// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/providers/index.ts
//
// Provider lookup. Same table style as `POS_ROUTE_GROUPS`: one place that says
// which adapters exist, so adding Вчасно or Є-Чек is a single line.
//
// `registerProvider` is also how the tests install a fake adapter. That is the
// point of the whole interface — shifts (phase 3) and checkout orchestration
// (phase 4) are exercised end to end against a fake, so neither needs a real
// provider account to be correct.

import { FiscalError } from '../errors.js';
import type { FiscalProvider, FiscalProviderId } from '../types.js';
import { checkboxProvider } from './checkbox/index.js';

/** Adapters compiled into the app. */
const BUILT_IN: FiscalProvider[] = [checkboxProvider];

const providers = new Map<FiscalProviderId, FiscalProvider>();

function seed(): void {
  providers.clear();
  for (const provider of BUILT_IN) providers.set(provider.id, provider);
}
seed();

/**
 * The adapter for `id`.
 *
 * Throws `not_configured` rather than returning null: a store whose configured
 * provider has no adapter must fail the pre-flight loudly, not fall through to
 * an un-fiscalised sale.
 */
export function getProvider(id: FiscalProviderId): FiscalProvider {
  const provider = providers.get(id);
  if (!provider) {
    throw new FiscalError(`No fiscal adapter for provider "${id}"`, 'not_configured');
  }
  return provider;
}

export function hasProvider(id: FiscalProviderId): boolean {
  return providers.has(id);
}

/** Install or replace an adapter. Used by the built-ins and by tests. */
export function registerProvider(provider: FiscalProvider): void {
  providers.set(provider.id, provider);
}

/** Restore the built-in set. Tests call this in `afterEach`. */
export function resetProviders(): void {
  seed();
}
