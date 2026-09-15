// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useAuthStore } from '../hooks/useAuth';
import type { NavOverrides } from '../types';

/** Module-level constant so an unconfigured store returns a stable reference. */
const NONE: NavOverrides = {};

/**
 * The store's menu appearance (`/admin/appearance`). Absent — no session yet,
 * or a cached auth written before this setting existed — means the factory
 * menus, never an empty menu: overrides only restyle entries that already
 * exist, so the worst a missing map can do is show the module defaults.
 */
export function useNavOverrides(): NavOverrides {
  return useAuthStore((s) => s.auth?.store.nav_overrides) ?? NONE;
}
