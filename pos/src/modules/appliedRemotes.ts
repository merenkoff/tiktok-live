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
 * without a `hooks -> modules -> @pos/platform -> hooks` cycle.
 */

let applied: ReadonlyMap<string, { url: string }> = new Map();

export function setAppliedRemotes(map: ReadonlyMap<string, { url: string }>): void {
  applied = map;
}

export function getAppliedRemotes(): ReadonlyMap<string, { url: string }> {
  return applied;
}

/** True when `map` (a `{ id: url }` object) matches the applied set exactly. */
export function sameRemoteMap(
  map: Record<string, string> | undefined,
  active: ReadonlyMap<string, { url: string }> = applied
): boolean {
  const entries = Object.entries(map ?? {});
  if (entries.length !== active.size) return false;
  for (const [id, url] of entries) {
    if (active.get(id)?.url !== url) return false;
  }
  return true;
}
