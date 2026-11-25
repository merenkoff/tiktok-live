-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 118: the cafe's tracker of kitchen orders (РК5, TechDocs/POS_REMOTE_KITCHEN.md §8).
--
-- `cancelled_by`: which side cancelled a paid order. A cancel from the kitchen
-- is news the cafe must act on — the guest has paid for a pizza that will not
-- come — so the cafe's till keeps a red line until a cashier says the guest
-- got the money back (`cancel_seen_at`). A cancel from the cafe (its own void
-- or «Скасувати») needs no such line. Rows cancelled before this file get the
-- side from the order's own journal.

ALTER TABLE pos_remote_orders ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE pos_remote_orders ADD COLUMN IF NOT EXISTS cancel_seen_at TIMESTAMPTZ;

ALTER TABLE pos_remote_orders DROP CONSTRAINT IF EXISTS pos_remote_orders_cancelled_by_check;
ALTER TABLE pos_remote_orders ADD CONSTRAINT pos_remote_orders_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('cafe', 'kitchen'));

UPDATE pos_remote_orders o
   SET cancelled_by = e.by
  FROM (
    SELECT DISTINCT ON (remote_order_id) remote_order_id, payload->>'by' AS by
      FROM pos_remote_order_events
     WHERE kind = 'cancelled' AND payload->>'by' IN ('cafe', 'kitchen')
     ORDER BY remote_order_id, at DESC, id DESC
  ) e
 WHERE o.id = e.remote_order_id AND o.status = 'cancelled' AND o.cancelled_by IS NULL;

-- What the cafe's till still has to tell its cashier.
CREATE INDEX IF NOT EXISTS idx_pos_remote_orders_cafe_unseen_cancel
  ON pos_remote_orders (cafe_store_id)
  WHERE status = 'cancelled' AND cancelled_by = 'kitchen' AND cancel_seen_at IS NULL;
