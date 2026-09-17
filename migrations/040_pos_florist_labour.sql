-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 040_pos_florist_labour.sql
-- What the shop charges for assembling a composite, on top of what its parts
-- cost the customer. See TechDocs/POS_FLORIST_BENCH.md §6.
--
-- Basis points rather than a percent so a shop can say 12.5% without a
-- floating-point column, and INTEGER so the price arithmetic stays exact —
-- every other money figure in this schema is an integer of the smallest unit.
--
-- Deliberately a percentage ON TOP, not a multiplier OF the retail sum. A
-- multiplier would compound a margin that is already there: in the demo store a
-- rose costs 40 ₴ and sells for 90 (×2.25), so another ×1.8 would be ×4 over
-- cost. The trade prices in two steps for the same reason — fresh goods marked
-- up over wholesale, then labour added to the marked-up subtotal.
--
-- Default 0: an existing store's prices do not move when this deploys. A new
-- flower shop is expected to set something around 25%.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS florist_labour_bps INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_florist_labour_bps_check;
ALTER TABLE pos_stores
  ADD CONSTRAINT pos_stores_florist_labour_bps_check
  CHECK (florist_labour_bps >= 0 AND florist_labour_bps <= 100000);

COMMENT ON COLUMN pos_stores.florist_labour_bps IS
  'Assembly charge on a composite, in basis points of its components'' retail sum (2500 = 25%). 0 = parts only.';

-- Give the demo shop the trade's usual figure, so the bench demonstrates the
-- feature instead of pricing a bouquet at cost. Guarded on 0, which every store
-- is on the deploy that adds the column — afterwards an owner's edit sticks.
-- (Setting the demo's charge back to exactly 0 would be re-seeded on the next
-- boot. It is a demo store; that is a cheap wart for a migration that has no
-- other way to know whether it has run.)
UPDATE pos_stores
   SET florist_labour_bps = 2500
 WHERE slug = 'demo-flowers' AND florist_labour_bps = 0;
