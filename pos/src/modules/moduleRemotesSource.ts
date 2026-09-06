// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Resolves the module-remote list `applyModuleRemotes()` should apply this boot
 * (roadmap #9, extended by #13 Part C). Runs before React mounts, so it reads
 * storage directly — never `useAuthStore`.
 *
 * Precedence:
 *   1. `VITE_MODULE_REMOTES` (`id@url,id@url`) — build/QA override, wins outright,
 *      string form only (dev override of a bundled module);
 *   2. otherwise the per-store `store.module_remotes` map from the cached
 *      `pos_auth` (set by the last successful login/`me()`).
 *
 * A `module_remotes` value is either a bare URL string (override a bundled
 * module's code) or a `ModuleRemoteEntry` object (a new online-only module the
 * desktop cashier downloads — carries the nav/route metadata to render a
 * placeholder before it's downloaded). The backend `sanitizeModuleRemotes` is
 * the real gate — this is just defence against a mangled cache.
 */

import type { ModuleRemoteEntry } from '../types';

const AUTH_KEY = 'pos_auth';

/** Nav/route metadata for an online-only module, before its full descriptor loads. */
export type ModulePresentation = Omit<ModuleRemoteEntry, 'url'>;

export interface ResolvedRemote {
  url: string;
  /** Set only for the object form — a new online-only module (roadmap #13 Part C). */
  presentation?: ModulePresentation;
}

/** Mirror of backend `isAllowedRemoteUrl` (src/pos/core/modules.ts). */
export function isAllowedRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  if (url.startsWith('/') && !url.startsWith('//')) return true;
  if (url.startsWith('https://')) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}

const NAV_LOCATIONS = ['cashier-primary', 'admin-sidebar'] as const;

/**
 * A lucide export name (roadmap #13 Part D) — shape only; whether this build
 * actually ships the icon is `resolveNavIcon`'s problem, and it has a fallback.
 */
function isIconName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value);
}

/** A cached object entry → validated `ModulePresentation`, or null. */
function parsePresentation(value: Record<string, unknown>): ModulePresentation | null {
  const { title, routePath, nav, icon } = value;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof routePath !== 'string' || !/^\/[a-z0-9][a-z0-9/-]*$/.test(routePath)) return null;
  if (!Array.isArray(nav) || nav.length === 0) return null;

  const cleanNav: ModulePresentation['nav'] = [];
  for (const raw of nav) {
    if (!raw || typeof raw !== 'object') return null;
    const n = raw as Record<string, unknown>;
    if (typeof n.label !== 'string' || !n.label.trim()) return null;
    if (typeof n.order !== 'number' || !Number.isInteger(n.order)) return null;
    if (!NAV_LOCATIONS.includes(n.location as (typeof NAV_LOCATIONS)[number])) return null;
    cleanNav.push({
      label: n.label,
      location: n.location as ModulePresentation['nav'][number]['location'],
      order: n.order,
      ...(typeof n.match === 'string' && n.match ? { match: n.match } : {}),
      ...(isIconName(n.icon) ? { icon: n.icon } : {}),
    });
  }

  return {
    title: title.trim(),
    routePath,
    nav: cleanNav,
    ...(isIconName(icon) ? { icon } : {}),
  };
}

function fromEnv(spec: string, knownIds: ReadonlySet<string>): Map<string, ResolvedRemote> {
  const out = new Map<string, ResolvedRemote>();
  for (const raw of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const at = raw.indexOf('@');
    if (at <= 0) continue;
    const id = raw.slice(0, at);
    const url = raw.slice(at + 1);
    if (knownIds.has(id) && isAllowedRemoteUrl(url)) out.set(id, { url: url.trim() });
  }
  return out;
}

function fromCachedAuth(knownIds: ReadonlySet<string>): Map<string, ResolvedRemote> {
  const out = new Map<string, ResolvedRemote>();
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
    for (const [id, value] of Object.entries(map as Record<string, unknown>)) {
      if (typeof value === 'string') {
        // String form: override a bundled module — id must be a known module.
        if (knownIds.has(id) && isAllowedRemoteUrl(value)) out.set(id, { url: value.trim() });
        continue;
      }
      // Object form: a new online-only module — arbitrary id, must self-describe.
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      if (!isAllowedRemoteUrl(entry.url)) continue;
      const presentation = parsePresentation(entry);
      if (presentation) out.set(id, { url: (entry.url as string).trim(), presentation });
    }
  } catch {
    /* mangled cache — no remotes */
  }
  return out;
}

export function resolveModuleRemotes(knownIds: ReadonlySet<string>): Map<string, ResolvedRemote> {
  const env = (import.meta.env.VITE_MODULE_REMOTES as string | undefined)?.trim();
  if (env) return fromEnv(env, knownIds);
  return fromCachedAuth(knownIds);
}
