// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { StockHubPage } from '../../pages/admin/stock/StockHubPage';
import { StockActionPage } from '../../pages/admin/stock/StockActionPage';
import { StockInventoryPage } from '../../pages/admin/stock/StockInventoryPage';
import { StockHistoryPage } from '../../pages/admin/stock/StockHistoryPage';
import { StockMovementPage } from '../../pages/admin/stock/StockMovementPage';
import { StockDocumentDetailPage } from '../../pages/admin/stock/StockDocumentDetailPage';
import type { ModuleDescriptor } from '../types';

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
