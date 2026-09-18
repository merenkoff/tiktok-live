-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 044_pos_product_sellable.sql
-- A product that is not on the menu.
-- See TechDocs/POS_CAFE.md §4.8 and §9 (café phase К1).
--
-- Until now every active variant was on the sell screen, because every
-- product a shop had was something it sold: a florist's ribbon and kraft are
-- consumables AND things a customer may buy on their own. A café is the first
-- vertical where that stops being true — flour, coffee beans and milk are
-- counted, delivered, stock-taken and written off by recipes, and none of them
-- may ever land on a receipt.
--
-- So this is a column on the PRODUCT (an ingredient is an ingredient in every
-- size it comes in), read by exactly one query — `getCatalog`, the till's view
-- — and by nothing else: the owner's product list, stock reports, stock
-- documents, the stock count and the recipe editor all keep seeing it, since
-- a hidden ingredient is still the thing they are about. The stock count on
-- the till goes through the catalog endpoint too, which is why the endpoint
-- takes `include_unsellable=1` rather than hard-filtering.
--
-- Deliberately not `is_active = FALSE`: an archived product is gone from
-- everywhere, an ingredient is gone from one screen. And deliberately not a
-- third `kind` next to simple/composite: a semi-finished sauce is a composite
-- that is not sold, a bottle of syrup is a simple product that is not sold —
-- "on the menu" is orthogonal to what shape the product has.

ALTER TABLE pos_products
  ADD COLUMN IF NOT EXISTS sellable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN pos_products.sellable IS
  'On the sell screen. FALSE for an ingredient or a semi-finished product: counted and written off by recipes, never rung up. Read only by the catalog query.';
