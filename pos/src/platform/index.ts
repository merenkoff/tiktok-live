// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * `@pos/platform` — the frozen contract between the host shell and a feature
 * module. A module under `src/modules/**` imports only from here (and its own
 * folder); it never reaches into `../../services`, `../../hooks`, `../../lib`,
 * or `../../offline` directly. Keeping this surface small and stable is what
 * lets a module later ship on its own cadence (see the Task B PoC).
 */

export * from './api';
export * from './auth';
export * from './cart';
export * from './money';
export * from './receipt';
export * from './ui';
export * from './sales';
export * from './offline';
export * from './types';
