-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 101: who changed what in the menu (TechDocs/POS_MENU_CHANGES.md). One row
-- per write to a product card, its variants, its tags and modifier groups, or
-- a modifier group: who did it (the staff row and, as written then, their name
-- and role), when, and a list of what changed from what to what.
--
-- The list is computed by the server from the card before and after the write
-- (`src/pos/menu-changes.ts`), never sent by a client, so it says what the
-- database now holds. Stock, the stop-list and timestamps are not menu changes
-- and never appear in it.
--
-- `staff_id` is SET NULL on delete: the name and role written beside it keep
-- the row readable after the person is gone. `entity_id` has no foreign key on
-- purpose — one column names a product or a modifier group, and a deleted
-- modifier group's history stays.
--
-- Re-runnable: IF NOT EXISTS throughout, the CHECKs inline.

CREATE TABLE IF NOT EXISTS pos_menu_changes (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    entity TEXT NOT NULL CHECK (entity IN ('product', 'modifier_group')),
    entity_id BIGINT NOT NULL,
    -- The name as it reads after the write (before it, for a deletion).
    entity_name TEXT NOT NULL,
    staff_id BIGINT NULL REFERENCES pos_staff(id) ON DELETE SET NULL,
    staff_name TEXT NOT NULL,
    staff_role TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'archive', 'restore', 'delete')),
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_menu_changes_store_time
  ON pos_menu_changes (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_menu_changes_entity
  ON pos_menu_changes (store_id, entity, entity_id, created_at DESC);

COMMENT ON TABLE pos_menu_changes IS
  'Who changed what in the menu: one row per write to a product card or a modifier group, with the fields that changed (TechDocs/POS_MENU_CHANGES.md).';
