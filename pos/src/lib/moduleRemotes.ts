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

export interface ModuleSyncResult {
  /** `'updated'` fresh download · `'current'` cache already good · `'offline'`
   *  no network (use whatever is cached) · `'error'` unreachable here (Rust
   *  returns `Err`, surfaced as a rejected promise). */
  status: 'updated' | 'current' | 'offline' | 'error';
  /** Version now live in the cache; `null` only when offline with nothing cached. */
  active: string | null;
  previous?: string | null;
  error?: string | null;
}

/** Download + verify + cache the module, resolve with where it now stands. */
export function syncModuleRemote(id: string, baseUrl: string): Promise<ModuleSyncResult> {
  return invoke('sync_module_remote', { id, baseUrl });
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
