// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { NavItem } from './types';

/**
 * The owner's sidebar in groups, the way Things splits its sidebar into
 * areas: «Сьогодні» on top, then what the shop sells, what it stocks, the
 * place itself, its channels, and the system entries pinned to the bottom.
 *
 * Decided by the host, by module id, rather than declared by each module: a
 * module-remote ships its manifest verbatim, so a `group` field would reach a
 * store only after every module was re-released — and an old bundle without
 * one must still land somewhere sensible. A manifest MAY still name its own
 * `group`; an unknown module falls into «Інше».
 */
export type NavGroupId = 'top' | 'sales' | 'catalog' | 'venue' | 'channels' | 'other' | 'system';

/** Display order; `system` is drawn last, pushed to the bottom of the sidebar. */
export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['top', 'sales', 'catalog', 'venue', 'channels', 'other', 'system'];

const MODULE_GROUP: Record<string, NavGroupId> = {
  analytics: 'top',
  'catalog-checkout': 'top',
  returns: 'sales',
  customers: 'sales',
  'qr-payment': 'sales',
  products: 'catalog',
  stock: 'catalog',
  stocktake: 'catalog',
  'gtin-enrichment': 'catalog',
  'vertical-cafe': 'venue',
  'vertical-flowers': 'venue',
  tables: 'venue',
  'tiktok-live': 'channels',
  'live-selling': 'channels',
  staff: 'system',
  hardware: 'system',
  'fiscal-checkbox': 'system',
  settings: 'system',
};

export function navGroupOf(moduleId: string, declared?: NavGroupId): NavGroupId {
  return declared ?? MODULE_GROUP[moduleId] ?? 'other';
}

/** The caption over a group; `null` draws none (`top`, `system`). */
export function navGroupLabel(group: NavGroupId, vertical?: string | null): string | null {
  switch (group) {
    case 'sales':
      return 'Продажі';
    case 'catalog':
      return 'Каталог';
    case 'venue':
      return vertical === 'flowers' ? 'Крамниця' : 'Заклад';
    case 'channels':
      return 'Канали';
    case 'other':
      return 'Інше';
    default:
      return null;
  }
}

/**
 * The glyph of an owner's sidebar entry that names none — the entries of a
 * module bundle released before admin entries had icons. By route, because
 * that is what the entry is.
 */
const ADMIN_ICON: Record<string, string> = {
  '/admin': 'Star',
  '/admin/sales': 'Receipt',
  '/admin/customers': 'Users',
  '/admin/products': 'Package',
  '/admin/tech-cards': 'FileText',
  '/admin/modifiers': 'Layers',
  '/admin/stock': 'Warehouse',
  '/admin/gtin': 'Barcode',
  '/admin/cafe': 'Coffee',
  '/admin/tables': 'Table',
  '/admin/flowers': 'Flower2',
  '/admin/live': 'Video',
  '/admin/staff': 'User',
  '/admin/fiscal': 'ShieldCheck',
  '/admin/settings': 'Settings',
  '/admin/appearance': 'Sparkles',
};

export function adminIconOf(item: Pick<NavItem, 'to' | 'icon'>): NavItem['icon'] {
  return item.icon ?? ADMIN_ICON[item.to];
}

/** Items of one location split into display groups, in `NAV_GROUP_ORDER`, keeping each group's own order. */
export function groupNavItems<T extends { group?: NavGroupId }>(items: readonly T[]): { group: NavGroupId; items: T[] }[] {
  return NAV_GROUP_ORDER.map((group) => ({ group, items: items.filter((i) => (i.group ?? 'other') === group) })).filter(
    (g) => g.items.length > 0
  );
}
