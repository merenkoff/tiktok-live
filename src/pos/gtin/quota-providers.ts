// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/quota-providers.ts — parallel server-side lookups

import { ingestGtinResults, getGtinCache } from './gtin-cache.service.js';
import { normalizeGtin } from './normalize.js';
import type { GtinHint, GtinLookupResult } from './types.js';
import { lookupUpcDev } from './upc-dev.provider.js';
import { lookupUpcitemdb, type QuotaSkip } from './upcitemdb.provider.js';

function isSkip(v: GtinLookupResult | QuotaSkip): v is QuotaSkip {
  return 'skipped' in v;
}

export async function lookupQuotaProviders(params: {
  code: string;
  storeId?: number;
  staffId?: number;
}): Promise<{
  hint: GtinHint | null;
  results: GtinLookupResult[];
  skipped: Array<{ provider: string; skipped: string; reason?: string }>;
}> {
  const norm = normalizeGtin(params.code);
  if (!norm.ok) throw new Error(`Invalid GTIN: ${norm.reason}`);

  const [upcitemdb, upcDev] = await Promise.all([
    lookupUpcitemdb(norm.gtin),
    lookupUpcDev(norm.gtin),
  ]);

  const results: GtinLookupResult[] = [];
  const skipped: Array<{ provider: string; skipped: string; reason?: string }> = [];

  if (isSkip(upcitemdb)) {
    skipped.push({ provider: 'upcitemdb', skipped: upcitemdb.skipped, reason: upcitemdb.reason });
  } else {
    results.push(upcitemdb);
  }
  if (isSkip(upcDev)) {
    skipped.push({ provider: 'upc_dev', skipped: upcDev.skipped, reason: upcDev.reason });
  } else {
    results.push(upcDev);
  }

  let hint: GtinHint | null = null;
  if (results.length > 0) {
    hint = await ingestGtinResults({
      code: norm.gtin,
      results,
      storeId: params.storeId,
      staffId: params.staffId,
    });
  }
  if (!hint) {
    hint = await getGtinCache(norm.gtin);
  }

  return { hint, results, skipped };
}
