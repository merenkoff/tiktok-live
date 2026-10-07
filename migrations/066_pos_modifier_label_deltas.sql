-- migrations/066_pos_modifier_label_deltas.sql
-- A modifier answer whose price depends on the size of the dish
-- (TechDocs/POS_DEMO_SUNCITY.md «PR A», POS_VERTICALS.md §7k).
--
-- A pizzeria charges more for the same crust on a bigger pizza: «Бортики
-- Філадельфія» is +80 ₴ on 30 см and +150 ₴ on 50 см. `price_delta_cents`
-- stays the answer's default; `label_deltas` is a list of
-- `{label, price_delta_cents}` overriding it for a variant whose label
-- matches (trimmed, spaces collapsed, case-folded — `labelKey` in
-- modifiers.service.ts). Keyed by the variant's LABEL, not its id: a group is
-- shared by every pizza on the menu, so one entry «50 см» covers all of them,
-- and a pizza added tomorrow in «50 см» is priced right without anyone
-- touching the group. In a café the label is the size (`cafe.ts` `labelOf`).
--
-- No snapshot changes: a sale line has one variant, so what lands in
-- `pos_sale_item_modifiers` / the 051/052/058 JSONB is already the one delta
-- that applied.
--
-- Re-runnable: the migration runner applies every file on every boot.

ALTER TABLE pos_modifiers
  ADD COLUMN IF NOT EXISTS label_deltas JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_modifiers_label_deltas_is_array'
  ) THEN
    ALTER TABLE pos_modifiers
      ADD CONSTRAINT pos_modifiers_label_deltas_is_array
      CHECK (jsonb_typeof(label_deltas) = 'array');
  END IF;
END
$guard$;
