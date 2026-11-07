// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/roles.ts — what each staff role may reach (track МР,
// TechDocs/POS_MARKETER_ROLE.md).
//
// The owner reaches everything and the seller everything `ensurePosAuth`
// opens, as before. The marketer is the other way round: DENIED BY DEFAULT.
// A route the marketer needs names its capability (`ensurePosAuth(…, { allow
// })`, `ensurePosOwner`, `ensureModule`), and every other route answers 403
// — so a route added tomorrow is closed to the marketer without anyone
// remembering to close it. `pos.marketer.test.ts` walks every registered route
// with a marketer's token and holds the open set to the list below.

import { verticalOffersRole } from '../verticals/index.js';
import type { PosAuthContext, PosRole } from '../types.js';

/**
 * What a route may open to the marketer.
 *
 * - `session` — the login itself: `/me`, logout.
 * - `menu.catalog` — products, their photos, variants (prices, portions), tags
 *   and modifiers; never cost, stock, tech cards or markdowns (`marketer.ts`).
 * - `menu.tables` — halls and tables, and so the QR stickers.
 * - `menu.public` — the guest menu's switches the marketer may flip, the
 *   place's profile and logo, the cork fee.
 * - `menu.feedback` — guests' feedback, without their phone.
 */
export type StaffCapability = 'session' | 'menu.catalog' | 'menu.tables' | 'menu.public' | 'menu.feedback';

const MARKETER: ReadonlySet<StaffCapability> = new Set<StaffCapability>([
  'session',
  'menu.catalog',
  'menu.tables',
  'menu.public',
  'menu.feedback',
]);

/** Whether a marketer may pass a route that opened `cap` to them. */
export function marketerMay(cap: StaffCapability | undefined): boolean {
  return cap !== undefined && MARKETER.has(cap);
}

/** The marketer's answer on a route that did not open itself to them. */
export const MARKETER_FORBIDDEN = 'Маркетолог працює лише з меню, столами й QR-меню. Це робить власник.';

/** A marketer whose store's vertical no longer offers the role (М3). */
export const ROLE_UNAVAILABLE = 'Роль «Маркетолог» є лише в кафе й ресторані. Зверніться до власника.';

/**
 * Why this session may not act at all, or null. Only a role the store's
 * vertical stopped offering (a café moved to another vertical) — then the
 * marketer's session dies with it rather than outliving the role.
 */
export function roleUnavailable(auth: Pick<PosAuthContext, 'role' | 'vertical'>): string | null {
  return verticalOffersRole(auth.vertical, auth.role) ? null : ROLE_UNAVAILABLE;
}

/** The role's name as the owner reads it. */
export function roleTitle(role: PosRole): string {
  return role === 'owner' ? 'Власник' : role === 'marketer' ? 'Маркетолог' : 'Продавець';
}
