-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 074_pos_debt_offline.sql
-- Goods given «під запис» by a desktop till that had no network
-- (TechDocs/grocery/G3_DEBTS.md §6, phase Г3 PR3).
--
-- The goods left with the customer while the till was offline; the till kept
-- the handover in its own queue and sends it when the connection is back. Such
-- an entry is DATED by the till: `created_at` of the entry and of its lines is
-- when the goods left (the service clamps it to the past), so the oldest-first
-- rule (decision Д4) and the owner's summary put it where it happened. This
-- column says when the server learnt of it, and its presence is the mark the
-- statement shows. NULL: written online.
--
-- Re-runnable, like every file here: one IF NOT EXISTS column.

ALTER TABLE pos_debt_entries
  ADD COLUMN IF NOT EXISTS offline_received_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_debt_entries.offline_received_at IS
  'When the server received an entry a desktop till wrote without a network; created_at is the till''s own time of the handover. NULL = written online.';
