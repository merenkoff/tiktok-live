import { useCallback as e, useEffect as t, useRef as n, useState as r } from "react";
import * as i from "@pos/platform";
import a from "dexie";
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function o(e) {
	"@babel/helpers - typeof";
	return o = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, o(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function s(e, t) {
	if (o(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (o(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function c(e) {
	var t = s(e, "string");
	return o(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function l(e, t, n) {
	return (t = c(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/tables/lib/hostPlatform.ts
var u = [
	"api.posRequest",
	"useOfflineStatus",
	"formatUah",
	"cashierApi.getCatalog",
	"groupsOf",
	"defaultModifierIds",
	"needsModifierSheet",
	"printPrecheck",
	"getMeta",
	"usePosShell"
], d = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), l(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function f(e) {
	return typeof e == "function";
}
function p(e) {
	return e.split(".").reduce((e, t) => e?.[t], i);
}
function m() {
	return u.filter((e) => !f(p(e)));
}
function h(e, t, n) {
	let r = m();
	return r.length > 0 ? Promise.reject(new d(r)) : i.api.posRequest(e, t, n);
}
async function g(e) {
	let t = p("cashierApi.getCatalog");
	if (!f(t)) throw new d(["cashierApi.getCatalog"]);
	return await t({ q: e }) ?? [];
}
//#endregion
//#region src/modules/tables/lib/tablesApi.ts
function _() {
	return h("get", "/halls");
}
function v() {
	return h("get", "/bills");
}
function y(e, t) {
	return h("post", "/bills", {
		table_id: e,
		...t ? { guests: t } : {}
	});
}
function b(e) {
	return h("get", `/bills/${e}`);
}
function x(e, t) {
	return h("post", `/bills/${e}/items`, t);
}
function S(e, t, n) {
	return h("patch", `/bills/${e}/items/${t}`, { quantity: n });
}
function C(e, t) {
	return h("delete", `/bills/${e}/items/${t}`);
}
function w(e, t) {
	return h("post", `/bills/${e}/fire`, { client_uuid: t });
}
function T(e, t) {
	return h("post", `/bills/${e}/rounds/${t}/cancel`);
}
function E(e, t) {
	return h("post", `/bills/${e}/pay`, { parts: t });
}
function D(e) {
	return h("post", `/bills/${e}/precheck`);
}
function O(e) {
	return h("post", "/halls", { name: e });
}
function k(e, t) {
	return h("patch", `/halls/${e}`, t);
}
function A(e) {
	return h("post", "/tables", e);
}
function j(e, t) {
	return h("patch", `/tables/${e}`, t);
}
function M(e) {
	return h("patch", "/tables/positions", { positions: e });
}
var N = new class extends a {
	constructor() {
		super("cloth-pos-module-tables"), l(this, "room", void 0), l(this, "bills", void 0), this.version(1).stores({
			room: "id",
			bills: "id, storeId"
		});
	}
}();
async function P(e, t) {
	try {
		return await e();
	} catch {
		return t;
	}
}
async function F(e, t) {
	await P(() => N.room.put({
		id: 1,
		storeId: e,
		...t,
		savedAt: Date.now()
	}), void 0);
}
async function I(e) {
	return P(async () => {
		let t = await N.room.get(1);
		return t && t.storeId === e ? t : null;
	}, null);
}
async function L(e, t) {
	await P(() => N.bills.put({
		id: t.id,
		storeId: e,
		bill: t,
		savedAt: Date.now()
	}), void 0);
}
async function R(e, t) {
	return P(async () => {
		let n = await N.bills.get(t);
		return n && n.storeId === e ? n : null;
	}, null);
}
async function z(e, t) {
	await P(async () => {
		let n = new Set(t), r = (await N.bills.where("storeId").equals(e).toArray()).filter((e) => !n.has(e.id)).map((e) => e.id);
		r.length > 0 && await N.bills.bulkDelete(r);
	}, void 0);
}
//#endregion
//#region src/modules/tables/lib/useHallMap.ts
var B = 1e4;
function V(e, t) {
	let n = e?.response?.data;
	return n && typeof n.error == "string" ? n.error : t;
}
function H({ online: i, mirrored: a = !1, storeId: o = null }) {
	let [s, c] = r([]), [l, u] = r([]), [d, f] = r(() => (/* @__PURE__ */ new Date()).toISOString()), [p, m] = r(!0), [h, g] = r(null), [y, b] = r(!1), [x, S] = r(null), C = n(!0);
	t(() => (C.current = !0, () => {
		C.current = !1;
	}), []);
	let w = e(async () => {
		if (!a || o == null) return !1;
		let e = await I(o);
		return !e || !C.current ? !1 : (c(e.halls), u(e.bills), f(e.now), b(!0), S(e.savedAt), m(!1), !0);
	}, [a, o]), T = e(async () => {
		try {
			let [e, t] = await Promise.all([_(), v()]);
			if (!C.current) return;
			c(e.halls), u(t.bills), f((/* @__PURE__ */ new Date()).toISOString()), g(null), b(!1), S(null), a && o != null && (F(o, {
				halls: e.halls,
				bills: t.bills,
				now: (/* @__PURE__ */ new Date()).toISOString()
			}), z(o, t.bills.map((e) => e.id)));
		} catch (e) {
			if (!C.current) return;
			let t = await w();
			C.current && !t && g(V(e, "Не вдалося прочитати зал"));
		} finally {
			C.current && m(!1);
		}
	}, [
		w,
		a,
		o
	]);
	return t(() => {
		i || (async () => {
			let e = await w();
			C.current && !e && m(!1);
		})();
	}, [i, w]), t(() => {
		if (!i) return;
		T();
		let e = setInterval(() => {
			typeof document < "u" && document.visibilityState !== "visible" || T();
		}, B);
		return () => clearInterval(e);
	}, [i, T]), {
		halls: s,
		bills: l,
		now: d,
		loading: p,
		error: h,
		stale: y,
		savedAt: x,
		refresh: T
	};
}
//#endregion
export { S as _, x as a, g as b, A as c, _ as d, D as f, y as g, C as h, L as i, w as l, E as m, H as n, T as o, M as p, R as r, O as s, V as t, b as u, k as v, j as y };
