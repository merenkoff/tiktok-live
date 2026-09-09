// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Feature modules with their own offline data (roadmap #12 track 3,
 * TechDocs/POS_MODULE_OFFLINE_DATA.md).
 *
 * A module that keeps its own IndexedDB queue declares `offline` hooks on its
 * descriptor (`ModuleOfflineHooks` in `modules/types.ts`). The shell's offline
 * runtime (`sync.ts`, `status.ts`) is bundled into the `@pos/platform` chunk
 * and must not import the module registry (registry → manifests → pages →
 * `@pos/platform` — a cycle), so the hooks reach it through this dependency-
 * free leaf: the shell entry registers the loaded descriptors' hooks after
 * `applyModuleRemotes()`, and the runtime only ever reads this map.
 *
 * The module does not register itself — it is data; the host reads it.
 */

export interface ModuleOfflineHooks {
  /** Rows still waiting to reach the server. Added to the till's "Очікує синк: N". */
  pendingCount(): Promise<number>;
  /**
   * Push queued work. Called after the shell's own outbox (customers → sales),
   * on the same triggers: `online`, the 30 s interval, after a login. Must be
   * idempotent (the server may already have the previous attempt) and must
   * not throw — a failure belongs in the module's own rows, and a throw here is
   * caught and reported, never allowed to stall the shell's sync.
   */
  sync(): Promise<void>;
}

const registry = new Map<string, ModuleOfflineHooks>();

export function registerOfflineModule(id: string, hooks: ModuleOfflineHooks): void {
  registry.set(id, hooks);
}

export function unregisterOfflineModule(id: string): void {
  registry.delete(id);
}

/** Snapshot of the registered hooks, in registration order. */
export function offlineModules(): Array<[string, ModuleOfflineHooks]> {
  return [...registry.entries()];
}

/** Register every descriptor that declares `offline` hooks; skips the rest. */
export function registerOfflineModules(
  descriptors: ReadonlyArray<{ id: string; offline?: ModuleOfflineHooks }>
): void {
  for (const d of descriptors) if (d.offline) registerOfflineModule(d.id, d.offline);
}

/**
 * Run every module's `sync()` in registration order. A hook that throws is
 * reported through `onError` and the loop moves on — one module's bug must not
 * hold the others' rows hostage.
 */
export async function syncOfflineModules(
  onError: (id: string, error: unknown) => void = () => undefined
): Promise<void> {
  for (const [id, hooks] of registry) {
    try {
      await hooks.sync();
    } catch (error) {
      onError(id, error);
    }
  }
}

/** Sum of every module's `pendingCount()`, per module; a throwing hook counts as 0. */
export async function modulePendingCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    [...registry].map(async ([id, hooks]) => {
      try {
        out[id] = await hooks.pendingCount();
      } catch {
        out[id] = 0;
      }
    })
  );
  return out;
}

/** Test-only: forget every registration. */
export function resetOfflineModulesForTests(): void {
  registry.clear();
}
