-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 015_pos_store_modules.sql
-- Per-store enabled feature modules. Core modules (catalog-checkout, settings,
-- hardware) are never stored here. An empty array resolves to the default set at
-- read time (see backend DEFAULT_ENABLED_MODULES) — the non-empty DEFAULT below
-- just means existing and new stores start with every toggleable module on, so
-- behaviour is unchanged until an owner opts out in Settings.
--
-- A constant array DEFAULT backfills existing rows in the single ALTER without a
-- table rewrite (Postgres 11+), so no separate UPDATE is needed.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS enabled_modules text[] NOT NULL
  DEFAULT ARRAY[
    'returns','customers','products','stock',
    'analytics','staff','gtin-enrichment','qr-payment'
  ]::text[];
