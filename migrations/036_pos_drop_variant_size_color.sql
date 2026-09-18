-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 036_pos_drop_variant_size_color.sql
-- Finishes what 035 started: the clothing-shaped columns go away.
--
-- ⚠ DEPLOY THIS IN A LATER RELEASE THAN 035, NEVER THE SAME ONE.
-- Migrations run before the new image is live. In the window between them a
-- 1.x backend is still serving `SELECT v.size, v.color` and still writing them
-- on every variant edit. 035 left the columns in place precisely so that
-- window is harmless; dropping them in the same deploy would 500 every catalog
-- request until the new image comes up.
--
-- The backfill below is 035's, repeated: it catches rows a 1.x backend wrote
-- after 035 ran. `WHERE attributes = '{}'` keeps it from touching anything the
-- new backend has since written.
--
-- Both halves are guarded on the column still existing, because the runner
-- keeps no tracking table and re-applies every migration on every container
-- start (Dockerfile CMD): the run after this one finds the columns already
-- gone. `DROP COLUMN IF EXISTS` handles itself; a bare UPDATE would not, and
-- a failed `migrate` means the API never starts. 007 stops re-adding the
-- placeholder pair once 035 has run, for the same reason.

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'pos_variants'::regclass
       AND attname = 'size'
       AND NOT attisdropped
  ) THEN
    EXECUTE $sql$
      UPDATE pos_variants
         SET attributes = jsonb_strip_nulls(
               jsonb_build_object('size', NULLIF(size, ''), 'color', NULLIF(color, ''))
             ),
             label = concat_ws(' / ', NULLIF(color, ''), NULLIF(size, ''))
       WHERE attributes = '{}'::jsonb
         AND label = ''
         AND (size <> '' OR color <> '')
    $sql$;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'pos_stock_document_lines'::regclass
       AND attname = 'placeholder_size'
       AND NOT attisdropped
  ) THEN
    EXECUTE $sql$
      UPDATE pos_stock_document_lines
         SET placeholder_attributes = jsonb_strip_nulls(
               jsonb_build_object(
                 'size', NULLIF(placeholder_size, ''),
                 'color', NULLIF(placeholder_color, '')
               )
             ),
             placeholder_label = concat_ws(
               ' / ', NULLIF(placeholder_color, ''), NULLIF(placeholder_size, '')
             )
       WHERE is_placeholder = TRUE
         AND placeholder_attributes = '{}'::jsonb
         AND placeholder_label = ''
         AND (placeholder_size <> '' OR placeholder_color <> '')
    $sql$;
  END IF;
END
$guard$;

ALTER TABLE pos_variants
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS color;

ALTER TABLE pos_stock_document_lines
  DROP COLUMN IF EXISTS placeholder_size,
  DROP COLUMN IF EXISTS placeholder_color;

COMMENT ON TABLE pos_variants IS
  'Product variants: vertical-defined attributes, a derived caption, price and barcode';
