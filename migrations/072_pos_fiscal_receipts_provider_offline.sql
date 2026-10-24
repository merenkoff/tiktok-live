-- migrations/072_pos_fiscal_receipts_provider_offline.sql
-- ПРРО contract v2 (TechDocs/prro/cashalot/POS_FISCAL_CASHALOT.md §4.3, phase CA4):
-- a third ledger mode, `provider_offline` — the document went to the provider
-- live, but the PROVIDER registered it in its own offline session because the
-- tax office was down (Cashalot does this by itself). The fiscal number is
-- final, the document reaches the tax office later, and the paper must say
-- «ОФЛАЙН». Such a row is always `done`; the retry pass and the session replay
-- never pick it up (they read `mode = 'online'` / an offline session).
--
-- `mode` was created as VARCHAR(8) in 027 and 'provider_offline' is 16
-- characters, so the column is widened first — under a guard, so that a boot
-- that finds it already wide takes no lock.
--
-- The CHECK is added by name here AND in 027, and the runner re-applies every
-- file on every boot, 027 first: 027 carries the same three values, or its
-- re-add would fail the first restart after the first such row
-- (CLAUDE.md «Migration runner»; `pos.migrations-idempotent.test.ts` checks
-- that both files add the identical constraint).
--
-- Re-runnable.

DO $widen$
BEGIN
  IF (SELECT character_maximum_length
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'pos_fiscal_receipts'
         AND column_name = 'mode') < 16 THEN
    ALTER TABLE pos_fiscal_receipts ALTER COLUMN mode TYPE VARCHAR(16);
  END IF;
END
$widen$;

ALTER TABLE pos_fiscal_receipts
    DROP CONSTRAINT IF EXISTS pos_fiscal_receipts_mode_check;
ALTER TABLE pos_fiscal_receipts
    ADD CONSTRAINT pos_fiscal_receipts_mode_check CHECK (mode IN ('online', 'offline', 'provider_offline'));

COMMENT ON COLUMN pos_fiscal_receipts.mode IS 'online = registered live; offline = stamped by us with an offline code, sent to the provider on replay; provider_offline = registered live, but in the provider''s own offline session (final number, reaches the tax office later)';
