-- migrations/023_pos_internal_barcode_seq.sql
-- Counter behind the "згенерувати штрихкод" button.
--
-- A scanner that cannot read a supplier's tag leaves the cashier with nothing
-- to scan and nothing to print on a price tag. The button mints an EAN-13 in
-- the GS1 restricted-distribution range (see src/pos/gtin/internal-code.ts),
-- which is exactly what that range exists for.
--
-- Why a sequence rather than random digits: `nextval` is non-transactional, so
-- it never rolls back — which answers the whole "what if she generates a code
-- and never saves the product" question. An abandoned code is a gap in an
-- opaque counter, and there are ten billion of them. The alternative needed a
-- retry loop, an RNG seam in the tests, and gave the operator — who will be
-- reading these codes aloud and typing them — eleven random digits instead of
-- a small number.
--
-- Deliberately global, not per store: the code is then unique across the whole
-- deployment, not merely within `idx_pos_variants_store_barcode`.

CREATE SEQUENCE IF NOT EXISTS pos_internal_barcode_seq AS BIGINT START WITH 1;
