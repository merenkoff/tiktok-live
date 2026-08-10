-- migrations/005_pos_discounts_customers.sql
-- Variant compare_at (product discount), cart discount on sales, customers

ALTER TABLE pos_variants
  ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER NULL
  CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0);

CREATE TABLE IF NOT EXISTS pos_customers (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    children_birthdays JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_customers_store_phone
    ON pos_customers (store_id, phone);

CREATE INDEX IF NOT EXISTS idx_pos_customers_store_id ON pos_customers(store_id);

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES pos_customers(id) ON DELETE SET NULL;

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS cart_discount_type VARCHAR(16)
  CHECK (cart_discount_type IS NULL OR cart_discount_type IN ('percent', 'fixed'));

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS cart_discount_value INTEGER;

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS cart_discount_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS compare_at_unit_cents INTEGER
  CHECK (compare_at_unit_cents IS NULL OR compare_at_unit_cents >= 0);

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS line_discount_cents INTEGER NOT NULL DEFAULT 0
  CHECK (line_discount_cents >= 0);

COMMENT ON COLUMN pos_variants.compare_at_cents IS 'Strikethrough / old unit price; NULL = no product discount';
COMMENT ON TABLE pos_customers IS 'Store customers for POS receipts';
COMMENT ON COLUMN pos_sales.cart_discount_cents IS 'Allocated cart discount total in cents';
