-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 017_pos_live_link.sql
-- Links a POS store to the TikTok LIVE account it sells from.
--
-- The `tiktok-live` feature module (an online-only module registered in
-- `pos_stores.module_remotes`) shows the LIVE comment feed inside the POS
-- shell. It never asks the operator to log into the LIVE side separately:
-- `POST /api/pos/live/session-token` takes an authenticated POS session,
-- reads this nickname, and mints the LIVE token for it.
--
-- NULL (the default) = the store is not connected to TikTok LIVE; the bridge
-- endpoint answers 409 `live_not_configured` and the module renders a "connect
-- it in Settings" empty state. Owner-writable via `PATCH /api/pos/store`.

ALTER TABLE pos_stores ADD COLUMN IF NOT EXISTS live_tiktok_username text;
