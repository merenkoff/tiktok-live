// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The Live Shop's attribution on a store's paper (migration 108,
// TechDocs/POS_LICENSING.md «Атрибуція в магазині»). The super admin switches
// it per store; the login carries it as `store.attribution`.
//
// Where it goes, by the licence's attribution form:
//   п. 1 — the last lines of every receipt, refund, pre-bill and slip, after
//          every requisite, the fiscal number and the QR, in the receipt's own
//          font: «Каса: The Live Shop» / «the-live.shop»;
//   п. 2 — a small «the-live.shop» in the bottom margin of a price tag, never
//          in the way of the name, the price or anything Інструкція № 2 asks;
//   п. 3 — the guest menu's footer (server-rendered, `public-menu/render.ts`).
//
// The flag is read from the cached login (`pos_auth`, written by
// `api.saveAuth` for every session, an offline one included) rather than
// passed in, for two reasons: a remote module that prints (the pre-bill in
// `tables`, the slips and receipts of `debts`) gets it without a release of
// its own, and `lib/printer.ts` stays out of `useAuthStore`'s reach, which
// `check:platform-boundary` would refuse for a file the host imports directly.
// `modules/moduleRemotesSource.ts` reads the same key the same way.

/** The two lines the form prescribes, in this order. */
export const ATTRIBUTION_LINES = ['Каса: The Live Shop', 'the-live.shop'] as const;

/** The price tag's line (п. 2). */
export const ATTRIBUTION_SITE = 'the-live.shop';

/** Owned by `services/api.ts`; named here by value so this file imports nothing. */
const AUTH_KEY = 'pos_auth';

/** Whether this device's current session says the store prints the attribution. */
export function storeAttribution(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_KEY);
    if (!raw) return false;
    const auth = JSON.parse(raw) as { store?: { attribution?: unknown } } | null;
    return auth?.store?.attribution === true;
  } catch {
    return false;
  }
}
