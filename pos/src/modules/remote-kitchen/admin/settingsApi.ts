// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The owner's pages of «Віддалена кухня» (РК4, TechDocs/POS_REMOTE_KITCHEN.md
// §11): the cafe's «Кухня» and the kitchen's «Точки». Mirrored wire shapes:
// this bundle shares only `@pos/platform` with the host.

import { posRequest } from '../lib/hostPlatform';

export type LinkStatus = 'active' | 'paused' | 'revoked';

/** `cafeLinkView` on the server: what the cafe may know of its link. */
export interface CafeLink {
  id: number;
  status: LinkStatus;
  kitchen_title: string;
  kitchen_phone: string | null;
  transit_minutes: number;
  answer_seconds: number;
  quote_ttl_seconds: number;
  /** Null = every time waits for the kitchen. */
  auto_confirm_max_min: number | null;
}

export interface KitchenStatus {
  accepting: boolean;
  paused_until: string | null;
  load_minutes: number;
}

export interface Setup {
  as_cafe: { link: CafeLink; kitchen: KitchenStatus } | null;
  as_kitchen: { status: KitchenStatus } | null;
}

/** A cafe card marked «готується на кухні», and the kitchen dish it is. */
export interface LinkItem {
  cafe_variant_id: number;
  kitchen_variant_id: number;
  cafe_name: string;
  cafe_label: string;
  kitchen_name: string;
  kitchen_label: string;
  prep_minutes: number | null;
}

/** The kitchen's dish as the cafe may see it: a name and a time, never a price. */
export interface KitchenDish {
  variant_id: number;
  name: string;
  label: string;
  prep_minutes: number | null;
  /** The 14-day median «оплачено → Готово» once five orders carried the dish; absent from an older server. */
  measured_minutes?: number | null;
  measured_orders?: number;
}

export interface KitchenCafe {
  link_id: number;
  cafe_name: string;
  status: LinkStatus;
  transit_minutes: number;
  dishes: KitchenDish[];
}

export type LinkSettings = Partial<
  Pick<CafeLink, 'kitchen_title' | 'kitchen_phone' | 'transit_minutes' | 'answer_seconds' | 'quote_ttl_seconds' | 'auto_confirm_max_min'>
>;

export const readSetup = () => posRequest<Setup>('get', '/remote-kitchen/setup');

export const saveLink = (body: LinkSettings) => posRequest<CafeLink>('patch', '/remote-kitchen/link', body);

export async function listItems(): Promise<LinkItem[]> {
  const res = await posRequest<{ items?: LinkItem[] }>('get', '/remote-kitchen/link/items');
  return Array.isArray(res?.items) ? res.items : [];
}

export async function listDishes(): Promise<KitchenDish[]> {
  const res = await posRequest<{ dishes?: KitchenDish[] }>('get', '/remote-kitchen/link/dishes');
  return Array.isArray(res?.dishes) ? res.dishes : [];
}

export async function unmark(cafeVariantId: number): Promise<LinkItem[]> {
  const res = await posRequest<{ items?: LinkItem[] }>('delete', `/remote-kitchen/link/items/${cafeVariantId}`);
  return Array.isArray(res?.items) ? res.items : [];
}

export interface ImportResult {
  created: number;
  linked: number;
  skipped: number;
  /** Cafe cards reused by name whose own price stayed — the owner is told. Absent on an older server. */
  kept_prices?: Array<{ name: string; price_cents: number }>;
  items: LinkItem[];
}

/** «Імпорт меню кухні»: each dish at the cafe's own price, in kopecks. */
export const importDishes = (dishes: Array<{ kitchen_variant_id: number; price_cents: number }>) =>
  posRequest<ImportResult>('post', '/remote-kitchen/link/import', { dishes });

export const listCafes = () =>
  posRequest<{ cafes: KitchenCafe[]; status: KitchenStatus }>('get', '/remote-kitchen/kitchen/cafes');

export const saveStatus = (body: { accepting?: boolean; pause_minutes?: number | null; load_minutes?: number }) =>
  posRequest<KitchenStatus>('put', '/remote-kitchen/status', body);
