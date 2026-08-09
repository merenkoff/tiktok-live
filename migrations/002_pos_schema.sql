-- migrations/002_pos_schema.sql
-- POS for small clothing stores (shared Postgres, isolated from LIVE tables)

-- ============================================
-- STORES
-- ============================================
CREATE TABLE IF NOT EXISTS pos_stores (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(64) NOT NULL UNIQUE,
    currency VARCHAR(8) NOT NULL DEFAULT 'UAH',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Kyiv',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_stores_slug ON pos_stores(slug);

-- ============================================
-- STAFF
-- ============================================
CREATE TABLE IF NOT EXISTS pos_staff (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'seller')),
    display_name VARCHAR(255) NOT NULL,
    login VARCHAR(255),
    password_hash VARCHAR(255),
    pin_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_staff_store_id ON pos_staff(store_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_staff_store_login
    ON pos_staff(store_id, lower(login))
    WHERE login IS NOT NULL;

-- ============================================
-- SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_sessions (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_token ON pos_sessions(token);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_staff_id ON pos_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_expires_at ON pos_sessions(expires_at);

-- ============================================
-- CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS pos_categories (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_categories_store_id ON pos_categories(store_id);

-- ============================================
-- PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_products (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES pos_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_products_store_id ON pos_products(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_name ON pos_products(store_id, name);

-- ============================================
-- VARIANTS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_variants (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    size VARCHAR(64) NOT NULL DEFAULT '',
    color VARCHAR(64) NOT NULL DEFAULT '',
    sku VARCHAR(64),
    barcode VARCHAR(64),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_variants_store_id ON pos_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_variants_product_id ON pos_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_variants_store_barcode
    ON pos_variants(store_id, barcode)
    WHERE barcode IS NOT NULL AND barcode <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_variants_store_sku
    ON pos_variants(store_id, sku)
    WHERE sku IS NOT NULL AND sku <> '';

-- ============================================
-- STOCK
-- ============================================
CREATE TABLE IF NOT EXISTS pos_stock (
    variant_id BIGINT PRIMARY KEY REFERENCES pos_variants(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_store_id ON pos_stock(store_id);

-- ============================================
-- STOCK MOVEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_stock_movements (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason VARCHAR(32) NOT NULL CHECK (reason IN ('sale', 'refund', 'adjust', 'void', 'seed')),
    reference_type VARCHAR(32),
    reference_id BIGINT,
    note TEXT,
    staff_id BIGINT REFERENCES pos_staff(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_stock_movements_store_id ON pos_stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_movements_variant_id ON pos_stock_movements(variant_id);

-- ============================================
-- SALES
-- ============================================
CREATE TABLE IF NOT EXISTS pos_sales (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('completed', 'voided', 'refunded', 'partially_refunded')),
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    refunded_cents INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    voided_at TIMESTAMPTZ,
    UNIQUE (store_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_store_created ON pos_sales(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON pos_sales(store_id, status);

-- ============================================
-- SALE ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_sale_items (
    id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL,
    variant_label VARCHAR(255) NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
    refunded_quantity INTEGER NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale_id ON pos_sale_items(sale_id);

-- ============================================
-- PAYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_payments (
    id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    method VARCHAR(16) NOT NULL CHECK (method IN ('cash', 'card')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_sale_id ON pos_payments(sale_id);

-- ============================================
-- REFUNDS
-- ============================================
CREATE TABLE IF NOT EXISTS pos_refunds (
    id BIGSERIAL PRIMARY KEY,
    sale_id BIGINT NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    staff_id BIGINT NOT NULL REFERENCES pos_staff(id) ON DELETE RESTRICT,
    total_cents INTEGER NOT NULL CHECK (total_cents > 0),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_refunds_sale_id ON pos_refunds(sale_id);

CREATE TABLE IF NOT EXISTS pos_refund_items (
    id BIGSERIAL PRIMARY KEY,
    refund_id BIGINT NOT NULL REFERENCES pos_refunds(id) ON DELETE CASCADE,
    sale_item_id BIGINT NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pos_refund_items_refund_id ON pos_refund_items(refund_id);

COMMENT ON TABLE pos_stores IS 'POS stores (clothing shops)';
COMMENT ON TABLE pos_staff IS 'Store owners and sellers';
COMMENT ON TABLE pos_sessions IS 'POS auth sessions (DB-backed)';
COMMENT ON TABLE pos_products IS 'Product catalog';
COMMENT ON TABLE pos_variants IS 'Size/color variants with price and barcode';
COMMENT ON TABLE pos_stock IS 'Current stock per variant';
COMMENT ON TABLE pos_sales IS 'Completed sales / receipts';
