import "react";
import { cashRoundingDelta as e, formatQuantity as t, formatUah as n, isWeighed as r, refundLineAmount as i } from "@pos/platform";
import { jsx as a, jsxs as o } from "react/jsx-runtime";
// src/platform/glyphs.tsx
function s({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ a("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ a("rect", {
				x: "17",
				y: "13",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			})
		]
	});
}
function c({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "CreditCard",
		...t,
		children: [
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "5",
				width: "20",
				height: "14",
				rx: "3",
				fill: "#1B9DF0"
			}),
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "8",
				width: "20",
				height: "3",
				fill: "#000000",
				fillOpacity: ".22"
			}),
			/* @__PURE__ */ a("rect", {
				x: "5",
				y: "14",
				width: "5",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".75"
			})
		]
	});
}
function l({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Wallet",
		...t,
		children: [
			/* @__PURE__ */ a("path", {
				d: "M5 6 16 3l1 3Z",
				fill: "#C0A96B",
				fillOpacity: ".55"
			}),
			/* @__PURE__ */ a("rect", {
				x: "3",
				y: "6",
				width: "18",
				height: "15",
				rx: "3",
				fill: "#C0A96B"
			}),
			/* @__PURE__ */ a("rect", {
				x: "14",
				y: "10",
				width: "8",
				height: "7",
				rx: "2",
				fill: "#FFFFFF",
				fillOpacity: ".45"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "17.5",
				cy: "13.5",
				r: "1.25",
				fill: "#C0A96B"
			})
		]
	});
}
function u({ size: e = 20, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function d({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function f({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function p({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function m({ size: e = 20, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Printer",
		...t,
		children: [
			/* @__PURE__ */ a("path", {
				d: "M5 8V3h10v5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "8",
				width: "16",
				height: "7",
				rx: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ a("path", {
				d: "M5 13h10v5H5Z",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function h({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M5 5 15 15M15 5 5 15",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
// src/modules/debts/lib/debt.ts
function g(e) {
	return e.map((e) => ({
		variant_id: e.variant_id,
		quantity: e.quantity,
		...e.modifiers?.length ? { modifiers: e.modifiers.map((e) => e.id).sort((e, t) => e - t) } : {},
		...e.note ? { note: e.note } : {},
		...e.weight_source ? { weight_source: e.weight_source } : {}
	}));
}
function _(e) {
	return r(e.price_per);
}
function v(e) {
	return e.some((e) => (e.components?.length ?? 0) > 0);
}
function y(e) {
	if (e.customerId == null) return {
		code: "no_customer",
		text: "Оберіть покупця — під запис записують на людину"
	};
	if (!e.online && !e.queue) return {
		code: "offline",
		text: "Під запис — лише з мережею"
	};
	if (v(e.lines)) return {
		code: "assembled",
		text: "Букет, зібраний на касі, під запис не записується — продайте його або запишіть готовий букет з каталогу"
	};
	if (!e.online && e.noMirror) return {
		code: "no_mirror",
		text: "Без мережі каса не знає, кому можна під запис: вона ще жодного разу не отримала ліміти покупців. Потрібна мережа."
	};
	if (e.customerId < 0) return {
		code: "no_credit",
		text: "Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця."
	};
	let t = e.credit;
	if (!t) return null;
	if (t.limit_cents == null) return {
		code: "no_credit",
		text: "Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця."
	};
	if (t.locked) return {
		code: "locked",
		text: "Власник заблокував записи під запис для цього покупця"
	};
	let r = t.available_cents ?? 0;
	return e.totalCents > r ? {
		code: "over_limit",
		text: `Понад ліміт: ще можна ${n(r)}, а в кошику ${n(e.totalCents)}`
	} : null;
}
function b(e) {
	let t = [], n = 0;
	for (let r of e) n += r.owed_cents, t.push(n);
	return t;
}
function x(e, t) {
	return t + 1 === e && e > 1 ? e - 1 : t + 1;
}
function S(e) {
	return e.length > 0 && e.every((e) => typeof e.paid_quantity == "number");
}
function C(e, t) {
	return t <= 0 ? 0 : i(e.line_total_cents, e.quantity, e.returned_quantity + (e.paid_quantity ?? 0), t);
}
function w(e) {
	return !r(e.price_per) && (e.prepaid_cents ?? 0) === 0 && e.remaining_quantity > 1;
}
function T(e, t) {
	return e ? !e.on || e.chains : !t;
}
function E(e) {
	return !e?.on || !e.chains ? () => !1 : (t) => t.chain != null && t.chain.provider === e.provider;
}
function D(e, t, n = () => !1) {
	let r = [], i = null;
	for (let t of e) n(t) ? (i = null, r.push({
		kind: "chain_close",
		lines: [t],
		units: null,
		goodsCents: t.owed_cents
	})) : (i || (i = {
		kind: "receipt",
		lines: [],
		units: null,
		goodsCents: 0
	}, r.push(i)), i.lines.push(t), i.goodsCents += t.owed_cents);
	return t && (i || (i = {
		kind: "receipt",
		lines: [],
		units: null,
		goodsCents: 0
	}, r.push(i)), i.units = t, i.goodsCents += t.cents), r;
}
function O(t, n) {
	return t.reduce((t, r) => t + e(r.goodsCents, n), 0);
}
function k(e, t, n) {
	let r = n.method === "cash" ? n.step : 0, i = n.closesAlone ?? (() => !1), a = (t, n) => {
		let a = D(e.slice(0, t), n, i);
		return a.reduce((e, t) => e + t.goodsCents, 0) + O(a, r);
	}, o = Math.max(0, Math.round(t)), s = 0, c = 0;
	for (; s < e.length && a(s + 1, null) <= o;) c += e[s].owed_cents, s += 1;
	let l = n.partial ? e[s] : void 0, u = null;
	if (l && w(l)) {
		let e = 0;
		for (; e + 1 < l.remaining_quantity && a(s, {
			line: l,
			quantity: e + 1,
			cents: C(l, e + 1)
		}) <= o;) e += 1;
		e > 0 && (u = {
			line: l,
			quantity: e,
			cents: C(l, e)
		});
	}
	let d = D(e.slice(0, s), u, i), f = c + (u?.cents ?? 0), p = O(d, r), m = o - f - p, h = null, g = !1;
	if (l && m > 0) {
		let e = l.owed_cents - (u?.cents ?? 0), t = Math.min(m, e - 1);
		r > 0 && (t -= t % r), t > 0 && (n.prepayAllowed ? (h = {
			line: l,
			cents: t
		}, m -= t) : g = !0);
	}
	return {
		wholeCount: s,
		wholeCents: c,
		units: u,
		receiptCents: f,
		roundingCents: p,
		prepay: h,
		changeCents: m,
		prepayRefused: g,
		documents: d
	};
}
function ee(e) {
	return e.receiptCents + e.roundingCents + (e.prepay?.cents ?? 0);
}
function A(e) {
	return e.receiptCents > 0 || e.prepay != null;
}
function j(e, t, n) {
	let r = t.units?.line ?? t.prepay?.line ?? null;
	return {
		...t.wholeCount > 0 ? { line_ids: e.slice(0, t.wholeCount).map((e) => e.id) } : {},
		...r ? { part: {
			line_id: r.id,
			...t.units ? { quantity: t.units.quantity } : {},
			...t.prepay ? { amount_cents: t.prepay.cents } : {},
			method: n
		} } : {},
		payments: t.receiptCents > 0 ? [{
			method: n,
			amount_cents: t.receiptCents + t.roundingCents
		}] : []
	};
}
function M(e) {
	if (e.parts && e.parts.length > 0) return e.parts;
	let t = e.prepayment ?? null, n = t != null && t.id === e.sale.id, r = [];
	return n || r.push({
		kind: "receipt",
		sale: e.sale,
		fiscal: e.fiscal
	}), t && r.push({
		kind: "prepayment",
		sale: t,
		fiscal: n ? e.fiscal : null
	}), r;
}
function N(e) {
	return (e.fiscal ?? e.sale.fiscal)?.status === "done";
}
function P(e) {
	return e.kind !== "prepayment" || N(e);
}
function F(e) {
	return e.sale.total_cents + (e.kind === "prepayment" ? 0 : e.sale.rounding_cents ?? 0);
}
function I(e) {
	let t = e.sale, n = t.receipt_number ?? null;
	if (e.kind === "prepayment") {
		let r = P(e) ? `Чек передплати${n ? ` ${n}` : ""}` : `Внесок${n ? ` № ${n}` : ""}`;
		return t.debt_prepayment ? `${r} · «${Q(t.debt_prepayment)}»` : r;
	}
	let r = `Чек${n ? ` ${n}` : ""}`;
	return e.kind === "chain_close" ? t.items[0] ? `${r} · закриває «${Q(t.items[0])}»` : r : t.items.length > 0 ? `${r} · ${Z(t.items.length)}` : r;
}
function L(e, t) {
	return `${e} з ${$(t.remaining_quantity, t.unit, t.price_per)}`;
}
function R(e, t, r) {
	let i = [];
	e.wholeCount > 0 && i.push(`Закриває ${Z(e.wholeCount)} на ${n(e.wholeCents)}`);
	for (let t of e.documents ?? []) t.kind === "chain_close" && i.push(`«${Q(t.lines[0])}» — окремим чеком: внески за цей товар уже в ПРРО`);
	if (e.units && i.push(`${L(e.units.quantity, e.units.line)} «${Q(e.units.line)}» на ${n(e.units.cents)}`), e.prepay) {
		let t = e.prepay.line.owed_cents - (e.units?.cents ?? 0) - e.prepay.cents, a = r?.on && r.chains ? " (чек передплати)" : "";
		i.push(`Внесок ${n(e.prepay.cents)} на «${Q(e.prepay.line)}»${a} — лишиться винно ${n(t)}`);
	}
	return A(e) || i.push(`Не вистачає навіть на найстаріший товар (${n(t[0]?.owed_cents ?? 0)})`), e.prepayRefused ? i.push(A(e) ? `Решту ${n(e.changeCents)} поверніть покупцеві: у магазині з ПРРО внесок за частину товару поки не приймається` : "У магазині з ПРРО внесок за частину товару поки не приймається — гроші поверніть покупцеві") : e.changeCents > 0 && A(e) && i.push(`Решта ${n(e.changeCents)}`), i;
}
function z(e) {
	let t = [];
	e.returned_quantity > 0 && t.push(`повернуто ${$(e.returned_quantity, e.unit, e.price_per)}`), (e.paid_quantity ?? 0) > 0 && t.push(`оплачено ${$(e.paid_quantity ?? 0, e.unit, e.price_per)}`);
	let r = [];
	return t.length > 0 && r.push(t.join(", ")), (e.prepaid_cents ?? 0) > 0 && r.push(`внесено ${n(e.prepaid_cents ?? 0)}`), r.length > 0 ? r.join(" · ") : null;
}
function B(e) {
	return e.chain?.pending ? "внесок ще реєструється в ПРРО" : null;
}
function V(e, t) {
	return !!(e?.on && e.chains && e.provider === t);
}
function H(e, t) {
	let n = e.chain;
	return !n || n.pending || !n.prepayments || !V(t, n.provider) ? null : {
		count: n.prepayments,
		cents: n.prepaid_cents ?? 0
	};
}
function U(e, t) {
	let n = e.chain_return;
	return n && V(t, n.provider) ? n : null;
}
function W(e, t) {
	return `${e} ${Y(e, "внесок", "внески", "внесків")} на ${n(t)}`;
}
function te(e, t) {
	return C(e, t);
}
function G(e) {
	return (e.prepaid_cents ?? 0) > 0;
}
function K(e, t) {
	let n = t.trim().toLowerCase();
	if (!n || e.name.toLowerCase().includes(n)) return !0;
	let r = n.replace(/\D/g, "");
	return r.length >= 2 && e.phone.replace(/\D/g, "").includes(r);
}
var q = 864e5;
function J(e, t = /* @__PURE__ */ new Date()) {
	let n = new Date(e), r = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), i = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.max(0, Math.round((i - r) / q));
}
function Y(e, t, n, r) {
	let i = e % 10, a = e % 100;
	return i === 1 && a !== 11 ? t : i >= 2 && i <= 4 && (a < 12 || a > 14) ? n : r;
}
function X(e, t = /* @__PURE__ */ new Date()) {
	let n = J(e, t);
	return n === 0 ? "сьогодні" : n === 1 ? "вчора" : `${n} ${Y(n, "день", "дні", "днів")}`;
}
function Z(e) {
	return `${e} ${Y(e, "товар", "товари", "товарів")}`;
}
function Q(e) {
	return e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
}
function $(e, n, i = 1) {
	return r(i) ? t(e, n, i) : `${e} ${n || "шт"}`;
}
var ne = {
	issue: "Під запис",
	return: "Повернуто товар",
	payment: "Погашено",
	payment_void: "Погашення скасовано",
	writeoff: "Списано"
};
function re(e, t, n = {}) {
	let r = new Set(e.filter((e) => e.kind === "payment_void" && e.sale_id != null).map((e) => e.sale_id)), i = new Set(t.map((e) => e.id));
	return new Set(e.filter((e) => e.kind === "payment" && e.prepayment === !0 && e.sale_id != null && !r.has(e.sale_id) && e.prepay_line_id != null && i.has(e.prepay_line_id) && e.fiscal_status !== "done" && e.fiscal_status !== "pending" && (e.fiscal_status !== "failed" || n.owner === !0)).map((e) => e.id));
}
function ie(e) {
	return e.prepayment && e.kind === "payment" ? "Внесок" : e.prepayment && e.kind === "payment_void" ? "Внесок скасовано" : ne[e.kind];
}
function ae(e) {
	let t = e.balance_cents > 0 ? `Борг ${n(e.balance_cents)}` : "Боргу немає";
	return e.limit_cents == null ? e.balance_cents > 0 ? `${t} · під запис більше не можна` : t : e.locked ? `${t} · записи заблоковано` : e.balance_cents > e.limit_cents ? `${t} · понад ліміт на ${n(e.balance_cents - e.limit_cents)}` : `${t} · ще можна ${n(e.available_cents ?? 0)}`;
}
function oe(e) {
	return e.limit_cents != null && e.balance_cents > e.limit_cents;
}
function se(e) {
	let t = e.replace(/\s/g, "").replace(",", ".");
	return t === "" || !/^\d+(\.\d{1,2})?$/.test(t) ? null : Math.round(Number(t) * 100);
}
var ce = 1e7;
export { b as A, L as B, M as C, ee as D, A as E, te as F, f as G, s as H, G as I, l as J, p as K, _ as L, W as M, P as N, R as O, $ as P, S as R, D as S, j as T, d as U, u as V, c as W, h as Y, K as _, U as a, F as b, O as c, oe as d, y as f, Q as g, z as h, B as i, T as j, Y as k, ie as l, se as m, X as n, E as o, g as p, m as q, H as r, ae as s, ce as t, Z as u, x as v, k as w, I as x, N as y, re as z };
