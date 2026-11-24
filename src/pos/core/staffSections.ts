// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/core/staffSections.ts
//
// The till's sections a staff member may not open (TechDocs/POS_STAFF_SECTIONS.md,
// migration 111). The owner closes them on «Співробітники» → «Доступ»: the
// TikTok broadcast for some cashiers, the stock count for all but the senior
// one. A section is a MODULE — the till's menu, its pages and its slots are
// already grouped by module — and `pos_staff.blocked_sections` lists the
// CLOSED ones, so a module added tomorrow arrives open.
//
// Two kinds of closing:
//   * the till hides the section (menu entry, page, the module's buttons in
//     the cart) — every section;
//   * the server refuses its actions, 403 `section_closed` — only the sections
//     in `SECTION_ROUTES`. The routes are named here, in one table, and read
//     by `ensurePosAuth` off the route the request matched, so no route file
//     needs to know about it and a test checks every name is a real route.
// «Клієнти» and «Обладнання» are only hidden: choosing a customer in the cart
// and the printers are part of selling, which nobody's section may stop.
// The owner is never limited.

/** The till itself — selling. Never closed: without it the till sells nothing. */
export const ALWAYS_OPEN_SECTION = 'catalog-checkout';

/** At most this many closed sections: more than every module there is. */
const MAX_SECTIONS = 32;

const SECTION_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * The staff-level routes each guarded section closes, `METHOD path` as
 * registered under `/api/pos`. What stays open on purpose: the print queues
 * (the kitchen's and the tables' printers drain under whoever is logged in on
 * that desktop), the register lease (offline selling), and reading a receipt.
 */
export const SECTION_ROUTES: Readonly<Record<string, readonly string[]>> = {
  'tiktok-live': [
    'POST /live/session-token',
    'GET /live/settings',
    'PUT /live/settings',
    'POST /live/settings/test-telegram',
  ],
  stocktake: ['POST /stock/counts'],
  debts: [
    'GET /debts',
    'GET /debts/summary',
    'GET /debts/customers/:id',
    'GET /debts/customers/:id/balance',
    'PATCH /debts/customers/:id/credit',
    'POST /debts/issue',
    'POST /debts/customers/:id/return',
    'POST /debts/customers/:id/writeoff',
    'POST /debts/customers/:id/pay',
    'POST /debts/customers/:id/prepayments/cancel',
    'POST /debts/customers/:id/chain-return',
  ],
  tables: [
    'GET /halls',
    'GET /bills',
    'POST /bills',
    'GET /bills/:id',
    'PATCH /bills/:id',
    'POST /bills/:id/items',
    'PATCH /bills/:id/items/:itemId',
    'PUT /bills/:id/items/:itemId/excise',
    'DELETE /bills/:id/items/:itemId',
    'POST /bills/:id/move',
    'POST /bills/:id/cancel',
    'POST /bills/:id/fire',
    'POST /bills/:id/rounds/:roundId/cancel',
    'POST /bills/:id/pay',
    'POST /bills/:id/pay-quote',
    'POST /bills/:id/precheck',
    'GET /guest-orders',
    'POST /guest-orders/:id/seen',
    'POST /guest-orders/:id/accept',
    'POST /guest-orders/:id/reject',
    'POST /waiter-calls/:id/answer',
  ],
  // «Роздача» (TechDocs/POS_PASS.md): a seller the owner keeps off the floor
  // marks no plate as carried.
  pass: ['GET /serving', 'GET /serving/bills/:id', 'POST /serving/serve', 'POST /serving/undo'],
  'vertical-cafe': [
    'GET /kitchen/orders',
    'POST /kitchen/stop-list/:productId',
    'PATCH /kitchen/rounds/:id/prep',
    'PATCH /sales/:id/prep',
  ],
  'vertical-flowers': [
    'POST /bench/showcase',
    'POST /bench/writeoff',
    'POST /bench/photo',
    'POST /bench/showcase/photo',
    'POST /bench/recipe',
  ],
  returns: ['POST /sales/:id/refunds', 'POST /sales/:id/exchange'],
  // One section whatever the store's provider: a cashier without «Зміна»
  // opens no shift, takes no X-report and hands the register to nobody. The
  // register lease and claim stay open — offline selling needs them.
  fiscal: [
    'POST /fiscal/shift/open',
    'POST /fiscal/shift/close',
    'POST /fiscal/service',
    'POST /fiscal/x-report',
    'POST /fiscal/register/handover/request',
    'POST /fiscal/register/handover/confirm',
    'POST /fiscal/register/handover/force',
  ],
};

/** The guarded section a matched route belongs to, by `METHOD /path`. */
const SECTION_OF_ROUTE: ReadonlyMap<string, string> = new Map(
  Object.entries(SECTION_ROUTES).flatMap(([section, routes]) => routes.map((route) => [route, section] as const))
);

/** The till's provider modules are one section, «Зміна». */
function sectionOfModule(id: string): string {
  return id.startsWith('fiscal-') ? 'fiscal' : id;
}

/**
 * The section of the route a request matched — `routeUrl` as Fastify registered
 * it (`/api/pos/debts/issue`) — or null when no section closes it.
 */
export function sectionOfRoute(method: string, routeUrl: string | undefined): string | null {
  if (!routeUrl) return null;
  const path = routeUrl.startsWith('/api/pos/') ? routeUrl.slice('/api/pos'.length) : routeUrl;
  return SECTION_OF_ROUTE.get(`${method.toUpperCase()} ${path}`) ?? null;
}

/** Whether `blocked` (a staff row's list) closes `section`. */
export function sectionClosed(blocked: readonly string[], section: string): boolean {
  return blocked.some((id) => sectionOfModule(id) === section);
}

/** The words a cashier reads when a closed section is asked for anyway. */
export const SECTION_CLOSED_MESSAGE = 'Цей розділ каси вам закрив власник';

export class StaffSectionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaffSectionsError';
  }
}

/**
 * The owner's list as it is stored: module ids, each once, sorted, «Каса»
 * refused. Anything but a list of such ids is refused in words.
 */
export function normalizeBlockedSections(value: unknown): string[] {
  if (!Array.isArray(value)) throw new StaffSectionsError('Розділи — це список');
  const out = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string' || !SECTION_ID.test(raw.trim())) {
      throw new StaffSectionsError('Невідомий розділ каси');
    }
    const id = raw.trim();
    if (id === ALWAYS_OPEN_SECTION) throw new StaffSectionsError('«Каса» відкрита завжди — без неї нічим продавати');
    out.add(id);
  }
  if (out.size > MAX_SECTIONS) throw new StaffSectionsError('Забагато розділів');
  return [...out].sort();
}

/** A stored value read back: anything odd reads as «nothing closed». */
export function readBlockedSections(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && SECTION_ID.test(id)) : [];
}
