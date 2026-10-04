-- migrations/063_pos_markdowns.sql
-- Mass markdown (clothing, TechDocs/POS_CLOTHING.md D2): one campaign over many
-- variants, with a per-variant snapshot of the prices before and after.
--
-- The snapshot is the whole point. A markdown ends — by hand or when its date
-- passes — by putting back what each variant cost BEFORE it, and the only
-- honest source for that is what was recorded when the markdown was applied:
-- `compare_at_cents` alone cannot say whether a variant had its own markdown
-- already, and a price the owner retyped meanwhile must not be overwritten
-- (the end step restores a variant only while it still carries the campaign's
-- price, and reports the rest as skipped).
--
-- Re-runnable: the migration runner applies every file on every boot.

CREATE TABLE IF NOT EXISTS pos_markdowns (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    -- Optional caption («Літо −30 %»); the list falls back to the percentage.
    name VARCHAR(80) NOT NULL DEFAULT '',
    -- Off the ORIGINAL price (compare_at when the variant was already marked
    -- down), so applying the same markdown twice is not a deeper markdown.
    percent INTEGER NOT NULL CHECK (percent > 0 AND percent < 100),
    -- In cents: 1 = копійки, 100 = до гривні, 1000 = до 10 гривень.
    rounding INTEGER NOT NULL DEFAULT 100 CHECK (rounding IN (1, 100, 1000)),
    -- Store-local calendar day; the markdown is live THROUGH this day and the
    -- hourly cron ends it on the first run after that day has passed. NULL =
    -- until the owner ends it.
    ends_on DATE NULL,
    created_by BIGINT NOT NULL REFERENCES pos_staff(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ NULL,
    -- NULL with ended_at set = the cron ended it.
    ended_by BIGINT NULL REFERENCES pos_staff(id),
    ended_reason VARCHAR(16) NULL CHECK (ended_reason IS NULL OR ended_reason IN ('manual', 'expired')),
    CHECK ((ended_at IS NULL) = (ended_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_pos_markdowns_live
    ON pos_markdowns (store_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS pos_markdown_items (
    id BIGSERIAL PRIMARY KEY,
    markdown_id BIGINT NOT NULL REFERENCES pos_markdowns(id) ON DELETE CASCADE,
    store_id BIGINT NOT NULL REFERENCES pos_stores(id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES pos_variants(id) ON DELETE CASCADE,
    price_before INTEGER NOT NULL CHECK (price_before >= 0),
    compare_at_before INTEGER NULL CHECK (compare_at_before IS NULL OR compare_at_before >= 0),
    price_after INTEGER NOT NULL CHECK (price_after > 0),
    compare_at_after INTEGER NOT NULL CHECK (compare_at_after > price_after),
    -- Filled when the markdown ends: 'restored' (the price went back) or
    -- 'skipped' (the owner had changed the variant since, so it was left).
    restored VARCHAR(16) NULL CHECK (restored IS NULL OR restored IN ('restored', 'skipped')),
    UNIQUE (markdown_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_markdown_items_variant
    ON pos_markdown_items (variant_id);

COMMENT ON TABLE pos_markdowns IS
  'A mass markdown campaign: percent off the original price over many variants, ended by hand or by date (clothing D2).';
COMMENT ON TABLE pos_markdown_items IS
  'Per-variant snapshot of a markdown: prices before and after, and whether the end step restored the variant.';
