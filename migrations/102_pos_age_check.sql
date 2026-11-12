-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 102: the buyer's age, asked once per receipt (TechDocs/POS_AGE_CHECK.md).
--
-- `pos_stores.age_check`: the owner's switch («Питати вік покупця»). When it is
-- on, a till asks «Покупцю є 18 років?» once per receipt that holds alcohol,
-- beer or tobacco — anything excise, or poured from an excise bottle, or with
-- an answer that pours from one. Off by default: a shop turns it on, so no till
-- starts asking overnight.
--
-- `pos_sales.age_confirmed`: the cashier answered «так» for this receipt. A
-- record, never a gate the server enforces — a till built before this column
-- sends nothing and must still sell (Д2).
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS.

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS age_check BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pos_stores.age_check IS
  'Ask the buyer''s age (18+) once per receipt with excise goods (TechDocs/POS_AGE_CHECK.md).';
COMMENT ON COLUMN pos_sales.age_confirmed IS
  'The cashier confirmed the buyer is 18 or older for this receipt (TechDocs/POS_AGE_CHECK.md).';
