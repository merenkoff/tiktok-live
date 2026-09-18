// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';
// Direct import, not via '@pos/platform' — the barrel re-exports the module
// manifests, which import this file; `platform/icons.ts` is a leaf.
import type { NavIconName } from '../platform/icons';
import type { PosShell } from '../shell';
import type { PosRole } from '../types';
import type { ModuleOfflineHooks } from '../offline/moduleHooks';

export type { ModuleOfflineHooks };

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
  | 'vertical-clothing'
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
  /**
   * Preferred form is the **name** of a lucide icon (`'PackageCheck'`) — the
   * host resolves it via `resolveNavIcon` (roadmap #13 Part D), so a module
   * neither bundles icon components nor has to exist as code to have an icon
   * (an online-only module's placeholder gets one from `module_remotes`).
   * A `LucideIcon` component is still accepted. The `(string & {})` arm keeps
   * autocomplete on `NavIconName` while allowing a name from a newer catalogue.
   */
  icon?: NavIconName | (string & {}) | LucideIcon;
  location: NavLocation;
  /** Sort key within a location. */
  order: number;
  /** Active-state path prefix; defaults to `to`. */
  match?: string;
  /** NavLink `end` (exact match) — used by the admin sidebar index item. */
  end?: boolean;
  /**
   * Extra visual state:
   * - `'update'` — amber "update available" dot (rail only);
   * - `'pending'` — greyed "module not downloaded yet" (roadmap #13 Part C).
   */
  indicator?: 'update' | 'pending';
  visible?: (ctx: NavCtx) => boolean;
}

export interface SalesCatalogProps {
  /**
   * False while the frame's payment modal, mobile cart or success screen owns
   * the screen. The catalog releases the scanner focus and stops reacting to
   * wedge input — a scan landing behind an opaque modal rings up an item
   * nobody can see.
   */
  active: boolean;
  /**
   * Bumped by the frame after every completed sale, every kept-but-unfiscalised
   * sale and every cancelled receipt. The catalog re-reads stock and keeps its
   * own tag and search state, so the cashier stays where they were.
   */
  stockEpoch: number;
}

/**
 * What a sales-vertical module contributes to the sell screen.
 *
 * The analogue of `offline` below: the module does not register itself, it is
 * data the host reads. The frame (cart, payment, ПРРО, receipt) stays in the
 * host — only the browsing half is the vertical's.
 */
export interface ModuleSalesSlot {
  Catalog: ComponentType<SalesCatalogProps> | LazyExoticComponent<ComponentType<SalesCatalogProps>>;
}

export interface AnalyticsPanelProps {
  /**
   * The window «Сьогодні» is showing right now — the `from`/`to` the server
   * resolved for the summary above, not the date inputs' local state. A panel
   * answering about a different period than the figures it sits under is worse
   * than no panel.
   */
  from: string;
  to: string;
}

/**
 * What a sales-vertical module adds to the owner's «Сьогодні» dashboard.
 *
 * Same shape as `sales` above — data the host reads, not self-registration —
 * with one deliberate difference: there is no fallback. A store whose module
 * is missing, `pending` or broken gets no panels at all, because the dashboard
 * is host surface and a failing CDN must not be able to take it down with it
 * (TechDocs/POS_FLORIST_BENCH.md §15).
 */
export interface ModuleAnalyticsSlot {
  Panels: ComponentType<AnalyticsPanelProps> | LazyExoticComponent<ComponentType<AnalyticsPanelProps>>;
}

/**
 * What a sales-vertical module adds to the owner's Settings page.
 *
 * Props-less on purpose: the card owns its fetch, its save button and its own
 * error line, exactly as the host's `FiscalSettingsCard` does. Settings is one
 * big form over `PATCH /store`, and threading a module's field through it would
 * mean the host knowing what that field is — which is the thing verticals exist
 * to avoid. No fallback either, for the same reason as `analytics` above.
 */
export interface ModuleSettingsSlot {
  Card: ComponentType | LazyExoticComponent<ComponentType>;
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
  /**
   * The module keeps its own offline data (own IndexedDB, own queue) and wants
   * the shell's offline runtime to drive it — roadmap #12 track 3,
   * TechDocs/POS_MODULE_OFFLINE_DATA.md. The host registers these after boot;
   * the module never touches the registry itself.
   */
  offline?: ModuleOfflineHooks;
  /**
   * Set by a `vertical-*` module: the catalog half of `/register`. The host
   * renders the one matching `store.vertical`, falling back to the bundled
   * clothing catalog — see `modules/verticals.ts`.
   */
  sales?: ModuleSalesSlot;
  /**
   * Set by a `vertical-*` module: extra figures on the owner's «Сьогодні».
   * Unlike `sales`, an absent or broken module simply contributes nothing —
   * see `modules/verticals.ts`.
   */
  analytics?: ModuleAnalyticsSlot;
  /**
   * Set by a `vertical-*` module: its own card on `/admin/settings`. Absent or
   * broken module → the page is simply the one it always was.
   */
  settings?: ModuleSettingsSlot;
  routes: RouteDef[];
  nav: NavItem[];
}
