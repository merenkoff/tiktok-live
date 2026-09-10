var f = Object.defineProperty;
var m = (t, e, r) => e in t ? f(t, e, { enumerable: !0, configurable: !0, writable: !0, value: r }) : t[e] = r;
var c = (t, e, r) => m(t, typeof e != "symbol" ? e + "" : e, r);
import { lazy as p } from "react";
import { isUnauthorized as h, isNetworkError as k, api as y } from "@pos/platform";
import w from "dexie";
const A = "1.1.1";
async function S(t, { retries: e = 2, backoffMs: r = 400 } = {}) {
  let s;
  for (let a = 0; a <= e; a += 1)
    try {
      return await t();
    } catch (n) {
      if (s = n, a === e) break;
      await new Promise((i) => setTimeout(i, r * 2 ** a));
    }
  throw s;
}
function b(t, e) {
  return p(() => S(t, e));
}
class E extends w {
  constructor() {
    super("cloth-pos-module-stocktake");
    c(this, "sheets");
    c(this, "lines");
    this.version(1).stores({
      sheets: "id, storeId, status, createdAt",
      lines: "[sheetId+variantId], sheetId"
    });
  }
}
const o = new E(), l = [2e3, 5e3, 15e3, 3e4, 6e4], _ = 8;
function D(t) {
  return l[Math.min(t, l.length - 1)];
}
function v(t, e = Date.now()) {
  return t.status === "queued" ? !0 : t.status !== "error" ? !1 : e >= (t.lastAttemptAt ?? t.createdAt) + D(t.attempts);
}
let u = !1;
function I() {
  return o.sheets.where("status").anyOf(["queued", "error"]).count();
}
function O(t) {
  const e = t?.response?.data;
  return e && typeof e.error == "string" ? e.error : t instanceof Error ? t.message : String(t);
}
function T(t) {
  return t?.response?.status;
}
async function g(t) {
  const e = await o.lines.where("sheetId").equals(t.id).toArray(), r = await y.submitStockCount({
    client_uuid: t.id,
    note: t.note,
    lines: e.map((s) => ({ variant_id: s.variantId, counted_qty: s.countedQty }))
  });
  await o.sheets.update(t.id, {
    status: "synced",
    serverDocId: r.id,
    serverDocNumber: r.doc_number,
    lastAttemptAt: Date.now(),
    lastError: void 0
  });
}
async function C() {
  if (!u) {
    u = !0;
    try {
      const t = (await o.sheets.where("status").anyOf(["queued", "error"]).toArray()).filter((e) => v(e)).sort((e, r) => e.createdAt - r.createdAt);
      for (const e of t)
        try {
          await g(e);
        } catch (r) {
          if (h(r)) return;
          const s = Date.now();
          if (k(r)) {
            await o.sheets.update(e.id, { lastAttemptAt: s, lastError: "Немає зв'язку" });
            continue;
          }
          const a = T(r), n = a != null && a >= 400 && a < 500, i = e.attempts + 1, d = n || i >= _;
          await o.sheets.update(e.id, {
            status: d ? "dead" : "error",
            attempts: i,
            lastAttemptAt: s,
            lastError: O(r),
            ...d ? { deadReason: n ? "rejected" : "attempts_exhausted" } : {}
          });
        }
    } finally {
      u = !1;
    }
  }
}
const M = b(
  () => import("./StocktakeRoutes-BqVjFRY-.js").then((t) => ({ default: t.StocktakeRoutes }))
), R = "stocktake", q = {
  id: R,
  title: "Інвентаризація",
  shells: ["web", "cashier"],
  alwaysEnabled: !0,
  // Splat, matching the shape `placeholderDescriptor` uses for the
  // not-yet-downloaded state; `StocktakeRoutes` nests the list and the sheet.
  routes: [{ path: "/stocktake/*", element: M }],
  nav: [
    // `ClipboardCheck` is in the host's `NAV_ICONS` allowlist. Keep in sync
    // with the `icon` in the store's `module_remotes` entry (the placeholder).
    {
      to: "/stocktake",
      label: "Інвентаризація",
      icon: "ClipboardCheck",
      location: "cashier-primary",
      order: 70,
      match: "/stocktake"
    }
  ],
  offline: { pendingCount: I, sync: C }
}, N = { ...q, version: A };
export {
  o as d,
  N as m,
  C as s
};
