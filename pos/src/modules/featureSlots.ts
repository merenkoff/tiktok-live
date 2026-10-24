// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What modules add to screens the host owns (phase Г2,
 * TechDocs/grocery/PLAN.md §4).
 *
 * Until Г2 every host slot belonged to the store's vertical alone
 * (`verticals.ts`): a debt journal or a scale integration had a route and a
 * nav entry and nowhere else to be. The owner's decision of 2026-10-24 makes
 * such features modules of their own, so the host now asks every loaded
 * module — the store's vertical first, because it was the only one before and
 * a florist's settings card must not move down the page.
 *
 * Which modules count is the question the nav already answers
 * (`selectNav.ts`):
 *  - an online-only remote is in this boot only because the store's
 *    `module_remotes` names it, so it counts — unless it is a `pending`
 *    placeholder with no code behind it yet;
 *  - a bundled module counts only while the store has it enabled;
 *  - either one only in a shell it runs in, and an owner-only one only for the
 *    owner;
 *  - a `vertical-*` module other than the store's own never: a stale second
 *    vertical remote must not hang its panels on a shop of another kind. The
 *    store's own vertical keeps the rule `verticals.ts` always had for it — no
 *    shell or role check — so nothing it drew before moves or disappears.
 *
 * No fallback, unlike `resolveSalesCatalog`: the sell screen must always end
 * up with a catalog, while a host screen must be able to end up with nothing
 * added to it — which is what a clothing shop and a shop whose CDN is down
 * should both see.
 */

import { useMemo } from 'react';
// The session, the shell and the enabled set through the barrel: this file is
// host code, and a relative import would read a second copy of each store
// (`scripts/check-platform-boundary.mjs`).
import { useAuthStore, useEnabledModules, usePosShell } from '@pos/platform';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';
import { allModules, type AnyModuleDescriptor } from './registry';
import { runsInShell } from './shells';
import type {
  ModuleAnalyticsSlot,
  ModuleCheckoutSlot,
  ModuleCustomerSlot,
  ModuleId,
  ModuleSettingsSlot,
  ModuleStation,
} from './types';
import { VERTICAL_MODULE_PREFIX, verticalModuleId } from './verticals';

interface SlotValues {
  'checkout.Action': ModuleCheckoutSlot['Action'];
  'customer.Panel': ModuleCustomerSlot['Panel'];
  'settings.Card': ModuleSettingsSlot['Card'];
  'analytics.Panels': ModuleAnalyticsSlot['Panels'];
  'hardware.stations': ModuleStation[];
}

export type ModuleSlotName = keyof SlotValues;

const PICKERS: { [K in ModuleSlotName]: (m: AnyModuleDescriptor) => SlotValues[K] | undefined } = {
  'checkout.Action': (m) => m.checkout?.Action,
  'customer.Panel': (m) => m.customer?.Panel,
  'settings.Card': (m) => m.settings?.Card,
  'analytics.Panels': (m) => m.analytics?.Panels,
  'hardware.stations': (m) => (m.hardware?.stations?.length ? m.hardware.stations : undefined),
};

export interface ModuleSlotContext {
  vertical: string | undefined;
  shell: PosShell;
  role: PosRole | null;
  enabled: ReadonlySet<ModuleId>;
}

export interface ResolvedModuleSlot<T> {
  value: T;
  moduleId: string;
}

function isRemote(m: AnyModuleDescriptor): boolean {
  return 'alwaysEnabled' in m && m.alwaysEnabled === true;
}

/** Every module that fills `slot` for this store, shell and role — the vertical first. */
export function resolveModuleSlots<K extends ModuleSlotName>(
  slot: K,
  ctx: ModuleSlotContext,
  modules: AnyModuleDescriptor[] = allModules()
): ResolvedModuleSlot<SlotValues[K]>[] {
  const pick = PICKERS[slot];
  const own = verticalModuleId(ctx.vertical);
  const seen = new Set<string>();
  let vertical: ResolvedModuleSlot<SlotValues[K]> | null = null;
  const rest: ResolvedModuleSlot<SlotValues[K]>[] = [];

  for (const m of modules) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    if ('pending' in m && m.pending) continue;

    const isVertical = m.id.startsWith(VERTICAL_MODULE_PREFIX);
    if (isVertical && m.id !== own) continue;
    if (!isVertical) {
      if (!runsInShell(m, ctx.shell)) continue;
      if (m.ownerOnly && ctx.role !== 'owner') continue;
      if (!isRemote(m) && !ctx.enabled.has(m.id as ModuleId)) continue;
    }

    const value = pick(m);
    if (!value) continue;
    if (isVertical) vertical = { value, moduleId: m.id };
    else rest.push({ value, moduleId: m.id });
  }

  return vertical ? [vertical, ...rest] : rest;
}

/** `resolveModuleSlots` for the signed-in store, this shell and this role. */
export function useModuleSlots<K extends ModuleSlotName>(slot: K): ResolvedModuleSlot<SlotValues[K]>[] {
  const shell = usePosShell();
  const role = useAuthStore((s) => s.auth?.staff.role ?? null);
  const vertical = useAuthStore((s) => s.auth?.store.vertical?.id);
  const enabled = useEnabledModules();
  return useMemo(
    () => resolveModuleSlots(slot, { vertical, shell, role, enabled }),
    [slot, vertical, shell, role, enabled]
  );
}
