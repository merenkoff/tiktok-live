// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The one call behind both café analytics surfaces — the `kitchenApi.ts`
// shape. Nothing here is a new export of `@pos/platform`, which is what keeps
// this module on platform 15.

import { posRequest } from '../lib/hostPlatform';
import type { CafeAnalytics } from './types';

/** The store's own numbers for a window. Owner-only; 409 for another vertical. */
export function getCafeAnalytics(range: { from?: string; to?: string }): Promise<CafeAnalytics> {
  const q = new URLSearchParams();
  if (range.from) q.set('from', range.from);
  if (range.to) q.set('to', range.to);
  const suffix = q.toString();
  return posRequest<CafeAnalytics>('get', `/analytics/cafe${suffix ? `?${suffix}` : ''}`);
}
