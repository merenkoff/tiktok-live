// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { api } from '@pos/platform';
import type { GtinCacheEntry, GtinCachePage } from '@pos/platform';

export type { GtinCacheEntry, GtinCachePage };

/**
 * Owner view of `pos_gtin_cache`. Web-only and owner-only: the table is shared
 * by every store on the deployment, so a correction here reaches all of them.
 */
export const gtinCacheApi = {
  list: (params: {
    q?: string;
    limit?: number;
    offset?: number;
    blockedOnly?: boolean;
  }): Promise<GtinCachePage> => api.listGtinCache(params),

  /** Save a correction. Stored as `manual`, which outranks every automatic source. */
  save: (
    code: string,
    patch: { name: string; brand?: string | null }
  ): Promise<{ hint: GtinCacheEntry | null }> => api.updateGtinCache(code, patch),

  /** Clear the entry and keep it cleared until it is unblocked. */
  evict: (code: string): Promise<{ hint: GtinCacheEntry | null }> => api.evictGtinCache(code),

  unblock: (code: string): Promise<{ hint: GtinCacheEntry | null }> =>
    api.updateGtinCache(code, { blocked: false }),
};
