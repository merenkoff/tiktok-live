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
  '033_pos_store_nav_overrides.sql',
  '034_pos_store_vertical.sql',
  '035_pos_variant_attributes.sql',
  // Registered one release after 035, as its header demands: it drops the
  // columns a 1.x backend still selects, and migrations run before the new
  // image is live. 035 shipped in 2.0.0; nothing selects them any more.
  //
  // Registering it also made three files re-runnable. The runner has no
  // tracking table — it re-applies every file in order on every container
  // start (Dockerfile CMD), and the API starts only if that exits 0 — so a
  // migration that drops a column its predecessor reads breaks the NEXT boot,
  // not this one. 007 (re-adding what 036 dropped), 035 and 036 (backfilling
  // from it) are guarded accordingly; `pos.migrations-idempotent.test.ts` is
  // what remembers the rule.
  '036_pos_drop_variant_size_color.sql',
  '037_pos_product_components.sql',
  '038_pos_production_documents.sql',
  '039_pos_demo_flowers_store.sql',
  '040_pos_florist_labour.sql',
  '041_pos_one_off_products.sql',
  '042_pos_parked_carts.sql',
  '043_pos_preorders.sql',
  '044_pos_product_sellable.sql',
  '045_pos_product_components_flat.sql',
  '046_pos_modifiers.sql',
  '047_pos_sale_order_no.sql',
  '048_pos_demo_cafe_store.sql',
  '049_pos_kitchen_prep.sql',
  '050_pos_stop_list_station.sql',
  '051_pos_parked_preorder_modifiers.sql',
  '052_pos_tables_bills.sql',
  '053_pos_demo_restaurant.sql',
] as const;

export function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}
