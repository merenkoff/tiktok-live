-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 084_pos_guest_feedback.sql
-- A guest's feedback from the QR menu (TechDocs/POS_QR_MENU_FEEDBACK.md,
-- phase F3): one tap on a face is already feedback; what went well or wrong
-- (chips), a few words and a phone are optional. Read by the owner (F4);
-- never shown to other guests.
--
-- The owner's switch, off by default. Unlike the bill, the orders and the
-- calls, feedback needs NO table key: it acts on nothing — it is a letter to
-- the owner — so a guest at the counter, with the venue's QR, may leave one
-- too. A table and its open bill are attached only when the QR proved them.
--
-- `phone` is personal data the guest offered so the owner can call back: it is
-- wiped after PHONE_RETENTION_DAYS by a daily cron (guest-feedback.service.ts);
-- the feedback itself stays.
--
-- Re-runnable: the runner applies every file on every boot.

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_menu_feedback BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_stores.public_menu_feedback IS
  'Guests may leave feedback from the QR menu (phase F3). Off by default.';

CREATE TABLE IF NOT EXISTS pos_guest_feedback (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- The table whose keyed QR was scanned, or NULL from the venue's QR.
    -- SET NULL: a retired table does not take the owner's feedback with it.
    table_id BIGINT REFERENCES pos_tables(id) ON DELETE SET NULL,
    -- The table's open bill at the time, when there was one (phase F5 rates its dishes).
    bill_id BIGINT REFERENCES pos_bills(id) ON DELETE SET NULL,
    -- Made by the guest's phone when the sheet opened: a retried POST is the same feedback.
    client_uuid UUID NOT NULL,
    score SMALLINT NOT NULL,
    -- Codes from FEEDBACK_TAGS (guest-feedback.service.ts), never free text.
    tags TEXT[] NOT NULL DEFAULT '{}',
    comment VARCHAR(600),
    phone VARCHAR(32),
    -- Where the sheet was opened from: the menu, or the table's bill.
    source TEXT NOT NULL DEFAULT 'menu',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The owner's «Опрацьовано» (phase F4).
    handled_at TIMESTAMPTZ,
    handled_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL
);

ALTER TABLE pos_guest_feedback DROP CONSTRAINT IF EXISTS pos_guest_feedback_score_check;
ALTER TABLE pos_guest_feedback ADD CONSTRAINT pos_guest_feedback_score_check CHECK (score BETWEEN 1 AND 5);
ALTER TABLE pos_guest_feedback DROP CONSTRAINT IF EXISTS pos_guest_feedback_source_check;
ALTER TABLE pos_guest_feedback ADD CONSTRAINT pos_guest_feedback_source_check CHECK (source IN ('menu', 'bill'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_guest_feedback_uuid
  ON pos_guest_feedback (store_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_pos_guest_feedback_store_created
  ON pos_guest_feedback (store_id, created_at DESC);
