-- migrations/022_pos_variant_barcode_to_sku.sql
-- Move internal article numbers out of `pos_variants.barcode` into `sku`.
--
-- The barcode field sat *before* SKU in the product form, unlabelled, and the
-- goods-receipt form had no SKU field at all — so article numbers off clothing
-- tags ("068-130", "14783", "675-222-16") were typed into the barcode column.
-- They are not barcodes: nothing can scan them, and `getCatalog`'s scan path
-- (`v.barcode = $1`) could never match them. The rule here is that simple —
-- a value that is not a valid GTIN was never a barcode.
--
-- WHAT THIS COSTS. `src/pos/migrate.ts` keeps no ledger of applied migrations;
-- it re-runs every file on every deploy. So this is not a one-time repair, it
-- is a standing policy: an article number typed into the barcode field next
-- month moves at the next deploy. Two consequences worth stating out loud:
--
--   1. `pos_variant_barcode_fixes` records every value this function touched,
--      keyed by (variant, value). A pair already moved is excluded from future
--      runs — so re-entering a value the system moved is respected, not fought.
--      That table is also the undo material: `old_barcode` keeps every original.
--   2. The rule is domain-wrong outside this shop. Code 128 and Code 39 encode
--      real, scannable barcodes that are not GTINs, and "675-222-16" as Code 128
--      is indistinguishable from an article number. Applied to a tenant who uses
--      non-GS1 symbologies this would strip working barcodes. The ledger makes
--      that reversible; a per-store opt-in is the fix if a second real tenant
--      ever appears.
--
-- The work lives in functions so it is re-runnable as a repair tool and can be
-- exercised by tests without re-applying the migration (applying migrations
-- concurrently takes ACCESS EXCLUSIVE locks — see vitest.global-setup.ts).

