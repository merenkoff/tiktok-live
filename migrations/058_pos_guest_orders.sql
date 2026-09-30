-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 058_pos_guest_orders.sql
-- A guest at a table asks for dishes from the QR menu; a waiter accepts
-- (TechDocs/POS_QR_MENU.md, phase Q6). Nothing here touches the bill: a guest
-- request lives in its OWN tables and becomes bill lines only when a waiter
-- accepts it, with the waiter's staff id — never as a draft line. Three
-- reasons, each one a way the obvious design would have been wrong:
--
--   1. `addDraftItem` is not idempotent (a replayed tap merges and doubles the
--      quantity), and a guest's double-tap on a slow phone is the normal case.
--      A request is keyed on `client_uuid`.
--   2. `fireRound` sends the WHOLE draft to the kitchen, so unapproved guest
--      lines sitting in the draft would go with the waiter's next «На кухню».
--   3. `pos_bill_items.added_by`, `pos_bills.opened_by` and
--      `pos_bill_rounds.fired_by` are NOT NULL foreign keys to a person. A
--      guest is not one, and a pseudo-staff row would have to be hidden from
--      every staff list.
--
-- `public_menu_ordering` is the owner's switch, off by default: it is meant to
-- be turned on once the waiters' screens show the requests.
--
-- Every foreign key cascades. A request is a note about a moment, not a record
-- anything else depends on, and a RESTRICT here would make deleting a table or
-- a dish (or the ordered store delete the demo migrations document) fail on a
-- request nobody remembers.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_menu_ordering BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS pos_guest_orders (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    table_id BIGINT NOT NULL REFERENCES pos_tables(id) ON DELETE CASCADE,
    -- Set when a waiter accepts: the bill the lines went to.
    bill_id BIGINT REFERENCES pos_bills(id) ON DELETE SET NULL,
    -- Made by the guest's phone, so a retried POST is the same request.
    client_uuid UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A request nobody answers is not an order: after this the guest is told
    -- to call a waiter and the waiter no longer sees it.
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    decided_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    reject_reason VARCHAR(120)
);

ALTER TABLE pos_guest_orders DROP CONSTRAINT IF EXISTS pos_guest_orders_status_check;
ALTER TABLE pos_guest_orders ADD CONSTRAINT pos_guest_orders_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_guest_orders_uuid
  ON pos_guest_orders (store_id, client_uuid);
-- What the waiter's screen and the per-table cap read: only the live ones.
CREATE INDEX IF NOT EXISTS idx_pos_guest_orders_pending
  ON pos_guest_orders (store_id, table_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS pos_guest_order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES pos_guest_orders(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- The captions as the guest saw them when they asked: a menu edited before
    -- the waiter looks must not rewrite what was requested.
    product_name TEXT NOT NULL,
    variant_label TEXT NOT NULL DEFAULT '',
    -- The answers the guest chose, in the shape a bill line carries them
    -- (`LineModifierSnapshot[]`); the ids inside are what the waiter's accept
    -- re-resolves against the live groups.
    modifiers JSONB,
    note VARCHAR(120) NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pos_guest_order_items_order
  ON pos_guest_order_items (order_id, sort_order, id);

COMMENT ON COLUMN pos_stores.public_menu_ordering IS
  'Guests may send dishes from the QR menu to a waiter for acceptance. Off until the owner switches it on.';
COMMENT ON TABLE pos_guest_orders IS
  'A guest''s request for dishes at a table. Becomes bill lines only when a waiter accepts it.';
