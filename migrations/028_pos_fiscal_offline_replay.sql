-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 028_pos_fiscal_offline_replay.sql
-- Phase 2 of TechDocs/POS_FISCAL_OFFLINE.md (server-side offline session).
-- The replay may call the provider's `go-online` at most once per two minutes
-- per register; the throttle has to survive a process restart, so the last
-- call is a column, not memory.

ALTER TABLE pos_fiscal_offline_sessions
    ADD COLUMN IF NOT EXISTS last_go_online_at TIMESTAMPTZ;

COMMENT ON COLUMN pos_fiscal_offline_sessions.last_go_online_at IS 'Last go-online call for this session; the replay repeats it no more often than once per two minutes';
