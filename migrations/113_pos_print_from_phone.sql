-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 113_pos_print_from_phone.sql
-- A receipt rung on a phone prints on the till's computer when it is on
-- (TechDocs/POS_PHONE_TILL.md, Т2 «Ретранслятор»; the owner's word of
-- 2026-11-23). The queue is migration 090's — a table bill's receipts have
-- printed through it since ДК3-Г — and two columns are all a phone's receipt
-- needs on top:
--
--   print_expires_at — when the job stops being worth printing. A phone's
--     receipt is printed within ten minutes or never: the buyer left with the
--     QR on the screen, and a pile of old receipts after the lights come back
--     is paper nobody takes. NULL keeps a table's twelve hours.
--   print_copy — the job is a second copy («КОПІЯ ЧЕКА» on top), asked for
--     again from the phone or from «Чеки» after the first one printed.

ALTER TABLE pos_sales
    ADD COLUMN IF NOT EXISTS print_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS print_copy BOOLEAN NOT NULL DEFAULT FALSE;
