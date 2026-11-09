-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 100: shared printer profiles (TechDocs/POS_PRINTER_PROFILES.md).
--
-- A desktop till whose owner picked a Cyrillic profile for a printer and then
-- printed three documents with it reports «this driver prints with this
-- profile» (`pos_printer_profile_reports`). The super admin approves one
-- profile per driver under a readable title (`pos_printer_profiles`), and every
-- till then prints through it on a printer with that driver that its owner has
-- not set up by hand.
--
-- `driver` is the operating system's driver name for the printer (Windows
-- «XP-58», macOS «Generic / Text Only»), never the printer's own name — that
-- one is whatever the shop called it («Кухня»). `esc_t` is always the number
-- the profile actually selects (the table's standard one filled in), so one
-- profile is one row however the till spelled it.
--
-- Re-runnable: IF NOT EXISTS everywhere, CHECKs inline.

CREATE TABLE IF NOT EXISTS pos_printer_profile_reports (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    driver TEXT NOT NULL CHECK (length(driver) BETWEEN 1 AND 120),
    enc_table TEXT NOT NULL CHECK (enc_table IN ('windows1251', 'cp866', 'cp1125')),
    esc_t SMALLINT NOT NULL CHECK (esc_t BETWEEN 0 AND 255),
    paper_width_mm SMALLINT NULL CHECK (paper_width_mm IN (58, 80)),
    prints INTEGER NOT NULL DEFAULT 0 CHECK (prints >= 0),
    first_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, driver, enc_table, esc_t)
);

CREATE TABLE IF NOT EXISTS pos_printer_profiles (
    id BIGSERIAL PRIMARY KEY,
    -- One approved profile per driver: a till must never have to choose.
    driver TEXT NOT NULL UNIQUE CHECK (length(driver) BETWEEN 1 AND 120),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    enc_table TEXT NOT NULL CHECK (enc_table IN ('windows1251', 'cp866', 'cp1125')),
    esc_t SMALLINT NOT NULL CHECK (esc_t BETWEEN 0 AND 255),
    -- The store whose report it was approved from; kept when that store goes.
    source_store_id BIGINT NULL REFERENCES pos_stores(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
