-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 068_pos_guest_calls_auto_kitchen.sql
-- Two things a guest at a table can now do from the QR menu
-- (TechDocs/POS_QR_MENU.md, phases Q8 and Q9):
--
--   Q8 — call a waiter, or ask for the bill. A call is not a request for
--        dishes, so it gets its own table rather than a kind of guest order:
--        it carries no lines, no prices and nothing a waiter accepts into a
--        bill, only «somebody, come to table 5».
--   Q9 — send an order straight to the kitchen and the bar, past the waiter,
--        when the owner has switched that on. Until now (058) nothing a guest
--        sent reached the kitchen, the stock or the bill before a waiter
--        accepted it; that stays the default and the safe choice.
--
-- What Q9 needs from the bill tables. `opened_by`, `added_by` and `fired_by`
-- were NOT NULL references to a person, and 058 refused a pseudo-staff
-- «guest» row (it would have to be hidden from every staff list). So an
-- author may now be NULL — but only when a flag says the guest did it, which
-- the CHECKs below hold. The flags, not the `guest_order_id` link, carry the
-- invariant: that link is `ON DELETE SET NULL`, and a CHECK leaning on it
-- would fail mid-cascade when a store is deleted and its guest orders go
-- before its bill lines do.
--
-- Re-runnable: the migration runner applies every file on every boot.
-- `DROP NOT NULL` on a column that is already nullable is a no-op, and 052's
-- `CREATE TABLE IF NOT EXISTS` never puts the NOT NULL back.

-- ── the owner's switches ───────────────────────────────────────────────────

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_call BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'off' — every guest order waits for a waiter (058, the default);
  -- 'reorders' — straight to the kitchen when the table already has an open
  --   bill, i.e. a waiter has seated the guests; a first order still waits;
  -- 'all' — straight to the kitchen always, the bill opening by itself.
  ADD COLUMN IF NOT EXISTS public_menu_auto_kitchen TEXT NOT NULL DEFAULT 'off',
  -- An order dearer than this waits for a waiter whatever the mode says.
  ADD COLUMN IF NOT EXISTS public_menu_auto_limit_cents INTEGER NOT NULL DEFAULT 200000,
  -- When, and by whom, the owner confirmed they had read the risks of
  -- switching auto-sending on. Kept after it is switched off again: it is a
  -- record that the warning was given, not a state.
  ADD COLUMN IF NOT EXISTS public_menu_auto_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_menu_auto_ack_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL;

ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_public_menu_auto_kitchen_check;
ALTER TABLE pos_stores ADD CONSTRAINT pos_stores_public_menu_auto_kitchen_check
  CHECK (public_menu_auto_kitchen IN ('off', 'reorders', 'all'));
ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_public_menu_auto_limit_check;
ALTER TABLE pos_stores ADD CONSTRAINT pos_stores_public_menu_auto_limit_check
  CHECK (public_menu_auto_limit_cents BETWEEN 100 AND 10000000);

-- ── a guest's order that went straight to the kitchen ──────────────────────

-- 058 carries the same list: it runs first on every boot and would otherwise
-- re-add a narrower CHECK that the first 'sent' row violates.
ALTER TABLE pos_guest_orders DROP CONSTRAINT IF EXISTS pos_guest_orders_status_check;
ALTER TABLE pos_guest_orders ADD CONSTRAINT pos_guest_orders_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled', 'sent'));

ALTER TABLE pos_guest_orders
  -- The round an auto-sent order became.
  ADD COLUMN IF NOT EXISTS round_id BIGINT REFERENCES pos_bill_rounds(id) ON DELETE SET NULL,
  -- What the order came to when the guest sent it (card prices + answers),
  -- the number the auto-send limit is compared with.
  ADD COLUMN IF NOT EXISTS total_cents INTEGER,
  -- A waiter's «Бачу» on the notice of an auto-sent order.
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seen_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL;

-- What the waiter's screen polls for: sent orders nobody has looked at yet.
CREATE INDEX IF NOT EXISTS idx_pos_guest_orders_unseen
  ON pos_guest_orders (store_id, table_id)
  WHERE status = 'sent' AND seen_at IS NULL;

