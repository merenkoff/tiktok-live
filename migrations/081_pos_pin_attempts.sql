-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 081_pos_pin_attempts.sql
-- Wrong PINs at the till, counted per store (src/pos/pin-attempts.ts,
-- TechDocs/POS_PIN_ATTEMPTS.md). Misses 1–4 are free, 5–9 close PIN login
-- for 1, 5, 15, 30 and 60 minutes, the 10th for an hour; a success, the
-- owner's «Розблокувати» or a new PIN clear both columns.
--
-- On the store row and not in process memory: every deploy restarts the API,
-- and a restart must not hand out ten fresh attempts.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS pin_failed_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

COMMENT ON COLUMN pos_stores.pin_failed_count IS
  'Wrong PINs in a row at this store''s tills since the last success or the owner''s reset (pin-attempts.ts).';
COMMENT ON COLUMN pos_stores.pin_locked_until IS
  'PIN login is closed until then: a wait after misses 5–9, a block after the 10th. NULL = open.';
