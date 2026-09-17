-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 034_pos_store_vertical.sql
-- The store's sales vertical: which attribute schema its products use, which
-- units it may sell in, and which module supplies the catalog half of the sell
-- screen (`vertical-<id>`). See TechDocs/POS_VERTICALS.md.
--
-- Deliberately a plain text column with no CHECK constraint: the set of
-- verticals lives in code (`src/pos/verticals`), exactly like the fiscal
-- provider ids do, so shipping a new one must not require a migration. An id
-- the running build does not know resolves to the default at read time
-- (`verticalOrDefault`) rather than failing a login.
--
-- The default backfills every existing store as 'clothing', which is what they
-- all are today — no behaviour changes until a super admin says otherwise.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'clothing';

COMMENT ON COLUMN pos_stores.vertical IS
  'Sales vertical id (src/pos/verticals): product attribute schema, unit set and the vertical-<id> sales module. Written only by the super admin.';