-- ── a bill, a line and a round the guest authored ──────────────────────────

ALTER TABLE pos_bills ALTER COLUMN opened_by DROP NOT NULL;
ALTER TABLE pos_bills
  ADD COLUMN IF NOT EXISTS opened_by_guest BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_bills DROP CONSTRAINT IF EXISTS pos_bills_opened_by_check;
ALTER TABLE pos_bills ADD CONSTRAINT pos_bills_opened_by_check
  CHECK (opened_by IS NOT NULL OR opened_by_guest);

ALTER TABLE pos_bill_items ALTER COLUMN added_by DROP NOT NULL;
ALTER TABLE pos_bill_items
  ADD COLUMN IF NOT EXISTS added_by_guest BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_order_id BIGINT REFERENCES pos_guest_orders(id) ON DELETE SET NULL;
ALTER TABLE pos_bill_items DROP CONSTRAINT IF EXISTS pos_bill_items_added_by_check;
ALTER TABLE pos_bill_items ADD CONSTRAINT pos_bill_items_added_by_check
  CHECK (added_by IS NOT NULL OR added_by_guest);

ALTER TABLE pos_bill_rounds ALTER COLUMN fired_by DROP NOT NULL;
ALTER TABLE pos_bill_rounds
  ADD COLUMN IF NOT EXISTS fired_by_guest BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_order_id BIGINT REFERENCES pos_guest_orders(id) ON DELETE SET NULL;
ALTER TABLE pos_bill_rounds DROP CONSTRAINT IF EXISTS pos_bill_rounds_fired_by_check;
ALTER TABLE pos_bill_rounds ADD CONSTRAINT pos_bill_rounds_fired_by_check
  CHECK (fired_by IS NOT NULL OR fired_by_guest);

-- ── a guest calling a waiter (Q8) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_waiter_calls (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- A call is a note about a moment, like a guest order (058): it cascades
    -- rather than making a table or a store impossible to delete.
    table_id BIGINT NOT NULL REFERENCES pos_tables(id) ON DELETE CASCADE,
    -- 'waiter' — «Покликати офіціанта»; 'bill' — «Попросити рахунок».
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A call nobody answered is not a call any more: the guest is told so and
    -- may call again.
    expires_at TIMESTAMPTZ NOT NULL,
    answered_at TIMESTAMPTZ,
    answered_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL
);

ALTER TABLE pos_waiter_calls DROP CONSTRAINT IF EXISTS pos_waiter_calls_kind_check;
ALTER TABLE pos_waiter_calls ADD CONSTRAINT pos_waiter_calls_kind_check
  CHECK (kind IN ('waiter', 'bill'));
ALTER TABLE pos_waiter_calls DROP CONSTRAINT IF EXISTS pos_waiter_calls_status_check;
ALTER TABLE pos_waiter_calls ADD CONSTRAINT pos_waiter_calls_status_check
  CHECK (status IN ('pending', 'answered', 'expired', 'cancelled'));

-- One live call of each kind per table: a guest tapping twice, or the whole
-- table tapping at once, is one call — the index makes that so without a lock.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_waiter_calls_live
  ON pos_waiter_calls (store_id, table_id, kind)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pos_waiter_calls_store
  ON pos_waiter_calls (store_id, created_at DESC);

COMMENT ON COLUMN pos_stores.public_menu_call IS
  'Guests at a table may call a waiter or ask for the bill from the QR menu. Off until the owner switches it on.';
COMMENT ON COLUMN pos_stores.public_menu_auto_kitchen IS
  'off | reorders | all: whether a guest order goes straight to the kitchen instead of waiting for a waiter.';
COMMENT ON COLUMN pos_stores.public_menu_auto_limit_cents IS
  'A guest order dearer than this waits for a waiter even when auto-sending is on.';
COMMENT ON COLUMN pos_bills.opened_by_guest IS
  'The bill was opened by a guest order sent straight to the kitchen; opened_by is NULL until a waiter takes the table.';
COMMENT ON TABLE pos_waiter_calls IS
  'A guest at a table asking for a waiter or for the bill. Answered by a waiter''s «Іду».';
