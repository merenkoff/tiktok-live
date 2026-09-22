-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 053_pos_demo_cafe_hall.sql
-- A floor plan for «Demo Café» — the demo restaurant of phase К4k. See
-- TechDocs/POS_TABLES.md §12 and POS_VERTICALS.md §7o.
--
-- Its own file rather than a bump of 048's `v_version`: that bump REBUILDS the
-- café's whole catalogue and deletes the demo's sales along with it, which is
-- a heavy price for adding eight tables. The stamp mechanism is the same
-- (`pos_demo_seed`), under its own slug, so the two demos version separately.
--
-- Why the café gets tables at all: the module's PRESENCE is the «restaurant»
-- switch (§4.11) — there is no `service_mode` column and there is not going to
-- be one — so the same demo store is a counter-service café with the module
-- off and a restaurant with it on. That is exactly what a demo should show.
--
-- The room is EMPTY: no bills, no rounds, nothing sold at a table. A seeded
-- bill ages badly — its `opened_at` is fixed in this file, and the hall map's
-- «сидять 3 дні» would be the first thing anybody saw. The waiter opens the
-- first one.
--
-- Coordinates are grid CELLS (§4.8), not pixels: `pos_x`/`pos_y` is the top-left
-- corner and `width`/`height` the size, so the same room reads the same on a
-- laptop, on a tablet and on the till.
--
-- Re-runnable, like every file here: the runner re-applies all of them on every
-- boot. Stamp = version → return. Older or absent stamp → the room is rebuilt,
-- which deletes THIS DEMO's bills (`pos_bills` cascades its rounds, items and
-- their component snapshots; `pos_sale_items.bill_item_id` is ON DELETE SET
-- NULL, so receipts survive and merely lose the link back to the table).

DO $$
DECLARE
  -- Bump when the layout below changes; the header says what that does.
  v_version CONSTANT int := 1;
  v_stamped int;
  v_store   bigint;
  v_hall    bigint;
  v_terrace bigint;
BEGIN
  SELECT id INTO v_store FROM pos_stores WHERE slug = 'demo-cafe';
  IF v_store IS NULL THEN
    -- 048 runs before this file on every boot, so this only happens in a
    -- database where the café demo was deliberately removed.
    RAISE NOTICE 'demo-cafe is not in this database — skipping its floor plan';
    RETURN;
  END IF;

  SELECT version INTO v_stamped FROM pos_demo_seed WHERE slug = 'demo-cafe-hall';
  IF v_stamped = v_version THEN
    RAISE NOTICE 'demo-cafe hall already at version % — skipping', v_version;
    RETURN;
  END IF;

  RAISE NOTICE 'building demo-cafe hall (stamp %, target %)',
    COALESCE(v_stamped::text, 'none'), v_version;

  -- Ordered by what Postgres checks mid-cascade: bills point at tables with
  -- ON DELETE RESTRICT, so they go first.
  DELETE FROM pos_bills WHERE store_id = v_store;
  DELETE FROM pos_tables WHERE store_id = v_store;
  DELETE FROM pos_halls WHERE store_id = v_store;

  INSERT INTO pos_halls (store_id, name, sort_order, is_active)
  VALUES (v_store, 'Зала', 0, TRUE)
  RETURNING id INTO v_hall;

  INSERT INTO pos_halls (store_id, name, sort_order, is_active)
  VALUES (v_store, 'Тераса', 1, TRUE)
  RETURNING id INTO v_terrace;

  -- A small room read from the door: two twos by the window, a four in the
  -- corner, two rounds, and a long six along the wall.
  INSERT INTO pos_tables (store_id, hall_id, name, seats, pos_x, pos_y, width, height, shape)
  VALUES
    (v_store, v_hall,    '1',  2, 0, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '2',  2, 2, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '3',  4, 5, 0, 2, 2, 'rect'),
    (v_store, v_hall,    '4',  2, 0, 3, 2, 2, 'round'),
    (v_store, v_hall,    '5',  4, 2, 3, 2, 2, 'round'),
    (v_store, v_hall,    '6',  6, 5, 3, 3, 2, 'rect'),
    (v_store, v_terrace, 'T1', 4, 0, 0, 2, 2, 'rect'),
    (v_store, v_terrace, 'T2', 4, 2, 0, 2, 2, 'rect');

  INSERT INTO pos_demo_seed (slug, version) VALUES ('demo-cafe-hall', v_version)
  ON CONFLICT (slug) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

  RAISE NOTICE 'demo-cafe hall ready at version % (store %)', v_version, v_store;
END $$;
