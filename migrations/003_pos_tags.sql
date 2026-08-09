-- migrations/003_pos_tags.sql
-- Product tags (many-to-many, up to 2 levels)

CREATE TABLE IF NOT EXISTS pos_tags (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES pos_tags(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_tags_store_id ON pos_tags(store_id);
CREATE INDEX IF NOT EXISTS idx_pos_tags_parent_id ON pos_tags(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_tags_store_parent_name
    ON pos_tags (store_id, COALESCE(parent_id, 0), lower(name));

CREATE TABLE IF NOT EXISTS pos_product_tags (
    product_id BIGINT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES pos_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_product_tags_tag_id ON pos_product_tags(tag_id);

COMMENT ON TABLE pos_tags IS 'Store product tags / label folders (max 2 levels)';
COMMENT ON TABLE pos_product_tags IS 'Many-to-many product ↔ tag';
