// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/super.service.ts — what the super admin can see and change across
// every store (TechDocs/POS_SUPER_ADMIN.md). Deliberately narrow: the two
// module-configuration columns, nothing else. Validation is the exact path the
// owner's `PATCH /store` takes, so the super admin cannot store anything an
// owner could not. Plus the one thing only it can do: open a store for a new
// client (`createStore`, TechDocs/POS_ONBOARDING.md).

import { pool } from '../db.js';
import { logger } from '../logger.js';
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
import { hashPassword } from './core/crypto.js';
import { getFiscalSettings } from './fiscal/settings.service.js';
import { isFiscalProviderId } from './fiscal/types.js';
import { getVertical, hasVertical, verticalOrDefault } from './verticals/index.js';
import { WEIGHABLE_UNITS, WEIGHED_PRICE_PER } from './weighed.js';
import type { AttributeValues, VerticalDefinition, VerticalId } from './verticals/types.js';

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

/** A request that collides with a row already there (a taken store code) → 409. */
export class SuperConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperConflictError';
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
  const def = getVertical(vertical);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertPricesKeepMeaning(client, storeId, def);
    await client.query(`UPDATE pos_stores SET vertical = $1, updated_at = NOW() WHERE id = $2`, [
      vertical,
      storeId,
    ]);
    const relabelled = await relabelStoreVariants(client, storeId, def);
    await client.query('COMMIT');
    logger.info('pos super: store vertical changed', { storeId, vertical, relabelled });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * Refuse a vertical under which some variant's price would mean something else
 * (migration 075). `price_per` is derived from the unit under the store's
 * vertical on every write, so a variant whose stored basis the new vertical
 * would derive differently — a weighed cheese in a store moved to the café,
 * a café's per-gram ingredient in one moved to groceries — would change its
 * price a thousandfold the first time anybody saved it. Among clothing,
 * flowers and the café this never fires: none of them sells by weight.
 */
