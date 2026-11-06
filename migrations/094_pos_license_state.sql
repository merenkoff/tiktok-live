-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 094_pos_license_state.sql
-- Disclosed licence-activation state (TechDocs/POS_LICENSING.md, phase 2).
--
-- One row for the whole DEPLOYMENT, not per store: a licence covers the
-- install, and this is the first truly instance-global POS table (the
-- `id = 1` singleton trick enforces that). It holds only licence-compliance
-- data — NO user activity, NO catalogue, NO PII:
--
--   instance_id     — a stable random id minted once on first boot. Travels in
--                     the activation ping so the author can count distinct
--                     running copies. A cloned DB copies it too, which is a
--                     feature: the same id pinging from a different
--                     public_base_url is how a clone shows up.
--   status          — the cached verdict the owner's `GET /license/status`
--                     reads: 'unknown' until the first heartbeat, then
--                     'licensed' | 'unlicensed' | 'unreachable'
--                     (src/pos/license/service.ts computeStatus). NEVER gates
--                     the POS — a lawfully-run copy keeps serving whatever this
--                     says (OwnNet 1.1 §1.12(a); §1.150 permits a
--                     licence-compliance check that does not disable).
--   claim           — the verified token's claim (licensee / plan / expires),
--                     for display only; absent when there is no valid token.
--   last_ok_at      — when the activation server last answered 2xx. Drives the
--                     grace window before 'licensed' degrades to 'unreachable'.
--   last_checked_at — when the heartbeat last ran at all.
--
-- Re-runnable like every migration (the runner re-applies the whole list on
-- every boot): CREATE … IF NOT EXISTS, and the singleton row is seeded only
-- when absent, so its instance_id is minted once and then stable.

CREATE TABLE IF NOT EXISTS pos_license_state (
  id              smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instance_id     uuid NOT NULL DEFAULT gen_random_uuid(),
  status          text NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('unknown', 'licensed', 'unlicensed', 'unreachable')),
  claim           jsonb,
  last_ok_at      timestamptz,
  last_checked_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pos_license_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
