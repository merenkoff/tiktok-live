-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 106_pos_license_activations_dev.sql
-- A licence ping says whether it comes from a development run
-- (TechDocs/POS_LICENSING.md, phase 2F).
--
-- Every boot of the backend pings the author's activation server, key or no
-- key — and so does every `npm run dev`: a developer's machine, a cloud coding
-- session. Each of those is a row under «Без ключа» that reads exactly like a
-- stranger's copy. On 2026-11-17/18 one such row (eight pings from Google
-- Cloud, each a few minutes before a commit of the author's own cloud session)
-- was taken for a stolen server.
--
-- The pings are NOT dropped — a row nobody sees cannot be told from a row that
-- never came — they are marked. The copy reports `dev: true` when it does not
-- run in production mode (`NODE_ENV` is not `production`; the published image
-- sets it), and the receiver keeps the last ping's word here, per row. It is
-- the copy's own word, like `public_base_url`: a mark for the reader, never a
-- reason to count a copy less. A copy older than this field sends nothing and
-- stays unmarked (false).
-- Re-runnable: ADD COLUMN IF NOT EXISTS.

ALTER TABLE pos_license_activations ADD COLUMN IF NOT EXISTS dev boolean NOT NULL DEFAULT false;
