-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 052_pos_tables_bills.sql
-- Halls, tables, and the open bill that lives on one of them.
-- See TechDocs/POS_TABLES.md §8 (phase К4a).
--
-- At the counter a cart lives a minute and dies as a receipt. In a dining room
-- the cart stops being a cart: it becomes a BILL that sits on the server for
-- hours, takes rounds, gets split and moves between tables. That is a second
-- model of selling beside the first one, not a button on it — which is why it
-- gets its own tables rather than a `table_id` on `pos_parked_carts`.
--
-- ── Why not the parked cart ────────────────────────────────────────────────
--
-- `pos_parked_carts.expires_at` is NOT NULL and its lapse is a predicate read
-- in three places (the reserve view, the open list, `pickUp`) — there is no
-- null path and no "extend"; `pickUp` closes the cart TERMINALLY; there is no
-- endpoint that appends a line to an open cart, so every round would mean a
-- pick-up plus a fresh `parkCart` — a new bill id per round; and one cart maps
-- to at most one sale (`markSold` writes a single `sale_id`), so splitting has
-- nowhere to live. The parked cart stays the florist's.
--
-- And a bill needs no stock reserve at all: the owner chose to write stock off
-- WHEN A ROUND IS FIRED to the kitchen, so the movement is made by the round
-- itself (К4c). Nothing here holds anything.
--
-- ── The four decisions this file pins ──────────────────────────────────────
--
-- 1. `pos_bills.table_id` is ON DELETE **RESTRICT** while `pos_tables.hall_id`
--    is CASCADE. Dropping a hall takes its tables with it, but a table some
--    bill once sat at cannot vanish — that would erase the history behind a
--    sale. Retiring a table is `is_active = false`; the service says so in
--    words rather than letting Postgres raise a 500.
-- 2. One open bill per table is the PARTIAL UNIQUE INDEX below, not a check in
--    a service. That is what makes "open this table" idempotent and what makes
--    moving a bill onto an occupied table impossible at the level of the
--    database rather than at the level of two tablets' good intentions.
-- 3. `pos_bill_items.round_id IS NULL` **is** the draft: the line has not flown
--    to the kitchen, has not moved stock, has no locked price and is still
--    editable. Firing a round fills `round_id`, the price, the caption snapshot
--    and the stock snapshot in one transaction. Cancelling a round does NOT
--    return its lines to the draft — it stamps `cancelled_at` on the round and
--    reverses the movement; SET NULL here only guarantees that deleting a round
--    can never take a paid line with it.
-- 4. `pos_bill_item_components` mirrors `pos_sale_item_components` exactly, per
--    ONE unit, because paying a bill (К4d) copies it across verbatim WITHOUT
--    moving stock again — the round already did. A refund then reverses what
--    the round actually took, never the current recipe.
--
-- Re-runnable, like every file here: the runner re-applies all of them on every
-- container start. Tables and indexes are IF NOT EXISTS; every CHECK is dropped
-- and re-added by name, because a bare ADD CONSTRAINT fails on the second boot.
--
-- No demo data: the demo restaurant is К4k, its own migration with a version
-- stamp, like `039`/`048`.

