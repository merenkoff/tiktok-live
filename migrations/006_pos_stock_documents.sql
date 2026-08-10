-- migrations/006_pos_stock_documents.sql
-- Stock documents (receipt / writeoff / adjustment / inventory) + ledger extensions

-- ============================================
-- SUPPLIERS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_suppliers (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32),
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_suppliers_store_id ON pos_suppliers(store_id);

-- ============================================
-- DOCUMENT COUNTERS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_store_counters (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    counter_key VARCHAR(32) NOT NULL,
    next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value >= 1),
    PRIMARY KEY (store_id, counter_key)
);

-- ============================================
-- STOCK DOCUMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_stock_documents (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL
        CHECK (type IN ('receipt', 'writeoff', 'adjustment', 'inventory')),
    status VARCHAR(16) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'posted', 'voided', 'reversed')),
    doc_number VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    supplier_id BIGINT REFERENCES pos_suppliers(id) ON DELETE SET NULL,
    reason_code VARCHAR(32),
    note TEXT,
    created_by BIGINT NOT NULL REFERENCES pos_staff(id) ON DELETE RESTRICT,
    posted_by BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    posted_at TIMESTAMPTZ,
    reversed_at TIMESTAMPTZ,
    reversal_of_id BIGINT REFERENCES pos_stock_documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, doc_number)
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_documents_store_created
    ON pos_stock_documents(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_stock_documents_store_type_status
    ON pos_stock_documents(store_id, type, status);
CREATE INDEX IF NOT EXISTS idx_pos_stock_documents_occurred
    ON pos_stock_documents(store_id, occurred_at DESC);

-- ============================================
-- DOCUMENT LINES
-- ============================================
CREATE TABLE IF NOT EXISTS pos_stock_document_lines (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES pos_stock_documents(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
    system_qty INTEGER,
    counted_qty INTEGER,
    line_note TEXT,
    UNIQUE (document_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_document_lines_document
    ON pos_stock_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_document_lines_variant
    ON pos_stock_document_lines(variant_id);

-- ============================================
-- IDEMPOTENCY
-- ============================================
CREATE TABLE IF NOT EXISTS pos_idempotency_keys (
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    key VARCHAR(128) NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (store_id, key)
);

-- ============================================
-- LEDGER: extend reasons + analytics columns
-- ============================================
ALTER TABLE pos_stock_movements DROP CONSTRAINT IF EXISTS pos_stock_movements_reason_check;
ALTER TABLE pos_stock_movements
    ADD CONSTRAINT pos_stock_movements_reason_check
    CHECK (reason IN ('sale', 'refund', 'adjust', 'void', 'seed', 'receipt', 'writeoff', 'inventory'));

ALTER TABLE pos_stock_movements
    ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER
    CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

ALTER TABLE pos_stock_movements
    ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

UPDATE pos_stock_movements
SET occurred_at = created_at
WHERE occurred_at IS NULL;

ALTER TABLE pos_stock_movements
    ALTER COLUMN occurred_at SET DEFAULT NOW();

ALTER TABLE pos_stock_movements
    ALTER COLUMN occurred_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_stock_movements_occurred
    ON pos_stock_movements(store_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_stock_movements_reason_occurred
    ON pos_stock_movements(store_id, reason, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_stock_movements_reference
    ON pos_stock_movements(reference_type, reference_id);
