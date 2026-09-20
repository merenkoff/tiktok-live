-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 051_pos_parked_preorder_modifiers.sql
-- A modified line survives being parked or ordered ahead (café phase К3f,
-- TechDocs/POS_CAFE.md §10, POS_VERTICALS.md §7n).
--
-- Since 046 a parked cart and a pre-order REFUSED a line carrying modifiers
-- or a kitchen note — out loud, because silently dropping them hands a
-- latte on oat milk back as a plain latte. These are the columns that were
-- missing, in the shape `pos_sale_item_modifiers` already uses, inline:
--
--   modifiers  JSONB  [{ modifier_id, group_name, name, price_delta_cents,
--                        sort_order }] — a SNAPSHOT. The ids replay at
--                      checkout (and write off what the answer takes, from
--                      the live row); the names and deltas draw the restored
--                      line and, for a pre-order, are the promise itself: a
--                      renamed answer must not rewrite what was quoted, and a
--                      deleted one must not un-price it. NULL = none.
--   note       text   the kitchen note, bounded like the sale line's.
--
-- A pre-order's `unit_price_cents` lock already INCLUDES the deltas: it was
-- minted as card price + Σ deltas the day the order was taken, and checkout
-- never re-resolves it. A parked cart's reserve holds what the answers take
-- off the shelf, resolved by the same `resolveStockDemand({ extra })` the
-- sale uses.
--
-- Re-applied on every container start; everything here is IF NOT EXISTS.

ALTER TABLE pos_parked_cart_items
  ADD COLUMN IF NOT EXISTS modifiers JSONB NULL,
  ADD COLUMN IF NOT EXISTS note VARCHAR(120) NOT NULL DEFAULT '';

COMMENT ON COLUMN pos_parked_cart_items.modifiers IS
  'Snapshot of the answers this line chose: [{modifier_id, group_name, name, price_delta_cents, sort_order}] — the pos_sale_item_modifiers row shape inline. Ids replay at checkout; names draw the restored line. NULL = none.';
COMMENT ON COLUMN pos_parked_cart_items.note IS
  'Kitchen note for this line, restored with it. Never on the fiscal receipt.';

ALTER TABLE pos_preorder_items
  ADD COLUMN IF NOT EXISTS modifiers JSONB NULL,
  ADD COLUMN IF NOT EXISTS note VARCHAR(120) NOT NULL DEFAULT '';

COMMENT ON COLUMN pos_preorder_items.modifiers IS
  'Snapshot of the answers this line was ordered with, same shape as on pos_parked_cart_items. Part of the promise: unit_price_cents already includes their deltas, and the hand-over uses these names, never a re-resolved answer.';
COMMENT ON COLUMN pos_preorder_items.note IS
  'Kitchen note for this line, carried into the sale at hand-over. Never on the fiscal receipt.';
