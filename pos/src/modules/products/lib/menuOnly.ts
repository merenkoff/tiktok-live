// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The café's marketer keeps the MENU half of a product card (track МР,
// TechDocs/POS_MARKETER_ROLE.md, М4): name, description, photo, prices,
// portions, what the guest reads. The server sends it no purchase price and no
// stock and refuses its changes to the kitchen's, the stock's and the
// register's half — so these screens neither show those fields nor send them.

import { useAuthStore } from '@pos/platform';

/** Whether this session sees only the menu half of a product card. */
export function useMenuOnly(): boolean {
  return useAuthStore((s) => s.auth?.staff.role === 'marketer');
}
