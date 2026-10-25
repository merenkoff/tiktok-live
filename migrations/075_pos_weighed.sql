-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 075_pos_weighed.sql
-- Weighed goods: a price per kilogram or litre over a quantity that stays a
-- whole number of grams or millilitres (TechDocs/grocery/G4_WEIGHED.md, phase
-- Г4 PR1).
--
-- 350 g of cheese is still quantity 350 in unit 'г' — stock, documents,
-- reservations and write-off snapshots do not change. What changes is what
-- the price on the row is FOR: `price_per` base units. 1 is every row there
-- was before this file (a price per piece, per gram, per millilitre); 1000 is
-- a weighed variant, priced per kg or per l. A column rather than a rule of
-- the store's vertical, because every reader of the number — the sale, the
-- offline till, the price tag, the fiscal document, analytics — has to know
-- what it means without asking, and a store's vertical can change.
--
-- The sale line and the «під запис» line keep `price_per` next to the price
-- they locked, so a receipt from last year never changes meaning, and
-- `weight_source` — how the weight was taken. Г4 knows only 'manual' (typed
-- in from a plain scale's display); 'label' (a scale's barcode label, Г6) and
-- 'scale' (a connected scale, Г9) are reserved here so those phases need no
-- migration of their own. A line has a source exactly when it is weighed.
--
-- Re-runnable, like every file here: IF NOT EXISTS columns, and constraints
-- dropped and added again by name. Only this file adds them.

ALTER TABLE pos_variants ADD COLUMN IF NOT EXISTS price_per INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_variants DROP CONSTRAINT IF EXISTS pos_variants_price_per_check;
ALTER TABLE pos_variants ADD CONSTRAINT pos_variants_price_per_check
  CHECK (price_per IN (1, 1000) AND (price_per = 1 OR unit IN ('г', 'мл')));

ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS price_per INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS weight_source TEXT;
ALTER TABLE pos_sale_items DROP CONSTRAINT IF EXISTS pos_sale_items_price_per_check;
ALTER TABLE pos_sale_items ADD CONSTRAINT pos_sale_items_price_per_check
  CHECK (
    price_per IN (1, 1000)
    AND (price_per = 1 OR unit IN ('г', 'мл'))
    AND (
      (price_per = 1 AND weight_source IS NULL)
      OR (price_per > 1 AND weight_source IN ('manual', 'label', 'scale'))
    )
  );

ALTER TABLE pos_debt_items ADD COLUMN IF NOT EXISTS price_per INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pos_debt_items ADD COLUMN IF NOT EXISTS weight_source TEXT;
ALTER TABLE pos_debt_items DROP CONSTRAINT IF EXISTS pos_debt_items_price_per_check;
ALTER TABLE pos_debt_items ADD CONSTRAINT pos_debt_items_price_per_check
  CHECK (
    price_per IN (1, 1000)
    AND (price_per = 1 OR unit IN ('г', 'мл'))
    AND (
      (price_per = 1 AND weight_source IS NULL)
      OR (price_per > 1 AND weight_source IN ('manual', 'label', 'scale'))
    )
  );

COMMENT ON COLUMN pos_variants.price_per IS
  'How many base units price_cents and compare_at_cents are for: 1 = per piece/g/ml, 1000 = a weighed variant priced per kg or l (unit г/мл). Derived from the store''s vertical on every write, never sent by a client.';
COMMENT ON COLUMN pos_sale_items.price_per IS
  'The basis unit_price_cents was locked at: 1, or 1000 for a weighed line (quantity in g/ml, price per kg/l).';
COMMENT ON COLUMN pos_sale_items.weight_source IS
  'How a weighed line''s weight was taken: manual (typed from a plain scale), label (a scale''s barcode, Г6), scale (a connected scale, Г9). NULL exactly when the line is not weighed.';
COMMENT ON COLUMN pos_debt_items.price_per IS
  'As pos_sale_items.price_per: the basis the line''s price was locked at when the goods were given.';
COMMENT ON COLUMN pos_debt_items.weight_source IS
  'As pos_sale_items.weight_source; copied onto the repayment receipt''s line.';
