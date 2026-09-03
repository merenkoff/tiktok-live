// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useMemo } from 'react';
import { useAuthStore } from '../hooks/useAuth';
import type { ModuleId } from './types';
import { CORE_MODULE_IDS, DEFAULT_ENABLED_MODULE_IDS } from './constants';

/**
 * When the server has not told us the enabled set yet (no auth, or an older
 * cached auth without `enabled_modules`), fall back to the FULL default set —
 * never to an empty set, or a returning user with a stale cache would lose every
 * module until the next login.
 */
const FALLBACK: ReadonlySet<ModuleId> = new Set<ModuleId>([
  ...CORE_MODULE_IDS,
  ...DEFAULT_ENABLED_MODULE_IDS,
]);

export function useEnabledModules(): ReadonlySet<ModuleId> {
  const mods = useAuthStore((s) => s.auth?.store.enabled_modules);
  return useMemo(() => {
    if (!mods) return FALLBACK;
    return new Set<ModuleId>([...CORE_MODULE_IDS, ...(mods as ModuleId[])]);
  }, [mods]);
}
