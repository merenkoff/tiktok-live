-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 114_pos_refund_act_on_receipt_printer.sql
-- «Акт повернення — на принтері чеків» (TechDocs/POS_PHONE_TILL.md, the
-- owner's word of 2026-11-23): the «Акт про видачу коштів» a return over
-- 100 ₴ needs went to the OS print dialog on A4 only, and a shop with no office
-- printer had nothing to print it on. With this switch the desktop prints it
-- as a slip on the receipt printer (`print_slip`, «НЕ Є РОЗРАХУНКОВИМ
-- ДОКУМЕНТОМ» around it). Off by default; the owner's «Налаштування» writes it
-- (`PATCH /store`) and it rides with the login like `auto_print_receipt`.
--
-- The store that asked for it, «Evelin» (`evelin`), gets it switched on ONCE:
-- only on the boot that adds the column (080's pattern). Every file here is
-- re-applied on every boot, and an owner who later switches it off must not
-- find it on again after the next deploy.

DO $act$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'pos_stores'
       AND column_name = 'refund_act_on_receipt_printer'
  ) THEN
    ALTER TABLE pos_stores
      ADD COLUMN refund_act_on_receipt_printer BOOLEAN NOT NULL DEFAULT FALSE;

    -- EXECUTE, so the statement is planned after the column exists.
    EXECUTE $u$
      UPDATE pos_stores
         SET refund_act_on_receipt_printer = TRUE,
             updated_at = NOW()
       WHERE slug = 'evelin'
    $u$;
  END IF;
END
$act$;

COMMENT ON COLUMN pos_stores.refund_act_on_receipt_printer IS
  'The refund act («Акт про видачу коштів») prints on the desktop''s receipt printer as a slip, not on A4. Off by default.';
