// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/provider-budget.ts

import { pool } from '../../db.js';

/**
 * Server-side providers with a daily allowance. One member since upc.dev was
 * retired (see `TechDocs/POS_GTIN_ENRICHMENT.md`) — the Open*Facts fan-out runs
 * in the browser and has no allowance of ours to spend.
 */
export type QuotaProvider = 'upcitemdb';

/** One bucket for the whole deployment. */
export const SHARED_SCOPE = 'shared';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dailyLimit(_provider: QuotaProvider): number {
  return Number(process.env.GTIN_UPCITEMDB_DAILY_LIMIT ?? 100);
}

/**
 * The identity the provider meters, which is what a daily counter has to be
 * keyed by (migration 020).
 *
 * UPCitemdb's trial has no key — it is metered per source IP, so the whole
 * deployment is one bucket, and that is the only case today. The `scope` column
 * stays in the primary key because the *next* keyed provider needs it: upc.dev
 * counted against the API key, and every store can set its own, so a shared
 * counter let one store spend another's allowance. Wiring such a provider back
 * in means returning a per-key scope here, not another migration.
 */
export function budgetScope(_provider: QuotaProvider): string {
  return SHARED_SCOPE;
}

export interface BudgetOptions {
  /** From {@link budgetScope}. Defaults to the deployment-wide bucket. */
  scope?: string;
  /**
   * A positive integer wins over the env/default daily limit — the per-store cap
   * set in POS admin (`pos_stores.gtin_daily_limit`).
   */
  limit?: number;
}

export async function getUsedCount(
  provider: QuotaProvider,
  opts: BudgetOptions = {}
): Promise<number> {
  const r = await pool.query(
    `SELECT used_count FROM pos_gtin_provider_budget
     WHERE provider = $1 AND scope = $2 AND day_utc = $3::date`,
    [provider, opts.scope ?? SHARED_SCOPE, utcDay()]
  );
  if (r.rows.length === 0) return 0;
  return Number(r.rows[0].used_count);
}

/**
 * Reserve a slot. Returns false when the quota for this scope is spent.
 *
 * The slot is taken *before* the request goes out, so concurrent lookups cannot
 * overshoot the cap between check and spend. A request that never reached the
 * provider gives its slot back — see {@link releaseBudget}.
 */
export async function tryConsumeBudget(
  provider: QuotaProvider,
  opts: BudgetOptions = {}
): Promise<boolean> {
  const limit =
    typeof opts.limit === 'number' && Number.isFinite(opts.limit) && opts.limit > 0
      ? Math.floor(opts.limit)
      : dailyLimit(provider);
  const scope = opts.scope ?? SHARED_SCOPE;
  const day = utcDay();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO pos_gtin_provider_budget (provider, scope, day_utc, used_count)
       VALUES ($1, $2, $3::date, 0)
       ON CONFLICT (provider, scope, day_utc) DO NOTHING`,
      [provider, scope, day]
    );
    const updated = await client.query(
      `UPDATE pos_gtin_provider_budget
       SET used_count = used_count + 1
       WHERE provider = $1 AND scope = $2 AND day_utc = $3::date AND used_count < $4
       RETURNING used_count`,
      [provider, scope, day, limit]
    );
    await client.query('COMMIT');
    return updated.rows.length > 0;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Give a reserved slot back, for a request the provider never counted.
 *
 * Only for failures on our side of the conversation — a timeout, a dropped
 * connection, a 5xx. A 4xx is an answer: a 429 means we really did spend the
 * allowance, and a 401/403 means the key is wrong, where handing the slot back
 * would let every scan for the rest of the day hammer a provider that will
 * refuse all of them.
 */
export async function releaseBudget(
  provider: QuotaProvider,
  opts: BudgetOptions = {}
): Promise<void> {
  await pool.query(
    `UPDATE pos_gtin_provider_budget
     SET used_count = used_count - 1
     WHERE provider = $1 AND scope = $2 AND day_utc = $3::date AND used_count > 0`,
    [provider, opts.scope ?? SHARED_SCOPE, utcDay()]
  );
}

/** True when a failed response should give its slot back. See {@link releaseBudget}. */
export function isRefundableStatus(status: number): boolean {
  return status >= 500;
}
