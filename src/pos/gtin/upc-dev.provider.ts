// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/upc-dev.provider.ts

import type { GtinLookupResult } from './types.js';
import { tryConsumeBudget } from './provider-budget.js';
import type { QuotaSkip } from './upcitemdb.provider.js';

export function mapUpcDevResponse(body: unknown): GtinLookupResult {
  const source = 'upc_dev';
  if (!body || typeof body !== 'object') return { source, found: false };
  const root = body as Record<string, unknown>;
  if (root.ok === false) return { source, found: false, raw: root };
  const data = (root.data ?? root) as Record<string, unknown>;
  const name = (data.name as string) || (data.title as string) || null;
  const brand = (data.brand as string) || null;
  const image_url = (data.image_url as string) || (data.image as string) || null;
  if (!name?.trim()) return { source, found: false, raw: { ok: root.ok } };
  return {
    source,
    found: true,
    name: name.trim(),
    brand: brand?.trim() || null,
    image_url,
    raw: { upc: data.upc, category: data.category },
  };
}

export async function lookupUpcDev(gtin: string): Promise<GtinLookupResult | QuotaSkip> {
  const key = process.env.UPC_DEV_API_KEY?.trim();
  if (!key) return { skipped: 'no_key' };

  const ok = await tryConsumeBudget('upc_dev');
  if (!ok) return { skipped: 'quota' };

  const contact = process.env.GTIN_CONTACT_EMAIL?.trim();
  const ua = contact
    ? `tiktok-live-pos/1.0 (gtin-lookup; ${contact})`
    : 'tiktok-live-pos/1.0 (gtin-lookup)';

  try {
    const url = `https://upc.dev/v1/product/${encodeURIComponent(gtin)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': ua,
        'X-API-Key': key,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { skipped: 'error', reason: `http_${res.status}` };
    }
    const json = await res.json();
    return mapUpcDevResponse(json);
  } catch (e) {
    return { skipped: 'error', reason: e instanceof Error ? e.message : 'fetch_failed' };
  }
}
