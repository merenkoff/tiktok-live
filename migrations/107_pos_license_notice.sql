-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 107_pos_license_notice.sql
-- The notice a copy without a valid licence key shows its users
-- (TechDocs/POS_LICENSING.md, phase 2G).
--
-- A copy that runs without a valid `LICENSE_KEY` counts, in its own database,
-- how many times a client has started against it (a sign-in, or a session
-- restored when the app opens). Past a threshold it tells every user of the
-- POS, in a strip that cannot be closed, that it runs without a key — and, when
-- the author has switched that on for the copy, says the same to the guests of
-- its QR menu under each dish. It is a NOTICE: nothing here blocks, slows or
-- switches off anything, which the project's own licence forbids (OwnNet 1.1
-- §1.12(a)), and the whole of it is disclosed in README.md and NOTICE.
--
-- Two sides in one file, like 094/095:
--
-- THE COPY (`pos_license_state`, its singleton row):
--   client_launches   — the counter. It moves only while the local token is not
--                       valid, so a licensed copy never counts and never warns.
--   notice_policy     — what the author's server last answered to this copy's
--                       ping: {warn_after, text, guests}. NULL until the first
--                       answer; the copy then uses the built-in threshold (30)
--                       and text, so a copy that cannot reach the server — or
--                       blocks it — is warned all the same.
--   notice_policy_at  — when that answer came.
--
-- THE AUTHOR (the-live.shop):
--   pos_license_notice_policy — one row: the threshold for every copy without a
--                       key (0 = no notice at all), the text (NULL = built in)
--                       and whether guests see it. Guests are OFF by default:
--                       the public licence lets a small business run without a
--                       key, so a copy without one is not by itself a breach,
--                       and what its guests read is switched on per copy, by a
--                       person who has looked at whose copy it is.
--   pos_license_copy_notices — the same three settings for ONE copy
--                       (`instance_id`); NULL in a column = «as for everyone».
--   pos_license_activations.client_launches — the counter as the copy last
--                       reported it, so the author sees a copy approaching its
--                       threshold. Reported only by a copy without a valid key.
--
-- Re-runnable: ADD COLUMN / CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.

ALTER TABLE pos_license_state ADD COLUMN IF NOT EXISTS client_launches integer NOT NULL DEFAULT 0;
ALTER TABLE pos_license_state ADD COLUMN IF NOT EXISTS notice_policy jsonb;
ALTER TABLE pos_license_state ADD COLUMN IF NOT EXISTS notice_policy_at timestamptz;

CREATE TABLE IF NOT EXISTS pos_license_notice_policy (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warn_after  integer NOT NULL DEFAULT 30 CHECK (warn_after >= 0 AND warn_after <= 1000000),
  notice_text text,
  guests      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pos_license_notice_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pos_license_copy_notices (
  instance_id uuid PRIMARY KEY,
  warn_after  integer CHECK (warn_after IS NULL OR (warn_after >= 0 AND warn_after <= 1000000)),
  notice_text text,
  guests      boolean,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pos_license_activations ADD COLUMN IF NOT EXISTS client_launches integer;
