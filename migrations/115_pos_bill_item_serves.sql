-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 115_pos_bill_item_serves.sql
-- «Роздача» (TechDocs/POS_PASS.md, phase B1): a round of a table's bill goes
-- to the kitchen whole, but it comes out in parts — often dish by dish, and
-- carried by different waiters. Until now only the ROUND had a state
-- (`pos_bill_rounds.prep_status`, migration 052: new → ready → served), so
-- «the borscht went out, the varenyky did not» had nowhere to live.
--
-- One row here is one act of carrying: «Оля took 2 of this line at 19:42».
-- The rows are the ONLY truth about how much of a line has been carried —
-- `served_quantity` is their sum, never a column kept beside them — because a
-- fired line never changes (its quantity is locked when the round fires), a
-- sum of live rows cannot drift from it, and an undo is a flag, not a second
-- number to keep in step. Every writer locks the line before it sums.
--
-- * `source` — `waiter` for a tap on «Роздача», `kitchen` for the rest of a
--   round the kitchen handed over with its own «Видано» (so the history says
--   who, and the sum stays uniform).
-- * `client_uuid` — one per request (a waiter carrying three plates sends one),
--   shared by its rows: a request replayed after a timeout answers with the
--   rows it already wrote instead of carrying the plates twice.
-- * `undone_at` — «Повернути»: the row stops counting, and stays.
--
-- Rounds already `served` before this migration have no rows; readers treat a
-- served round as fully carried (`servedQuantitySql`), so nothing is
-- back-filled and no author is invented.

CREATE TABLE IF NOT EXISTS pos_bill_item_serves (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    bill_id BIGINT NOT NULL REFERENCES pos_bills(id) ON DELETE CASCADE,
    round_id BIGINT NOT NULL REFERENCES pos_bill_rounds(id) ON DELETE CASCADE,
    bill_item_id BIGINT NOT NULL REFERENCES pos_bill_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'waiter',
    served_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    client_uuid UUID,
    undone_at TIMESTAMPTZ,
    undone_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL
);

-- Each CHECK is dropped and added again: every file here is re-applied on
-- every boot, and only one file adds these.
ALTER TABLE pos_bill_item_serves DROP CONSTRAINT IF EXISTS pos_bill_item_serves_quantity_check;
ALTER TABLE pos_bill_item_serves
  ADD CONSTRAINT pos_bill_item_serves_quantity_check CHECK (quantity > 0);

ALTER TABLE pos_bill_item_serves DROP CONSTRAINT IF EXISTS pos_bill_item_serves_source_check;
ALTER TABLE pos_bill_item_serves
  ADD CONSTRAINT pos_bill_item_serves_source_check CHECK (source IN ('waiter', 'kitchen'));

-- A waiter's row always has its request's key: that key is what makes a
-- replayed request harmless. The kitchen's «Видано» is its own guarded step.
ALTER TABLE pos_bill_item_serves DROP CONSTRAINT IF EXISTS pos_bill_item_serves_uuid_check;
ALTER TABLE pos_bill_item_serves
  ADD CONSTRAINT pos_bill_item_serves_uuid_check CHECK (source <> 'waiter' OR client_uuid IS NOT NULL);

-- One row per line per request: the backstop under the replay lookup.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bill_item_serves_uuid
  ON pos_bill_item_serves (store_id, client_uuid, bill_item_id)
  WHERE client_uuid IS NOT NULL;

-- How much of a line is carried: the live rows of that line.
CREATE INDEX IF NOT EXISTS idx_pos_bill_item_serves_live
  ON pos_bill_item_serves (bill_item_id)
  WHERE undone_at IS NULL;

-- Whether anything of a round went out (cancelling it is then refused).
CREATE INDEX IF NOT EXISTS idx_pos_bill_item_serves_round
  ON pos_bill_item_serves (round_id)
  WHERE undone_at IS NULL;

-- «Винесено» on the waiter's screen: one bill's history, newest first.
CREATE INDEX IF NOT EXISTS idx_pos_bill_item_serves_bill
  ON pos_bill_item_serves (bill_id, served_at DESC);
