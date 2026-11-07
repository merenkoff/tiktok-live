// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Who sees which module, page and menu entry (track МР, TechDocs/POS_MARKETER_ROLE.md).
//
// The owner and the seller keep the rule they always had: `ownerOnly` on the
// module, `visible()` on an entry. The marketer is the other way round, as on
// the server (`src/pos/core/roles.ts`): it sees a page or an entry only where
// that page or entry NAMES it in `roles`, and a module only while one of its
// pages does. So a remote bundle published before the role existed, a new
// module, a new page — none of them reaches the marketer until someone says so.

import type { PosRole } from '../types';
import type { NavItem, RouteDef } from './types';
import type { AnyModuleDescriptor } from './registry';

type Roled = { roles?: readonly PosRole[] };

/** Whether `role` passes a page's or an entry's own `roles`, the module's rule aside. */
function namesRole(item: Roled, role: PosRole | null): boolean {
  if (role === 'marketer') return item.roles?.includes('marketer') === true;
  return !item.roles || (role !== null && item.roles.includes(role));
}

/** Whether `role` may have this module at all. */
export function moduleOpenTo(m: AnyModuleDescriptor, role: PosRole | null): boolean {
  if (role === 'marketer') {
    return m.routes.some((r) => namesRole(r, role)) || m.nav.some((n) => namesRole(n, role));
  }
  return !m.ownerOnly || role === 'owner';
}

/** Whether `role` may open this page of the module. */
export function routeOpenTo(m: AnyModuleDescriptor, r: RouteDef, role: PosRole | null): boolean {
  return moduleOpenTo(m, role) && namesRole(r, role);
}

/** Whether `role` sees this menu entry of the module (`visible()` is asked separately). */
export function navOpenTo(m: AnyModuleDescriptor, n: NavItem, role: PosRole | null): boolean {
  return moduleOpenTo(m, role) && namesRole(n, role);
}

/** Whether this role works in the cabinet (`/admin`) at all. */
export function usesCabinet(role: PosRole | null): boolean {
  return role === 'owner' || role === 'marketer';
}
