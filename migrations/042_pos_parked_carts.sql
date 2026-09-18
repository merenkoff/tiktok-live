-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 042_pos_parked_carts.sql
-- A cart put aside at one till and rung up at another.
-- See TechDocs/POS_FLORIST_BENCH.md §9 (phase B4).
--
-- The florist assembles a bouquet, the customer wanders off to pick a card, and
-- the next person in the queue is already waiting. Or there are two tills and
-- the bouquet is paid for at the other one. Either way the cart has to leave the
-- screen without being rung — which is what the «Зберегти кошик» button has
-- promised and not delivered since the sell screen was written.
--
-- Deliberately on the SERVER, not in the till's IndexedDB: the whole point is
-- that a cart parked at one till can be picked up at another, and a cart that
-- only exists on the machine that parked it solves the smaller half of the
-- problem. The desktop cashier can still park while offline in a later phase —
-- that needs an id issued locally, the same problem the bench's «На вітрину»
-- has, and it is not this phase.
--
-- ── Reservations ───────────────────────────────────────────────────────────
--
-- Parking a bouquet holds its stems. Without that, the stems of a bouquet
-- sitting on the counter still read as free, and the second florist builds a
-- second bouquet out of roses that are physically already in the first one —
-- the exact case §9 deferred to this phase.
--
-- Three things decide the shape here:
--
-- 1. **What is held is resolved once, at parking time, by the same code the
--    sale uses.** A derived bouquet holds its stems; one assembled in advance
--    holds itself. Resolving it later, or separately, would let what a cart
--    holds drift from what ringing it consumes.
--
-- 2. **Expiry is a predicate, not a job.** `pos_parked_carts.expires_at` is
--    read by the view below, so a reserve is released the instant it lapses
--    even if the cleanup cron never runs. The cron only deletes rows nobody
--    will look at again; correctness does not depend on it having run.
--
-- 3. **A reserve never refuses a sale.** `applyStockDelta` already lets a sale
--    drive stock negative on purpose — a till that raced another one still
--    sold the goods, and refusing to record that loses money rather than
--    saving flowers. A reserve is the same kind of fact: it changes what the
--    catalog offers, never what the till may ring.

CREATE TABLE IF NOT EXISTS pos_parked_carts (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- Who put it aside. The other till shows this, because "whose bouquet is
    -- this" is the first question asked when picking one up.
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id),
    -- What the cashier calls it out loud: a customer's name, «троянди Оксані».
    -- Required: an unnamed parked cart is one nobody can ask for.
    label TEXT NOT NULL,
    note TEXT,
    -- SET NULL rather than CASCADE: deleting a customer must not silently
    -- delete the bouquet waiting on the counter for them.
    customer_id BIGINT REFERENCES pos_customers(id) ON DELETE SET NULL,
    -- Exactly what `completeSale` takes, so picking a cart up is a replay and
    -- not a translation.
    cart_discount JSONB,
    status TEXT NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'picked', 'released', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    -- Idempotency for the park itself, same rule as everywhere else at the
    -- till: a double tap on a flaky connection must not hold the stems twice.
    client_uuid UUID,
    -- What became of it. `sale_id` is ON DELETE SET NULL for the same reason as
    -- the customer: history about the cart outlives the row it points at.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,
    closed_by BIGINT REFERENCES pos_staff(id),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_parked_carts_uuid
  ON pos_parked_carts (store_id, client_uuid) WHERE client_uuid IS NOT NULL;
-- The list every till opens: this store's carts still waiting, newest first.
CREATE INDEX IF NOT EXISTS idx_pos_parked_carts_open
  ON pos_parked_carts (store_id, status, expires_at);

CREATE TABLE IF NOT EXISTS pos_parked_cart_items (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    cart_id BIGINT NOT NULL REFERENCES pos_parked_carts(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- The composition this ONE line was parked with — a bouquet assembled at
    -- the bench, whose catalogue card carries only a default recipe. Same
    -- shape as `CompleteSaleItemInput.components`; null for an ordinary line.
    components JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_parked_cart_items_cart
  ON pos_parked_cart_items (cart_id, sort_order, id);

CREATE TABLE IF NOT EXISTS pos_stock_reservations (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    cart_id BIGINT NOT NULL REFERENCES pos_parked_carts(id) ON DELETE CASCADE,
    -- The variant whose shelf this actually takes from, already resolved: the
    -- stems for a derived bouquet, the bouquet itself for one assembled in
    -- advance or for any ordinary product.
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_reservations_variant
  ON pos_stock_reservations (store_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_reservations_cart
  ON pos_stock_reservations (cart_id);

-- What is held right now, per variant.
--
-- A view rather than a counter column on `pos_stock`: a counter would have to
-- be decremented by whoever notices a cart lapsed, and «whoever notices» is
-- exactly how a reserve drifts into holding flowers that were sold last week.
-- Here nothing has to notice — `expires_at > NOW()` is evaluated on every read.
CREATE OR REPLACE VIEW pos_stock_reserved AS
  SELECT r.store_id,
         r.variant_id,
         SUM(r.quantity)::int AS reserved
  FROM pos_stock_reservations r
  JOIN pos_parked_carts c ON c.id = r.cart_id
  WHERE c.status = 'open' AND c.expires_at > NOW()
  GROUP BY r.store_id, r.variant_id;
