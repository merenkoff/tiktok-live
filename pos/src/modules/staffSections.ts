// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The till's sections the owner closed for the person signed in
// (TechDocs/POS_STAFF_SECTIONS.md). A section is a module: closing it hides
// its menu entries, its pages and — for a feature module — its buttons in the
// cart, wherever the module set is filtered (`selectNavItems`,
// `renderModuleRoutes`, `resolveModuleSlots`). The server closes the actions
// of the sections it guards on its own (`src/pos/core/staffSections.ts`); this
// side is what the cashier sees.

import { useMemo } from 'react';
import { useAuthStore } from '@pos/platform';
import type { PosRole } from '../types';

/** The till itself — selling. Never closed. */
export const ALWAYS_OPEN_SECTION = 'catalog-checkout';

const NONE: ReadonlySet<string> = new Set();

/** Whether the owner closed module `moduleId` for this person. The owner is never limited. */
export function sectionClosedFor(
  moduleId: string,
  role: PosRole | null,
  blocked: ReadonlySet<string> | undefined
): boolean {
  if (!blocked || blocked.size === 0 || role === 'owner') return false;
  if (moduleId === ALWAYS_OPEN_SECTION) return false;
  return blocked.has(moduleId);
}

/** The signed-in person's closed sections; empty for the owner and for a login from an older server. */
export function useBlockedSections(): ReadonlySet<string> {
  const list = useAuthStore((s) => (s.auth?.staff.role === 'owner' ? undefined : s.auth?.staff.blocked_sections));
  return useMemo(() => (list && list.length > 0 ? new Set(list) : NONE), [list]);
}
