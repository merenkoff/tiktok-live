// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/migrations.ts — the ordered POS migration list.
//
// Single source of truth, shared by `migrate.ts` (production) and the test
// fixtures. Before this file the list was duplicated in the runner and in every
// DB-backed test; the copies drifted (016 landed in the tests but never in the
// runner, so `npm run pos:migrate` silently left `pos_stores.module_remotes`
// uncreated). Append new migrations here and nowhere else.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root `migrations/` directory. */
export const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

/**
 * POS migrations in apply order. `001_create_schema.sql` is deliberately absent:
 * it owns the LIVE-automation tables, which the POS subsystem does not touch.
 */
export const POS_MIGRATIONS = [
  '002_pos_schema.sql',
  '003_pos_tags.sql',
  '004_pos_tag_catalog_bar.sql',
  '005_pos_discounts_customers.sql',
  '006_pos_stock_documents.sql',
  '007_pos_receipt_placeholders.sql',
  '008_pos_gtin_cache.sql',
  '009_pos_gtin_learn_jobs.sql',
  '010_pos_offline_sync.sql',
  '011_pos_qr_payment.sql',
  '012_pos_qr_confirmations.sql',
  '013_pos_store_settings.sql',
  '014_pos_refund_documents.sql',
  '015_pos_store_modules.sql',
  '016_pos_store_module_remotes.sql',
  '017_pos_live_link.sql',
  '018_pos_gtin_canonical.sql',
  '019_pos_gtin_cache_admin.sql',
  '020_pos_gtin_budget_scope.sql',
  '021_pos_gtin_events_retention.sql',
  '022_pos_variant_barcode_to_sku.sql',
  '023_pos_internal_barcode_seq.sql',
  '024_pos_fiscal.sql',
  '025_pos_stock_document_client_uuid.sql',
  '026_pos_fiscal_receipt_width.sql',
  '027_pos_fiscal_offline.sql',
  '028_pos_fiscal_offline_replay.sql',
  '029_pos_fiscal_register_fn.sql',
  '030_pos_fiscal_requisites.sql',
  '031_pos_fiscal_device_sessions.sql',
  '032_pos_fiscal_offline_code_order.sql',
] as const;

export function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}
