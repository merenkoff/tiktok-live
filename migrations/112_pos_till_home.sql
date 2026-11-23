-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 112_pos_till_home.sql
-- The products the till shows on its home screen
-- (TechDocs/POS_CLOTHING.md «Головна каси й швидкість фото»).
--
-- The till's root view used to be EVERY product of the shop in one grid: a
-- clothing store with a few hundred photographed cards (Evelin, 2026-11-22)
-- waded through all of them before the first tap, while the folders above
-- already sorted the range. The owner now ticks «На головному екрані каси» on
-- the cards the cashier should find at once; the rest stays one tap away in
-- its folder and under «Усі товари». Nothing is ticked by default: such a
-- store's home screen is the 24 products that sold most in 30 days, computed
-- per read (`popularRanks` in products.service.ts), and a store with neither
-- sees every product, exactly as before this file.

ALTER TABLE pos_products
    ADD COLUMN IF NOT EXISTS till_home BOOLEAN NOT NULL DEFAULT FALSE;
