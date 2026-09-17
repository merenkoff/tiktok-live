// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/modules.ts
// Per-store feature-module gating. Mirrors the frontend registry
// (pos/src/modules/constants.ts) — keep the two id lists in sync.

import { NAV_LOCATIONS, type NavLocation } from './nav.js';

/**
 * Client module id prefix for a sales vertical: `vertical-clothing` is bundled
 * and core, every other one arrives as an online-only `module_remotes` entry.
 * Kept here because both the remote guard and the client registry key off it.
 */
export const VERTICAL_MODULE_PREFIX = 'vertical-';

/**
 * The one vertical module that ships inside the app. It is the sell screen's
 * fallback catalog, so it is never downloaded and never overridden.
 */
export const BUNDLED_VERTICAL_MODULE_ID = 'vertical-clothing';

/** Always available — never stored in `pos_stores.enabled_modules`, never toggleable. */
export const CORE_MODULE_IDS = [
  'catalog-checkout',
  'settings',
  'hardware',
  // The bundled clothing catalog — the sell screen's fallback. Listing it here
  // is also what stops it being stored in `module_remotes` or `enabled_modules`.
  BUNDLED_VERTICAL_MODULE_ID,
] as const;

/**
 * The set a store gets when `enabled_modules` is empty ("never configured").
 * Matches the `015_pos_store_modules.sql` backfill.
 */
export const DEFAULT_ENABLED_MODULES = [
  'returns',
  'customers',
  'products',
  'stock',
  'analytics',
  'staff',
  'gtin-enrichment',
  'qr-payment',
] as const;


/** Every id that may legitimately appear in `enabled_modules` (excludes core). */
export const TOGGLEABLE_MODULE_IDS = [...DEFAULT_ENABLED_MODULES, 'live-selling'] as const;

const CORE_SET: ReadonlySet<string> = new Set(CORE_MODULE_IDS);
const TOGGLEABLE_SET: ReadonlySet<string> = new Set(TOGGLEABLE_MODULE_IDS);

export function isCoreModuleId(id: string): boolean {
  return CORE_SET.has(id);
}

export function isKnownToggleableModuleId(id: string): boolean {
  return TOGGLEABLE_SET.has(id);
}

/** Resolve the effective enabled set for a store (empty stored set → defaults). */
export function effectiveEnabledModules(stored: string[] | null | undefined): string[] {
  return stored && stored.length > 0 ? stored : [...DEFAULT_ENABLED_MODULES];
}

/** Is `moduleId` available for a store with this stored `enabled_modules`? */
export function isModuleEnabled(stored: string[] | null | undefined, moduleId: string): boolean {
  if (isCoreModuleId(moduleId)) return true;
  return effectiveEnabledModules(stored).includes(moduleId);
}

/**
 * Keep only real, non-core module ids from a client-supplied list, de-duplicated.
 * Unknown ids are dropped silently; core ids are never persisted.
 */
