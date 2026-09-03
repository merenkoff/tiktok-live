// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { lazy } from 'react';
import type { ModuleDescriptor } from '../types';

const StockHubPage = lazy(() =>
  import('../../pages/admin/stock/StockHubPage').then((m) => ({ default: m.StockHubPage }))
);
const StockActionPage = lazy(() =>
  import('../../pages/admin/stock/StockActionPage').then((m) => ({ default: m.StockActionPage }))
);
const StockInventoryPage = lazy(() =>
  import('../../pages/admin/stock/StockInventoryPage').then((m) => ({ default: m.StockInventoryPage }))
);
const StockHistoryPage = lazy(() =>
  import('../../pages/admin/stock/StockHistoryPage').then((m) => ({ default: m.StockHistoryPage }))
);
const StockMovementPage = lazy(() =>
  import('../../pages/admin/stock/StockMovementPage').then((m) => ({ default: m.StockMovementPage }))
);
const StockDocumentDetailPage = lazy(() =>
  import('../../pages/admin/stock/StockDocumentDetailPage').then((m) => ({
    default: m.StockDocumentDetailPage,
  }))
);

/** Stock: adjustments, documents (receipt/writeoff/inventory), suppliers, reports. Owner-only, web. */
export const stockModule: ModuleDescriptor = {
  id: 'stock',
  title: 'Склад',
  defaultEnabled: true,
  shells: ['web'],
  ownerOnly: true,
  routes: [
    { path: 'stock', mount: 'admin', element: StockHubPage },
    { path: 'stock/receipt', mount: 'admin', element: StockActionPage, props: { type: 'receipt' } },
    { path: 'stock/writeoff', mount: 'admin', element: StockActionPage, props: { type: 'writeoff' } },
    { path: 'stock/adjust', mount: 'admin', element: StockActionPage, props: { type: 'adjustment' } },
    { path: 'stock/inventory', mount: 'admin', element: StockInventoryPage },
    { path: 'stock/inventory/:id', mount: 'admin', element: StockInventoryPage },
    { path: 'stock/history', mount: 'admin', element: StockHistoryPage },
    { path: 'stock/movement', mount: 'admin', element: StockMovementPage },
    { path: 'stock/documents/:id', mount: 'admin', element: StockDocumentDetailPage },
  ],
  nav: [{ to: '/admin/stock', label: 'Склад', location: 'admin-sidebar', order: 30 }],
};
