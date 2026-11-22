-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 110_pos_round_print_cancel.sql
-- A paper «СКАСОВАНО» for a round the kitchen already has on paper
-- (TechDocs/POS_TABLES.md §11, «Друк раундів»).
--
-- A round cancelled before its ticket was taken prints nothing at all (the
-- queue skips cancelled rounds), so the cook never sees it. One whose ticket
-- is already printed — or taken by a desktop that may be printing it right
-- now — leaves a second job per such station, `kind = 'cancel'`, which the
-- same desktop prints as «СКАСОВАНО · Не готувати» with the round's lines.
--
-- The key grows by `kind` so one round and station can hold both jobs. Every
-- statement is re-runnable: the runner re-applies this file on every boot.

ALTER TABLE pos_round_prints
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'fire';

ALTER TABLE pos_round_prints DROP CONSTRAINT IF EXISTS pos_round_prints_kind_check;
ALTER TABLE pos_round_prints
    ADD CONSTRAINT pos_round_prints_kind_check CHECK (kind IN ('fire', 'cancel'));

DO $pk$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = 'pos_round_prints'::regclass
           AND c.contype = 'p'
           AND a.attname = 'kind'
    ) THEN
        ALTER TABLE pos_round_prints DROP CONSTRAINT IF EXISTS pos_round_prints_pkey;
        ALTER TABLE pos_round_prints ADD CONSTRAINT pos_round_prints_pkey PRIMARY KEY (round_id, station, kind);
    END IF;
END
$pk$;
