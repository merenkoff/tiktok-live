-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 096_pos_license_activations_remote_ip.sql
-- The address a licence ping CAME FROM (TechDocs/POS_LICENSING.md, phase 2F).
--
-- `public_base_url` is what the copy says about itself, and a copy whose
-- operator set no PUBLIC_BASE_URL (or CORS_ORIGINS, or runs outside Railway)
-- says nothing — the author's own deployment pinged as «(невідомо)» on
-- 2026-11-06. The receiver now also keeps the network address the ping came
-- from, which the copy cannot leave blank: the last one seen per row, for the
-- same purpose as the origin (whom to contact over a copy-count breach), never
-- for anything else. A server's egress address; no user of the copy is in it.
-- Re-runnable: ADD COLUMN IF NOT EXISTS.

ALTER TABLE pos_license_activations ADD COLUMN IF NOT EXISTS remote_ip text;