export function sanitizeEnabledModules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (isKnownToggleableModuleId(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * A URL a store owner may register as a module-remote source (roadmap #9).
 * Deliberately narrow: `https://…`, a root-relative `/…` path (served from the
 * same origin as the web app), or `http://localhost` / `http://127.0.0.1` for
 * local development. Everything else (plain `http://`, `data:`, protocol-relative
 * `//host`, junk) is rejected.
 */
export function isAllowedRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  if (url.startsWith('https://')) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return true;
  return false;
}

interface ModuleRemoteNavEntry {
  label: string;
  location: NavLocation;
  order: number;
  match?: string;
  /** lucide export name the client resolves host-side (roadmap #13 Part D). */
  icon?: string;
}

/**
 * A lucide export name — shape only. Which names a given client build actually
 * ships is the client's business (`resolveNavIcon` falls back), so this only
 * keeps junk/markup out of the stored settings.
 */
function sanitizeIconName(value: unknown): string | undefined {
  const icon = clampStr(value, 40);
  return icon && /^[A-Za-z0-9]+$/.test(icon) ? icon : undefined;
}

/**
 * The object form of a `module_remotes` value (roadmap #13 Part C): a **new
 * online-only module** the desktop cashier downloads and runs, one it doesn't
 * ship code for. It must self-describe enough to render a nav entry + a route
 * before its full descriptor is available (cold offline first run). The bare
 * string form still means "override a bundled module's code" (roadmap #9).
 */
export interface ModuleRemoteEntry {
  url: string;
  title: string;
  routePath: string;
  nav: ModuleRemoteNavEntry[];
  /** Default lucide export name for nav entries that don't name their own. */
  icon?: string;
}

/** New online-only module id: kebab-case, and NOT a core / known-toggleable id. */
function isOnlineOnlyModuleId(id: string): boolean {
  return (
    /^[a-z][a-z0-9-]{1,40}$/.test(id) && !isCoreModuleId(id) && !isKnownToggleableModuleId(id)
  );
}

function clampStr(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function sanitizeRemoteNav(input: unknown): ModuleRemoteNavEntry[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 8) return null;
  const out: ModuleRemoteNavEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const label = clampStr(r.label, 40);
    const order = r.order;
    if (!label) return null;
    if (typeof order !== 'number' || !Number.isInteger(order)) return null;
    if (!NAV_LOCATIONS.includes(r.location as NavLocation)) return null;
    const entry: ModuleRemoteNavEntry = { label, location: r.location as NavLocation, order };
    const match = clampStr(r.match, 200);
    if (match) entry.match = match;
    const icon = sanitizeIconName(r.icon);
    if (icon) entry.icon = icon;
    out.push(entry);
  }
  return out;
}

/** One object-form `module_remotes` value → a clean `ModuleRemoteEntry`, or null. */
function sanitizeModuleRemoteEntry(input: unknown): ModuleRemoteEntry | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;
  if (!isAllowedRemoteUrl(r.url)) return null;
  const title = clampStr(r.title, 80);
  const routePath = clampStr(r.routePath, 120);
  if (!title || !routePath || !/^\/[a-z0-9][a-z0-9/-]*$/.test(routePath)) return null;
  const nav = sanitizeRemoteNav(r.nav);
  if (!nav) return null;
  const entry: ModuleRemoteEntry = { url: r.url.trim(), title, routePath, nav };
  const icon = sanitizeIconName(r.icon);
  if (icon) entry.icon = icon;
  return entry;
}

/**
 * Keep only valid `module_remotes` entries, dropping anything malformed:
 *   - string value → override a bundled module (known non-core id + allowed URL);
 *   - object value → a new online-only module (roadmap #13 Part C): arbitrary
 *     kebab-case id that isn't a core / bundled-toggleable id, self-describing
 *     via `ModuleRemoteEntry`.
 * Non-object input → `{}`.
 */
export function sanitizeModuleRemotes(
  input: unknown
): Record<string, string | ModuleRemoteEntry> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, string | ModuleRemoteEntry> = {};
  for (const [rawId, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const id = rawId.trim();
    if (typeof rawValue === 'string') {
      if (isKnownToggleableModuleId(id) && isAllowedRemoteUrl(rawValue)) {
        out[id] = rawValue.trim();
      }
      continue;
    }
    if (!isOnlineOnlyModuleId(id)) continue;
    const entry = sanitizeModuleRemoteEntry(rawValue);
    if (entry) out[id] = entry;
  }
  return out;
}

/**
 * A `module_remotes` map that cannot be coherent: two bundles claiming the same
 * role, or one that disagrees with the store column it must follow.
 *
 * Both callers (`PATCH /store`, `PATCH /super/stores/:id`) catch this base class
 * and answer 400, so a new single-slot guard needs no new catch site.
 */
export class ModuleRemoteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleRemoteConflictError';
  }
}

/**
 * A store's `module_remotes` names more than one ПРРО provider bundle, or one
 * that disagrees with `pos_fiscal_settings.provider`.
 *
 * Thrown by `assertSingleFiscalRemote`, mapped to 400 by the caller.
 */
