-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 077_pos_demo_grocery_credit.sql
-- Customers who may take goods «під запис» in `demo-grocery` (076).
--
-- Credit is only for a customer the owner gave a limit (decision Д2,
-- TechDocs/grocery/G3_DEBTS.md), and 076 made no customers at all — so a
-- visitor of the public demo saw «Під запис» beside «Оплатити» and could write
-- nothing down. These are the names off the debt notebook the grocery landing
-- page draws (site/src/assets/illustrations/zoshyt-borgiv.svg), with the
-- notebook's own «Ліміт — 500 грн!» on Оля, so the demo and the page tell
-- one story.
--
-- Created ONCE, like 069: the stamp `demo-grocery-credit` in `pos_demo_seed`
-- (039) means «done», not a version. A visitor of the demo may raise a limit,
-- lock a customer or delete one, and the next boot leaves it so; drop the
-- stamp to get the five back (a phone that is still there is left alone).
-- Without `demo-grocery` there is nothing to add to, and no stamp is written,
-- so a store that 076 builds later still gets them.
--
-- No debts are seeded: every visitor of a public demo shares these limits,
-- and a notebook that starts half full leaves the next visitor less room to
-- try the handover. Phones are digits only, as `normalizePhone` stores them,
-- in the 380 00 range — no Ukrainian operator has that code, so none of them
-- rings anyone. A 076 rebuild keeps customers, so these survive it too.

DO $$
DECLARE
  v_store bigint;
  v_owner bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pos_demo_seed WHERE slug = 'demo-grocery-credit') THEN
    RETURN;
  END IF;

  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-grocery';
  IF v_store IS NULL THEN
    RAISE NOTICE 'demo-grocery not found — no customers on credit to add';
    RETURN;
  END IF;
  SELECT id INTO v_owner FROM pos_staff
   WHERE store_id = v_store AND role = 'owner' ORDER BY id LIMIT 1;

  INSERT INTO pos_customers (store_id, name, phone, credit_limit_cents, credit_set_at, credit_set_by)
  VALUES
    (v_store, 'Оля, 3 під''їзд',      '380000000101',  50000, NOW(), v_owner),
    (v_store, 'Петрович',             '380000000102', 200000, NOW(), v_owner),
    (v_store, 'Марина — до пенсії',   '380000000103', 100000, NOW(), v_owner),
    (v_store, 'Сашко, хліб і молоко', '380000000104',  30000, NOW(), v_owner),
    (v_store, 'Ніна Іванівна',        '380000000105', 100000, NOW(), v_owner)
  ON CONFLICT (store_id, phone) DO NOTHING;

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-grocery-credit', 1)
  ON CONFLICT (slug) DO NOTHING;

  RAISE NOTICE 'demo-grocery: customers on credit added (store %)', v_store;
END $$;
