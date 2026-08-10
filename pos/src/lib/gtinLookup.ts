/** Client-side Open*Facts fan-out + ingest/quota via our API. */

export type GtinHint = {
  gtin: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  best_source: string | null;
};

export type LookupResult = {
  source: string;
  found: boolean;
  name?: string | null;
  brand?: string | null;
  image_url?: string | null;
  raw?: unknown;
};

const OPEN_FACTS = [
  {
    source: 'open_products_facts',
    url: (g: string) => `https://world.openproductsfacts.org/api/v2/product/${g}.json`,
  },
  {
    source: 'open_food_facts',
    url: (g: string) => `https://world.openfoodfacts.org/api/v2/product/${g}.json`,
  },
  {
    source: 'open_beauty_facts',
    url: (g: string) => `https://world.openbeautyfacts.org/api/v2/product/${g}.json`,
  },
] as const;

function mapOpenFacts(source: string, body: unknown): LookupResult {
  if (!body || typeof body !== 'object') return { source, found: false };
  const root = body as Record<string, unknown>;
  if (root.status === 0 || root.status === '0') return { source, found: false };
  const product = (root.product ?? root) as Record<string, unknown>;
  const name =
    (product.product_name_en as string) ||
    (product.product_name as string) ||
    (product.generic_name as string) ||
    null;
  const brand =
    (product.brands as string)?.split(',')[0]?.trim() ||
    (product.brand_owner as string) ||
    null;
  const image_url =
    (product.image_front_url as string) || (product.image_url as string) || null;
  if (!name?.trim()) return { source, found: false };
  return {
    source,
    found: true,
    name: name.trim(),
    brand: brand?.trim() || null,
    image_url,
  };
}

async function fetchOpenFacts(gtin: string): Promise<LookupResult[]> {
  if (import.meta.env.VITE_GTIN_OPEN_FACTS_ENABLED === 'false') return [];
  const settled = await Promise.allSettled(
    OPEN_FACTS.map(async (p) => {
      const res = await fetch(p.url(gtin), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { source: p.source, found: false } satisfies LookupResult;
      const json = await res.json();
      return mapOpenFacts(p.source, json);
    })
  );
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : { source: OPEN_FACTS[i]!.source, found: false }
  );
}

const SOURCE_LABEL: Record<string, string> = {
  open_products_facts: 'Open Products Facts',
  open_food_facts: 'Open Food Facts',
  open_beauty_facts: 'Open Beauty Facts',
  upcitemdb: 'UPCitemdb',
  upc_dev: 'upc.dev',
  manual: 'збережено вручну',
};

export function gtinSourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  return SOURCE_LABEL[source] ?? source;
}

export async function enrichGtinFromSources(
  gtin: string,
  api: {
    getGtinCache: (code: string) => Promise<{ found: boolean; hint?: GtinHint | null } & Partial<GtinHint>>;
    ingestGtin: (
      gtin: string,
      results: LookupResult[]
    ) => Promise<{ found: boolean; hint: GtinHint | null }>;
    lookupQuotaProviders: (
      gtin: string
    ) => Promise<{ found: boolean; hint: GtinHint | null; skipped?: unknown[] }>;
  }
): Promise<{ hint: GtinHint | null; cleared?: boolean }> {
  try {
    const cached = await api.getGtinCache(gtin);
    if (cached.found && (cached.hint?.name || cached.name)) {
      const hint = cached.hint ?? {
        gtin,
        name: cached.name ?? null,
        brand: cached.brand ?? null,
        image_url: cached.image_url ?? null,
        best_source: cached.best_source ?? null,
      };
      return { hint };
    }
  } catch {
    // 404 / disabled — continue
  }

  const openResults = await fetchOpenFacts(gtin);
  if (openResults.some((r) => r.found)) {
    try {
      const ingested = await api.ingestGtin(gtin, openResults);
      if (ingested.found && ingested.hint?.name) return { hint: ingested.hint };
    } catch {
      const best = openResults.find((r) => r.found);
      if (best?.name) {
        return {
          hint: {
            gtin,
            name: best.name,
            brand: best.brand ?? null,
            image_url: best.image_url ?? null,
            best_source: best.source,
          },
        };
      }
    }
  }

  try {
    const quota = await api.lookupQuotaProviders(gtin);
    if (quota.found && quota.hint?.name) return { hint: quota.hint };
  } catch {
    // silent
  }

  return { hint: null };
}
