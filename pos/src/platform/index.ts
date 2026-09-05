// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * `@pos/platform` — the frozen contract between the host shell and a feature
 * module. A module under `src/modules/**` imports only from here (and its own
 * folder); it never reaches into `../../services`, `../../hooks`, `../../lib`,
 * or `../../offline` directly. Keeping this surface small and stable is what
 * lets a module later ship on its own cadence (see the Task B PoC).
 *
 * State/data only — see `@pos/platform/ui` for shared components. `ui.ts`
 * re-exports `Nav`, which reads the full module registry (every manifest's
 * lazily-loaded pages, including this module's own), so it can't be part of
 * this barrel without a self-referential cycle the first time this file is
 * built as a standalone chunk (`vite.platform-remote.config.ts`). Splitting
 * it out keeps this barrel small enough to actually share as one instance
 * across the host<->remote boundary; `@pos/platform/ui`'s components are
 * bundled locally by every consumer instead (fine — they're not singletons,
 * they just read the shared stores above).
 */

export * from './api';
export * from './auth';
export * from './cart';
export * from './gtin';
export * from './money';
export * from './receipt';
export * from './sales';
export * from './offline';
export * from './types';
