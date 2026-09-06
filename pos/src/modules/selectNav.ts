// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleId, NavCtx, NavItem, NavLocation } from './types';
import type { AnyModuleDescriptor } from './registry';

/**
 * The nav entries a given shell/role/variant should see, in display order:
 * keep enabled modules available in this shell (owner-only ones for owners;
 * online-only remote modules are `alwaysEnabled` — being in `module_remotes`
 * is the opt-in), take their entries for this location, apply per-item
 * `visible()`, sort by `order`. The single place this filtering lives —
 * {@link Nav} only renders.
 */
export function selectNavItems(
  modules: readonly AnyModuleDescriptor[],
  enabled: ReadonlySet<ModuleId>,
  ctx: NavCtx,
  location: NavLocation
): NavItem[] {
  return modules
    .filter(
      (m) =>
        (('alwaysEnabled' in m && m.alwaysEnabled) || enabled.has(m.id as ModuleId)) &&
        m.shells.includes(ctx.shell) &&
        (!m.ownerOnly || ctx.role === 'owner')
    )
    .flatMap((m) => m.nav)
    .filter((n) => n.location === location && (!n.visible || n.visible(ctx)))
    .sort((a, b) => a.order - b.order);
}
