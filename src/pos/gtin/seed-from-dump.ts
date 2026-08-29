#!/usr/bin/env npx tsx
// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/gtin/seed-from-dump.ts — CLI seeder
// Usage: npx tsx src/pos/gtin/seed-from-dump.ts --dataset products --limit 10000

import 'dotenv/config';
import { pool, testConnection } from '../../db.js';
import { createLearnJob, getLearnJob, runLearnJob } from './learn-jobs.service.js';
import type { DumpDataset } from './dump-seeder.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

async function main(): Promise<void> {
  await testConnection();
  const dataset = (arg('dataset') ?? 'products') as DumpDataset;
  const limit = arg('limit') ? Number(arg('limit')) : undefined;
  if (!['products', 'food', 'beauty'].includes(dataset)) {
    throw new Error('--dataset must be products|food|beauty');
  }

  const job = await createLearnJob({
    datasets: [dataset],
    limit,
    runInline: false,
  });
  console.log('Created job', job.id, 'running…');
  const done = await runLearnJob(job.id);
  console.log(JSON.stringify(done, null, 2));
  const check = await getLearnJob(job.id);
  console.log('status', check?.status, 'inserted', check?.inserted, 'skipped', check?.skipped);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
