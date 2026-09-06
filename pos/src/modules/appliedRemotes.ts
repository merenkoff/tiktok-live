// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What `applyModuleRemotes()` (`registry.ts`) actually swapped in this boot —
 * `{ moduleId -> { url } }`. `useAuth.ts` compares a fresh server auth's
 * `store.module_remotes` against this to decide whether to prompt a reload
 * (roadmap #9).
 *
 * Dependency-free leaf (like `telemetry.ts`) so `hooks/useAuth.ts` can import it
 * without a `hooks -> modules -> @pos/platform -> hooks` cycle. (`import type` is
 * erased — no runtime dependency.)
 */

import type { ModuleRemoteEntry } from '../types';

let applied: ReadonlyMap<string, { url: string }> = new Map();

export function setAppliedRemotes(map: ReadonlyMap<string, { url: string }>): void {
  applied = map;
}

export function getAppliedRemotes(): ReadonlyMap<string, { url: string }> {
  return applied;
}

/**
 * True when `map` (a `{ id: url | ModuleRemoteEntry }` object) matches the
 * applied set exactly — compared **by URL only**, so a presentation-only tweak
 * to an online-only entry (roadmap #13 Part C) doesn't trip the reload banner.
 */
export function sameRemoteMap(
  map: Record<string, string | ModuleRemoteEntry> | undefined,
  active: ReadonlyMap<string, { url: string }> = applied
): boolean {
  const entries = Object.entries(map ?? {});
  if (entries.length !== active.size) return false;
  for (const [id, value] of entries) {
    const url = typeof value === 'string' ? value : value?.url;
    if (active.get(id)?.url !== url) return false;
  }
  return true;
}
