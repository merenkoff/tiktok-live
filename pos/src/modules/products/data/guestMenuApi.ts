// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the product card asks about the guest's QR menu: the address of the
// published menu («Як бачить гість» opens this dish there) and which product
// is the store's cork fee (migration 105). Both reached through
// `api.posRequest`, open to the owner and the marketer alike, and both QUIET:
// a seller's 403, an older backend's 404 or a store with no guest menu reads
// as «nothing to show», never as an error over a card that is otherwise fine.

import { api } from '@pos/platform';

interface PublicMenuView {
  enabled?: boolean;
  url?: string | null;
}

interface ProfileView {
  corkage_product?: { id: number } | null;
}

/** The published menu's address, or null while there is none. */
export async function readGuestMenuUrl(): Promise<string | null> {
  try {
    const view = await api.posRequest<PublicMenuView>('get', '/store/public-menu');
    const url = view.enabled && typeof view.url === 'string' ? view.url : null;
    return url && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** One dish on the guest's page: the menu's own address for it (`/m/<key>/d/<id>`). */
export function guestDishUrl(menuUrl: string, productId: number): string {
  return `${menuUrl.replace(/\/+$/, '')}/d/${productId}`;
}

/** The id of the store's cork-fee product, or null. */
export async function readCorkageProductId(): Promise<number | null> {
  try {
    const view = await api.posRequest<ProfileView>('get', '/store/profile');
    return view.corkage_product?.id ?? null;
  } catch {
    return null;
  }
}
