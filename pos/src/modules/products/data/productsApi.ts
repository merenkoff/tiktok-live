// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Product calls the host's `api` object has no method for — through
// `api.posRequest`, the `markdownsApi.ts` shape, so nothing here is a new
// export of `@pos/platform` and the platform stays where it is.

import { api } from '@pos/platform';
import type { Product } from '@pos/platform';

/** Back from the archive: the card and every variant on it (`POST /products/:id/restore`). */
export function restoreProduct(productId: number): Promise<Product> {
  // Called as a METHOD of `api`, never detached: it reaches its axios client through `this`.
  return api.posRequest<Product>('post', `/products/${productId}/restore`);
}
