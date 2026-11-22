-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 111_pos_staff_sections.sql
-- Which sections of the till a staff member may not open
-- (TechDocs/POS_STAFF_SECTIONS.md).
--
-- The owner ticks them on «Співробітники» → «Доступ»: «Прямий ефір» for some
-- cashiers, «Інвентаризація» only for the senior one. The list names what is
-- CLOSED, so everything is open by default — as it was before this file — and
-- a module added tomorrow arrives open. Ids are module ids (`tiktok-live`,
-- `stocktake`, …); the server closes the routes of the ones it guards
-- (`src/pos/core/staffSections.ts`), the till hides the rest. The owner's own
-- row is never read for it.

ALTER TABLE pos_staff
    ADD COLUMN IF NOT EXISTS blocked_sections TEXT[] NOT NULL DEFAULT '{}';
