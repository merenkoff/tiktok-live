// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from './types';
import { importWithRetry } from './lazyWithRetry';
import { reportModuleEvent } from './telemetry';
import { resolveModuleRemotes } from './moduleRemotesSource';
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

  // Build-only escape hatch: point `VITE_MODULE_REMOTES` at an unsigned URL for
  // local dev. The per-store (cached-auth) path is always verified.
  const skipVerify =
    Boolean(import.meta.env.VITE_MODULE_REMOTES) &&
    import.meta.env.VITE_MODULE_REMOTES_INSECURE === '1';

  for (const [id, { url }] of entries) {
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
          reason: 'not cached (offline first run)',
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
      else MODULES.push(descriptor);
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
    modules: MODULES.map((m) => ({
      id: m.id,
      version: m.version ?? POS_APP_VERSION,
      source: remotes.has(m.id) ? 'remote' : 'bundled',
      url: remotes.get(m.id)?.url,
    })),
  });
}
