-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 061_pos_customer_discount.sql
-- A regular customer's personal discount (TechDocs/POS_CLOTHING.md, phase C0).
--
-- The owner's and the cashier's guides have long said «знижка клієнта — постійна,
-- задана в картці клієнта; на касі вона підставляється сама», and there was no
-- such column: a customer was only attached to the sale as `customer_id` and
-- changed nothing. This is that column.
--
-- WHOLE PERCENT, 0..100. Not basis points, not a decimal: the discount travels
-- through the existing cart-discount mechanism (`pos_sales.cart_discount_value`
-- is an INTEGER percent), and a fractional one would need a second column type
-- on every sale for a tier nobody asked for (3 %, 5 %, 10 % are the real ones).
--
-- 0 means «no discount» and is the default, so a store that never opens the new
-- field is untouched. Only the owner writes it (the routes enforce that — a
-- cashier can create and correct a customer but may not hand out a price).
--
-- The runner re-applies every file on every boot, hence IF NOT EXISTS and a
-- CHECK that is dropped before it is added.

ALTER TABLE pos_customers
  ADD COLUMN IF NOT EXISTS discount_percent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_customers DROP CONSTRAINT IF EXISTS pos_customers_discount_percent_check;
ALTER TABLE pos_customers ADD CONSTRAINT pos_customers_discount_percent_check
  CHECK (discount_percent BETWEEN 0 AND 100);

COMMENT ON COLUMN pos_customers.discount_percent IS
  'Personal discount in whole percent (0..100), applied by the till as the cart discount when the customer is chosen. 0 = none. Written only by the owner.';
