// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerCatalogRoutes } from './routes/catalog.routes.js';
import { registerCheckoutRoutes } from './routes/checkout.routes.js';
import { registerStoreRoutes } from './routes/store.routes.js';
import { registerReturnsRoutes } from './routes/returns.routes.js';
import { registerCustomersRoutes } from './routes/customers.routes.js';
import { registerProductsRoutes } from './routes/products.routes.js';
import { registerStockRoutes } from './routes/stock.routes.js';
import { registerAnalyticsRoutes } from './routes/analytics.routes.js';
import { registerStaffRoutes } from './routes/staff.routes.js';
import { registerGtinRoutes } from './routes/gtin.routes.js';
import { registerQrRoutes } from './routes/qr.routes.js';
import { registerTelemetryRoutes } from './routes/telemetry.routes.js';

export interface PosRouteGroup {
  /** null = core: always registered, no per-request module gate. */
  moduleId: string | null;
  register: (fastify: FastifyInstance) => void | Promise<void>;
}

/**
 * Registration table for the POS route surface. Every group is always
 * registered; per-request module gating lives in each handler via
 * `ensureModule`. `moduleId` is metadata (docs / future registration-time skips).
 */
export const POS_ROUTE_GROUPS: PosRouteGroup[] = [
  { moduleId: null, register: registerAuthRoutes },
  { moduleId: null, register: registerCatalogRoutes },
  { moduleId: null, register: registerCheckoutRoutes },
  { moduleId: null, register: registerStoreRoutes },
  { moduleId: null, register: registerTelemetryRoutes },
  { moduleId: 'returns', register: registerReturnsRoutes },
  { moduleId: 'customers', register: registerCustomersRoutes },
  { moduleId: 'products', register: registerProductsRoutes },
  { moduleId: 'stock', register: registerStockRoutes },
  { moduleId: 'analytics', register: registerAnalyticsRoutes },
  { moduleId: 'staff', register: registerStaffRoutes },
  { moduleId: 'gtin-enrichment', register: registerGtinRoutes },
  { moduleId: 'qr-payment', register: registerQrRoutes },
];
