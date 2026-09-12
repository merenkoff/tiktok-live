// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/requisites.ts
//
// Keeping `pos_fiscal_settings.requisites` fresh: the store's legal name and
// number, the point of sale, the register's own fiscal number and the tax
// letters — everything the receipt header has to say (Положення № 13, розділ
// II п. 2) that the owner would otherwise have to type.
//
// Called from the places that are online by definition — the owner's
// connection test, opening a shift, the offline-code refill — and never from
// checkout: a sale must not wait on a lookup, and offline there is nobody to
// ask, which is the whole reason this is a cache. A failed refresh is a log
// line; the last snapshot stays.

import { logger } from '../../logger.js';
import { asFiscalError } from './errors.js';
import { rememberRequisites } from './settings.service.js';
import { buildCallCtx, type FiscalContext } from './shifts.service.js';
import type { FiscalRequisites } from './types.js';

/** Legal requisites change once in a blue moon; a day is plenty. */
export const REQUISITES_TTL_MS = 24 * 60 * 60 * 1000;

export function requisitesFresh(ctx: FiscalContext, now = Date.now()): boolean {
  const at = ctx.settings.requisites_fetched_at;
  return Boolean(ctx.settings.requisites) && at !== null && now - new Date(at).getTime() < REQUISITES_TTL_MS;
}

export type RefreshOutcome = 'fresh' | 'refreshed' | 'failed';

/**
 * Fetch and cache unless the cache is younger than the TTL (or `force`).
 * Never throws: the callers have their own job to finish.
 */
export async function refreshRequisites(
  ctx: FiscalContext,
  signal: AbortSignal,
  opts: { force?: boolean } = {}
): Promise<{ outcome: RefreshOutcome; requisites: FiscalRequisites | null }> {
  if (!opts.force && requisitesFresh(ctx)) {
    return { outcome: 'fresh', requisites: ctx.settings.requisites };
  }
  try {
    const requisites = await ctx.provider.fetchRequisites(await buildCallCtx(ctx, signal));
    await rememberRequisites(ctx.storeId, requisites);
    // Keep the in-memory context truthful for whoever holds it after us.
    ctx.settings.requisites = requisites;
    ctx.settings.requisites_fetched_at = new Date();
    return { outcome: 'refreshed', requisites };
  } catch (error) {
    const fiscal = asFiscalError(error, 'fetchRequisites failed');
    logger.warn('Fiscal requisites: refresh failed', {
      storeId: ctx.storeId,
      kind: fiscal.kind,
      message: fiscal.message,
    });
    return { outcome: 'failed', requisites: ctx.settings.requisites };
  }
}
