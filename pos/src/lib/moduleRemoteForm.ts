// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Client-side rules for a `module_remotes` object entry, shared by the owner's
 * Settings page and the super admin (`/super`). Mirrors the backend's
 * `sanitizeModuleRemoteEntry` (src/pos/core/modules.ts) closely enough to fail
 * here with a readable message instead of on save — the backend stays the
 * real gate. Pure, so it is unit-tested without React.
 */

import type { ModuleRemoteEntry } from '../types';
import { isAllowedRemoteUrl } from '../modules/moduleRemotesSource';

export { isAllowedRemoteUrl };

export const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

export interface RemoteEntryInput {
  id: string;
  title: string;
  url: string;
  routePath: string;
  order: string | number;
  icon?: string;
  /** Ids already in use — bundled modules and existing entries. */
  takenIds: ReadonlySet<string>;
}

export type RemoteEntryResult =
  | { ok: true; id: string; entry: ModuleRemoteEntry }
  | { ok: false; error: string };

export function validateRemoteEntryInput(input: RemoteEntryInput): RemoteEntryResult {
  const id = input.id.trim();
  const url = input.url.trim();
  const title = input.title.trim();
  const routePath = input.routePath.trim();
  const order = Number(input.order);
  const icon = (input.icon ?? '').trim();

  if (!MODULE_ID_RE.test(id)) {
    return { ok: false, error: 'Ідентифікатор: малі латинські літери, цифри, дефіс, з літери.' };
  }
  if (input.takenIds.has(id)) return { ok: false, error: `Ідентифікатор «${id}» вже зайнято.` };
  if (!title || title.length > 80) return { ok: false, error: 'Назва: від 1 до 80 символів.' };
  if (!isAllowedRemoteUrl(url)) {
    return { ok: false, error: 'Джерело: https://…, шлях від кореня /… або http://localhost.' };
  }
  if (!routePath || routePath.length > 120 || !/^\/[a-z0-9][a-z0-9/-]*$/.test(routePath)) {
    return { ok: false, error: 'Маршрут: з «/», малі латинські літери, цифри, «-», «/».' };
  }
  if (!Number.isInteger(order)) return { ok: false, error: 'Порядок у меню: ціле число.' };
  if (icon && !/^[A-Za-z0-9]+$/.test(icon)) {
    return { ok: false, error: 'Іконка: ім’я lucide-компонента без пробілів (напр. Video).' };
  }

  const entry: ModuleRemoteEntry = {
    url,
    title,
    routePath,
    nav: [
      {
        label: title,
        location: 'cashier-primary',
        order,
        match: routePath,
        ...(icon ? { icon } : {}),
      },
    ],
    ...(icon ? { icon } : {}),
  };
  return { ok: true, id, entry };
}

/**
 * The version a release URL pins, when it follows the `module-release.yml`
 * layout (`…@module-<id>-v<version>/<id>/remote-entry.js`); null otherwise.
 */
export function parseVersionFromUrl(url: string): string | null {
  const m = /@module-[a-z0-9-]+-v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\//.exec(url);
  return m ? m[1] : null;
}

/** The URL of a `module_remotes` value, whichever form it is. */
export function remoteUrlOf(value: string | ModuleRemoteEntry): string {
  return typeof value === 'string' ? value : value.url;
}

/** Host + tail of a long URL, for a table cell. */
export function shortUrl(url: string, tail = 40): string {
  try {
    const u = new URL(url, 'https://x.invalid');
    const path = u.pathname.length > tail ? `…${u.pathname.slice(-tail)}` : u.pathname;
    return u.host === 'x.invalid' ? path : `${u.host}${path}`;
  } catch {
    return url.length > tail + 12 ? `…${url.slice(-tail)}` : url;
  }
}

/** `tiktok-live 1.1.0` when the URL pins a release, else the id + a short URL. */
export function remoteSummary(id: string, value: string | ModuleRemoteEntry): string {
  const url = remoteUrlOf(value);
  const version = parseVersionFromUrl(url);
  return version ? `${id} ${version}` : `${id} · ${shortUrl(url)}`;
}
