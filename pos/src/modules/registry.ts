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
