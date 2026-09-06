// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from './types';
import { importWithRetry, lazyWithRetry } from './lazyWithRetry';
import { reportModuleEvent } from './telemetry';
import { resolveModuleRemotes, type ModulePresentation } from './moduleRemotesSource';
import { setAppliedRemotes } from './appliedRemotes';
import { verifyRemoteEntry } from './remoteVerify';
// Direct import, not via '@pos/platform' — the barrel re-exports the module
// manifests, which import this file; `platform/version.ts` is a zero-import leaf.
import { POS_APP_VERSION, POS_API_CLIENT_VERSION } from '../platform/version';
import { catalogCheckoutModule } from './catalog-checkout/manifest';
import { returnsModule } from './returns/manifest';
import { customersModule } from './customers/manifest';
import { productsModule } from './products/manifest';
import { stockModule } from './stock/manifest';
import { analyticsModule } from './analytics/manifest';
import { staffModule } from './staff/manifest';
import { settingsModule } from './settings/manifest';
import { gtinEnrichmentModule } from './gtin-enrichment/manifest';
import { qrPaymentModule } from './qr-payment/manifest';
import { hardwareModule } from './hardware/manifest';
import { liveSellingModule } from './live-selling/manifest';

/**
 * Single source of truth for the app's feature surface. Order matters: it is the
 * order routes and (within a nav location, before `order` sort) nav entries are
 * considered, and it decides the `/admin` index fallback target.
 */
/**
 * Inject a runtime-loaded module's own utilities sheet (roadmap #4), once, as a
 * `<style data-module-remote="<id>">`. The CSS text is already sha384-verified
 * against the signed manifest (`verifyRemoteEntry`). Runs before the first
 * render, so no flash of unstyled content.
 */
export function injectModuleStyle(moduleId: string, css: string | undefined): void {
  if (!css || typeof document === 'undefined') return;
  if (document.querySelector(`style[data-module-remote="${moduleId}"]`)) return;
  const el = document.createElement('style');
  el.dataset.moduleRemote = moduleId;
  el.textContent = css;
  document.head.appendChild(el);
}

export const MODULES: ModuleDescriptor[] = [
  catalogCheckoutModule,
  returnsModule,
  customersModule,
  productsModule,
  stockModule,
  analyticsModule,
  staffModule,
  settingsModule,
  gtinEnrichmentModule,
  qrPaymentModule,
  hardwareModule,
  liveSellingModule,
];

/**
 * A module the shell ships no code for — a new online-only feature module
 * (roadmap #13 Part C), declared as an object in `store.module_remotes`,
 * downloaded and run by the desktop cashier. `id` is a free string (not a
 * bundled `ModuleId`); `alwaysEnabled` because being in `module_remotes` *is*
 * the opt-in; `pending` marks a not-yet-downloaded placeholder.
 */
export type RemoteModuleDescriptor = Omit<
  ModuleDescriptor,
  'id' | 'core' | 'coreInShell' | 'requires'
> & { id: string; alwaysEnabled?: true; pending?: true };

export type AnyModuleDescriptor = ModuleDescriptor | RemoteModuleDescriptor;

/**
 * Resolved online-only modules for this boot — either the real descriptor from
 * the `liveshopmodule://` cache (Part B) or a `pending` placeholder. Filled by
 * `applyModuleRemotes` before the first render, like `MODULES`.
 */
export const remoteModules: RemoteModuleDescriptor[] = [];

/** Bundled feature surface + this boot's online-only modules. */
export function allModules(): AnyModuleDescriptor[] {
  return remoteModules.length ? [...MODULES, ...remoteModules] : MODULES;
}

const RemoteModuleUnavailablePage = lazyWithRetry(() =>
  import('../components/RemoteModuleUnavailablePage').then((m) => ({
    default: m.RemoteModuleUnavailablePage,
  }))
);