export class FiscalRemoteConflictError extends ModuleRemoteConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalRemoteConflictError';
  }
}

/**
 * A store's `module_remotes` names more than one sales-vertical bundle, or one
 * that disagrees with `pos_stores.vertical`.
 *
 * Thrown by `assertSingleVerticalRemote`, mapped to 400 by the caller.
 */
export class VerticalRemoteConflictError extends ModuleRemoteConflictError {
  constructor(message: string) {
    super(message);
    this.name = 'VerticalRemoteConflictError';
  }
}

/**
 * At most one `fiscal-*` entry may exist, and it must name the provider the
 * store is actually configured for.
 *
 * Without this, the desktop cache — keyed on moduleId + semver, only
 * downloads strictly newer — would let a second `fiscal-*` entry sit there
 * doing nothing, or two competing entries resolve their route collision
 * silently by array order in `renderRoutes.tsx` (TechDocs/POS_FISCAL_PRRO.md
 * §11.4). `configuredProvider` is `pos_fiscal_settings.provider` for this
 * store, or null when fiscalisation has never been configured — a null
 * provider does not conflict with anything, since the owner may add the
 * module remote before saving the provider selection, or the other way round.
 */
export function assertSingleFiscalRemote(
  remotes: Record<string, string | ModuleRemoteEntry>,
  configuredProvider: string | null
): void {
  const fiscalIds = Object.keys(remotes).filter((id) => id.startsWith('fiscal-'));
  if (fiscalIds.length > 1) {
    throw new FiscalRemoteConflictError(
      `Only one fiscal-* module remote is allowed, got: ${fiscalIds.join(', ')}`
    );
  }
  if (fiscalIds.length === 1 && configuredProvider) {
    const provider = fiscalIds[0].slice('fiscal-'.length);
    if (provider !== configuredProvider) {
      throw new FiscalRemoteConflictError(
        `Module remote "${fiscalIds[0]}" does not match the configured ПРРО provider "${configuredProvider}"`
      );
    }
  }
}

/**
 * At most one `vertical-*` entry may exist, and it must be the vertical the
 * store is actually set to (`pos_stores.vertical`).
 *
 * Two of them would collide the same way two `fiscal-*` bundles do — the
 * desktop cache is keyed on moduleId + semver, and nothing warns when two
 * modules both claim the sell screen. Pointing at a vertical the store is not
 * set to is worse than useless: the sell screen resolves `vertical-<column>`
 * and would silently ignore the downloaded module, so the owner would see a
 * module that does nothing.
 *
 * The bundled clothing catalog is rejected outright: it is the cold-start
 * fallback the sell screen falls back to when a remote vertical is missing,
 * pending or broken, so replacing it over the wire would remove the very thing
 * that guarantees a till can always sell.
 */
export function assertSingleVerticalRemote(
  remotes: Record<string, string | ModuleRemoteEntry>,
  vertical: string | null | undefined
): void {
  const verticalIds = Object.keys(remotes).filter((id) => id.startsWith(VERTICAL_MODULE_PREFIX));
  if (verticalIds.includes(BUNDLED_VERTICAL_MODULE_ID)) {
    throw new VerticalRemoteConflictError(
      `"${BUNDLED_VERTICAL_MODULE_ID}" ships with the app and cannot be loaded from a URL`
    );
  }
  if (verticalIds.length > 1) {
    throw new VerticalRemoteConflictError(
      `Only one vertical-* module remote is allowed, got: ${verticalIds.join(', ')}`
    );
  }
  if (verticalIds.length === 1) {
    const wanted = `${VERTICAL_MODULE_PREFIX}${vertical ?? ''}`;
    if (verticalIds[0] !== wanted) {
      throw new VerticalRemoteConflictError(
        `Module remote "${verticalIds[0]}" does not match the store's sales vertical "${vertical ?? ''}"`
      );
    }
  }
}
