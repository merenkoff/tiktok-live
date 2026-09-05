// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';

/**
 * The POS UI is assembled from independently-toggleable modules. A store owner
 * enables/disables modules in Settings; the enabled set drives which routes are
 * mounted, which nav entries show, and which API groups the backend serves.
 *
 * `core` modules can never be turned off. Every other id is stored per-store in
 * `pos_stores.enabled_modules` (see backend `ensureModule`).
 */
export type ModuleId =
  | 'catalog-checkout'
  | 'returns'
  | 'customers'
  | 'products'
  | 'stock'
  | 'analytics'
  | 'staff'
  | 'settings'
  | 'gtin-enrichment'
  | 'qr-payment'
  | 'hardware'
  | 'live-selling';

export type RouteMount = 'root' | 'admin';

export interface RouteDef {
  /** Path relative to the mount. Omit when `index` is true. */
  path?: string;
  /** Index route of its mount (only meaningful for `mount: 'admin'`). */
  index?: boolean;
  /** `root` = top-level route; `admin` = child of the `/admin` layout. Default `root`. */
  mount?: RouteMount;
  /** Skip the `<Suspense>` wrapper — for landing screens that must not flash. */
  eager?: boolean;
  // Real props travel in `props`; the registry is not the place to re-type every page.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  /** Static props passed to `element` (e.g. `{ cashierShell: true }`, `{ type: 'receipt' }`). */
  props?: Record<string, unknown>;
}

export type NavLocation = 'admin-sidebar' | 'cashier-primary';
export type NavVariant = 'rail' | 'bottom';

export interface NavCtx {
  shell: PosShell;
  role: PosRole | null;
  /** Set for `cashier-primary` — lets an item show only in the rail or only in the bottom bar. */
  variant?: NavVariant;
}

export interface NavItem {
  to: string;
  label: string;
  icon?: LucideIcon;
  location: NavLocation;
  /** Sort key within a location. */
  order: number;
  /** Active-state path prefix; defaults to `to`. */
  match?: string;
  /** NavLink `end` (exact match) — used by the admin sidebar index item. */
  end?: boolean;
  /** Extra visual state: `'update'` shows the amber "update available" dot (rail only). */
  indicator?: 'update';
  visible?: (ctx: NavCtx) => boolean;
}

export interface ModuleDescriptor {
  id: ModuleId;
  /** Shown in the Settings "Модулі магазину" checklist. */
  title: string;
  /**
   * Build version of the code behind this descriptor. Stamped at registration
   * (`registry.ts`): bundled modules inherit `POS_APP_VERSION`; a runtime-loaded
   * remote carries its own build's version via `remote-entry.ts`. Surfaced in
   * the `session_manifest` telemetry event (roadmap #6).
   */
  version?: string;
  /** Cannot be disabled anywhere. */
  core?: boolean;
  /** Cannot be disabled when running in this shell (e.g. `hardware` on the cashier). */
  coreInShell?: PosShell;
  /** Part of the default-on set for a store that has never configured modules. */
  defaultEnabled?: boolean;
  requires?: ModuleId[];
  shells: PosShell[];
  /** All of this module's surface is owner-only (filters nav + route inclusion). */
  ownerOnly?: boolean;
  routes: RouteDef[];
  nav: NavItem[];
}
