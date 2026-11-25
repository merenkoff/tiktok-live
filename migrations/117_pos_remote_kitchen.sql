-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 117_pos_remote_kitchen.sql
-- «Віддалена кухня» (TechDocs/POS_REMOTE_KITCHEN.md, phase РК1): a cafe till
-- asks another store's kitchen how long a dish will take, the kitchen names a
-- time (or the till's own rule does, §7.2), the guest agrees and pays, and the
-- kitchen cooks and sends it over. Two stores, two warehouses, one ФОП (§9).
--
-- Why the shape is what it is:
--
--   1. A link is written by hand (super-admin), never discovered: a store must
--      not be able to send orders into somebody else's kitchen. It is paused or
--      revoked by status and never deleted, because orders point at it.
--   2. A request lives in its OWN tables, keyed on the till's `client_uuid`,
--      for the same reason a guest order does (058): a retried tap on a slow
--      network is the normal case and must be the same request.
--   3. The kitchen's stock moves when the cafe has been paid, not before
--      (П2: «оплата одразу після згоди»), into
--      `pos_remote_order_item_components` — the same per-unit snapshot every
--      other stock-moving line keeps, so a cancel after payment gives back
--      exactly what was taken and not today's recipe.
--   4. The cafe's own sale line for such a dish carries
--      `remote_order_item_id` and moves no cafe stock (РК2).
--   5. Expiry is computed on read, as everywhere else in this code: there is
--      no cron, and a single instance polls.
--
-- Store ids and staff ids are BIGINT here because `pos_stores.id` and
-- `pos_staff.id` are BIGSERIAL (002).

-- ── Who may ask whom ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_kitchen_links (
    id BIGSERIAL PRIMARY KEY,
    cafe_store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    kitchen_store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    -- What the cafe shows its cashier and guest: «Кухня Пульчинелли».
    kitchen_title TEXT NOT NULL,
    -- The way out when the kitchen is silent or offline (П3, §8).
    kitchen_phone TEXT,
    -- Kitchen → cafe, fixed (П6). Owner of the cafe changes it.
    transit_minutes INTEGER NOT NULL DEFAULT 10,
    -- How long the till waits for the kitchen before offering the phone (П3).
    answer_seconds INTEGER NOT NULL DEFAULT 60,
    -- How long a named time holds before the till must ask again.
    quote_ttl_seconds INTEGER NOT NULL DEFAULT 180,
    -- At or below this total the till confirms by itself (П4). NULL = off.
    auto_confirm_max_min INTEGER DEFAULT 40,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_kitchen_links DROP CONSTRAINT IF EXISTS pos_kitchen_links_status_check;
ALTER TABLE pos_kitchen_links ADD CONSTRAINT pos_kitchen_links_status_check
  CHECK (status IN ('active', 'paused', 'revoked'));
ALTER TABLE pos_kitchen_links DROP CONSTRAINT IF EXISTS pos_kitchen_links_two_stores;
ALTER TABLE pos_kitchen_links ADD CONSTRAINT pos_kitchen_links_two_stores
  CHECK (cafe_store_id <> kitchen_store_id);
ALTER TABLE pos_kitchen_links DROP CONSTRAINT IF EXISTS pos_kitchen_links_numbers;
ALTER TABLE pos_kitchen_links ADD CONSTRAINT pos_kitchen_links_numbers
  CHECK (
    transit_minutes BETWEEN 0 AND 240
    AND answer_seconds BETWEEN 15 AND 600
    AND quote_ttl_seconds BETWEEN 30 AND 1800
    AND (auto_confirm_max_min IS NULL OR auto_confirm_max_min BETWEEN 5 AND 240)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_kitchen_links_pair
  ON pos_kitchen_links (cafe_store_id, kitchen_store_id);
CREATE INDEX IF NOT EXISTS idx_pos_kitchen_links_kitchen
  ON pos_kitchen_links (kitchen_store_id);

-- Which cafe dish is which kitchen dish. A row here is the mark «готується на
-- кухні»: the till asks the kitchen for this variant and sells it without
-- touching cafe stock.
CREATE TABLE IF NOT EXISTS pos_kitchen_link_items (
    link_id BIGINT NOT NULL REFERENCES pos_kitchen_links(id) ON DELETE CASCADE,
    cafe_variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    kitchen_variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (link_id, cafe_variant_id)
);

-- ── What the kitchen says about itself right now ────────────────────────────

CREATE TABLE IF NOT EXISTS pos_kitchen_status (
    kitchen_store_id BIGINT PRIMARY KEY REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- «Пауза прийому».
    accepting BOOLEAN NOT NULL DEFAULT TRUE,
    -- A pause lifts itself at this moment (read-time, no cron).
    paused_until TIMESTAMPTZ,
    -- «Черга зараз»: +0 / +10 / +20 minutes on top of every dish.
    load_minutes INTEGER NOT NULL DEFAULT 0,
    updated_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_kitchen_status DROP CONSTRAINT IF EXISTS pos_kitchen_status_load_check;
ALTER TABLE pos_kitchen_status ADD CONSTRAINT pos_kitchen_status_load_check
  CHECK (load_minutes BETWEEN 0 AND 180);

-- ── One request ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_remote_orders (
    id BIGSERIAL PRIMARY KEY,
    link_id BIGINT NOT NULL REFERENCES pos_kitchen_links(id) ON DELETE CASCADE,
    -- Denormalised from the link so each side's lists read one index.
    cafe_store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    kitchen_store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- Made by the cafe till; a retried POST is the same request.
    client_uuid UUID NOT NULL,
    -- The cashier changed the cart → a new revision, and the old time is void.
    revision INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'requested',
    quote_source TEXT,
    prep_minutes INTEGER,
    load_minutes INTEGER,
    transit_minutes INTEGER,
    -- What the kitchen's own numbers suggested, shown to the kitchen as a hint.
    suggested_minutes INTEGER,
    -- What was promised to the guest: prep + load + transit, rounded up to 5.
    quoted_minutes INTEGER,
    promised_at TIMESTAMPTZ,
    answer_deadline_at TIMESTAMPTZ,
    quote_expires_at TIMESTAMPTZ,
    decline_reason VARCHAR(160),
    -- «П-12»: the kitchen's daily counter, given at payment.
    order_no INTEGER,
    guest_label VARCHAR(80),
    note VARCHAR(200),
    cafe_sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,
    -- §10: the seam for a future delivery module. Only 'to_store' is used now.
    fulfilment TEXT NOT NULL DEFAULT 'to_store',
    delivery_address TEXT,
    delivery_id BIGINT,
    requested_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    quoted_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quoted_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    handed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_remote_orders DROP CONSTRAINT IF EXISTS pos_remote_orders_status_check;
ALTER TABLE pos_remote_orders ADD CONSTRAINT pos_remote_orders_status_check
  CHECK (status IN (
    'requested', 'quoted', 'declined', 'expired', 'guest_declined',
    'paid', 'cooking', 'ready', 'dispatched', 'arrived', 'handed_over', 'cancelled'
  ));
ALTER TABLE pos_remote_orders DROP CONSTRAINT IF EXISTS pos_remote_orders_quote_source_check;
ALTER TABLE pos_remote_orders ADD CONSTRAINT pos_remote_orders_quote_source_check
  CHECK (quote_source IS NULL OR quote_source IN ('kitchen', 'auto', 'phone'));
ALTER TABLE pos_remote_orders DROP CONSTRAINT IF EXISTS pos_remote_orders_fulfilment_check;
ALTER TABLE pos_remote_orders ADD CONSTRAINT pos_remote_orders_fulfilment_check
  CHECK (fulfilment IN ('to_store', 'delivery'));
ALTER TABLE pos_remote_orders DROP CONSTRAINT IF EXISTS pos_remote_orders_two_stores;
ALTER TABLE pos_remote_orders ADD CONSTRAINT pos_remote_orders_two_stores
  CHECK (cafe_store_id <> kitchen_store_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_remote_orders_uuid
  ON pos_remote_orders (cafe_store_id, client_uuid);
-- The kitchen's inbox and board: everything not yet finished.
CREATE INDEX IF NOT EXISTS idx_pos_remote_orders_kitchen_live
  ON pos_remote_orders (kitchen_store_id, requested_at)
  WHERE status IN ('requested', 'quoted', 'paid', 'cooking', 'ready', 'dispatched', 'arrived');
-- The cafe's strip of orders on the way.
CREATE INDEX IF NOT EXISTS idx_pos_remote_orders_cafe_live
  ON pos_remote_orders (cafe_store_id, requested_at)
  WHERE status IN ('requested', 'quoted', 'paid', 'cooking', 'ready', 'dispatched', 'arrived');
-- One sale pays for at most one request.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_remote_orders_sale
  ON pos_remote_orders (cafe_sale_id) WHERE cafe_sale_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pos_remote_order_items (
    id BIGSERIAL PRIMARY KEY,
    remote_order_id BIGINT NOT NULL REFERENCES pos_remote_orders(id) ON DELETE CASCADE,
    cafe_variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    kitchen_variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- Captions as the cashier saw them, so a menu edit does not rewrite history.
    product_name TEXT NOT NULL DEFAULT '',
    variant_label TEXT NOT NULL DEFAULT '',
    -- The answers chosen at the till, in the shape a bill line carries them.
    modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
    note VARCHAR(120) NOT NULL DEFAULT '',
    -- The kitchen marked this line «немає» while answering.
    problem TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE pos_remote_order_items DROP CONSTRAINT IF EXISTS pos_remote_order_items_problem_check;
ALTER TABLE pos_remote_order_items ADD CONSTRAINT pos_remote_order_items_problem_check
  CHECK (problem IS NULL OR problem IN ('stop', 'unavailable'));

CREATE INDEX IF NOT EXISTS idx_pos_remote_order_items_order
  ON pos_remote_order_items (remote_order_id, sort_order, id);

-- What one unit of a paid line took off the KITCHEN's shelf. Same arithmetic
-- as pos_bill_item_components (052), so a cancel gives back exactly this.
CREATE TABLE IF NOT EXISTS pos_remote_order_item_components (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    remote_order_item_id BIGINT NOT NULL REFERENCES pos_remote_order_items(id) ON DELETE CASCADE,
    component_variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity_per_unit INTEGER NOT NULL CHECK (quantity_per_unit > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_remote_order_item_components_uniq
  ON pos_remote_order_item_components (remote_order_item_id, component_variant_id);

-- Who did what, when. For «чому піца їхала 50 хвилин».
CREATE TABLE IF NOT EXISTS pos_remote_order_events (
    id BIGSERIAL PRIMARY KEY,
    remote_order_id BIGINT NOT NULL REFERENCES pos_remote_orders(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_store_id BIGINT,
    actor_staff_id BIGINT,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pos_remote_order_events_order
  ON pos_remote_order_events (remote_order_id, at, id);

-- ── The kitchen's paper (РК3) ──────────────────────────────────────────────

-- A paid order is a ticket on the kitchen's printer, like a table's round
-- (109/110): the cafe's till is not where that printer is, so the payment
-- leaves a job here and the kitchen's desktop takes it, prints it and says so
-- — the same two-minute lease. A cancel after the ticket was printed or taken
-- leaves a second job, `cancel`, printed as «СКАСОВАНО».
CREATE TABLE IF NOT EXISTS pos_remote_order_prints (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    remote_order_id BIGINT NOT NULL REFERENCES pos_remote_orders(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('fire', 'cancel')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_by TEXT,
    claimed_at TIMESTAMPTZ,
    printed_at TIMESTAMPTZ,
    PRIMARY KEY (remote_order_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_pos_remote_order_prints_waiting
  ON pos_remote_order_prints (store_id, requested_at)
  WHERE printed_at IS NULL;

-- ── The cafe's receipt line points back ─────────────────────────────────────

-- SET NULL: a request may be purged one day, a sold receipt may not.
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS remote_order_item_id BIGINT
    REFERENCES pos_remote_order_items(id) ON DELETE SET NULL;

COMMENT ON TABLE pos_kitchen_links IS
  'A cafe may ask this kitchen for dishes (Віддалена кухня). Written by super-admin, revoked by status.';
COMMENT ON TABLE pos_kitchen_link_items IS
  'Cafe variant → kitchen variant. A row marks the cafe dish as cooked in the remote kitchen.';
COMMENT ON TABLE pos_remote_orders IS
  'A cafe till''s request to a remote kitchen: time quoted, paid, cooked, carried, handed over.';
COMMENT ON TABLE pos_remote_order_item_components IS
  'What one unit of a paid remote line took off the kitchen''s shelf; a cancel gives back exactly this.';
COMMENT ON TABLE pos_remote_order_prints IS
  'Kitchen tickets of paid remote orders, taken and confirmed by the kitchen''s desktop (lease 2 min).';
COMMENT ON COLUMN pos_sale_items.remote_order_item_id IS
  'The remote-kitchen line behind this receipt line. Such a line moved no stock in the cafe.';
