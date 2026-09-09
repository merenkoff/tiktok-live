// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Desktop cashier bridge to the Rust module-remote cache (roadmap #13 Part B).
 * Cashier-only, like `src/lib/updates.ts` — never imported by the web build.
 *
 * `syncModuleRemote` asks Rust to fetch + Ed25519-verify + cache a module under
 * `appDataDir/modules/<id>/`; `moduleRemoteUrl` builds the `liveshopmodule://`
 * URL the Rust URI-scheme handler serves those cached bytes from, which
 * `applyModuleRemotes` then `import()`s.
 */

import { invoke } from '@tauri-apps/api/core';
// Leaf import, like `registry.ts`: `platform/version.ts` has no dependencies.
import { PLATFORM_VERSION } from '../platform/version';

export interface ModuleSyncResult {
  /** `'updated'` fresh download · `'current'` cache already good · `'offline'`
   *  no network (use whatever is cached) · `'incompatible'` the server's build
   *  needs a newer host `PLATFORM_VERSION` than this app has — not downloaded,
   *  `active` is the cached version if that one is compatible (roadmap #12
   *  track 2) · `'error'` unreachable here (Rust returns `Err`, surfaced as a
   *  rejected promise). */
  status: 'updated' | 'current' | 'offline' | 'incompatible' | 'error';
  /** Version now live in the cache; `null` when nothing usable is cached. */
  active: string | null;
  previous?: string | null;
  error?: string | null;
}

export interface SyncModuleRemoteOptions {
  /**
   * Answer from the on-disk cache without touching the network: `current` +
   * the cached version when the cache is intact, `offline` + `null` otherwise.
   * What the shell boots from (roadmap #12 track 1) — the network sync runs
   * afterwards in the background.
   */
  cachedOnly?: boolean;
}

/** Download + verify + cache the module, resolve with where it now stands. */
export function syncModuleRemote(
  id: string,
  baseUrl: string,
  opts: SyncModuleRemoteOptions = {}
): Promise<ModuleSyncResult> {
  // `hostPlatform` is what Rust compares the manifest's `minHostPlatform` to —
  // the TS side owns that number; Rust cannot read `version.ts`.
  return invoke('sync_module_remote', {
    id,
    baseUrl,
    cachedOnly: opts.cachedOnly ?? false,
    hostPlatform: PLATFORM_VERSION,
  });
}

/**
 * Delete the cache of every module NOT in `keep`; resolves with the ids removed.
 * Called once after boot with the ids the store still names in `module_remotes`.
 */
export function pruneModuleRemotes(keep: string[]): Promise<string[]> {
  return invoke('prune_module_remotes', { keep });
}

/**
 * Base for the cached bytes served by the Rust `liveshopmodule://` handler.
 * Tauri exposes a custom scheme as `liveshopmodule://localhost/…` on
 * macOS/Linux and `http://liveshopmodule.localhost/…` on Windows.
 */
export function moduleRemoteUrl(id: string, file = 'remote-entry.js'): string {
  const isWindows =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
  const base = isWindows ? 'http://liveshopmodule.localhost' : 'liveshopmodule://localhost';
  return `${base}/${id}/${file}`;
}
