-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 078_pos_debt_partial.sql
-- Paying a «під запис» debt in parts (decision Д4, revised 2026-10-25;
-- TechDocs/grocery/G3_DEBTS.md §11).
--
-- The customer hands over any sum. It closes whole lines from the oldest, as
-- before; then part of the next line's units, when that line is counted in
-- pieces — an ordinary receipt for real goods, so a store with ПРРО has it
-- from the start; and what is left becomes a «внесок» on that same line —
-- money for those goods that does not close it yet (without ПРРО for now; a
-- Checkbox prepayment chain is step 2).
--
-- ── The decisions this file pins ───────────────────────────────────────────
--
-- 1. `paid_quantity` counts the units of a line paid by receipts, the one
--    that closed it included. A line is open while it is not written off, has
--    no closing receipt (`sale_id`) and `returned + paid < quantity`.
-- 2. What is owed is the line total minus the share of `returned + paid`
--    units, by the cumulative rule `refundLineAmount` uses, minus the
--    «внески». So the units of a line still add up to exactly its total in
--    whatever order they are returned or paid.
-- 3. A «внесок» is a row in `pos_sales` with no goods lines and the money as
--    its payment, pointing at the line it went to (`debt_prepay_item_id`):
--    takings, the receipt count and the payment split see it on its own day,
--    «Популярні товари» do not. The journal needs no new kind — it is a
--    `payment` with that sale's id, and voiding it is `payment_void`.
-- 4. The receipt that closes a line with «внески» carries the money taken now
--    (owed after them), and `debt_prepaid_cents` says how much came earlier,
--    so nothing is counted twice.
--
-- Re-runnable, like every file here: columns are IF NOT EXISTS, the CHECK is
-- dropped and re-added by name, and the backfill finds nothing to do on the
-- next boot.

ALTER TABLE pos_debt_items
  ADD COLUMN IF NOT EXISTS paid_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepaid_cents INTEGER NOT NULL DEFAULT 0;

-- Its own name: 073 re-adds `pos_debt_items_returned_check` on every boot, and
-- that one still holds.
ALTER TABLE pos_debt_items DROP CONSTRAINT IF EXISTS pos_debt_items_left_check;
ALTER TABLE pos_debt_items ADD CONSTRAINT pos_debt_items_left_check
  CHECK (
    paid_quantity >= 0
    AND prepaid_cents >= 0
    AND returned_quantity + paid_quantity <= quantity
  );

COMMENT ON COLUMN pos_debt_items.paid_quantity IS
  'Units of the line paid by repayment receipts, the closing one included (G3_DEBTS.md §11).';
COMMENT ON COLUMN pos_debt_items.prepaid_cents IS
  'Money taken toward the line as «внески» — not closing it — and not voided since.';

-- A line paid before this file was paid whole by its `sale_id`: those units
-- were paid. A void after this file then gives them back exactly.
UPDATE pos_debt_items
   SET paid_quantity = quantity - returned_quantity
 WHERE sale_id IS NOT NULL AND paid_quantity = 0 AND returned_quantity < quantity;

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS debt_prepay_item_id BIGINT REFERENCES pos_debt_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sales_debt_prepay
  ON pos_sales (debt_prepay_item_id) WHERE debt_prepay_item_id IS NOT NULL;

COMMENT ON COLUMN pos_sales.debt_prepay_item_id IS
  'Set on a «внесок»: money toward this «під запис» line, no goods lines of its own (G3_DEBTS.md §11).';

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS debt_prepaid_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pos_sale_items.debt_prepaid_cents IS
  'On the receipt that closed a «під запис» line: what was paid toward it earlier as «внески».';
