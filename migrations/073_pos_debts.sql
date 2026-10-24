-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 073_pos_debts.sql
-- Goods given «під запис» — the shop's debt notebook, kept by the till
-- (TechDocs/grocery/G3_DEBTS.md, phase Г3 of the grocery plan).
--
-- A customer takes goods now and pays later. Under the owner's scheme A the
-- handover is a NON-fiscal entry in this journal and the fiscal receipt is
-- issued when the money comes, for the goods being paid for. So nothing here
-- is a sale: a repayment is an ordinary sale (`pos_sales`) that names the
-- lines it pays.
--
-- ── The decisions this file pins ───────────────────────────────────────────
--
-- 1. The LINES are what is owed; the JOURNAL is an append-only record of every
--    event, each carrying the amount by which the open lines changed. So a
--    customer's balance is both the sum of the journal and the sum of what is
--    still owed on the open lines, and the service keeps the two equal. The
--    journal is never edited: a mistake is put right by a new entry with an
--    author (a return, or the owner's write-off), never by changing an old one.
-- 2. Credit is allowed only to a customer the owner gave a limit (decision Д2):
--    `credit_limit_cents` NULL means «no credit», and the owner can also lock
--    new credit without touching the debt already there.
-- 3. A debt line locks its price, its discount and what it took off the shelf
--    when it is given, the way a fired bill round does (052). Paying copies
--    the stock snapshot into the receipt WITHOUT moving stock again, and a
--    refund of that receipt reverses the copy.
-- 4. Every foreign key to a person or a product is NO ACTION: a customer with
--    a journal cannot be deleted (the service says so in words), and a variant
--    is archived, never deleted, in normal work. The demo migrations that DO
--    delete a catalogue on a rebuild delete these rows first.
--
-- The stock movement reason `credit` is added to the CHECK in 006, not here:
-- 006 re-adds that constraint by name on every boot, so a second, wider copy
-- here would be narrowed back by 006 and the first boot after the first credit
-- movement would never come up (CLAUDE.md, «Migration runner»).
--
-- Re-runnable, like every file here: tables and indexes are IF NOT EXISTS and
-- every CHECK is dropped and re-added by name.

-- ── the customer's credit ──────────────────────────────────────────────────

ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS credit_limit_cents INTEGER,
  ADD COLUMN IF NOT EXISTS credit_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS credit_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_set_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL;

ALTER TABLE pos_customers DROP CONSTRAINT IF EXISTS pos_customers_credit_limit_check;
ALTER TABLE pos_customers ADD CONSTRAINT pos_customers_credit_limit_check
  CHECK (credit_limit_cents IS NULL OR credit_limit_cents BETWEEN 100 AND 10000000);

COMMENT ON COLUMN pos_customers.credit_limit_cents IS
  'How much this customer may owe «під запис», in kopecks. NULL = credit not allowed (decision Д2). Written only by the owner.';
COMMENT ON COLUMN pos_customers.credit_locked IS
  'The owner stopped new credit for this customer; repayments and returns still go through.';

-- ── the journal ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_debt_entries (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES pos_customers(id),
    kind VARCHAR(16) NOT NULL,
    -- Signed: what the event did to the customer's balance.
    amount_cents INTEGER NOT NULL,
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id),
    -- The owner's reason for a write-off; a note on the others.
    reason VARCHAR(200),
    client_uuid VARCHAR(64),
    -- The repayment receipt behind a `payment` / `payment_void`. SET NULL like
    -- every link to a sale: the journal's history outlives a purged receipt.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_debt_entries DROP CONSTRAINT IF EXISTS pos_debt_entries_kind_check;
ALTER TABLE pos_debt_entries ADD CONSTRAINT pos_debt_entries_kind_check
  CHECK (kind IN ('issue', 'return', 'payment', 'payment_void', 'writeoff'));

ALTER TABLE pos_debt_entries DROP CONSTRAINT IF EXISTS pos_debt_entries_amount_check;
ALTER TABLE pos_debt_entries ADD CONSTRAINT pos_debt_entries_amount_check
  CHECK (
    (kind IN ('issue', 'payment_void') AND amount_cents > 0)
    OR (kind IN ('payment', 'writeoff') AND amount_cents < 0)
    OR (kind = 'return' AND amount_cents <= 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_debt_entries_uuid
  ON pos_debt_entries (store_id, client_uuid) WHERE client_uuid IS NOT NULL;
-- A receipt pays once and is voided at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_debt_entries_sale_kind
  ON pos_debt_entries (sale_id, kind) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_debt_entries_customer
  ON pos_debt_entries (store_id, customer_id, id);
CREATE INDEX IF NOT EXISTS idx_pos_debt_entries_created
  ON pos_debt_entries (store_id, created_at);

COMMENT ON TABLE pos_debt_entries IS
  'Append-only journal of goods given on credit and what happened to them. A customer''s balance is the sum of amount_cents.';

-- ── what is owed ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pos_debt_items (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL REFERENCES pos_customers(id),
    -- The `issue` entry that created the line.
    entry_id BIGINT NOT NULL REFERENCES pos_debt_entries(id),
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL DEFAULT '',
    -- Caption snapshot, modifiers already composed into the label.
    product_name TEXT NOT NULL,
    variant_label TEXT NOT NULL DEFAULT '',
    -- Locked when the goods were given (decision 3 of the header).
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    compare_at_unit_cents INTEGER,
    line_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
    modifiers JSONB,
    note VARCHAR(120) NOT NULL DEFAULT '',
    returned_quantity INTEGER NOT NULL DEFAULT 0,
    -- The repayment receipt that paid the line.
    sale_id BIGINT REFERENCES pos_sales(id) ON DELETE SET NULL,
    -- The owner's write-off that closed it.
    written_off_entry_id BIGINT REFERENCES pos_debt_entries(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_debt_items DROP CONSTRAINT IF EXISTS pos_debt_items_returned_check;
ALTER TABLE pos_debt_items ADD CONSTRAINT pos_debt_items_returned_check
  CHECK (returned_quantity BETWEEN 0 AND quantity);

-- The open lines of a customer, oldest first — the repayment order (Д4).
CREATE INDEX IF NOT EXISTS idx_pos_debt_items_open
  ON pos_debt_items (store_id, customer_id, created_at, id)
  WHERE sale_id IS NULL AND written_off_entry_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_pos_debt_items_sale
  ON pos_debt_items (sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_debt_items_entry
  ON pos_debt_items (entry_id);

COMMENT ON TABLE pos_debt_items IS
  'A line given on credit. Open while not paid (sale_id), not written off and not fully returned.';

CREATE TABLE IF NOT EXISTS pos_debt_item_components (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    debt_item_id BIGINT NOT NULL REFERENCES pos_debt_items(id) ON DELETE CASCADE,
    component_variant_id BIGINT NOT NULL REFERENCES pos_variants(id),
    -- Per ONE unit, as in `pos_sale_item_components`, which a repayment copies
    -- this into verbatim.
    quantity_per_unit INTEGER NOT NULL CHECK (quantity_per_unit > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_debt_item_components_uniq
  ON pos_debt_item_components (debt_item_id, component_variant_id);

COMMENT ON TABLE pos_debt_item_components IS
  'What one unit of a credit line took off the shelf. Copied into pos_sale_item_components at repayment, without moving stock again.';

-- Which lines a `return` entry gave back, and how much of each.
CREATE TABLE IF NOT EXISTS pos_debt_entry_lines (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    entry_id BIGINT NOT NULL REFERENCES pos_debt_entries(id) ON DELETE CASCADE,
    debt_item_id BIGINT NOT NULL REFERENCES pos_debt_items(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pos_debt_entry_lines_entry
  ON pos_debt_entry_lines (entry_id);

-- ── the link back from a receipt ───────────────────────────────────────────

-- So a void or a refund can tell a repayment line from a walk-in one, as
-- `bill_item_id` does for a table (052).
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS debt_item_id BIGINT REFERENCES pos_debt_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_debt_item
  ON pos_sale_items (debt_item_id) WHERE debt_item_id IS NOT NULL;