async function assertPricesKeepMeaning(
  client: Queryable,
  storeId: number,
  def: VerticalDefinition
): Promise<void> {
  const weighable = def.weighedUnits.filter((unit) => WEIGHABLE_UNITS.includes(unit));
  const result = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM pos_variants
      WHERE store_id = $1
        AND price_per <> CASE WHEN unit = ANY($2::text[]) THEN $3::int ELSE 1 END`,
    [storeId, weighable, WEIGHED_PRICE_PER]
  );
  const n = Number(result.rows[0]?.n ?? 0);
  if (n > 0) {
    throw new SuperValidationError(
      `Варіантів, чия ціна в типі «${def.title}» означала б інше (за 1 кг замість 1 г чи навпаки): ${n}. ` +
        'Ціна змінилася б у 1000 разів — спершу переведіть ці варіанти в іншу одиницю або залиште тип магазину.'
    );
  }
}

/**
 * Recompute every stored caption of a store under a new vertical.
 *
 * The attribute bags are left exactly as they are — a florist's `length_cm`
 * stays on the row even while the store is set to clothing, so moving back
 * restores the old captions verbatim. Keys the new vertical does not declare
 * simply do not appear in its label, which is why this reads `labelOf`
 * directly rather than going through `normalizeAttributes` (that one rejects
 * unknown keys, which is right on a write and wrong here).
 *
 * Returns how many rows it touched, for the log.
 */
async function relabelStoreVariants(
  client: Queryable,
  storeId: number,
  def: VerticalDefinition
): Promise<number> {
  const variants = await client.query(
    `SELECT id, attributes FROM pos_variants WHERE store_id = $1`,
    [storeId]
  );
  if (variants.rows.length > 0) {
    const ids = variants.rows.map((row) => Number(row.id));
    const labels = variants.rows.map((row) =>
      def.labelOf((row.attributes as AttributeValues | null) ?? {})
    );
    await client.query(
      `UPDATE pos_variants v
          SET label = x.label, updated_at = NOW()
         FROM unnest($1::bigint[], $2::text[]) AS x(id, label)
        WHERE v.id = x.id AND v.label IS DISTINCT FROM x.label`,
      [ids, labels]
    );
  }

  // Draft receipts carry captions of products that do not exist yet.
  const placeholders = await client.query(
    `SELECT l.id, l.placeholder_attributes
       FROM pos_stock_document_lines l
       JOIN pos_stock_documents d ON d.id = l.document_id
      WHERE l.store_id = $1 AND l.is_placeholder = TRUE AND d.status = 'draft'`,
    [storeId]
  );
  if (placeholders.rows.length > 0) {
    const ids = placeholders.rows.map((row) => Number(row.id));
    const labels = placeholders.rows.map((row) =>
      def.labelOf((row.placeholder_attributes as AttributeValues | null) ?? {})
    );
    await client.query(
      `UPDATE pos_stock_document_lines l
          SET placeholder_label = x.label
         FROM unnest($1::bigint[], $2::text[]) AS x(id, label)
        WHERE l.id = x.id AND l.placeholder_label IS DISTINCT FROM x.label`,
      [ids, labels]
    );
  }

  return variants.rows.length;
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

/**
 * The store code a till types at login. Lower case only: `loginWithPin`
 * lower-cases what the cashier typed and then compares it exactly, so a code
 * with a capital letter could never be entered with a PIN.
 */
const STORE_SLUG_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const MIN_OWNER_PASSWORD = 10;

export interface CreateStoreInput {
  name?: unknown;
  slug?: unknown;
  /** A store whose configuration — vertical, modules, module remotes, menu look — the new one starts from. */
  template_store_id?: unknown;
  owner_login?: unknown;
  owner_password?: unknown;
  owner_name?: unknown;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A real store for a new client (TechDocs/POS_ONBOARDING.md, O1): the store
 * row, its owner and — when the template seats guests — an empty hall the
 * owner draws tables into. From a template it copies only configuration
 * (vertical, enabled modules, module remotes, menu overrides, currency and
 * time zone): never a catalogue, staff, the QR-menu token, ПРРО or the
 * public profile — those are the client's own.
 *
 * The password is typed by the super admin and only ever leaves here hashed:
 * it is not logged and not returned.
 */
export async function createStore(input: CreateStoreInput): Promise<SuperStoreRow> {
  const name = text(input.name);
  if (name.length < 1 || name.length > 120) {
    throw new SuperValidationError('Назва магазину — від 1 до 120 символів');
  }
  const slug = text(input.slug).toLowerCase();
  if (!STORE_SLUG_RE.test(slug)) {
    throw new SuperValidationError(
      'Код магазину — від 3 до 41 символу: латинські малі літери, цифри й дефіс, на початку літера чи цифра'
    );
  }
  const login = text(input.owner_login);
  if (login.length < 3 || login.length > 120 || /\s/.test(login)) {
    throw new SuperValidationError('Логін власника — email або слово без пробілів, від 3 до 120 символів');
  }
  const password = typeof input.owner_password === 'string' ? input.owner_password : '';
  if (password.length < MIN_OWNER_PASSWORD || password.length > 200) {
    throw new SuperValidationError(`Пароль власника — щонайменше ${MIN_OWNER_PASSWORD} символів`);
  }
  const ownerName = text(input.owner_name).slice(0, 80) || 'Власник';
  let templateId: number | null = null;
  if (input.template_store_id != null && input.template_store_id !== '') {
    templateId = Number(input.template_store_id);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      throw new SuperValidationError('Шаблон — це id магазину');
    }
  }
  const passwordHash = await hashPassword(password);

  const client = await pool.connect();
  let storeId: number;
  try {
    await client.query('BEGIN');
    const taken = await client.query(`SELECT 1 FROM pos_stores WHERE lower(slug) = $1`, [slug]);
    if (taken.rows.length) throw new SuperConflictError(`Код «${slug}» уже зайнятий`);

    let inserted;
    if (templateId != null) {
      inserted = await client.query(
        `INSERT INTO pos_stores (name, slug, currency, timezone, vertical, enabled_modules, module_remotes, nav_overrides)
         SELECT $1, $2, t.currency, t.timezone, t.vertical, t.enabled_modules, t.module_remotes, t.nav_overrides
           FROM pos_stores t WHERE t.id = $3
         RETURNING id, module_remotes`,
        [name, slug, templateId]
      );
      if (!inserted.rows.length) throw new SuperValidationError('Шаблон не знайдено');
    } else {
      inserted = await client.query(
        `INSERT INTO pos_stores (name, slug) VALUES ($1, $2) RETURNING id, module_remotes`,
        [name, slug]
      );
    }
    storeId = Number(inserted.rows[0].id);

    await client.query(
      `INSERT INTO pos_staff (store_id, role, display_name, login, password_hash)
       VALUES ($1, 'owner', $2, $3, $4)`,
      [storeId, ownerName, login, passwordHash]
    );

    // The restaurant switch is the `tables` module's presence (POS_TABLES.md):
    // give it the one hall the floor-plan editor needs, with no tables in it —
    // only the owner knows how many there are.
    const remotes = (inserted.rows[0].module_remotes ?? {}) as Record<string, unknown>;
    if ('tables' in remotes) {
      await client.query(`INSERT INTO pos_halls (store_id, name, sort_order, is_active) VALUES ($1, 'Зала', 0, TRUE)`, [
        storeId,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // Two super admins racing for one code: the UNIQUE index answers.
    if ((error as { code?: string }).code === '23505') throw new SuperConflictError(`Код «${slug}» уже зайнятий`);
    throw error;
  } finally {
    client.release();
  }

  logger.info('pos super: store created', { storeId, slug, templateId });
  const row = await getStore(storeId);
  if (!row) throw new Error(`store ${storeId} vanished after creation`);
  return row;
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
