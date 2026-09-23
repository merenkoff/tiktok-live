// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { PosShell } from '../shell';

/**
 * Does a module run in this shell?
 *
 * A bundled manifest names `'tablet'` explicitly. A remote bundle published
 * before the tablet existed carries `shells: ['web', 'cashier']` baked in
 * (`remote-entry.ts` ships the manifest verbatim), and a bare `includes` would
 * make every such module vanish from the tablet until the CDN is republished —
 * the café's own catalog would silently fall back to clothing. So a module that
 * runs in BOTH older shells is taken to run on the tablet too: the tablet is the
 * till-side screen set, and a module that fits the desktop till and the browser
 * fits it. A web-only (admin) or cashier-only (hardware) module does not.
 */
export function runsInShell(m: { shells: readonly PosShell[] }, shell: PosShell): boolean {
  if (m.shells.includes(shell)) return true;
  return shell === 'tablet' && m.shells.includes('web') && m.shells.includes('cashier');
}
