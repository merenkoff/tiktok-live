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
  '054_pos_variant_pack.sql',
  // The fourth demo store (clothing), same stamp pattern as 039/048/053.
  '055_pos_demo_clothing_store.sql',
  // The guest's QR menu: switch + URL token, and a fixed token for the demo cafés.
  '056_pos_public_menu.sql',
  // The guest sees their own table's bill: a per-table key, the owner's switch, the print-link secret.
  '057_pos_guest_bill.sql',
  // A guest's request for dishes at a table, accepted (or not) by a waiter; the owner's ordering switch.
  '058_pos_guest_orders.sql',
  // The guest menu's header: logo, address, phone and opening hours; the two demo cafés get theirs once.
  '059_pos_store_public_profile.sql',
  // What a dish says about what is in it: a line of composition and the allergens the owner ticked; demo dishes get theirs once.
  '060_pos_product_composition_allergens.sql',
  // A regular customer's personal discount, in whole percent; the till puts it in as the cart discount (clothing C0).
  '061_pos_customer_discount.sql',
  // The clothing demo's purchase prices were a tenth of what they should be; corrected once where 055 is already stamped.
  '062_pos_demo_clothing_costs.sql',
  // Mass markdown campaigns with a per-variant before/after snapshot (clothing D2).
  '063_pos_markdowns.sql',
  // Exchange link, refund reason/buyer, defect write-off (clothing R1/R2/R4).
  '064_pos_exchange.sql',
  // A receipt stub on an existing card + stubs grouped into one product (clothing S1).
  '065_pos_placeholder_product.sql',
  // A modifier answer priced per variant label — the crust that costs more on a 50 см pizza (demo «Sun City», PR A).
  '066_pos_modifier_label_deltas.sql',
  // The «Sun City» demo café (Malyn, no tables): the real menu, generated from scripts/demo-suncity/menu.json.
  '067_pos_demo_suncity.sql',
  // A guest calls a waiter or asks for the bill; a guest order may go straight to the kitchen (QR menu Q8/Q9).
  '068_pos_guest_calls_auto_kitchen.sql',
  // Four one-time copies of the demos for a reseller to play with (cash-demo-*, owner PIN 3333, seller 4444).
  '069_pos_cash_demo_stores.sql',
  // Leads from the marketing site with their journey, for the super admin's CRM tab; old `leads` carried over once.
  '070_crm_leads.sql',
  // Cash totals rounded to 10 or 50 kopecks (НБУ № 25), the owner's setting; sales and refunds keep the rounding.
  '071_pos_cash_rounding.sql',
  // A third fiscal ledger mode, `provider_offline`: the provider registered the document in its own offline session (ПРРО contract v2).
  '072_pos_fiscal_receipts_provider_offline.sql',
  // Goods given «під запис»: the customer's limit, an append-only journal and the lines it owes (grocery Г3).
  '073_pos_debts.sql',
  // A handover a desktop till wrote without a network: dated by the till, marked by when the server received it (Г3 PR3).
  '074_pos_debt_offline.sql',
  // Weighed goods: a price per kg/l (`price_per` 1000) over whole grams, and how the weight was taken (grocery Г4).
  '075_pos_weighed.sql',
  // The «Demo Grocery» store (grocery vertical): packed goods by EAN-13 and weighed ones by the kilogram; credentials in the header.
  '076_pos_demo_grocery_store.sql',
  // Five customers with a credit limit in demo-grocery, off the landing page's debt notebook — once, like 069.
  '077_pos_demo_grocery_credit.sql',
  // Paying a «під запис» debt in parts: units of a line, and «внески» toward the oldest one (Д4 revised).
  '078_pos_debt_partial.sql',
  // A «внесок» under ПРРО: the line's Checkbox prepayment chain, our number for it, and the sales that are its documents.
  '079_pos_debt_chain.sql',
  // «Коротка адреса»: the guest menu may also answer at /m/<slug>, the owner's opt-in; «Шабля» gets it once.
  '080_pos_public_menu_slug.sql',
  // Wrong PINs at the till, counted per store: waits after the 5th, an hour's block after the 10th.
  '081_pos_pin_attempts.sql',
  // The guest menu's header: email, Instagram/Facebook/TikTok handles and the Google card link; «Шабля» filled once.
  '082_pos_store_public_socials.sql',
  // The cork fee on the guest menu («Шабля» filled once) and `pos_products.menu_hidden`: sold at the till, never listed to guests.
  '083_pos_corkage_menu_hidden.sql',
  // A guest's feedback from the QR menu (one face, chips, words, a phone) and the owner's switch.
  '084_pos_guest_feedback.sql',
] as const;

export function readMigration(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
}
