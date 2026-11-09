-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 099: one row per opening of a guest's QR menu page (track W,
-- TechDocs/POS_MENU_WALL.md). What the office television counts: how often
-- the menu of each place — and each table — is opened today.
--
-- Deliberately a journal of PAGE OPENS, not of people: the guest page runs
-- under `script-src 'self'` with no cookie and no anonymous id, and the owner
-- asked for every open to count, a reload included (Д1). No IP, no User-Agent
-- is kept (Д5): the row says which store, which table, by which address and
-- when — nothing about who.
--
-- `table_id` is SET NULL on delete rather than CASCADE: a table the owner
-- removed still had its menu opened, and that open belongs to the store's
-- day even when the table is gone. The store's rows go with the store.
--
-- Re-runnable: every statement is IF NOT EXISTS, and the two CHECKs are
-- written inline so a fresh database gets them once and a restart leaves
-- them alone (`CREATE TABLE IF NOT EXISTS` never re-adds them).

CREATE TABLE IF NOT EXISTS pos_menu_opens (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    table_id BIGINT NULL REFERENCES pos_tables(id) ON DELETE SET NULL,
    -- The table's own key (`?k=`, phase Q5) was checked and matched: the QR
    -- printed after Q5, not a `?t=` somebody typed.
    keyed BOOLEAN NOT NULL DEFAULT FALSE,
    -- Which address opened the page: the random token or the short slug (Q10).
    via TEXT NOT NULL CHECK (via IN ('token', 'slug')),
    -- The menu itself or a dish's own address (phase F11).
    page TEXT NOT NULL CHECK (page IN ('menu', 'dish')),
    -- A label from the link (`utm_campaign` or `c`), for the day the QR codes
    -- carry one (Д6). NULL until then.
    tag TEXT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_menu_opens_store_time
  ON pos_menu_opens (store_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_pos_menu_opens_time
  ON pos_menu_opens (opened_at);

COMMENT ON TABLE pos_menu_opens IS
  'One row per opening of a guest QR-menu page (menu or dish). Page opens, not people: no IP, no UA. Read by the super admin''s television widget (TechDocs/POS_MENU_WALL.md).';
