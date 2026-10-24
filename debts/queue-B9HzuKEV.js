import { api as e, isOfflinePosEnabled as t } from "@pos/platform";
import n from "dexie";
// \0@oxc-project+runtime@0.155.0/helpers/esm/typeof.js
function r(e) {
	"@babel/helpers - typeof";
	return r = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, r(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPrimitive.js
function i(e, t) {
	if (r(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var i = n.call(e, t || "default");
		if (r(i) != "object") return i;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPropertyKey.js
function a(e) {
	var t = i(e, "string");
	return r(t) == "symbol" ? t : t + "";
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/defineProperty.js
function o(e, t, n) {
	return (t = a(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
var s = new class extends n {
	constructor() {
		super("cloth-pos-module-debts"), o(this, "issues", void 0), o(this, "credit", void 0), o(this, "meta", void 0), this.version(1).stores({
			issues: "id, storeId, status, [storeId+customerId], createdAt",
			credit: "[storeId+customerId], storeId",
			meta: "key"
		});
	}
}();
async function c(e, t) {
	try {
		return await e();
	} catch {
		return t;
	}
}
function l(e) {
	return `filledAt:${e}`;
}
function u(e) {
	return {
		customer_id: e.customerId,
		limit_cents: e.limitCents,
		locked: e.locked,
		balance_cents: e.balanceCents,
		available_cents: e.limitCents == null ? null : Math.max(0, e.limitCents - e.balanceCents),
		set_at: null,
		set_by_name: null
	};
}
function d(e) {
	return {
		customer_id: e,
		limit_cents: null,
		locked: !1,
		balance_cents: 0,
		available_cents: null,
		set_at: null,
		set_by_name: null
	};
}
async function f(e, t, n) {
	let r = [e, t.customer_id];
	if (t.limit_cents == null && t.balance_cents === 0) {
		await s.credit.delete(r);
		return;
	}
	let i = await s.credit.get(r);
	await s.credit.put({
		storeId: e,
		customerId: t.customer_id,
		name: n?.name ?? i?.name ?? "",
		phone: n?.phone ?? i?.phone ?? "",
		limitCents: t.limit_cents,
		locked: t.locked,
		balanceCents: t.balance_cents,
		readAt: Date.now()
	});
}
async function p(e, t, n) {
	await c(() => f(e, t, n), void 0);
}
async function m(e, t, n) {
	await c(() => s.transaction("rw", s.credit, s.meta, async () => {
		let r = await s.credit.where("storeId").equals(e).toArray(), i = new Set(r.filter((e) => e.readAt > n).map((e) => e.customerId)), a = new Set(t.map((e) => e.customer_id));
		if (t.length < 500) {
			let t = r.filter((e) => !a.has(e.customerId) && !i.has(e.customerId)).map((t) => [e, t.customerId]);
			t.length > 0 && await s.credit.bulkDelete(t);
		}
		let o = t.filter((e) => !i.has(e.customer_id)).map((t) => ({
			storeId: e,
			customerId: t.customer_id,
			name: t.name,
			phone: t.phone,
			limitCents: t.limit_cents,
			locked: t.locked,
			balanceCents: t.balance_cents,
			readAt: n
		}));
		o.length > 0 && await s.credit.bulkPut(o), await s.meta.put({
			key: l(e),
			value: n
		});
	}), void 0);
}
async function h(e) {
	return c(async () => (await s.meta.get(l(e)))?.value ?? null, null);
}
async function g(e, t) {
	return c(async () => {
		let n = await s.credit.get([e, t]);
		return n ? {
			credit: u(n),
			readAt: n.readAt
		} : await h(e) == null ? "unknown" : "none";
	}, "unknown");
}
async function _(e) {
	return c(() => s.credit.where("storeId").equals(e).toArray(), []);
}
// src/modules/debts/lib/creditStore.ts
var v = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set();
function b(e) {
	v.set(e.customer_id, e);
	for (let t of y) t(e.customer_id);
}
function x(n, r) {
	if (b(n), !t()) return;
	let i = e.loadAuth()?.store.id;
	i != null && p(i, n, r);
}
function S(e) {
	return v.get(e) ?? null;
}
function C(e) {
	return y.add(e), () => {
		y.delete(e);
	};
}
function w(e, t) {
	if (t <= 0) return e;
	let n = e.balance_cents + t;
	return {
		...e,
		balance_cents: n,
		available_cents: e.limit_cents == null ? null : Math.max(0, e.limit_cents - n)
	};
}
// src/modules/debts/data/queue.ts
var T = /* @__PURE__ */ new Set();
function E(e) {
	return T.add(e), () => {
		T.delete(e);
	};
}
function D() {
	for (let e of T) e();
}
async function O(e, t = Date.now()) {
	let n = await s.transaction("rw", s.issues, async () => {
		let n = await s.issues.get(e.id);
		if (n) return n;
		let r = {
			id: e.id,
			storeId: e.storeId,
			staffId: e.staff.id,
			staffName: e.staff.name,
			customerId: e.customer.id,
			customerName: e.customer.name,
			customerPhone: e.customer.phone ?? "",
			items: e.items,
			cartDiscount: e.cartDiscount,
			note: e.note,
			totalCents: e.totalCents,
			discountCents: e.discountCents,
			lines: e.lines,
			createdAt: t,
			status: "queued",
			attempts: 0
		};
		return await s.issues.add(r), r;
	});
	return D(), n;
}
function k(e) {
	return e.status === "queued" || e.status === "error";
}
async function A(e, t) {
	return c(async () => {
		let n = (await s.issues.where("[storeId+customerId]").equals([e, t]).toArray()).filter(k);
		return {
			cents: n.reduce((e, t) => e + t.totalCents, 0),
			count: n.length
		};
	}, {
		cents: 0,
		count: 0
	});
}
async function j(e) {
	return c(async () => {
		let t = /* @__PURE__ */ new Map();
		for (let n of await s.issues.where("storeId").equals(e).toArray()) k(n) && t.set(n.customerId, (t.get(n.customerId) ?? 0) + n.totalCents);
		return t;
	}, /* @__PURE__ */ new Map());
}
async function M(e) {
	return c(() => s.issues.where("storeId").equals(e).sortBy("createdAt"), []);
}
async function N(e) {
	await c(() => s.issues.update(e, {
		status: "queued",
		attempts: 0,
		lastError: void 0,
		lastAttemptAt: void 0,
		deadReason: void 0
	}), 0), D();
}
async function P(e) {
	await c(() => s.issues.delete(e), void 0), D();
}
export { g as _, j as a, s as b, N as c, C as d, x as f, h as g, _ as h, E as i, b as l, m, O as n, A as o, w as p, D as r, M as s, P as t, S as u, d as v, c as x, f as y };