/**
 * Greyed placeholder for an online-only module that isn't downloaded yet.
 *
 * The nav entry keeps the module's **own** icon (`nav[].icon`, else the entry's
 * `icon`, resolved by name in `@pos/platform` — roadmap #13 Part D) so it sits
 * in the rail looking like itself; `indicator: 'pending'` is what greys it out.
 * Only a module that declared no icon at all falls back to `CloudOff`.
 */
function placeholderDescriptor(
  id: string,
  url: string,
  presentation: ModulePresentation
): RemoteModuleDescriptor {
  return {
    id,
    title: presentation.title,
    shells: ['cashier'],
    alwaysEnabled: true,
    pending: true,
    routes: [
      {
        path: `${presentation.routePath.replace(/^\//, '')}/*`,
        element: RemoteModuleUnavailablePage,
        props: { moduleId: id, title: presentation.title, url },
      },
    ],
    nav: presentation.nav.map((n) => ({
      to: presentation.routePath,
      label: n.label,
      icon: n.icon ?? presentation.icon ?? 'CloudOff',
      location: n.location,
      order: n.order,
      match: n.match,
      indicator: 'pending' as const,
    })),
  };
}

export interface ApplyModuleRemotesOptions {
  /**
   * Desktop cashier only (roadmap #13 Part B). Given the store's `{ id, url }`,
   * download+verify+cache the module in Rust and return the `liveshopmodule://`
   * URLs to `import()` / `fetch` its style from — or `null` when it isn't cached
   * and can't be fetched (offline first run), meaning skip it this boot. The
   * bytes behind those URLs are already Ed25519-verified in Rust, so the web
   * `verifyRemoteEntry` step is skipped for them. Absent on web → the CDN
   * verify+`import()` path below runs unchanged.
   */
  syncRemote?: (
    id: string,
    url: string
  ) => Promise<{ importUrl: string; styleUrl?: string } | null>;
}

/**
 * Swap a bundled module descriptor for one fetched from a URL at boot. The
 * `{ id -> url }` list comes from `resolveModuleRemotes()` — the per-store
 * `store.module_remotes` setting off the cached `pos_auth` (roadmap #9), or the
 * `VITE_MODULE_REMOTES` build override when set. Empty → no-op, the bundled
 * registry above is used verbatim.
 *
 * A remote that 404s / errors / exports the wrong descriptor falls back to the
 * bundled module (telemetry: `remote_load_fallback`), never a broken registry —
 * this runs before the first render on every boot.
 */
