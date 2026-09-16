// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Per-store menu appearance: the label, icon and position a store owner gave a
 * module's navigation entry (`store.nav_overrides`, edited on `/admin/appearance`).
 * Mirrors the backend `src/pos/core/nav.ts` — keep the key format and the limits
 * in sync. See TechDocs/POS_NAV_CUSTOMIZATION.md.
 *
 * Two properties this file exists to hold:
 *
 *  1. **Sparse.** An override carries only the fields the owner actually
 *     changed. A module that later renames its entry, moves it or ships a new
 *     icon still reaches a store that had only reordered its menu.
 *  2. **Inert when it misses.** A key naming a module or a route that is gone
 *     matches nothing and changes nothing — no migration, no cleanup, no broken
 *     menu. The same holds the other way round: an entry with no override keeps
 *     exactly the values its module declared.
 *
 * Pure — no React, no store — so both {@link selectNavItems} and the editor can
 * use it, and so it can be unit-tested on its own.
 */

import type { NavOverride, NavOverrides } from '../types';
import type { AnyModuleDescriptor } from './registry';
import type { ModuleId, NavCtx, NavItem, NavLocation, NavVariant } from './types';

export type { NavOverride, NavOverrides };

/** A label is a menu entry — short by construction. Mirrors backend `NAV_LABEL_MAX`. */
export const NAV_LABEL_MAX = 40;

/**
 * The identity of a nav entry across builds: `<moduleId>:<location>:<path>`.
 *
 * The module and the route are what make an entry itself. The location is in
 * the key because one module legitimately puts the *same* route in two menus
 * under different labels — `products` shows «Товари» both in the admin sidebar
 * and (for a web owner) in the cashier rail, and renaming one must not rename
 * the other.
 *
 * Not in the key: `visible`. Two entries of one module that differ only by who
 * sees them (`returns` shows `/admin/sales` to a web owner and `/sales` to
 * everyone else) already differ by path, so they are separately customisable.
 */
export function navItemKey(moduleId: string, item: Pick<NavItem, 'to' | 'location'>): string {
  return `${moduleId}:${item.location}:${item.to}`;
}

/**
 * One entry with its store override folded in. `undefined` fields of the
 * override are skipped, not written as `undefined` — this result is what the
 * rail renders, and an `icon: undefined` would blank the glyph out.
 */
export function applyNavOverride(item: NavItem, override: NavOverride | undefined): NavItem {
  if (!override) return item;
  const next = { ...item };
  if (override.label) next.label = override.label;
  if (override.icon) next.icon = override.icon;
  if (override.order !== undefined) next.order = override.order;
  return next;
}

/** Drop the fields that match the module's own values, and empty entries with them. */
export function pruneNavOverrides(
  overrides: NavOverrides,
  defaults: ReadonlyMap<string, NavItem>
): NavOverrides {
  const out: NavOverrides = {};
  for (const [key, override] of Object.entries(overrides)) {
    const base = defaults.get(key);
    const entry: NavOverride = {};
    if (override.label && override.label !== base?.label) entry.label = override.label;
    if (override.icon && override.icon !== base?.icon) entry.icon = override.icon;
    if (override.order !== undefined && override.order !== base?.order) {
      entry.order = override.order;
    }
    if (Object.keys(entry).length > 0) out[key] = entry;
  }
  return out;
}

/** Every shell/role/variant combination an entry's `visible()` is asked about. */
const NAV_CONTEXTS: NavCtx[] = (['web', 'cashier'] as const).flatMap((shell) =>
  (['owner', 'seller'] as const).flatMap((role) =>
    (['rail', 'bottom'] as const).map<NavCtx>((variant) => ({ shell, role, variant }))
  )
);

/**
 * Where an entry actually shows up, as booleans the editor turns into a hint.
 * Only ever *narrower* than "everywhere": an entry with no `visible()` yields
 * all-false, which the editor renders as no hint at all.
 */
export interface NavEntryScope {
  ownerOnly: boolean;
  /** Shows in exactly one shell — the web app or the desktop till. */
  shellOnly: 'web' | 'cashier' | null;
  /** Shows in exactly one cashier variant — the side rail or the phone bottom bar. */
  variantOnly: NavVariant | null;
}

/** One customisable menu entry, as the editor sees it. */
export interface NavCatalogEntry {
  key: string;
  moduleId: string;
  moduleTitle: string;
  /** The entry exactly as its module declares it — what «restore default» restores. */
  item: NavItem;
  scope: NavEntryScope;
}

function describeScope(module: AnyModuleDescriptor, item: NavItem): NavEntryScope {
  const shells = new Set(module.shells);
  const visible = NAV_CONTEXTS.filter(
    (ctx) => shells.has(ctx.shell) && (!item.visible || item.visible(ctx))
  );
  const seen = <K extends keyof NavCtx>(field: K): Set<NavCtx[K]> =>
    new Set(visible.map((ctx) => ctx[field]));

  const roles = seen('role');
  const shellsSeen = seen('shell');
  const variants = seen('variant');
  return {
    ownerOnly: Boolean(module.ownerOnly) || (roles.size === 1 && roles.has('owner')),
    shellOnly: shellsSeen.size === 1 ? ([...shellsSeen][0] ?? null) : null,
    variantOnly:
      item.location === 'cashier-primary' && variants.size === 1
        ? ([...variants][0] ?? null)
        : null,
  };
}

/**
 * Every entry of one menu that a store could customise — all of them, not just
 * the ones the current viewer happens to see. The editor is a *store* setting:
 * an owner configuring the till from a laptop must be able to rename an entry
 * only their sellers ever see, so this deliberately ignores `NavCtx` where
 * {@link selectNavItems} applies it, and reports the difference as `scope`.
 *
 * Sorted the way the menu will be, overrides included, so the editor's list and
 * its live preview cannot disagree.
 */
export function collectNavEntries(
  modules: readonly AnyModuleDescriptor[],
  enabled: ReadonlySet<ModuleId>,
  location: NavLocation,
  overrides: NavOverrides = {}
): NavCatalogEntry[] {
  return modules
    .filter((m) => ('alwaysEnabled' in m && m.alwaysEnabled) || enabled.has(m.id as ModuleId))
    .flatMap((m) =>
      m.nav
        .filter((item) => item.location === location)
        .map((item) => ({
          key: navItemKey(m.id, item),
          moduleId: m.id,
          moduleTitle: m.title,
          item,
          scope: describeScope(m, item),
        }))
    )
    .sort(
      (a, b) =>
        (overrides[a.key]?.order ?? a.item.order) - (overrides[b.key]?.order ?? b.item.order)
    );
}
