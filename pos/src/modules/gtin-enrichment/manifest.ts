// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from '../types';

/**
 * GTIN barcode lookup / enrichment. No page of its own — it only gates the GTIN
 * subsection in Settings and the lookup call during stock receiving. Kept as a
 * module so the toggle lives in one place (backend `/gtin/*` is gated too).
 */
export const gtinEnrichmentModule: ModuleDescriptor = {
  id: 'gtin-enrichment',
  title: 'GTIN-довідник',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [],
  nav: [],
};