export async function applyModuleRemotes(opts: ApplyModuleRemotesOptions = {}): Promise<void> {
  const knownIds = new Set(MODULES.map((m) => m.id));
  const entries = resolveModuleRemotes(knownIds);
  const remotes = new Map<string, { url: string }>();
  remoteModules.length = 0;

  // Build-only escape hatch: point `VITE_MODULE_REMOTES` at an unsigned URL for
  // local dev. The per-store (cached-auth) path is always verified.
  const skipVerify =
    Boolean(import.meta.env.VITE_MODULE_REMOTES) &&
    import.meta.env.VITE_MODULE_REMOTES_INSECURE === '1';

  for (const [id, { url, presentation }] of entries) {
    // Object-form entry for an id we ship no code for → a NEW online-only module
    // (roadmap #13 Part C). Its descriptor goes in `remoteModules`, and if it
    // can't be loaded we still show a `pending` placeholder from `presentation`.
    const isOnlineOnly = !!presentation && !MODULES.some((m) => m.id === id);
    let landed = false;

    try {
      let importUrl = url;
      let styleUrl: string | undefined;
      let styleCss: string | undefined;

      if (opts.syncRemote) {
        let resolved: { importUrl: string; styleUrl?: string } | null;
        try {
          resolved = await opts.syncRemote(id, url);
        } catch (error) {
          reportModuleEvent({ type: 'remote_verify_error', moduleId: id, url, error });
          reportModuleEvent({
            type: 'remote_load_fallback',
            moduleId: id,
            url,
            reason: 'module sync/verify failed',
          });
          continue;
        }
        if (!resolved) {
          reportModuleEvent({
            type: 'remote_load_fallback',
            moduleId: id,
            url,
            reason: isOnlineOnly ? 'not downloaded' : 'not cached (offline first run)',
          });
          continue;
        }
        importUrl = resolved.importUrl;
        styleUrl = resolved.styleUrl;
      } else if (!skipVerify) {
        try {
          ({ styleCss } = await verifyRemoteEntry(url, id));
        } catch (error) {
          reportModuleEvent({ type: 'remote_verify_error', moduleId: id, url, error });
          reportModuleEvent({
            type: 'remote_load_fallback',
            moduleId: id,
            url,
            reason: 'signature/integrity check failed',
          });
          continue;
        }
      }

      let attempts = 0;
      try {
        const mod = await importWithRetry<Record<string, unknown>>(() => {
          attempts += 1;
          return import(/* @vite-ignore */ importUrl);
        });
        const descriptor = (mod.manifest ?? mod.default) as ModuleDescriptor | undefined;
        if (!descriptor || descriptor.id !== id) {
          reportModuleEvent({
            type: 'remote_load_fallback',
            moduleId: id,
            url,
            reason: `remote did not export a "${id}" descriptor`,
          });
          continue;
        }
        const idx = MODULES.findIndex((m) => m.id === id);
        if (idx >= 0) MODULES[idx] = descriptor;
        else if (isOnlineOnly) remoteModules.push(descriptor as unknown as RemoteModuleDescriptor);
        else MODULES.push(descriptor);
        landed = true;
        remotes.set(id, { url });
        if (styleUrl) {
          // Served from the Rust-verified cache — fetch its text, no re-hash.
          try {
            const res = await fetch(styleUrl);
            if (res.ok) injectModuleStyle(id, await res.text());
          } catch {
            /* style is best-effort; the module is already imported */
          }
        } else {
          injectModuleStyle(id, styleCss);
        }
        reportModuleEvent({ type: 'remote_load_ok', moduleId: id, url, attempts });
      } catch (error) {
        reportModuleEvent({ type: 'remote_load_error', moduleId: id, url, attempts, error });
        reportModuleEvent({
          type: 'remote_load_fallback',
          moduleId: id,
          url,
          reason: 'dynamic import failed after retries',
        });
      }
    } finally {
      // Desktop only: an online-only module that didn't load this boot still
      // gets a greyed nav entry + an "unavailable" screen (roadmap #13 Part C).
      if (opts.syncRemote && isOnlineOnly && !landed && presentation) {
        remoteModules.push(placeholderDescriptor(id, url, presentation));
      }
    }
  }

  // Record the resolved *intent* (not just the swaps that succeeded) so a
  // persistently-down remote doesn't re-trigger the "reload" banner on every
  // `me()` — the fallback is already visible via telemetry + RouteErrorBoundary.
  setAppliedRemotes(entries);
  reportSessionManifest(remotes);
}

/**
 * Emit the boot `session_manifest` telemetry event: the app build version, the
 * `/api/pos` version this build expects, and every module's resolved version +
 * whether it came bundled or from a runtime remote. Fired once per shell boot —
 * from `applyModuleRemotes()` on web, directly from `cashier-main.tsx` on the
 * Tauri shell (which never swaps remotes). Bundled modules are stamped with
 * `POS_APP_VERSION` here so `MODULES` carries a version everywhere it's read.
 */
export function reportSessionManifest(remotes: Map<string, { url: string }> = new Map()): void {
  for (const m of MODULES) {
    if (m.version == null && !remotes.has(m.id)) m.version = POS_APP_VERSION;
  }
  reportModuleEvent({
    type: 'session_manifest',
    appVersion: POS_APP_VERSION,
    apiClientVersion: POS_API_CLIENT_VERSION,
    modules: allModules().map((m) => ({
      id: m.id,
      version: m.version ?? POS_APP_VERSION,
      source:
        remotes.has(m.id) || (m as RemoteModuleDescriptor).pending ? 'remote' : 'bundled',
      url: remotes.get(m.id)?.url,
    })),
  });
}
