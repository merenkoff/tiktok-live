// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Історія змін меню» (migration 101, TechDocs/POS_MENU_CHANGES.md): typed
// wrapper over the host's `api.posRequest`, the `markdownsApi.ts` shape — no
// new `@pos/platform` export, so the platform does not move.

import { api } from '@pos/platform';

export type MenuEntity = 'product' | 'modifier_group';
export type MenuAction = 'create' | 'update' | 'archive' | 'restore' | 'delete';

/** Mirrors `MenuChange` in `src/pos/menu-changes.ts`. */
export interface MenuChange {
  field: string;
  variant?: string;
  from?: unknown;
  to?: unknown;
}

/** Mirrors `MenuChangeRow` in `src/pos/menu-changes.ts`. */
export interface MenuChangeRow {
  id: number;
  entity: MenuEntity;
  entity_id: number;
  entity_name: string;
  staff_id: number | null;
  staff_name: string;
  staff_role: string;
  action: MenuAction;
  changes: MenuChange[];
  created_at: string;
}

export interface MenuChangesPage {
  changes: MenuChangeRow[];
  total: number;
}

export async function listMenuChanges(
  query: { entity?: MenuEntity; entityId?: number; limit?: number; offset?: number } = {}
): Promise<MenuChangesPage> {
  const params = new URLSearchParams();
  if (query.entity) params.set('entity', query.entity);
  if (query.entityId != null) params.set('entity_id', String(query.entityId));
  if (query.limit != null) params.set('limit', String(query.limit));
  if (query.offset != null) params.set('offset', String(query.offset));
  const search = params.toString();
  return api.posRequest<MenuChangesPage>('get', `/menu-changes${search ? `?${search}` : ''}`);
}
