-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 043_pos_preorders.sql
-- A bouquet ordered now for a day that has not happened yet.
-- See TechDocs/POS_FLORIST_BENCH.md §14 (phase B6).
--
-- The florist's biggest days are booked in advance: 8 March, a wedding, a
-- funeral, a birthday somebody remembered a week early. What makes this its own
-- table rather than more columns on `pos_parked_carts` (migration 042) is that
-- almost every rule differs, and two of them are opposites.
--
-- ── It holds NO stock ──────────────────────────────────────────────────────
--
-- This is the one people get backwards, because a parked cart does exactly the
-- reverse. A cart parked at the till holds its stems for four hours: those
-- flowers are physically in the florist's hands. An order for 8 March must hold
-- nothing — the roses it will be made of have not been delivered yet, and
-- holding them would empty the catalogue for every customer standing in the shop
-- today. A pre-order is a promise to buy stems later, not a claim on stems now.
--
-- ── It is not paid until it is handed over ─────────────────────────────────
--
-- Money means a ПРРО receipt, and taking it at order time would mean either a
-- service receipt for an advance («отримання авансу») or a sale of goods that do
-- not exist. Both are real fiscal paths and neither is this phase. So the
-- fulfilment is an ORDINARY sale, through the ordinary checkout: the stock moves
-- then, the receipt prints then, and nothing here touches the fiscal layer.
--
-- ── Its price is locked ────────────────────────────────────────────────────
--
-- Quoted today, assembled in two weeks, by which time a rose costs more. The
-- shop promised a number and must not re-price against the customer
-- (`POS_FLORIST_BENCH.md` §3.5 forbids a freely settable LINE price; this is not
-- that). The distinction that keeps both rules true: the locked price lives in
-- `pos_preorder_items.unit_price_cents`, written by the server when the order
-- was taken, and checkout reads it FROM HERE rather than accepting one on the
-- wire. The client sends an order id, never a number.

CREATE TABLE IF NOT EXISTS pos_preorders (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- Who took the order. Kept for the same reason the parked cart keeps it:
    -- «чиє це замовлення» is the first question asked about one.
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id),

    -- Two people, deliberately. In a flower shop the person who pays and the
    -- person who receives are usually not the same, and collapsing them loses
    -- the only phone number worth calling when the courier cannot find the door.
    customer_id BIGINT REFERENCES pos_customers(id) ON DELETE SET NULL,
    recipient_name TEXT,
    recipient_phone TEXT,

    fulfilment TEXT NOT NULL DEFAULT 'pickup'
        CHECK (fulfilment IN ('pickup', 'delivery')),
    address TEXT,

    -- When it must be ready (pickup) or delivered. The window is how a florist
    -- actually promises: «до 14:00», «між 10 і 12».
    due_at TIMESTAMPTZ NOT NULL,
    due_window_minutes INTEGER CHECK (due_window_minutes IS NULL OR due_window_minutes > 0),

    -- What goes on the card. Not a note: the florist copies it by hand onto a
    -- card, so it is the customer's words and nobody else's.
    card_message TEXT,
    note TEXT,

    -- What the shop promised, at the moment it promised it. The lines carry the
    -- per-unit halves; this is the total the customer heard.
    quoted_total_cents INTEGER NOT NULL CHECK (quoted_total_cents >= 0),

    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'assembled', 'handed_over', 'cancelled')),
    -- The sale it became. SET NULL rather than CASCADE: what the shop promised
    -- outlives the receipt row it points at.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,

    client_uuid UUID,
    assembled_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    closed_by BIGINT REFERENCES pos_staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_preorders_uuid
  ON pos_preorders (store_id, client_uuid) WHERE client_uuid IS NOT NULL;
-- The florist's morning question: what is due, soonest first.
CREATE INDEX IF NOT EXISTS idx_pos_preorders_due
  ON pos_preorders (store_id, status, due_at);

CREATE TABLE IF NOT EXISTS pos_preorder_items (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    preorder_id BIGINT NOT NULL REFERENCES pos_preorders(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- THE LOCK. Written by the server when the order was taken, read by
    -- checkout when it is rung. Never accepted on the wire — that is what keeps
    -- this from being the freely settable line price §3.5 refuses.
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    -- The composition it was quoted with, when the florist designed one at the
    -- bench. Same shape as a parked cart's and a sale's, so ringing it is a
    -- replay rather than a translation.
    components JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_preorder_items_order
  ON pos_preorder_items (preorder_id, sort_order, id);
