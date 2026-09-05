// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from './types';
import { importWithRetry } from './lazyWithRetry';
import { reportModuleEvent } from './telemetry';
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
 * Task B PoC — swap a bundled module descriptor for one fetched from a URL at
 * boot. `VITE_MODULE_REMOTES` is a comma-separated list of `id@url` entries
 * (e.g. `returns@http://localhost:5001/remote-entry.js`). Unset → no-op, the
 * bundled registry above is used verbatim. Evaluation only; not wired for prod.
 */
export async function applyModuleRemotes(): Promise<void> {
  const spec = import.meta.env.VITE_MODULE_REMOTES as string | undefined;
  const remotes = new Map<string, { url: string }>();
  if (!spec) {
    reportSessionManifest(remotes);
    return;
  }
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const at = raw.indexOf('@');
    const id = at > 0 ? raw.slice(0, at) : '';
    const url = at > 0 ? raw.slice(at + 1) : '';
    if (!id || !url) continue;

    let attempts = 0;
    try {
      const mod = await importWithRetry<Record<string, unknown>>(() => {
        attempts += 1;
        return import(/* @vite-ignore */ url);
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
