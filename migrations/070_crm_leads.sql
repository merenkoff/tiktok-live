-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 070_crm_leads.sql
-- Leads from the marketing site, as a small CRM the super admin reads
-- (TechDocs/CRM_LEADS.md).
--
--   crm_leads         — one row per person (the phone), with the status and
--                       the note the super admin keeps;
--   crm_lead_touches  — one row per form sent: which form, what intent, which
--                       product, the page, and the visitor's journey (where
--                       they came from, what they clicked and read) already
--                       cleaned by `src/crm/journey.ts`.
--
-- The old LIVE table `leads` (001) kept one row per phone and overwrote it on
-- every repeat, with nothing about where the person came from. Its rows are
-- carried over ONCE, as people with an `imported` touch, guarded on the table
-- existing (the test database has no LIVE schema) and on the phone not being
-- here yet — so a second boot copies nothing. Nothing writes to `leads` after
-- this; dropping it is a later cleanup.
--
-- Platform data, not a store's: no `pos_` prefix and no store_id. It sits in
-- POS_MIGRATIONS because the super admin is a POS surface and the POS test
-- database is where its tests run.
--
-- Re-runnable: the migration runner applies every file on every boot.

CREATE TABLE IF NOT EXISTS crm_leads (
  id            BIGSERIAL PRIMARY KEY,
  phone         VARCHAR(20)  NOT NULL,
  name          VARCHAR(80),
  status        VARCHAR(16)  NOT NULL DEFAULT 'new',
  note          TEXT         NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_touch_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_phone_uniq ON crm_leads (phone);
CREATE INDEX IF NOT EXISTS crm_leads_last_touch_idx ON crm_leads (last_touch_at DESC);

ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_status_check;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_status_check
  CHECK (status IN ('new', 'contacted', 'demo', 'client', 'lost'));
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_note_len;
ALTER TABLE crm_leads ADD CONSTRAINT crm_leads_note_len CHECK (char_length(note) <= 2000);

CREATE TABLE IF NOT EXISTS crm_lead_touches (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     BIGINT       NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  form_id     VARCHAR(80)  NOT NULL DEFAULT 'unknown',
  intent      VARCHAR(16),
  product     VARCHAR(16),
  business    VARCHAR(16),
  page_path   VARCHAR(200),
  name_given  VARCHAR(80),
  journey     JSONB        NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS crm_lead_touches_lead_idx ON crm_lead_touches (lead_id, created_at DESC);

-- The old table, once. EXECUTE so nothing is planned against `leads` where it
-- does not exist; RETURNING gives only the rows actually inserted, so a phone
-- already here gets no second «imported» touch on the next boot.
DO $import$
BEGIN
  IF to_regclass('public.leads') IS NOT NULL THEN
    EXECUTE $q$
      WITH moved AS (
        INSERT INTO crm_leads (phone, name, status, created_at, last_touch_at, updated_at)
        SELECT l.phone,
               NULLIF(left(btrim(l.name), 80), ''),
               CASE WHEN l.status IN ('new', 'contacted', 'demo', 'client', 'lost') THEN l.status ELSE 'new' END,
               COALESCE(l.created_at AT TIME ZONE 'UTC', NOW()),
               COALESCE(COALESCE(l.updated_at, l.created_at) AT TIME ZONE 'UTC', NOW()),
               NOW()
        FROM leads l
        WHERE l.phone IS NOT NULL AND btrim(l.phone) <> ''
        ON CONFLICT (phone) DO NOTHING
        RETURNING id, created_at
      )
      INSERT INTO crm_lead_touches (lead_id, created_at, form_id)
      SELECT id, created_at, 'imported' FROM moved
    $q$;
  END IF;
END
$import$;
