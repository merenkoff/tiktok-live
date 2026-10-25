-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 079_pos_debt_chain.sql
-- A «внесок» in a store with ПРРО: the Checkbox prepayment chain (step 2 of
-- partial repayment, TechDocs/grocery/G3_DEBTS.md §11 «Крок 2»).
--
-- The first «внесок» toward a «під запис» line opens a chain at the provider
-- — a «чек передплати» for the line's goods at what is still owed for them,
-- paid by the «внесок»; every further «внесок» is one more prepayment receipt
-- of that chain; the receipt that closes the line is its «чек післяплати».
--
-- ── The decisions this file pins ───────────────────────────────────────────
--
-- 1. The chain's number is OURS. Checkbox takes our `custom_relation_id` as
--    the chain's own number (sandbox run of 2026-10-25, answer 1), so it is
--    written here together with the opening receipt and a chain can be found
--    after a timeout without any answer from the provider in hand. It is
--    `ls-<store>-<line>-<n>`, where `<n>` is `fiscal_chain_attempts`: a
--    number stays taken at the provider after its chain is returned or its
--    opening refused, so a new chain on the same line takes the next one.
-- 2. The provider beside it, because a Checkbox chain cannot be closed in
--    another provider: a store that switched closes such a line with an
--    ordinary receipt and leaves the old chain where it is.
-- 3. Every sale of a chain carries the chain's number too — the «внески» and
--    the receipt that closes the line — so «are all of its documents
--    registered?» and «which sales does returning it undo?» are one query
--    each. The fiscal ledger itself does not change: each document of a
--    chain is the `sale` row of its own sale.
--
-- Re-runnable, like every file here: columns are IF NOT EXISTS, the CHECK is
-- dropped and re-added by name.

ALTER TABLE pos_debt_items
  ADD COLUMN IF NOT EXISTS fiscal_chain_id TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_chain_provider TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_chain_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos_debt_items DROP CONSTRAINT IF EXISTS pos_debt_items_chain_check;
ALTER TABLE pos_debt_items ADD CONSTRAINT pos_debt_items_chain_check
  CHECK (
    (fiscal_chain_id IS NULL) = (fiscal_chain_provider IS NULL)
    AND fiscal_chain_attempts >= 0
  );

-- One line per chain: the number carries the line's id, so a second line
-- with it would be a bug, not a coincidence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_debt_items_fiscal_chain
  ON pos_debt_items (fiscal_chain_id) WHERE fiscal_chain_id IS NOT NULL;

COMMENT ON COLUMN pos_debt_items.fiscal_chain_id IS
  'The ПРРО prepayment chain the line''s «внески» went to — our number, which the provider takes as its own (G3_DEBTS.md §11).';
COMMENT ON COLUMN pos_debt_items.fiscal_chain_provider IS
  'Whose chain it is: a chain of one provider cannot be closed in another.';
COMMENT ON COLUMN pos_debt_items.fiscal_chain_attempts IS
  'Chains opened on the line so far — the <n> of the next number, since a used number stays taken at the provider.';

ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS fiscal_chain_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_sales_fiscal_chain
  ON pos_sales (store_id, fiscal_chain_id) WHERE fiscal_chain_id IS NOT NULL;

COMMENT ON COLUMN pos_sales.fiscal_chain_id IS
  'Set on a document of a ПРРО prepayment chain: a «внесок», or the receipt that closed the line (G3_DEBTS.md §11).';
