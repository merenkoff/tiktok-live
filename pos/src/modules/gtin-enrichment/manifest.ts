// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from '../types';
import { lazyWithRetry } from '../lazyWithRetry';

const GtinCachePage = lazyWithRetry(() =>
  import('./pages/GtinCachePage').then((m) => ({ default: m.GtinCachePage }))
);

/**
 * GTIN barcode lookup / enrichment.
 *
 * The toggle gates three things at once: the GTIN subsection in Settings, the
 * lookup during stock receiving, and the backend `/gtin/*` routes. Its own page
 * is the owner's repair surface over `pos_gtin_cache` — that table is shared by
 * every store on the deployment, so a wrong name there is wrong for all of
 * them and there has to be a way to correct or retract one.
 */
export const gtinEnrichmentModule: ModuleDescriptor = {
  id: 'gtin-enrichment',
  title: 'GTIN-довідник',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [{ path: 'gtin', mount: 'admin', element: GtinCachePage }],
  nav: [
    { to: '/admin/gtin', label: 'GTIN-довідник', location: 'admin-sidebar', order: 65 },
  ],
};
