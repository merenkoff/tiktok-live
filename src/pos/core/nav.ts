// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/nav.ts
// Per-store menu appearance (`pos_stores.nav_overrides`): the label, icon and
// position the owner gave a module's navigation entry. Mirrors the frontend
// `pos/src/modules/navOverrides.ts` — keep the key format and the limits in
// sync. See TechDocs/POS_NAV_CUSTOMIZATION.md.

/** Where a module's nav entry sits. Mirrors frontend `NavLocation`. */
export const NAV_LOCATIONS = ['cashier-primary', 'admin-sidebar'] as const;
export type NavLocation = (typeof NAV_LOCATIONS)[number];

/**
 * One entry's override. Every field is optional and **absent means "keep the
 * module's own value"** — that is what lets a module rename or re-icon its
 * entry and have the change reach a store that only reordered the menu.
 */
export interface NavOverride {
  label?: string;
  /** lucide export name; the client falls back to a placeholder glyph. */
  icon?: string;
  order?: number;
}

export type NavOverrides = Record<string, NavOverride>;

/**
 * `<moduleId>:<location>:<path>` — the identity of a nav entry across builds.
 *
 * The module id and the route are what make an entry itself; the location is in
 * the key because one module legitimately puts the *same* route in two menus
 * with different labels (`products` → «Товари» in the sidebar and in the rail).
 */
export const NAV_OVERRIDE_KEY_RE =
  /^[a-z][a-z0-9-]{0,40}:(?:cashier-primary|admin-sidebar):\/[A-Za-z0-9/_.-]*$/;

/** A label is a menu entry — short by construction. Matches `ModuleRemoteEntry.nav[].label`. */
export const NAV_LABEL_MAX = 40;
/** Plenty for every menu of every module; a bigger map is junk, not configuration. */
export const NAV_OVERRIDES_MAX = 64;

function clampLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= NAV_LABEL_MAX ? trimmed : undefined;
}

/**
 * A lucide export name — shape only, same rule as `sanitizeIconName` in
 * `modules.ts`: which names a given client build ships is the client's
 * business (`resolveNavIcon` falls back), this only keeps junk out of the DB.
 */
function clampIcon(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 40 && /^[A-Za-z0-9]+$/.test(trimmed)
    ? trimmed
    : undefined;
}

function clampOrder(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value >= -10000 && value <= 10000 ? value : undefined;
}

/**
 * Keep only well-formed overrides, dropping anything malformed — a bad key, a
 * value that is not an object, a field that does not survive its clamp, and an
 * entry left with no fields at all (an empty object would be stored forever
 * while meaning exactly nothing).
 *
 * Deliberately lenient about *which* entry a key names: the set of nav entries
 * belongs to the client build, which the backend does not know and must not
 * have to know — a store may run a newer POS build, or an online-only module
 * the backend has never heard of. An override for an entry that does not exist
 * is inert on every client.
 */
export function sanitizeNavOverrides(input: unknown): NavOverrides {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: NavOverrides = {};
  let kept = 0;
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (kept >= NAV_OVERRIDES_MAX) break;
    const key = rawKey.trim();
    if (!NAV_OVERRIDE_KEY_RE.test(key)) continue;
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue;
    const r = rawValue as Record<string, unknown>;
    const entry: NavOverride = {};
    const label = clampLabel(r.label);
    if (label) entry.label = label;
    const icon = clampIcon(r.icon);
    if (icon) entry.icon = icon;
    const order = clampOrder(r.order);
    if (order !== undefined) entry.order = order;
    if (Object.keys(entry).length === 0) continue;
    out[key] = entry;
    kept += 1;
  }
  return out;
}
