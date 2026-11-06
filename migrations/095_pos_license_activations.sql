-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 095_pos_license_activations.sql
-- Author-side licence-activation ingest (TechDocs/POS_LICENSING.md, phase 2F).
--
-- The MIRROR of migration 094: 094 is the single `pos_license_state` row a
-- CLIENT install keeps about itself; this table lives on the AUTHOR's
-- deployment (the-live.shop) and records the heartbeat pings that every install
-- sends to `POST /api/license/activation`. It is how the author counts running
-- copies and spots copies over the contract's copy-count limit — for
-- COMPLIANCE and legal follow-up, never to disable anyone (OwnNet 1.1 §1.150).
--
-- Only licence-compliance data, exactly what the ping carries — NO user
-- activity, catalogue or PII:
--   license_fingerprint — sha256 hex of the token string, the stable identity
--                         of one licence (the same token hashes the same way
--                         on every install it was issued to). '' when the ping
--                         carried no token at all («без ключа»).
--   instance_id         — the per-install random id from the copy's own
--                         pos_license_state. Distinct ids per fingerprint = how
--                         many copies run. A cloned DB copies the id too, so the
--                         SAME id under two different public_base_url values is
--                         the signal of a clone.
--   public_base_url     — the origin the copy reported running on; '' when not
--                         sent. This is what points at WHO to contact / file a
--                         complaint against.
--   verified            — did the token verify (Ed25519, unexpired) at ingest.
--   licensee/plan/instance_limit — the verified claim, for display and the
--                         over-limit check (installs > instance_limit).
--
-- One row per (fingerprint, instance_id, base_url): a repeated identical ping
-- only bumps seen_count/last_seen, so the table cannot grow from a copy that
-- simply keeps pinging. Re-runnable like every migration (CREATE … IF NOT
-- EXISTS); it seeds no rows.

CREATE TABLE IF NOT EXISTS pos_license_activations (
  id                  bigserial PRIMARY KEY,
  license_fingerprint text NOT NULL,
  instance_id         uuid NOT NULL,
  public_base_url     text NOT NULL DEFAULT '',
  verified            boolean NOT NULL DEFAULT false,
  licensee            text,
  plan                text,
  instance_limit      integer,
  pos_api_version     integer,
  first_seen          timestamptz NOT NULL DEFAULT now(),
  last_seen           timestamptz NOT NULL DEFAULT now(),
  seen_count          integer NOT NULL DEFAULT 1,
  UNIQUE (license_fingerprint, instance_id, public_base_url)
);

CREATE INDEX IF NOT EXISTS pos_license_activations_fp_idx
  ON pos_license_activations (license_fingerprint);
CREATE INDEX IF NOT EXISTS pos_license_activations_last_seen_idx
  ON pos_license_activations (last_seen DESC);
