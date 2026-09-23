// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A static import, deliberately: this catalog is what the sell screen falls
// back to when a store's own vertical module is missing, still downloading or
// broken. A lazily-loaded fallback could itself fail to arrive, which is
// exactly the situation it exists to cover.
import { ClothingCatalog } from './ClothingCatalog';
import type { ModuleDescriptor } from '../types';

/**
 * The bundled sales vertical: goods sold by the piece off a rail.
 *
 * It owns no routes and no nav entry — `catalog-checkout` owns `/register` and
 * renders whichever vertical's catalog the store is set to. Core, because a
 * till without a fallback catalog is a till that can stop being able to sell.
 */
export const verticalClothingModule: ModuleDescriptor = {
  id: 'vertical-clothing',
  title: 'Продаж одягу',
  core: true,
  shells: ['web', 'cashier', 'tablet'],
  routes: [],
  nav: [],
  sales: { Catalog: ClothingCatalog },
};
