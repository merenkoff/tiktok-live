-- The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
-- Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
-- Commercial use requires a separate agreement: mer.sergei@gmail.com

-- 097: licence-gated delivery of online-module bundles (TechDocs/POS_OPENCORE.md
-- §8, TechDocs/POS_LICENSING.md phase 2D-C). Re-runnable: every statement is
-- IF NOT EXISTS, because the runner re-applies every file on every boot.
--
-- 1. pos_module_issues — the AUTHOR's journal of which module version was ever
--    handed to which licence. A licence that has since expired still gets the
--    versions it was given (OwnNet §1.12: a licence-compliance check must not
--    disable software the user already lawfully runs); it only stops getting
--    NEW ones. Keyed by the licence's fingerprint (first 32 hex of sha256 of the
--    licence token), never by a store: the author's server sees deployments,
--    not their stores. Only the author's deployment writes it; on any other copy
--    the table stays empty.
CREATE TABLE IF NOT EXISTS pos_module_issues (
  license_fp     text        NOT NULL,
  module_id      text        NOT NULL,
  version        text        NOT NULL,
  first_issued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (license_fp, module_id, version)
);

-- 2. The DEPLOYMENT's own delivery token, obtained from the author's server with
--    its LICENSE_KEY and put into the module URLs its tills receive at login.
--    Kept in the singleton licence row so a restart does not hand out bare URLs
--    until the next refresh reaches the author's server.
ALTER TABLE pos_license_state ADD COLUMN IF NOT EXISTS module_token text;
ALTER TABLE pos_license_state ADD COLUMN IF NOT EXISTS module_token_expires_at timestamptz;
