-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 104: gross and net in a recipe (TechDocs/POS_VERTICALS.md §7t).
--
-- A recipe line's `quantity` is what leaves the shelf — the GROSS weight — and
-- it stays that: stock, the expanded recipes (045), the sale snapshots and the
-- cost all read it and none of them changes. What a cook's card says, though,
-- is the NET weight («картопля 100 г»), and the owner worked the 125 g out on
-- a calculator. `loss_bps` is the share of the gross that does not reach the
-- plate — peel, bones, what boils away — in basis points (2000 = 20 %); the
-- net is DERIVED from the two, `round(quantity × (1 − loss))`, and never
-- stored, so there is no second weight to drift from the first.
--
-- `pos_variants.prep_loss_bps` is the ingredient's USUAL loss: a typing aid,
-- like the purchase pack (054) — the editor offers it when the ingredient is
-- added to a recipe, and no sum ever reads it. NULL = not said.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS.

ALTER TABLE pos_product_components
  ADD COLUMN IF NOT EXISTS loss_bps INTEGER NOT NULL DEFAULT 0
  CHECK (loss_bps >= 0 AND loss_bps <= 9900);

ALTER TABLE pos_variants
  ADD COLUMN IF NOT EXISTS prep_loss_bps INTEGER
  CHECK (prep_loss_bps IS NULL OR (prep_loss_bps >= 0 AND prep_loss_bps <= 9900));

COMMENT ON COLUMN pos_product_components.loss_bps IS
  'Share of the line''s quantity (the gross weight, what leaves the shelf) that does not reach the dish, in basis points. The net weight is derived, never stored (migration 104).';
COMMENT ON COLUMN pos_variants.prep_loss_bps IS
  'The ingredient''s usual preparation loss in basis points — offered by the recipe editor when the ingredient is added, read by no sum (migration 104). NULL = not said.';
