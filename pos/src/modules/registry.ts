// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from './types';
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
  if (!spec) return;
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const at = raw.indexOf('@');
    const id = at > 0 ? raw.slice(0, at) : '';
    const url = at > 0 ? raw.slice(at + 1) : '';
    if (!id || !url) continue;
    try {
      const mod: Record<string, unknown> = await import(/* @vite-ignore */ url);
      const descriptor = (mod.manifest ?? mod.default) as ModuleDescriptor | undefined;
      if (!descriptor || descriptor.id !== id) {
        console.error(`[module-remote] ${url} did not export a "${id}" descriptor`);
        continue;
      }
      const idx = MODULES.findIndex((m) => m.id === id);
      if (idx >= 0) MODULES[idx] = descriptor;
      else MODULES.push(descriptor);
      console.info(`[module-remote] loaded "${id}" from ${url}`);
    } catch (err) {
      console.error(`[module-remote] failed to load "${id}" from ${url}`, err);
    }
  }
}
