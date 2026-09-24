// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleId, NavCtx, NavItem, NavLocation } from './types';
import type { AnyModuleDescriptor } from './registry';
import { applyNavOverride, navItemKey, type NavOverrides } from './navOverrides';
import { runsInShell } from './shells';
import { navGroupOf } from './navGroups';

/**
 * The nav entries a given shell/role/variant should see, in display order:
 * keep enabled modules available in this shell (owner-only ones for owners;
 * online-only remote modules are `alwaysEnabled` — being in `module_remotes`
 * is the opt-in), take their entries for this location, apply per-item
 * `visible()`, fold in the store's appearance overrides, sort by `order`.
 * The single place this filtering lives — {@link Nav} only renders.
 *
 * `overrides` is the store's «Вигляд меню» setting (`store.nav_overrides`). It
 * is applied *after* filtering and only ever changes how an entry looks and
 * where it sits: which entries exist at all is the module set's business, so a
 * stale or hostile override cannot add a menu item or take one away. The sort
 * is stable, so entries the owner never reordered keep registry order among
 * equal `order` values, exactly as before.
 */
export function selectNavItems(
  modules: readonly AnyModuleDescriptor[],
  enabled: ReadonlySet<ModuleId>,
  ctx: NavCtx,
  location: NavLocation,
  overrides: NavOverrides = {}
): NavItem[] {
  return modules
    .filter(
      (m) =>
        (('alwaysEnabled' in m && m.alwaysEnabled) || enabled.has(m.id as ModuleId)) &&
        runsInShell(m, ctx.shell) &&
        (!m.ownerOnly || ctx.role === 'owner')
    )
    .flatMap((m) =>
      m.nav
        .filter((n) => n.location === location && (!n.visible || n.visible(ctx)))
        .map((n) => ({ ...applyNavOverride(n, overrides[navItemKey(m.id, n)]), group: navGroupOf(m.id, n.group) }))
    )
    .sort((a, b) => a.order - b.order);
}
