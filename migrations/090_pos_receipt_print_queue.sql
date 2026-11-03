-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 090_pos_receipt_print_queue.sql
-- A table's receipts print on the bar's printer, whoever took the money
-- (track ДК, decision Д13, TechDocs/POS_DUAL_REGISTER.md): the waiter's tablet
-- has no printer, so paying a bill asks for the paper, and the desktop that
-- holds the «Чеки столів» printer takes the request, prints and says so.
-- Re-runnable: every statement guards itself.

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS print_requested_at TIMESTAMPTZ;
-- The device (X-POS-Device-ID) that took the job and when; a job taken and
-- not printed within two minutes goes back to the queue.
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS print_claimed_by TEXT;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS print_claimed_at TIMESTAMPTZ;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_sales.print_requested_at IS
  'A receipt to print on the store''s «Чеки столів» printer (a paid table bill, ДК3-Г); NULL = nobody asked.';
COMMENT ON COLUMN pos_sales.printed_at IS
  'When the desktop holding that printer printed it; NULL while it waits.';

CREATE INDEX IF NOT EXISTS idx_pos_sales_print_queue
  ON pos_sales (store_id, id)
  WHERE print_requested_at IS NOT NULL AND printed_at IS NULL;
