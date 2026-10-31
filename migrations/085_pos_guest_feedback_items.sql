-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 085_pos_guest_feedback_items.sql
-- The dishes of the table's bill, rated 👍/👎 inside a feedback
-- (TechDocs/POS_QR_MENU_FEEDBACK.md, phase F5; the feedback itself is 084).
-- Only a guest whose QR proved the table sees the list — the server knows
-- what the table ate (`pos_bill_items`) and hands the page nothing but the
-- names — and the bill may already be paid: a guest rates the dinner after
-- paying for it, so the feedback attaches the table's open bill or the one
-- paid within the last hours.
--
-- `product_name` is a snapshot («Латте · M»): the owner reads «Борщ 👎» next
-- year even if the dish was renamed or the bill line went with its round.
--
-- Re-runnable: the runner applies every file on every boot.

CREATE TABLE IF NOT EXISTS pos_guest_feedback_items (
    id BIGSERIAL PRIMARY KEY,
    feedback_id BIGINT NOT NULL REFERENCES pos_guest_feedback(id) ON DELETE CASCADE,
    bill_item_id BIGINT REFERENCES pos_bill_items(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    verdict TEXT NOT NULL
);

ALTER TABLE pos_guest_feedback_items DROP CONSTRAINT IF EXISTS pos_guest_feedback_items_verdict_check;
ALTER TABLE pos_guest_feedback_items ADD CONSTRAINT pos_guest_feedback_items_verdict_check
  CHECK (verdict IN ('up', 'down'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_guest_feedback_items_line
  ON pos_guest_feedback_items (feedback_id, bill_item_id) WHERE bill_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_guest_feedback_items_feedback
  ON pos_guest_feedback_items (feedback_id);
