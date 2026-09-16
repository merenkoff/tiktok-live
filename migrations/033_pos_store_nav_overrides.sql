-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 033_pos_store_nav_overrides.sql
-- Per-store appearance of the navigation menus — the cashier's left rail (and
-- its phone bottom bar) and the admin sidebar. The owner edits it on
-- `/admin/appearance`; see TechDocs/POS_NAV_CUSTOMIZATION.md.
--
-- Shape: a **sparse** `{ "<moduleId>:<location>:<path>": { label?, icon?, order? } }`
-- map. Only what the owner actually changed is stored, so a module that later
-- renames its own entry, moves it or ships a new icon keeps showing its new
-- default everywhere it was not overridden. A key whose module or path is gone
-- simply matches nothing — dropping it is not a migration, it is a no-op.
--
-- `{}` (the default) = every menu exactly as the modules declare it, i.e. the
-- behaviour before this column existed.
--
-- Validated server-side on write (`sanitizeNavOverrides`, src/pos/core/nav.ts):
-- known locations only, labels clamped to 40 chars, `icon` a bare lucide export
-- name, `order` an integer. The client resolves an icon name it does not ship
-- to a fallback glyph, so an override can never blank out a menu entry.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS nav_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pos_stores.nav_overrides IS
  'Per-store menu appearance: {moduleId:location:path -> {label,icon,order}} sparse overrides of module-declared nav entries';
