// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// `@pos/platform`, not `../hooks/useAuth`: on the web build the platform is an
// externalised chunk, and a relative import would bundle a SECOND auth store
// into the host — one nobody ever logs into. `check-platform-boundary.mjs`
// enforces this. Its neighbour `useEnabledModules` reaches the store relatively
// because it is re-exported BY `platform/auth.ts`, i.e. bundled into that same
// chunk; this hook is not — nothing in `platform/` imports it, and no remote
// module needs it (the nav is rendered by the host alone — see `platform/ui.ts`
// on why `Nav` is deliberately not exported). So it is ordinary host code, and
// host code reaches a singleton through the barrel.
import { useAuthStore } from '@pos/platform';
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
