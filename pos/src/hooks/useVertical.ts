// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useAuthStore } from './useAuth';
import { DEFAULT_VERTICAL } from '../lib/vertical';
import type { VerticalPublicConfig } from '../types';

/**
 * Warned once per page load, not per render: whether a session carries a
 * vertical is a property of that session, so the first read says everything
 * later ones would.
 */
let warnedMissing = false;

/**
 * The store's sales vertical — its attribute schema, its units and its title.
 *
 * Every screen that renders product attributes (the admin product form, the
 * stock placeholder form) reads it from here rather than hard-coding «Розмір»
 * and «Колір». Falls back to clothing for a session rebuilt from an
 * `AuthResponse` cached before verticals existed.
 */
export function useVertical(): VerticalPublicConfig {
  const vertical = useAuthStore((s) => s.auth?.store.vertical);
  const signedIn = useAuthStore((s) => s.auth !== null);
  if (signedIn && !vertical && !warnedMissing) {
    warnedMissing = true;
    // Silence here is what made the original bug look legitimate: a florist's
    // admin read «Одяг» because this hook was reading a SECOND, never-logged-in
    // auth store — a relative import of it bypassed the platform barrel (see
    // scripts/check-platform-boundary.mjs). A signed-in session that really has
    // no vertical is a pre-2.0.0 cached one, which the fallback exists for.
    console.warn(
      'pos: vertical missing from the session payload — falling back to ' +
        `"${DEFAULT_VERTICAL.id}". A signed-in session should always carry one.`
    );
  }
  return vertical ?? DEFAULT_VERTICAL;
}
