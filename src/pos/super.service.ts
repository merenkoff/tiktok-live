// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/super.service.ts — what the super admin can see and change across
// every store (TechDocs/POS_SUPER_ADMIN.md). Deliberately narrow: the two
// module-configuration columns, nothing else. Validation is the exact path the
// owner's `PATCH /store` takes, so the super admin cannot store anything an
// owner could not.

import { pool } from '../db.js';
import { updateStore, type StorePatch } from './analytics.service.js';
import {
  assertSingleFiscalRemote,
  assertSingleVerticalRemote,
  effectiveEnabledModules,
  isAllowedRemoteUrl,
  ModuleRemoteConflictError,
  sanitizeEnabledModules,
  sanitizeModuleRemotes,
  type ModuleRemoteEntry,
} from './core/modules.js';
import { getFiscalSettings } from './fiscal/settings.service.js';
import { isFiscalProviderId } from './fiscal/types.js';
import { hasVertical, verticalOrDefault } from './verticals/index.js';
import type { VerticalId } from './verticals/types.js';

export interface SuperStoreRow {
  id: number;
  name: string;
  slug: string;
  currency: string;
  created_at: string;
  /** What the store sells — the one column only the super admin may write. */
  vertical: VerticalId;
  /** Effective set (defaults applied), not the raw column. */
  enabled_modules: string[];
  module_remotes: Record<string, string | ModuleRemoteEntry>;
  live_tiktok_username: string | null;
  fiscal: { enabled: boolean; provider: string | null };
  staff_count: number;
  last_sale_at: string | null;
}

/** A request the super admin made that the validation rules reject → 400. */
export class SuperValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperValidationError';
  }
}

const STORE_SELECT = `
  SELECT s.id, s.name, s.slug, s.currency, s.created_at, s.vertical,
         s.enabled_modules, s.module_remotes, s.live_tiktok_username,
         fs.enabled AS fiscal_enabled, fs.provider AS fiscal_provider,
         (SELECT count(*)::int FROM pos_staff st WHERE st.store_id = s.id AND st.is_active) AS staff_count,
         (SELECT max(sa.created_at) FROM pos_sales sa WHERE sa.store_id = s.id) AS last_sale_at
  FROM pos_stores s
  LEFT JOIN pos_fiscal_settings fs ON fs.store_id = s.id`;

function mapRow(row: Record<string, unknown>): SuperStoreRow {
  const created = row.created_at as Date | string;
  const lastSale = row.last_sale_at as Date | string | null;
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    currency: String(row.currency),
    created_at: created instanceof Date ? created.toISOString() : String(created),
    vertical: verticalOrDefault(row.vertical as string | null).id,
    enabled_modules: effectiveEnabledModules(row.enabled_modules as string[] | null),
    module_remotes: (row.module_remotes as SuperStoreRow['module_remotes'] | null) ?? {},
    live_tiktok_username: (row.live_tiktok_username as string | null) ?? null,
    fiscal: {
      enabled: Boolean(row.fiscal_enabled),
      provider: isFiscalProviderId(row.fiscal_provider) ? String(row.fiscal_provider) : null,
    },
    staff_count: Number(row.staff_count ?? 0),
    last_sale_at: lastSale == null ? null : lastSale instanceof Date ? lastSale.toISOString() : String(lastSale),
  };
}

export async function listStores(): Promise<SuperStoreRow[]> {
  const result = await pool.query(`${STORE_SELECT} ORDER BY s.id ASC`);
  return result.rows.map(mapRow);
}

export async function getStore(storeId: number): Promise<SuperStoreRow | null> {
  const result = await pool.query(`${STORE_SELECT} WHERE s.id = $1`, [storeId]);
  return result.rows.length ? mapRow(result.rows[0]) : null;
}

/**
 * Same checks as the owner's `PATCH /store`: the fiscal-* guard needs the
 * store's configured provider, the vertical-* guard the vertical it will have
 * once this request lands — which is why `vertical` is a parameter rather than
 * another read. Throws `SuperValidationError` for either conflict;
 * `sanitizeModuleRemotes` silently drops malformed entries, exactly as it does
 * for the owner.
 */
async function validatedRemotes(
  storeId: number,
  input: unknown,
  vertical: VerticalId
): Promise<Record<string, string | ModuleRemoteEntry>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SuperValidationError('module_remotes must be an object');
  }
  const sanitized = sanitizeModuleRemotes(input);
  const fiscal = await getFiscalSettings(storeId);
  try {
    assertSingleFiscalRemote(sanitized, fiscal?.provider ?? null);
    assertSingleVerticalRemote(sanitized, vertical);
  } catch (error) {
    if (error instanceof ModuleRemoteConflictError) throw new SuperValidationError(error.message);
    throw error;
  }
  return sanitized;
}

