-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 032 — what `serial_id` actually is (TechDocs/POS_FISCAL_OFFLINE.md).
--
-- Migration 027 recorded it as «Provider ordinal of the code; codes are handed
-- out in serial order», and the pool sorted by it. Two fixtures of the demo
-- register from 2026-09-12 show that is wrong: the same code TEST-VWvfoM came
-- back as serial_id 4 in one `get-offline-codes` response and serial_id 1 in
-- another the same day. The number describes the position in that response —
-- the list of still-unused codes, oldest first — not the code.
--
-- So the pool now spends codes in insertion order (our own `id`), which is the
-- order the provider listed them in. No data changes; only the note that would
-- mislead the next reader of the schema.

COMMENT ON COLUMN pos_fiscal_offline_codes.serial_id IS
  'Position of the code in the get-offline-codes response it arrived in — NOT a property of the code (the same code comes back with a different number in a later response). Kept for diagnostics; the pool spends codes in insertion order (id).';
