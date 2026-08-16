-- Offline cashier sync: idempotent sales + customer upsert by client_uuid

ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_customers_store_client_uuid
  ON pos_customers (store_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_store_client_uuid
  ON pos_sales (store_id, client_uuid)
  WHERE client_uuid IS NOT NULL;

COMMENT ON COLUMN pos_sales.client_uuid IS 'Client-generated UUID for offline sale idempotency';
COMMENT ON COLUMN pos_customers.client_uuid IS 'Client-generated UUID for offline customer upsert';

-- Sales may drive on-hand negative when two tills race; adjust/writeoff still blocked in app code.
ALTER TABLE pos_stock DROP CONSTRAINT IF EXISTS pos_stock_quantity_check;
