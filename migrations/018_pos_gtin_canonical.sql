-- migrations/018_pos_gtin_canonical.sql
-- Canonicalize the GTIN cache key to GTIN-14 (zero-padded) and merge the rows
-- that were split across two representations of the same trade item.
--
-- Before this, `normalizeGtin` padded UPC-A to 13 but left GTIN-14 as-is, so
-- `4820000000017` and `04820000000017` were two PRIMARY KEY values for one
-- product. Zero-padding never changes the mod-10 check digit, so lpad(...,14)
-- is a safe canonical form; a real indicator digit (`14820000000014` — a case
-- of that item) is a different code and stays a separate row.
--
-- The work lives in a function so it is re-runnable as a repair tool and can be
-- exercised by tests without re-applying the migration (applying migrations
-- concurrently takes ACCESS EXCLUSIVE locks — see vitest.global-setup.ts).

CREATE OR REPLACE FUNCTION pos_gtin_canonicalize()
RETURNS TABLE(merged integer, moved integer)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_merged integer := 0;
  v_moved  integer := 0;
BEGIN
  -- 1. Within each canonical group, keep one winner. Manual first — a human
  --    correction outranks anything automatic (see gtin/types.ts priority).
  WITH ranked AS (
    SELECT gtin,
           lpad(gtin, 14, '0') AS canon,
           row_number() OVER (
             PARTITION BY lpad(gtin, 14, '0')
             ORDER BY (best_source = 'manual') DESC NULLS LAST,
                      updated_at DESC,
                      length(coalesce(name, '')) DESC,
                      gtin
           ) AS rn
    FROM pos_gtin_cache
  ),
  winners AS (SELECT gtin, canon FROM ranked WHERE rn = 1),
  losers  AS (SELECT gtin, canon FROM ranked WHERE rn > 1),
  -- 2. Top the winner up with whatever only a loser had.
  donated AS (
    SELECT l.canon,
           (array_remove(array_agg(c.brand     ORDER BY c.updated_at DESC), NULL))[1] AS brand,
           (array_remove(array_agg(c.image_url ORDER BY c.updated_at DESC), NULL))[1] AS image_url
    FROM losers l
    JOIN pos_gtin_cache c ON c.gtin = l.gtin
    GROUP BY l.canon
  ),
  filled AS (
    UPDATE pos_gtin_cache c
    SET brand     = coalesce(c.brand, d.brand),
        image_url = coalesce(c.image_url, d.image_url),
        updated_at = NOW()
    FROM winners w
    JOIN donated d ON d.canon = w.canon
    WHERE c.gtin = w.gtin
      AND (c.brand IS NULL OR c.image_url IS NULL)
    RETURNING 1
  ),
  -- 3. Drop the duplicates.
  dropped AS (
    DELETE FROM pos_gtin_cache c
    USING losers l
    WHERE c.gtin = l.gtin
    RETURNING 1
  )
  -- Data-modifying CTEs always run to completion, referenced or not.
  SELECT (SELECT count(*) FROM dropped) INTO v_merged;

  -- 4. Rewrite the surviving keys. After step 3 every canonical group holds a
  --    single row, so no PRIMARY KEY conflict is possible here.
  UPDATE pos_gtin_cache
  SET gtin = lpad(gtin, 14, '0')
  WHERE gtin <> lpad(gtin, 14, '0');
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  -- 5. Keep the audit trail joinable to the cache.
  UPDATE pos_gtin_lookup_events
  SET gtin = lpad(gtin, 14, '0')
  WHERE gtin <> lpad(gtin, 14, '0');

  merged := v_merged;
  moved  := v_moved;
  RETURN NEXT;
END;
$fn$;

SELECT * FROM pos_gtin_canonicalize();
