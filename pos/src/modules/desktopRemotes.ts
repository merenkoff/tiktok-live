// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * How the desktop cashier boots and keeps module remotes fresh (roadmap #12
 * track 1). Pure over an injected `sync` so it is unit-testable without Tauri;
 * `cashier-main.tsx` passes the real `syncModuleRemote` bridge.
 *
 * Boot is **cache-first**: a module already on disk is imported at once and
 * the network is not consulted at all (`createCacheFirstSync`). Only a module
 * with nothing cached waits for a download — the first run. After the first
 * render, `checkModuleRemoteUpdates` runs the real sync for every remote in the
 * background; whatever it downloads is picked up on the next boot, and
 * `useModuleRemoteUpdates` lets the shell offer that reload right away.
 */

import { create } from 'zustand';
import { getAppliedRemotes } from '@pos/platform';
import { allModules, remoteModules } from './registry';
import type { ModuleSyncResult } from '../lib/moduleRemotes';

export type SyncFn = (
  id: string,
  url: string,
  opts?: { cachedOnly?: boolean }
) => Promise<ModuleSyncResult>;

/**
 * The `applyModuleRemotes({ syncRemote })` implementation: cache → network.
 * Resolves `null` when neither holds the module (cold offline first run), so the
 * registry shows the placeholder.
 */
export function createCacheFirstSync(sync: SyncFn, urlFor: (id: string, file?: string) => string) {
  return async (id: string, url: string) => {
    const located = { importUrl: urlFor(id), styleUrl: urlFor(id, 'style.css') };
    const cached = await sync(id, url, { cachedOnly: true }).catch(() => null);
    if (cached?.active != null) return located;
    const fetched = await sync(id, url).catch(() => null);
    if (!fetched || fetched.active == null) return null;
    return located;
  };
}

interface ModuleRemoteUpdatesState {
  /** Module titles whose newer (or first) download landed since boot. */
  ready: string[];
  /**
   * Module titles whose published build needs a newer host `PLATFORM_VERSION`
   * than this app has (roadmap #12 track 2) — a reload changes nothing; the
   * app itself has to update.
   */
  needsAppUpdate: string[];
  dismissed: boolean;
  markReady: (title: string) => void;
  markNeedsAppUpdate: (title: string) => void;
  dismiss: () => void;
}

export const useModuleRemoteUpdates = create<ModuleRemoteUpdatesState>((set) => ({
  ready: [],
  needsAppUpdate: [],
  dismissed: false,
  markReady: (title) =>
    set((s) => (s.ready.includes(title) ? s : { ready: [...s.ready, title], dismissed: false })),
  markNeedsAppUpdate: (title) =>
    set((s) =>
      s.needsAppUpdate.includes(title)
        ? s
        : { needsAppUpdate: [...s.needsAppUpdate, title], dismissed: false }
    ),
  dismiss: () => set({ dismissed: true }),
}));

function titleOf(id: string): string {
  return allModules().find((m) => m.id === id)?.title ?? id;
}

/**
 * One background pass over every remote this boot resolved (the store's full
 * `module_remotes` intent, placeholders included). A `'updated'` result, or a
 * placeholder that now has a cached version, means a reload would change what
 * the user sees — mark it. Never throws: a sync failure is telemetry's
 * business, not this banner's.
 */
export async function checkModuleRemoteUpdates(sync: SyncFn): Promise<void> {
  const pending = new Set(remoteModules.filter((m) => m.pending).map((m) => m.id));
  const entries = [...getAppliedRemotes()];
  await Promise.allSettled(
    entries.map(async ([id, { url }]) => {
      const res = await sync(id, url);
      if (res.status === 'incompatible') {
        useModuleRemoteUpdates.getState().markNeedsAppUpdate(titleOf(id));
      } else if (res.status === 'updated' || (pending.has(id) && res.active != null)) {
        useModuleRemoteUpdates.getState().markReady(titleOf(id));
      }
    })
  );
}

/** Once an hour — a module release is a rare event, not a queue to drain. */
export const MODULE_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Kick off the background checks: right away, whenever the network comes
 * back, and on an interval. Returns a stop function (used by tests).
 */
export function startModuleRemoteUpdateChecks(
  sync: SyncFn,
  intervalMs = MODULE_UPDATE_CHECK_INTERVAL_MS
): () => void {
  if (getAppliedRemotes().size === 0) return () => undefined;
  const run = () => {
    void checkModuleRemoteUpdates(sync);
  };
  run();
  window.addEventListener('online', run);
  const timer = window.setInterval(run, intervalMs);
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(timer);
  };
}
