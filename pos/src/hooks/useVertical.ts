// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useAuthStore } from './useAuth';
import { DEFAULT_VERTICAL } from '../lib/vertical';
import type { VerticalPublicConfig } from '../types';

/**
 * The store's sales vertical — its attribute schema, its units and its title.
 *
 * Every screen that renders product attributes (the admin product form, the
 * stock placeholder form) reads it from here rather than hard-coding «Розмір»
 * and «Колір». Falls back to clothing for a session rebuilt from an
 * `AuthResponse` cached before verticals existed.
 */
export function useVertical(): VerticalPublicConfig {
  return useAuthStore((s) => s.auth?.store.vertical) ?? DEFAULT_VERTICAL;
}