-- ── Halls ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_halls (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- Retiring beats deleting: the terrace closes for winter and comes back in
    -- May with the same tables and the same history.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_halls_store
  ON pos_halls (store_id, sort_order, id);

COMMENT ON TABLE pos_halls IS
  'A room of a restaurant: the terrace, the main room. Owns tables, owns nothing else.';

-- ── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_tables (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    hall_id BIGINT NOT NULL REFERENCES pos_halls(id) ON DELETE CASCADE,
    -- Unique per STORE, not per hall: the waiter says «пʼятий», never «пʼятий
    -- on the terrace», and two tables answering to the same word is the bug
    -- that sends a round to the wrong room.
    name TEXT NOT NULL,
    seats INTEGER NOT NULL DEFAULT 2,
    -- Whole grid CELLS, never pixels: the owner lays the room out on a laptop
    -- and the waiter reads it on a tablet, and pixels would tie the layout to
    -- the screen it was drawn on. Overlap is not an error — a sofa stands
    -- against a wall — so nothing here forbids it.
    pos_x INTEGER NOT NULL DEFAULT 0,
    pos_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 2,
    height INTEGER NOT NULL DEFAULT 2,
    shape TEXT NOT NULL DEFAULT 'rect',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_tables DROP CONSTRAINT IF EXISTS pos_tables_shape_check;
ALTER TABLE pos_tables ADD CONSTRAINT pos_tables_shape_check
  CHECK (shape IN ('rect', 'round'));
ALTER TABLE pos_tables DROP CONSTRAINT IF EXISTS pos_tables_seats_check;
ALTER TABLE pos_tables ADD CONSTRAINT pos_tables_seats_check
  CHECK (seats > 0);
ALTER TABLE pos_tables DROP CONSTRAINT IF EXISTS pos_tables_geometry_check;
ALTER TABLE pos_tables ADD CONSTRAINT pos_tables_geometry_check
  CHECK (pos_x >= 0 AND pos_y >= 0 AND width > 0 AND height > 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tables_name
  ON pos_tables (store_id, name);
CREATE INDEX IF NOT EXISTS idx_pos_tables_hall
  ON pos_tables (hall_id, id);

COMMENT ON TABLE pos_tables IS
  'A table in a hall, positioned in grid cells. Named uniquely per store: the waiter calls it by that name.';

-- ── Bills ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_bills (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- RESTRICT, see the header: a table a bill sat at is history now.
    table_id BIGINT NOT NULL REFERENCES pos_tables(id) ON DELETE RESTRICT,
    -- The short daily number, keyed `bill_<store-local date>` through the same
    -- `pos_store_counters` that issues `order_no`. NOT NULL because this table
    -- is new and the only writer assigns it inside the opening transaction — a
    -- nullable short number that every screen prints is a trap.
    bill_no INTEGER NOT NULL,
    guests INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    -- SET NULL rather than CASCADE, as everywhere: deleting a customer must
    -- not delete the dinner they are in the middle of.
    customer_id BIGINT REFERENCES pos_customers(id) ON DELETE SET NULL,
    cart_discount JSONB,
    status TEXT NOT NULL DEFAULT 'open',
    -- A pre-bill is printed, never binding: it does not freeze the bill (the
    -- guest may still order coffee), it only shows on the table tile that the
    -- sum has already been read out loud. Under Закон 265/95-ВР it is not a
    -- settlement document at all — only the fiscal receipt is.
    precheck_printed_at TIMESTAMPTZ,
    opened_by BIGINT NOT NULL REFERENCES pos_staff(id),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_by BIGINT REFERENCES pos_staff(id),
    closed_at TIMESTAMPTZ,
    client_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_bills DROP CONSTRAINT IF EXISTS pos_bills_status_check;
ALTER TABLE pos_bills ADD CONSTRAINT pos_bills_status_check
  CHECK (status IN ('open', 'paid', 'cancelled'));
ALTER TABLE pos_bills DROP CONSTRAINT IF EXISTS pos_bills_guests_check;
ALTER TABLE pos_bills ADD CONSTRAINT pos_bills_guests_check
  CHECK (guests > 0);

-- Decision 2 of the header. Partial, so a table may carry any number of paid
-- bills over an evening and exactly one open one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bills_open_table
  ON pos_bills (store_id, table_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bills_uuid
  ON pos_bills (store_id, client_uuid) WHERE client_uuid IS NOT NULL;
-- The hall map: this store's open bills, and the day's list behind them.
CREATE INDEX IF NOT EXISTS idx_pos_bills_store_status
  ON pos_bills (store_id, status, opened_at DESC);

COMMENT ON TABLE pos_bills IS
  'An open bill on a table: lives for hours, takes rounds, is split into one or more sales. Never holds stock.';

-- ── Rounds ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_bill_rounds (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    bill_id BIGINT NOT NULL REFERENCES pos_bills(id) ON DELETE CASCADE,
    -- 1, 2, 3 within the bill. What the kitchen card says: «Стіл 5 · раунд 2».
    seq INTEGER NOT NULL,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fired_by BIGINT NOT NULL REFERENCES pos_staff(id),
    -- The same three states and the same two taps as a counter sale (049), so
    -- the kitchen board treats a round and a sale identically.
    prep_status TEXT NOT NULL DEFAULT 'new',
    ready_at TIMESTAMPTZ,
    served_at TIMESTAMPTZ,
    -- Cancelling a round reverses its stock movement; its lines stay on the
    -- round rather than falling back into the draft, because what the kitchen
    -- already started is a fact and not an edit.
    cancelled_at TIMESTAMPTZ,
    cancelled_by BIGINT REFERENCES pos_staff(id),
    client_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_bill_rounds DROP CONSTRAINT IF EXISTS pos_bill_rounds_prep_status_check;
ALTER TABLE pos_bill_rounds ADD CONSTRAINT pos_bill_rounds_prep_status_check
  CHECK (prep_status IN ('new', 'ready', 'served'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bill_rounds_seq
  ON pos_bill_rounds (bill_id, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bill_rounds_uuid
  ON pos_bill_rounds (store_id, client_uuid) WHERE client_uuid IS NOT NULL;
-- What the kitchen board reads: rounds still cooking or waiting to be handed
-- over. Deliberately not day-bounded — a bill opened before midnight is still
-- being eaten after it (§9.11).
CREATE INDEX IF NOT EXISTS idx_pos_bill_rounds_open
  ON pos_bill_rounds (store_id, fired_at)
  WHERE prep_status IN ('new', 'ready') AND cancelled_at IS NULL;

COMMENT ON TABLE pos_bill_rounds IS
  'One batch of a bill fired to the kitchen: the unit that moves stock, locks price and appears on the board.';

-- ── Bill lines ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_bill_items (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    bill_id BIGINT NOT NULL REFERENCES pos_bills(id) ON DELETE CASCADE,
    -- NULL is the draft. Decision 3 of the header.
    round_id BIGINT REFERENCES pos_bill_rounds(id) ON DELETE SET NULL,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    -- Written when the round is fired, never at payment: a bill that lives
    -- three hours must not be silently repriced mid-dinner by a menu edit.
    -- Both are null while the line is a draft.
    unit_price_cents INTEGER,
    compare_at_unit_cents INTEGER,
    -- Caption snapshot, also taken at fire time, in the shape a sale line
    -- carries it — modifiers already composed into `variant_label`.
    product_name TEXT,
    variant_label TEXT,
    unit TEXT,
    -- Exactly what `CompleteSaleItemInput` takes, so paying is a replay and
    -- not a translation: a bench-assembled composition, the chosen modifier
    -- ids with their snapshot, and the kitchen note (never on a fiscal line).
    components JSONB,
    modifiers JSONB,
    note VARCHAR(120) NOT NULL DEFAULT '',
    -- Which part of a split paid for this line. SET NULL for the same reason
    -- as everywhere: history about the line outlives the row it points at.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,
    -- §4.7: everyone sees every table, so the bill records who added what.
    added_by BIGINT NOT NULL REFERENCES pos_staff(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_bill_items_bill
  ON pos_bill_items (bill_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_pos_bill_items_round
  ON pos_bill_items (round_id) WHERE round_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_bill_items_sale
  ON pos_bill_items (sale_id) WHERE sale_id IS NOT NULL;

COMMENT ON TABLE pos_bill_items IS
  'A line of a bill. round_id IS NULL means a draft: not fired, no stock moved, no locked price.';

CREATE TABLE IF NOT EXISTS pos_bill_item_components (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    bill_item_id BIGINT NOT NULL REFERENCES pos_bill_items(id) ON DELETE CASCADE,
    component_variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    -- Per ONE unit, the same as `pos_sale_item_components`, because К4d copies
    -- this across verbatim and a partial refund is exact arithmetic over it.
    quantity_per_unit INTEGER NOT NULL CHECK (quantity_per_unit > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_bill_item_components_uniq
  ON pos_bill_item_components (bill_item_id, component_variant_id);

COMMENT ON TABLE pos_bill_item_components IS
  'What one unit of a fired bill line actually took off the shelf. Copied into pos_sale_item_components at payment, without moving stock again.';

-- ── The link back from a sale ──────────────────────────────────────────────

-- So a refund can tell which line of which bill is behind a line of a receipt.
-- SET NULL: a bill may be purged one day, a sold receipt may not.
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS bill_item_id BIGINT REFERENCES pos_bill_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_bill_item
  ON pos_sale_items (bill_item_id) WHERE bill_item_id IS NOT NULL;