/**
 * Write `pos_stores.vertical`.
 *
 * Its own statement rather than a `StorePatch` field: the column is not in
 * `STORE_PATCH_COLUMNS`, which is exactly what makes it unwritable through the
 * owner's `PATCH /store`. In a transaction because changing what a shop sells
 * also changes how every variant label reads — migration 035 adds that
 * recompute here, next to the write it belongs to.
 */
async function setStoreVertical(storeId: number, vertical: VerticalId): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE pos_stores SET vertical = $1, updated_at = NOW() WHERE id = $2`, [
      vertical,
      storeId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function patchStoreModules(
  storeId: number,
  body: { enabled_modules?: unknown; module_remotes?: unknown; vertical?: unknown }
): Promise<SuperStoreRow | null> {
  const current = await getStore(storeId);
  if (!current) return null;

  // Validate everything against the state this request would produce, before
  // writing anything: setting `vertical: clothing` while `vertical-flowers` is
  // registered and registering `vertical-flowers` on a clothing store are the
  // same mistake, and both have to fail whichever order they arrive in — or
  // together in one body.
  let vertical: VerticalId | undefined;
  if (body.vertical !== undefined) {
    if (!hasVertical(body.vertical)) {
      throw new SuperValidationError(`unknown vertical "${String(body.vertical)}"`);
    }
    vertical = body.vertical;
  }
  const effectiveVertical = vertical ?? current.vertical;

  const patch: StorePatch = {};
  if (body.enabled_modules !== undefined) {
    if (!Array.isArray(body.enabled_modules)) {
      throw new SuperValidationError('enabled_modules must be an array');
    }
    patch.enabled_modules = sanitizeEnabledModules(body.enabled_modules);
  }
  if (body.module_remotes !== undefined) {
    patch.module_remotes = await validatedRemotes(storeId, body.module_remotes, effectiveVertical);
  } else if (vertical !== undefined) {
    // The vertical moved but the remotes did not: the entry already stored has
    // to still be legal against the new column, or the till would download a
    // module the sell screen never asks for.
    await validatedRemotes(storeId, current.module_remotes, effectiveVertical);
  }

  if (vertical !== undefined && vertical !== current.vertical) {
    await setStoreVertical(storeId, vertical);
  }
  await updateStore(storeId, patch);
  return getStore(storeId);
}

export interface RepointReport {
  updated: Array<{ id: number; slug: string }>;
  /** Stores that do not use this module at all — nothing to re-point. */
  skipped: Array<{ id: number; slug: string }>;
  failed: Array<{ id: number; slug: string; error: string }>;
}

const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

/**
 * Point `module_id` at a new `url` in every target store that already has it:
 * a string entry is replaced, an object entry keeps its presentation and gets
 * the new `url`. A store without the entry is skipped — adding a brand-new
 * online-only module needs its title/nav, which is the per-store editor's job.
 * Each store is validated and written on its own; the report is honest about
 * partial success.
 */
export async function repointModuleRemote(params: {
  moduleId: string;
  url: string;
  storeIds?: number[];
}): Promise<RepointReport> {
  const moduleId = params.moduleId.trim();
  const url = params.url.trim();
  if (!MODULE_ID_RE.test(moduleId)) throw new SuperValidationError('module_id is not a module id');
  if (!isAllowedRemoteUrl(url)) {
    throw new SuperValidationError('url must be https://, root-relative or http://localhost');
  }
  if (params.storeIds !== undefined) {
    if (!Array.isArray(params.storeIds) || !params.storeIds.every((id) => Number.isInteger(id) && id > 0)) {
      throw new SuperValidationError('store_ids must be an array of store ids');
    }
  }

  const all = await listStores();
  const wanted = params.storeIds ? new Set(params.storeIds) : null;
  const targets = wanted ? all.filter((s) => wanted.has(s.id)) : all;

  const report: RepointReport = { updated: [], skipped: [], failed: [] };
  for (const store of targets) {
    const entry = store.module_remotes[moduleId];
    if (entry === undefined) {
      report.skipped.push({ id: store.id, slug: store.slug });
      continue;
    }
    const next = {
      ...store.module_remotes,
      [moduleId]: typeof entry === 'string' ? url : { ...entry, url },
    };
    try {
      const sanitized = await validatedRemotes(store.id, next, store.vertical);
      if (!(moduleId in sanitized)) {
        throw new SuperValidationError('entry rejected by validation');
      }
      await updateStore(store.id, { module_remotes: sanitized });
      report.updated.push({ id: store.id, slug: store.slug });
    } catch (error) {
      report.failed.push({
        id: store.id,
        slug: store.slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}
