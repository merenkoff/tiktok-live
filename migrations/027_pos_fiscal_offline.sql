-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 027_pos_fiscal_offline.sql
-- Phase 1 of TechDocs/POS_FISCAL_OFFLINE.md (fiscal phase 8б): the ground the
-- ПРРО offline mode stands on. Three things land together because they only
-- make sense together:
--   * the store-level switch (`offline_mode`) and the reserve size the refill
--     cron keeps (`offline_codes_target`);
--   * the register holder — which till currently owns the provider register
--     (one Checkbox licence key = one register = one till at a time, §3а) —
--     plus the pending handover request from another till;
--   * the pool of tax-office offline codes and the offline sessions a replay
--     walks through, with the ledger columns that tie a receipt to them.
-- Nothing here changes behaviour while `offline_mode` is false.

ALTER TABLE pos_fiscal_settings
    ADD COLUMN IF NOT EXISTS offline_mode BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS offline_codes_target INTEGER NOT NULL DEFAULT 200,
    ADD COLUMN IF NOT EXISTS holder_device_id TEXT,
    ADD COLUMN IF NOT EXISTS holder_name TEXT,
    ADD COLUMN IF NOT EXISTS holder_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS holder_last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS handover_device_id TEXT,
    ADD COLUMN IF NOT EXISTS handover_name TEXT,
    ADD COLUMN IF NOT EXISTS handover_requested_at TIMESTAMPTZ;

ALTER TABLE pos_fiscal_settings
    DROP CONSTRAINT IF EXISTS pos_fiscal_settings_offline_codes_target_check;
ALTER TABLE pos_fiscal_settings
    ADD CONSTRAINT pos_fiscal_settings_offline_codes_target_check
    CHECK (offline_codes_target BETWEEN 50 AND 2000);

COMMENT ON COLUMN pos_fiscal_settings.offline_mode IS 'Sell from a reserve of tax-office offline codes when the provider is unreachable; only for providers whose adapter declares the offline capability';
COMMENT ON COLUMN pos_fiscal_settings.offline_codes_target IS 'How many free offline codes the refill cron keeps in pos_fiscal_offline_codes';
COMMENT ON COLUMN pos_fiscal_settings.holder_device_id IS 'The till (X-POS-Device-ID) that currently owns the provider register; null = free. Enforced only while offline_mode is on';
COMMENT ON COLUMN pos_fiscal_settings.holder_last_seen_at IS 'Last request from the holder; a stale holder is shown as "possibly selling offline"';
COMMENT ON COLUMN pos_fiscal_settings.handover_device_id IS 'A till asking the holder to hand the register over; cleared on confirm/force';

-- ── Offline code pool ───────────────────────────────────────────────────────
-- One row per code the provider handed us. A code is single-use at the tax
-- office; `status` tracks whose hands it is in on our side:
--   free    — in the pool, nobody holds it
--   leased  — handed to a till (phase 3) for offline sales
--   used    — stamped on a document (used_by_receipt_id)
--   burned  — consumed outside our control (the provider went offline on its
--             own and spent it, or a force-take orphaned a lease); never reused

CREATE TABLE IF NOT EXISTS pos_fiscal_offline_codes (
    id                  BIGSERIAL PRIMARY KEY,
    store_id            BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    cash_register_key   TEXT NOT NULL DEFAULT '',
    fiscal_code         TEXT NOT NULL,
    serial_id           BIGINT,
    status              VARCHAR(16) NOT NULL DEFAULT 'free'
                        CHECK (status IN ('free', 'leased', 'used', 'burned')),
    lease_device_id     TEXT,
    leased_at           TIMESTAMPTZ,
    used_by_receipt_id  BIGINT REFERENCES pos_fiscal_receipts(id) ON DELETE SET NULL,
    used_at             TIMESTAMPTZ,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pos_fiscal_offline_codes_unique UNIQUE (store_id, cash_register_key, fiscal_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_fiscal_offline_codes_status
    ON pos_fiscal_offline_codes (store_id, cash_register_key, status);

COMMENT ON COLUMN pos_fiscal_offline_codes.serial_id IS 'Provider ordinal of the code; codes are handed out in serial order';
COMMENT ON COLUMN pos_fiscal_offline_codes.status IS 'free = in pool; leased = handed to a till; used = stamped on a document; burned = consumed outside our control, never reused';

-- ── Offline sessions ────────────────────────────────────────────────────────
-- One row per stretch of offline selling (POS_FISCAL_OFFLINE.md §5). `holder`
-- says who issued the offline documents: the server (case B, provider down)
-- or a till (case C, till without internet). At most one live session per
-- register.

CREATE TABLE IF NOT EXISTS pos_fiscal_offline_sessions (
    id                  BIGSERIAL PRIMARY KEY,
    store_id            BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    cash_register_key   TEXT NOT NULL DEFAULT '',
    holder              VARCHAR(8) NOT NULL CHECK (holder IN ('server', 'device')),
    device_id           TEXT,
    shift_id            BIGINT REFERENCES pos_fiscal_shifts(id) ON DELETE SET NULL,
    started_at          TIMESTAMPTZ NOT NULL,
    go_offline_code     TEXT,
    go_offline_tx_id    TEXT,
    status              VARCHAR(16) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'replaying', 'closed', 'stuck')),
    ended_at            TIMESTAMPTZ,
    error_code          VARCHAR(64),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_fiscal_offline_sessions_live
    ON pos_fiscal_offline_sessions (store_id, cash_register_key)
    WHERE status IN ('open', 'replaying');

COMMENT ON COLUMN pos_fiscal_offline_sessions.started_at IS 'The go-offline fiscal date; must be >= the last transaction the tax office received for this register';
COMMENT ON COLUMN pos_fiscal_offline_sessions.status IS 'open = documents being issued; replaying = being sent to the provider in order; closed = provider back online; stuck = needs the owner';

-- ── Ledger: which session a receipt belongs to ──────────────────────────────

ALTER TABLE pos_fiscal_receipts
    ADD COLUMN IF NOT EXISTS mode VARCHAR(8) NOT NULL DEFAULT 'online',
    ADD COLUMN IF NOT EXISTS offline_session_id BIGINT REFERENCES pos_fiscal_offline_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS offline_seq INTEGER,
    ADD COLUMN IF NOT EXISTS control_number TEXT;

ALTER TABLE pos_fiscal_receipts
    DROP CONSTRAINT IF EXISTS pos_fiscal_receipts_mode_check;
ALTER TABLE pos_fiscal_receipts
    ADD CONSTRAINT pos_fiscal_receipts_mode_check CHECK (mode IN ('online', 'offline'));

CREATE INDEX IF NOT EXISTS idx_pos_fiscal_receipts_offline_session
    ON pos_fiscal_receipts (offline_session_id, offline_seq)
    WHERE offline_session_id IS NOT NULL;

COMMENT ON COLUMN pos_fiscal_receipts.mode IS 'online = registered live; offline = stamped with an offline code, sent to the provider on replay';
COMMENT ON COLUMN pos_fiscal_receipts.offline_seq IS 'Position inside the offline session; replay sends in this order';
COMMENT ON COLUMN pos_fiscal_receipts.control_number IS 'Контрольне число of an offline document, as returned by the provider on replay';
