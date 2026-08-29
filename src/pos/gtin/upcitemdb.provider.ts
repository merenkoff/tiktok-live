// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/upcitemdb.provider.ts

import type { GtinLookupResult } from './types.js';
import { tryConsumeBudget } from './provider-budget.js';

export type QuotaSkip = { skipped: 'quota' | 'no_key' | 'error'; reason?: string };

export function mapUpcitemdbResponse(body: unknown): GtinLookupResult {
  const source = 'upcitemdb';
  if (!body || typeof body !== 'object') return { source, found: false };
  const root = body as Record<string, unknown>;
  const items = root.items as unknown[] | undefined;
  if (!Array.isArray(items) || items.length === 0) {
    return { source, found: false, raw: { total: root.total } };
  }
  const item = items[0] as Record<string, unknown>;
  const name = (item.title as string) || null;
  const brand = (item.brand as string) || null;
  const images = item.images as string[] | undefined;
  const image_url = images?.[0] ?? null;
  if (!name?.trim()) return { source, found: false };
  return {
    source,
    found: true,
    name: name.trim(),
    brand: brand?.trim() || null,
    image_url,
    raw: { ean: item.ean, upc: item.upc },
  };
}

export async function lookupUpcitemdb(gtin: string): Promise<GtinLookupResult | QuotaSkip> {
  const ok = await tryConsumeBudget('upcitemdb');
  if (!ok) return { skipped: 'quota' };

  const contact = process.env.GTIN_CONTACT_EMAIL?.trim();
  const ua = contact
    ? `tiktok-live-pos/1.0 (gtin-lookup; ${contact})`
    : 'tiktok-live-pos/1.0 (gtin-lookup)';

  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(gtin)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': ua },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { skipped: 'error', reason: `http_${res.status}` };
    }
    const json = await res.json();
    return mapUpcitemdbResponse(json);
  } catch (e) {
    return { skipped: 'error', reason: e instanceof Error ? e.message : 'fetch_failed' };
  }
}
