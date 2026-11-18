-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 105: the cork fee and the product the waiter rings for it are one thing
-- (TechDocs/POS_QR_MENU_FEEDBACK.md «Корковий збір і товар», 2026-11-18).
--
-- Until now the terms the guest reads («Свій алкоголь: +100 ₴ за пляшку»,
-- `public_corkage`, migration 083) and the product the waiter adds to the bill
-- lived apart: the owner was told to make «Корковий збір» by hand, and its
-- price could say one thing while the menu said another. Now:
--
--   · `public_corkage_product_id` — the store's cork-fee product. Its price IS
--     the fee: the guest's page reads the price, so it says exactly what the
--     till will ring. Saving the fee in «Свій алкоголь» sets the price; saving
--     the price on the card moves the page.
--   · `public_corkage_on` — whether the terms are shown. Switching them off no
--     longer throws them away: the terms and the link stay, the product goes to
--     the archive (a waiter must not keep ringing a fee the place stopped
--     taking), and switching back on brings the SAME product back — never a
--     second «Корковий збір».
--
-- On the boot that adds `public_corkage_on`, every store whose terms were set
-- gets it TRUE (null terms were «off» until now). Then, on every boot, a store
-- that shows a fee above zero and has no product yet is given one: a product
-- the owner already made whose name starts with «Корк» is linked rather than
-- duplicated, otherwise «Корковий збір» is created at the fee in the terms —
-- sold at the till, hidden from the QR menu, with a counter large enough that
-- the till never greys it out (a fee is a service, not a shelf). Nothing is
-- done for a store that already has its product, so a re-run creates nothing,
-- and an existing product's price is never changed here.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, a DO block keyed on the column's
-- absence, and a repair whose WHERE no linked store matches.

DO $corkage_on$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'pos_stores' AND column_name = 'public_corkage_on'
  ) THEN
    ALTER TABLE pos_stores ADD COLUMN public_corkage_on BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE pos_stores SET public_corkage_on = TRUE WHERE public_corkage IS NOT NULL;
  END IF;
END
$corkage_on$;

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS public_corkage_on BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS public_corkage_product_id BIGINT REFERENCES pos_products(id) ON DELETE SET NULL;

COMMENT ON COLUMN pos_stores.public_corkage_on IS
  'The cork-fee terms are shown on the guest''s page. Off keeps the terms and the product link (migration 105).';
COMMENT ON COLUMN pos_stores.public_corkage_product_id IS
  'The product the waiter rings for the cork fee; its price is the fee the guest''s page shows (migration 105).';

DO $corkage_product$
DECLARE
  s RECORD;
  v_product BIGINT;
  v_variant BIGINT;
  v_fee INTEGER;
BEGIN
  FOR s IN
    SELECT id, public_corkage
      FROM pos_stores
     WHERE public_corkage_on
       AND public_corkage_product_id IS NULL
       AND public_corkage IS NOT NULL
       AND jsonb_typeof(public_corkage -> 'fee_cents') = 'number'
       AND (public_corkage ->> 'fee_cents')::numeric > 0
  LOOP
    v_fee := (s.public_corkage ->> 'fee_cents')::integer;

    -- One the owner made by hand, as the old hint told them to: linked, not duplicated.
    SELECT p.id INTO v_product
      FROM pos_products p
     WHERE p.store_id = s.id
       AND p.kind = 'simple'
       AND (p.name ILIKE 'корк%' OR p.name ILIKE 'cork%')
       AND EXISTS (SELECT 1 FROM pos_variants v WHERE v.product_id = p.id)
     ORDER BY p.is_active DESC, p.id ASC
     LIMIT 1;

    IF v_product IS NULL THEN
      INSERT INTO pos_products (store_id, name, description, kind, stock_mode, sellable, menu_hidden)
      VALUES (s.id, 'Корковий збір', 'За пляшку свого алкоголю. Ціна — та, що бачить гість у QR-меню.',
              'simple', 'own', TRUE, TRUE)
      RETURNING id INTO v_product;

      INSERT INTO pos_variants (store_id, product_id, attributes, label, unit, price_cents)
      VALUES (s.id, v_product, '{}'::jsonb, '', 'шт', v_fee)
      RETURNING id INTO v_variant;

      INSERT INTO pos_stock (variant_id, store_id, quantity) VALUES (v_variant, s.id, 100000);
      INSERT INTO pos_stock_movements (store_id, variant_id, delta, reason, note)
      VALUES (s.id, v_variant, 100000, 'seed', 'Корковий збір — послуга, залишок не рахується');
    ELSE
      -- The guest reads the terms above the dishes; the product itself is the bill's.
      UPDATE pos_products SET menu_hidden = TRUE, updated_at = NOW() WHERE id = v_product;
    END IF;

    UPDATE pos_stores SET public_corkage_product_id = v_product WHERE id = s.id;
  END LOOP;
END
$corkage_product$;
