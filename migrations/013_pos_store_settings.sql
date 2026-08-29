-- migrations/013_pos_store_settings.sql
-- Per-store admin settings: paid GTIN provider config + auto-print receipt.

-- upc.dev (paid GTIN provider) credentials/quota, editable in POS admin.
-- NULL → fall back to the server env vars.
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS gtin_api_key TEXT;
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS gtin_daily_limit INTEGER;
ALTER TABLE pos_stores DROP CONSTRAINT IF EXISTS pos_stores_gtin_daily_limit_check;
ALTER TABLE pos_stores ADD CONSTRAINT pos_stores_gtin_daily_limit_check
  CHECK (gtin_daily_limit IS NULL OR gtin_daily_limit > 0);

-- Auto-print the receipt after a completed sale on a station with a configured
-- thermal printer (Tauri desktop cashier). No-op on plain web.
ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS auto_print_receipt BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_stores.gtin_api_key IS 'upc.dev API key; NULL falls back to UPC_DEV_API_KEY env';
COMMENT ON COLUMN pos_stores.gtin_daily_limit IS 'upc.dev daily call cap; NULL falls back to GTIN_UPC_DEV_DAILY_LIMIT env / 100';
COMMENT ON COLUMN pos_stores.auto_print_receipt IS 'Auto-print receipt after a sale on a station with a configured thermal printer; no-op on plain web';
