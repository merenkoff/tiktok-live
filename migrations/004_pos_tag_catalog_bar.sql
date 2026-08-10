-- migrations/004_pos_tag_catalog_bar.sql
-- Tag color for folder tiles + flag for register catalog bar ("Рядок категорій")

ALTER TABLE pos_tags
  ADD COLUMN IF NOT EXISTS color VARCHAR(32) NULL;

ALTER TABLE pos_tags
  ADD COLUMN IF NOT EXISTS show_in_catalog_bar BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_tags.color IS 'Palette key for register folder tile (green, rose, blue, ...)';
COMMENT ON COLUMN pos_tags.show_in_catalog_bar IS 'Show tag as text tab in register catalog bar';
