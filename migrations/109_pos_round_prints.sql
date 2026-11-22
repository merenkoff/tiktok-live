-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 109_pos_round_prints.sql
-- The print queue of a table's rounds for the kitchen and the bar
-- (TechDocs/POS_TABLES.md §11, «Друк раундів»).
--
-- A round is fired from a waiter's tablet, the bar's till or a guest's phone,
-- and none of them is where the kitchen's printer is. So `fireRoundTx` leaves
-- one row here per station the round's lines are made at, and the desktop
-- whose «Обладнання» holds that station's printer takes the job, prints the
-- ticket and says so — the same lease the «Чеки столів» queue uses (migration
-- 090): taking a job is not printing it, and a desktop that does not confirm
-- within two minutes gives it back.
--
-- Rounds fired before this file have no row and are never printed.

CREATE TABLE IF NOT EXISTS pos_round_prints (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    round_id BIGINT NOT NULL REFERENCES pos_bill_rounds(id) ON DELETE CASCADE,
    station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,
    printed_at TIMESTAMPTZ,
    PRIMARY KEY (round_id, station)
);

CREATE INDEX IF NOT EXISTS idx_pos_round_prints_waiting
    ON pos_round_prints (store_id, requested_at)
    WHERE printed_at IS NULL;