-- ── Is this string a GTIN? ────────────────────────────────────────────────
-- Mirrors the accept rule of `normalizeGtin` in src/pos/gtin/normalize.ts:
-- strip non-digits, reject outside 8..14, pad UPC-A (12) to 13, accept only
-- 8/13/14, verify the GS1 mod-10 check digit. Kept in step with the TypeScript
-- by a parity test (src/__tests__/pos.variant-barcode-migration.test.ts).
CREATE OR REPLACE FUNCTION pos_gtin_is_valid(raw text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $fn$
DECLARE
  digits text;
  body   text;
  total  integer := 0;
  weight integer;
  i      integer;
BEGIN
  digits := regexp_replace(raw, '\D', '', 'g');
  IF length(digits) < 8 OR length(digits) > 14 THEN
    RETURN false;
  END IF;
  IF length(digits) = 12 THEN
    digits := '0' || digits;
  END IF;
  IF length(digits) NOT IN (8, 13, 14) THEN
    RETURN false;
  END IF;

  body := left(digits, length(digits) - 1);
  -- Weights alternate 3,1 counting from the rightmost digit of the body.
  FOR i IN 1..length(body) LOOP
    weight := CASE WHEN (length(body) - i) % 2 = 0 THEN 3 ELSE 1 END;
    total := total + substr(body, i, 1)::integer * weight;
  END LOOP;

  RETURN right(digits, 1)::integer = (10 - total % 10) % 10;
END;
$fn$;

-- ── Audit trail, undo material, and the re-run filter ─────────────────────
CREATE TABLE IF NOT EXISTS pos_variant_barcode_fixes (
  variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL,
  old_barcode TEXT NOT NULL,
  -- moved | cleared_duplicate | skipped_sku_present | skipped_sku_taken
  action TEXT NOT NULL,
  conflict_variant_id BIGINT,
  conflict_is_active BOOLEAN,
  existing_sku TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (variant_id, old_barcode)
);

CREATE INDEX IF NOT EXISTS idx_pos_variant_barcode_fixes_store
  ON pos_variant_barcode_fixes(store_id, action);

-- `p_store_id` NULL means every store, which is how the migration calls it.
-- Passing one store scopes the repair — used by the tests, which share this
-- database with every other suite, and available to an operator who wants to
-- fix one shop without touching the rest.
CREATE OR REPLACE FUNCTION pos_backfill_variant_barcodes(p_store_id bigint DEFAULT NULL)
RETURNS TABLE(
  moved integer,
  cleared integer,
  skipped_sku_present integer,
  skipped_sku_taken integer
)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_moved   integer := 0;
  v_cleared integer := 0;
  v_present integer := 0;
  v_taken   integer := 0;
BEGIN
  -- Candidates: a non-empty barcode that is not a GTIN, on a pair this
  -- function has not already resolved. `barcode = ''` is excluded on purpose —
  -- there is nothing to move, and the partial unique index does not cover it.
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT v.id, v.store_id, v.barcode AS old_barcode, v.sku
  FROM pos_variants v
  WHERE (p_store_id IS NULL OR v.store_id = p_store_id)
    AND v.barcode IS NOT NULL
    AND v.barcode <> ''
    AND NOT pos_gtin_is_valid(v.barcode)
    AND NOT EXISTS (
      SELECT 1 FROM pos_variant_barcode_fixes f
      WHERE f.variant_id = v.id
        AND f.old_barcode = v.barcode
        AND f.action IN ('moved', 'cleared_duplicate')
    );

  -- Classify. The value moves byte for byte — no trim. `barcode` is unique per
  -- store, so a verbatim copy cannot collide within the batch; trimming would
  -- map 'X ' and 'X' onto one target and reintroduce that collision class.
  CREATE TEMP TABLE _plan ON COMMIT DROP AS
  SELECT c.id,
         c.store_id,
         c.old_barcode,
         c.sku,
         other.id AS conflict_variant_id,
         other.is_active AS conflict_is_active,
         CASE
           WHEN c.sku = c.old_barcode THEN 'cleared_duplicate'
           WHEN c.sku IS NOT NULL AND c.sku <> '' THEN 'skipped_sku_present'
           WHEN other.id IS NOT NULL THEN 'skipped_sku_taken'
           ELSE 'moved'
         END AS action
  FROM _cand c
  LEFT JOIN LATERAL (
    SELECT o.id, o.is_active
    FROM pos_variants o
    WHERE o.store_id = c.store_id AND o.sku = c.old_barcode AND o.id <> c.id
    LIMIT 1
  ) other ON TRUE;

  UPDATE pos_variants v
  SET sku = p.old_barcode, barcode = NULL, updated_at = NOW()
  FROM _plan p
  WHERE v.id = p.id AND p.action = 'moved';
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- Both fields held the same value: the barcode column is the wrong home, and
  -- clearing it loses nothing because `sku` already carries it.
  UPDATE pos_variants v
  SET barcode = NULL, updated_at = NOW()
  FROM _plan p
  WHERE v.id = p.id AND p.action = 'cleared_duplicate';
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- The two refusals touch nothing at all. Clearing a barcode whose value has
  -- nowhere to go would destroy it; a human resolves these from the ledger.
  SELECT count(*) FILTER (WHERE action = 'skipped_sku_present'),
         count(*) FILTER (WHERE action = 'skipped_sku_taken')
  INTO v_present, v_taken
  FROM _plan;

  INSERT INTO pos_variant_barcode_fixes AS f
    (variant_id, store_id, old_barcode, action, conflict_variant_id, conflict_is_active, existing_sku)
  SELECT p.id, p.store_id, p.old_barcode, p.action, p.conflict_variant_id, p.conflict_is_active, p.sku
  FROM _plan p
  ON CONFLICT (variant_id, old_barcode) DO UPDATE
    SET action = EXCLUDED.action,
        conflict_variant_id = EXCLUDED.conflict_variant_id,
        conflict_is_active = EXCLUDED.conflict_is_active,
        existing_sku = EXCLUDED.existing_sku,
        seen_at = NOW();

  moved := v_moved;
  cleared := v_cleared;
  skipped_sku_present := v_present;
  skipped_sku_taken := v_taken;
  RETURN NEXT;
END;
$fn$;

-- ── The other half of the confusion ───────────────────────────────────────
-- The goods-receipt form had a barcode field and no SKU field, so an article
-- number off a tag had nowhere else to go. Give the placeholder line a SKU of
-- its own; `postDocument` carries it onto the variant it creates.
ALTER TABLE pos_stock_document_lines
  ADD COLUMN IF NOT EXISTS placeholder_sku VARCHAR(64);

SELECT * FROM pos_backfill_variant_barcodes();
