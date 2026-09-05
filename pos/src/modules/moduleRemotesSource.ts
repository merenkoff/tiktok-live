// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Resolves the module-remote list `applyModuleRemotes()` should apply this boot
 * (roadmap #9). Runs before React mounts, so it reads storage directly — never
 * `useAuthStore`.
 *
 * Precedence:
 *   1. `VITE_MODULE_REMOTES` (`id@url,id@url`) — build/QA override, wins outright;
 *   2. otherwise the per-store `store.module_remotes` map from the cached
 *      `pos_auth` (set by the last successful login/`me()`).
 *
 * Both are filtered: the id must be a known module and the URL must look like a
 * remote we're willing to `import()`. The backend `sanitizeModuleRemotes` is the
 * real gate — this is just defence against a mangled cache.
 */

const AUTH_KEY = 'pos_auth';

/** Mirror of backend `isAllowedRemoteUrl` (src/pos/core/modules.ts). */
export function isAllowedRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  if (url.startsWith('https://')) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

function fromEnv(spec: string, knownIds: ReadonlySet<string>): Map<string, { url: string }> {
  const out = new Map<string, { url: string }>();
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const at = raw.indexOf('@');
    if (at <= 0) continue;
    const id = raw.slice(0, at);
    const url = raw.slice(at + 1);
    if (knownIds.has(id) && isAllowedRemoteUrl(url)) out.set(id, { url: url.trim() });
  }
  return out;
}

function fromCachedAuth(knownIds: ReadonlySet<string>): Map<string, { url: string }> {
  const out = new Map<string, { url: string }>();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(AUTH_KEY);
  } catch {
    return out;
  }
  if (!raw) return out;
  try {
    const map = (JSON.parse(raw) as { store?: { module_remotes?: unknown } })?.store?.module_remotes;
    if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
    for (const [id, url] of Object.entries(map as Record<string, unknown>)) {
      if (knownIds.has(id) && isAllowedRemoteUrl(url)) out.set(id, { url: url.trim() });
    }
  } catch {
    /* mangled cache — no remotes */
  }
  return out;
}

export function resolveModuleRemotes(knownIds: ReadonlySet<string>): Map<string, { url: string }> {
  const env = (import.meta.env.VITE_MODULE_REMOTES as string | undefined)?.trim();
  if (env) return fromEnv(env, knownIds);
  return fromCachedAuth(knownIds);
}
