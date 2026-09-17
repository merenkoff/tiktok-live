import { api as e, isNetworkError as t, isUnauthorized as n } from "@pos/platform";
import r from "dexie";
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function i(e) {
	"@babel/helpers - typeof";
	return i = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, i(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function a(e, t) {
	if (i(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (i(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function o(e) {
	var t = a(e, "string");
	return i(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function s(e, t, n) {
	return (t = o(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
var c = new class extends r {
	constructor() {
		super("cloth-pos-module-stocktake"), s(this, "sheets", void 0), s(this, "lines", void 0), this.version(1).stores({
			sheets: "id, storeId, status, createdAt",
			lines: "[sheetId+variantId], sheetId"
		});
	}
}(), l = [
	2e3,
	5e3,
	15e3,
	3e4,
	6e4
];
function u(e) {
	return l[Math.min(e, l.length - 1)];
}
function d(e, t = Date.now()) {
	return e.status === "queued" || e.status === "error" && t >= (e.lastAttemptAt ?? e.createdAt) + u(e.attempts);
}
//#endregion
//#region src/modules/stocktake/data/sync.ts
var f = !1;
function p() {
	return c.sheets.where("status").anyOf(["queued", "error"]).count();
}
function m(e) {
	let t = e?.response?.data;
	return t && typeof t.error == "string" ? t.error : e instanceof Error ? e.message : String(e);
}
function h(e) {
	return e?.response?.status;
}
async function g(t) {
	let n = await c.lines.where("sheetId").equals(t.id).toArray(), r = await e.submitStockCount({
		client_uuid: t.id,
		note: t.note,
		lines: n.map((e) => ({
			variant_id: e.variantId,
			counted_qty: e.countedQty
		}))
	});
	await c.sheets.update(t.id, {
		status: "synced",
		serverDocId: r.id,
		serverDocNumber: r.doc_number,
		lastAttemptAt: Date.now(),
		lastError: void 0
	});
}
async function _() {
	if (!f) {
		f = !0;
		try {
			let e = (await c.sheets.where("status").anyOf(["queued", "error"]).toArray()).filter((e) => d(e)).sort((e, t) => e.createdAt - t.createdAt);
			for (let r of e) try {
				await g(r);
			} catch (e) {
				if (n(e)) return;
				let i = Date.now();
				if (t(e)) {
					await c.sheets.update(r.id, {
						lastAttemptAt: i,
						lastError: "Немає зв'язку"
					});
					continue;
				}
				let a = h(e), o = a != null && a >= 400 && a < 500, s = r.attempts + 1, l = o || s >= 8;
				await c.sheets.update(r.id, {
					status: l ? "dead" : "error",
					attempts: s,
					lastAttemptAt: i,
					lastError: m(e),
					...l ? { deadReason: o ? "rejected" : "attempts_exhausted" } : {}
				});
			}
		} finally {
			f = !1;
		}
	}
}
//#endregion
export { _ as n, c as r, p as t };
