import { t as e } from "./debtsApi-DhkvGjzT.js";
import { b as t, l as n, m as r, r as i, x as a, y as o } from "./queue-B9HzuKEV.js";
import { api as s, isNetworkError as c, isUnauthorized as l } from "@pos/platform";
// src/modules/debts/data/policy.ts
var u = [
	2e3,
	5e3,
	15e3,
	3e4,
	6e4
];
function d(e) {
	return u[Math.min(e, u.length - 1)];
}
function f(e, t = Date.now()) {
	return e.status === "queued" || e.status === "error" && t >= (e.lastAttemptAt ?? e.createdAt) + d(e.attempts);
}
function p(e) {
	return e != null && e >= 400 && e < 500 && e !== 408 && e !== 429;
}
var m = !1, h = 0;
function g() {
	return s.loadAuth()?.store.id ?? null;
}
function _(e) {
	let t = e?.response?.data;
	return t && typeof t.error == "string" ? t.error : e instanceof Error ? e.message : String(e);
}
function v(e) {
	return e?.response?.status;
}
function y() {
	let e = g();
	return e == null ? Promise.resolve(0) : a(async () => (await t.issues.where("storeId").equals(e).toArray()).filter((e) => e.status === "queued" || e.status === "error").length, 0);
}
async function b(r, i) {
	let s = await e.issue({
		customer_id: i.customerId,
		items: i.items,
		cart_discount: i.cartDiscount,
		client_uuid: i.id,
		...i.note ? { note: i.note } : {},
		offline_at: new Date(i.createdAt).toISOString()
	});
	await a(() => t.transaction("rw", t.issues, t.credit, async () => {
		await t.issues.delete(i.id), await o(r, s.credit, {
			name: i.customerName,
			phone: i.customerPhone
		});
	}), void 0), n(s.credit);
}
async function x(e) {
	let n = (await a(() => t.issues.where("storeId").equals(e).toArray(), [])).filter((e) => f(e)).sort((e, t) => e.createdAt - t.createdAt), r = 0;
	for (let i of n) try {
		await b(e, i), r += 1;
	} catch (e) {
		if (l(e)) return "stop";
		let n = Date.now();
		if (c(e)) {
			await a(() => t.issues.update(i.id, {
				lastAttemptAt: n,
				lastError: "Немає звʼязку"
			}), 0);
			continue;
		}
		let r = p(v(e)), o = i.attempts + 1, s = r || o >= 8;
		await a(() => t.issues.update(i.id, {
			status: s ? "dead" : "error",
			attempts: o,
			lastAttemptAt: n,
			lastError: _(e),
			...s ? { deadReason: r ? "rejected" : "attempts_exhausted" } : {}
		}), 0);
	}
	return r;
}
async function S(t, n) {
	let i = Date.now();
	if (!(!n && i - h < 6e4)) try {
		let { debtors: n } = await e.debtors(!0);
		await r(t, n, i), h = i;
	} catch {}
}
async function C() {
	if (m) return;
	let e = g();
	if (e != null) {
		m = !0;
		try {
			let t = await x(e);
			if (t === "stop") return;
			await S(e, t > 0);
		} finally {
			m = !1, i();
		}
	}
}
export { C as n, y as t };
