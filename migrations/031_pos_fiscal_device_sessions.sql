-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 031 — the till's own offline stretch (TechDocs/POS_FISCAL_OFFLINE.md, фаза 3).
--
-- Phase 2 gave the session table a `holder` of 'server' or 'device'; only the
-- server ever used it. A till-held stretch needs two more facts:
--
--   * which stretch the arriving documents belong to — the till mints a
--     `client_session_id` the moment it starts stamping offline, and every
--     sale it queues carries it, so the sync knows one outage from the next;
--   * whether the till still has documents we have not seen. The replay must
--     not send `go-offline` while more receipts of the same stretch are
--     queued on a till: they would arrive after the chain moved past their
--     date. `ready_at` is the till saying "my queue is empty".
--
-- No uniqueness here: at most one live session per register is already
-- enforced by `idx_pos_fiscal_offline_sessions_live`, and a second row for
-- the same `client_session_id` is legitimate once the first one closed (a
-- late document from a finished stretch opens its own session, which the
-- replay then parks for the owner).

ALTER TABLE pos_fiscal_offline_sessions
    ADD COLUMN IF NOT EXISTS client_session_id TEXT,
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pos_fiscal_offline_sessions_device
    ON pos_fiscal_offline_sessions (store_id, device_id, client_session_id)
    WHERE device_id IS NOT NULL;

COMMENT ON COLUMN pos_fiscal_offline_sessions.client_session_id IS 'The till''s own id for the offline stretch these documents came from; null for a session opened server-side';
COMMENT ON COLUMN pos_fiscal_offline_sessions.ready_at IS 'The till reported an empty outbox: every document it stamped is with us and the replay may start. Cleared whenever another device document arrives';
