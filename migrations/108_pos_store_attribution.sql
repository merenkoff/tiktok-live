-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 108_pos_store_attribution.sql
-- The Live Shop's attribution, switched on per store by the super admin
-- (TechDocs/POS_LICENSING.md, «Атрибуція в магазині»).
--
-- With it on, the till prints «Каса: The Live Shop» / «the-live.shop» as the
-- last lines of every receipt, refund, pre-bill and slip, a small
-- «the-live.shop» under a price tag, and the guest QR menu carries the logo
-- and «The Live Shop» in its footer. Off by default: nothing changes for a
-- store until the super admin says so.
--
-- Only the super admin writes it (`PATCH /super/stores/:id`); the column is
-- deliberately absent from `STORE_PATCH_COLUMNS`, so the owner's
-- `PATCH /store` cannot. Re-runnable, like every migration here.

ALTER TABLE pos_stores
  ADD COLUMN IF NOT EXISTS attribution BOOLEAN NOT NULL DEFAULT FALSE;
