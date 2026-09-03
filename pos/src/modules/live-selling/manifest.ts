// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { ModuleDescriptor } from '../types';

/**
 * Reserved slot for the TikTok LIVE selling flow, to be delivered as a module
 * later. No routes, no nav, off by default — the descriptor exists so the id is
 * part of the union and the Settings checklist can reveal it when ready.
 */
export const liveSellingModule: ModuleDescriptor = {
  id: 'live-selling',
  title: 'LIVE-продажі',
  defaultEnabled: false,
  shells: ['web', 'cashier'],
  routes: [],
  nav: [],
};
