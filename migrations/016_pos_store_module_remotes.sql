-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 016_pos_store_module_remotes.sql
-- Per-store runtime module-remote registration (roadmap #9). Maps a feature
-- module id to the URL of a standalone `remote-entry.js` the web build loads at
-- boot instead of the bundled descriptor. `{}` (the default) = every module
-- bundled, i.e. current behaviour. Web only — the Tauri cashier ignores it.
--
-- Validated server-side on write (see backend sanitizeModuleRemotes): known
-- non-core module ids only, `https://` / root-relative `/` / `http://localhost`
-- URLs only.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS module_remotes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN pos_stores.module_remotes IS
  'Per-store {moduleId: remote-entry.js URL} map; web build loads these at boot instead of the bundled module (roadmap #9)';
