-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 098: a third staff role, «Маркетолог» (track МР, TechDocs/POS_MARKETER_ROLE.md).
-- It edits the menu, the halls and the QR menu of a café and nothing else; the
-- server denies it every route that does not name it (`core/roles.ts`).
--
-- Re-runnable: the runner re-applies every file on every boot. `002` wrote the
-- CHECK inline, so Postgres named it `pos_staff_role_check`, and `002`'s
-- CREATE TABLE IF NOT EXISTS never adds it again — this file is the only one
-- that (re)defines it, so dropping and re-adding it here cannot fight another
-- file on the next restart.
ALTER TABLE pos_staff DROP CONSTRAINT IF EXISTS pos_staff_role_check;
ALTER TABLE pos_staff
  ADD CONSTRAINT pos_staff_role_check CHECK (role IN ('owner', 'seller', 'marketer'));
