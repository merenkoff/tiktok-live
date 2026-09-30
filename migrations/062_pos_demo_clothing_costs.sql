-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 062_pos_demo_clothing_costs.sql
-- The «Demo Clothing» purchase prices were ten times too small (TechDocs/
-- POS_CLOTHING.md, phase C0): a 690 ₴ T-shirt cost 28 ₴ (4 %), a 1 390 ₴
-- hoodie 61 ₴ — any margin shown off this demo read ~96 %. Migration 055 now
-- seeds 28 000 / 61 000 … (37–44 %, what a clothing shop really pays), which
-- fixes every database that builds the store from now on.
--
-- This is for the ones that already have it. 055 is stamped: a store at its
-- current version is left alone, and bumping the version would REBUILD the
-- catalogue and delete whatever the demo's public visitors rang up since. So
-- the correction is a one-shot UPDATE instead, the way 060 handles the demo
-- dishes.
--
-- Idempotent by its own guard: it touches a variant only while its cost is
-- still under a tenth of its price — 4 % before, ~40 % after — so a second
-- run (every boot re-applies every file) finds nothing to do, and a cost a
-- visitor typed in since is left alone once it is a believable one.

UPDATE pos_variants v
SET cost_cents = v.cost_cents * 10
FROM pos_stores s
WHERE s.id = v.store_id
  AND s.slug = 'demo-clothing'
  AND v.cost_cents > 0
  AND v.cost_cents * 10 <= v.price_cents;
