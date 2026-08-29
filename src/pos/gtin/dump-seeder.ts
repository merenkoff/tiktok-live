// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/dump-seeder.ts — parse Open*Facts CSV/JSONL dumps into cache rows

import fs from 'fs';
import readline from 'readline';
import zlib from 'zlib';
import { createReadStream } from 'fs';
import { normalizeGtin } from './normalize.js';
import type { GtinLookupResult, GtinSource } from './types.js';

export type DumpDataset = 'products' | 'food' | 'beauty';

const SOURCE_BY_DATASET: Record<DumpDataset, GtinSource> = {
  products: 'open_products_facts',
  food: 'open_food_facts',
  beauty: 'open_beauty_facts',
};

export type DumpRow = {
  gtin: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  source: GtinSource;
};

export function datasetSource(dataset: DumpDataset): GtinSource {
  return SOURCE_BY_DATASET[dataset];
}

/** Parse one TSV/CSV line with header map (tab-separated Open Facts export). */
export function parseDumpTsvLine(
  line: string,
  header: string[],
  source: GtinSource
): DumpRow | { skip: string } {
  const cols = line.split('\t');
  const get = (key: string): string => {
    const i = header.indexOf(key);
    if (i < 0) return '';
    return (cols[i] ?? '').trim();
  };
  const code = get('code') || get('barcode');
  const norm = normalizeGtin(code);
  if (!norm.ok) return { skip: `bad_gtin:${norm.reason}` };
  const name =
    get('product_name') || get('product_name_en') || get('generic_name') || '';
  if (!name.trim()) return { skip: 'empty_name' };
  const brandRaw = get('brands') || get('brand');
  const brand = brandRaw.split(',')[0]?.trim() || null;
  const image_url = get('image_url') || get('image_front_url') || null;
  return {
    gtin: norm.gtin,
    name: name.trim().slice(0, 500),
    brand,
    image_url: image_url || null,
    source,
  };
}

export function parseDumpJsonlLine(
  line: string,
  source: GtinSource
): DumpRow | { skip: string } {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { skip: 'bad_json' };
  }
  const code = String(obj.code ?? obj.barcode ?? '');
  const norm = normalizeGtin(code);
  if (!norm.ok) return { skip: `bad_gtin:${norm.reason}` };
  const name = String(
    obj.product_name ?? obj.product_name_en ?? obj.generic_name ?? ''
  ).trim();
  if (!name) return { skip: 'empty_name' };
  const brands = String(obj.brands ?? obj.brand ?? '');
  const brand = brands.split(',')[0]?.trim() || null;
  const image_url =
    (obj.image_url as string) || (obj.image_front_url as string) || null;
  return {
    gtin: norm.gtin,
    name: name.slice(0, 500),
    brand,
    image_url,
    source,
  };
}

export function dumpRowToLookupResult(row: DumpRow): GtinLookupResult {
  return {
    source: row.source,
    found: true,
    name: row.name,
    brand: row.brand,
    image_url: row.image_url,
  };
}

export function dumpDir(): string {
  return process.env.GTIN_DUMP_DIR?.trim() || 'data/gtin-dumps';
}

/** Resolve local dump path for a dataset (tsv / csv / jsonl, optionally .gz). */
export function resolveDumpPath(dataset: DumpDataset, baseDir = dumpDir()): string | null {
  const candidates = [
    `${dataset}.tsv`,
    `${dataset}.tsv.gz`,
    `${dataset}.csv`,
    `${dataset}.csv.gz`,
    `${dataset}.jsonl`,
    `${dataset}.jsonl.gz`,
    `en.open${dataset === 'products' ? 'products' : dataset === 'food' ? 'food' : 'beauty'}facts.org.products.tsv`,
    `en.open${dataset === 'products' ? 'products' : dataset === 'food' ? 'food' : 'beauty'}facts.org.products.csv`,
  ];
  for (const name of candidates) {
    const p = `${baseDir}/${name}`;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function openLines(filePath: string): readline.Interface {
  const isGz = filePath.endsWith('.gz');
  const stream = isGz
    ? createReadStream(filePath).pipe(zlib.createGunzip())
    : createReadStream(filePath, { encoding: 'utf8' });
  return readline.createInterface({ input: stream as NodeJS.ReadableStream, crlfDelay: Infinity });
}

export type SeedProgress = {
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
};

export type SeedHandlers = {
  onBatch: (rows: DumpRow[]) => Promise<{ inserted: number; updated: number }>;
  shouldCancel?: () => Promise<boolean>;
  onProgress?: (p: SeedProgress) => Promise<void>;
  batchSize?: number;
  limit?: number;
};

/** Stream a dump file and call onBatch with DumpRow batches. */
export async function seedFromDumpFile(
  filePath: string,
  dataset: DumpDataset,
  handlers: SeedHandlers
): Promise<SeedProgress> {
  const source = datasetSource(dataset);
  const batchSize = handlers.batchSize ?? 200;
  const limit = handlers.limit;
  const progress: SeedProgress = { processed: 0, inserted: 0, updated: 0, skipped: 0 };
  const isJsonl = filePath.includes('.jsonl');
  const rl = openLines(filePath);

  let header: string[] | null = null;
  let batch: DumpRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const r = await handlers.onBatch(batch);
    progress.inserted += r.inserted;
    progress.updated += r.updated;
    batch = [];
    if (handlers.onProgress) await handlers.onProgress({ ...progress });
  };

  for await (const line of rl) {
    if (handlers.shouldCancel && (await handlers.shouldCancel())) break;
    if (!line.trim()) continue;

    if (!isJsonl && header == null) {
      header = line.split('\t').map((h) => h.trim());
      // if single-column weird header, also try comma — Open Facts uses tab
      if (header.length < 2 && line.includes(',')) {
        header = line.split(',').map((h) => h.trim());
      }
      continue;
    }

    const parsed = isJsonl
      ? parseDumpJsonlLine(line, source)
      : parseDumpTsvLine(line, header!, source);

    progress.processed += 1;
    if ('skip' in parsed) {
      progress.skipped += 1;
    } else {
      batch.push(parsed);
      if (batch.length >= batchSize) await flush();
    }

    if (limit != null && progress.processed >= limit) break;
  }

  await flush();
  return progress;
}
