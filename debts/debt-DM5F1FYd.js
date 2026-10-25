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
function T(t, n, r) {
	let i = r.method === "cash" ? r.step : 0, a = (t) => t + e(t, i), o = Math.max(0, Math.round(n)), s = 0, c = 0;
	for (; s < t.length && a(c + t[s].owed_cents) <= o;) c += t[s].owed_cents, s += 1;
	let l = r.partial ? t[s] : void 0, u = null;
	if (l && w(l)) {
		let e = 0;
		for (; e + 1 < l.remaining_quantity && a(c + C(l, e + 1)) <= o;) e += 1;
		e > 0 && (u = {
			line: l,
			quantity: e,
			cents: C(l, e)
		});
	}
	let d = c + (u?.cents ?? 0), f = a(d) - d, p = o - d - f, m = null, h = !1;
	if (l && p > 0) {
		let e = l.owed_cents - (u?.cents ?? 0), t = Math.min(p, e - 1);
		i > 0 && (t -= t % i), t > 0 && (r.prepayAllowed ? (m = {
			line: l,
			cents: t
		}, p -= t) : h = !0);
	}
	return {
		wholeCount: s,
		wholeCents: c,
		units: u,
		receiptCents: d,
		roundingCents: f,
		prepay: m,
		changeCents: p,
		prepayRefused: h
	};
}
function E(e) {
	return e.receiptCents + e.roundingCents + (e.prepay?.cents ?? 0);
}
function D(e) {
	return e.receiptCents > 0 || e.prepay != null;
}
function O(e, t, n) {
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
function k(e, t) {
	return `${e} з ${V(t.remaining_quantity, t.unit, t.price_per)}`;
}
function A(e, t) {
	let r = [];
	if (e.wholeCount > 0 && r.push(`Закриває ${z(e.wholeCount)} на ${n(e.wholeCents)}`), e.units && r.push(`${k(e.units.quantity, e.units.line)} «${B(e.units.line)}» на ${n(e.units.cents)}`), e.prepay) {
		let t = e.prepay.line.owed_cents - (e.units?.cents ?? 0) - e.prepay.cents;
		r.push(`Внесок ${n(e.prepay.cents)} на «${B(e.prepay.line)}» — лишиться винно ${n(t)}`);
	}
	return D(e) || r.push(`Не вистачає навіть на найстаріший товар (${n(t[0]?.owed_cents ?? 0)})`), e.prepayRefused ? r.push(D(e) ? `Решту ${n(e.changeCents)} поверніть покупцеві: у магазині з ПРРО внесок за частину товару поки не приймається` : "У магазині з ПРРО внесок за частину товару поки не приймається — гроші поверніть покупцеві") : e.changeCents > 0 && D(e) && r.push(`Решта ${n(e.changeCents)}`), r;
}
function j(e) {
	let t = [];
	e.returned_quantity > 0 && t.push(`повернуто ${V(e.returned_quantity, e.unit, e.price_per)}`), (e.paid_quantity ?? 0) > 0 && t.push(`оплачено ${V(e.paid_quantity ?? 0, e.unit, e.price_per)}`);
	let r = [];
	return t.length > 0 && r.push(t.join(", ")), (e.prepaid_cents ?? 0) > 0 && r.push(`внесено ${n(e.prepaid_cents ?? 0)}`), r.length > 0 ? r.join(" · ") : null;
}
function M(e, t) {
	return C(e, t);
}
function N(e) {
	return (e.prepaid_cents ?? 0) > 0;
}
function P(e, t) {
	let n = t.trim().toLowerCase();
	if (!n || e.name.toLowerCase().includes(n)) return !0;
	let r = n.replace(/\D/g, "");
	return r.length >= 2 && e.phone.replace(/\D/g, "").includes(r);
}
var F = 864e5;
function I(e, t = /* @__PURE__ */ new Date()) {
	let n = new Date(e), r = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), i = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.max(0, Math.round((i - r) / F));
}
function L(e, t, n, r) {
	let i = e % 10, a = e % 100;
	return i === 1 && a !== 11 ? t : i >= 2 && i <= 4 && (a < 12 || a > 14) ? n : r;
}
function R(e, t = /* @__PURE__ */ new Date()) {
	let n = I(e, t);
	return n === 0 ? "сьогодні" : n === 1 ? "вчора" : `${n} ${L(n, "день", "дні", "днів")}`;
}
function z(e) {
	return `${e} ${L(e, "товар", "товари", "товарів")}`;
}
function B(e) {
	return e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
}
function V(e, n, i = 1) {
	return r(i) ? t(e, n, i) : `${e} ${n || "шт"}`;
}
var H = {
	issue: "Під запис",
	return: "Повернуто товар",
	payment: "Погашено",
	payment_void: "Погашення скасовано",
	writeoff: "Списано"
};
function U(e, t) {
	let n = new Set(e.filter((e) => e.kind === "payment_void" && e.sale_id != null).map((e) => e.sale_id)), r = new Set(t.map((e) => e.id));
	return new Set(e.filter((e) => e.kind === "payment" && e.prepayment === !0 && e.sale_id != null && !n.has(e.sale_id) && e.prepay_line_id != null && r.has(e.prepay_line_id)).map((e) => e.id));
}
function W(e) {
	return e.prepayment && e.kind === "payment" ? "Внесок" : e.prepayment && e.kind === "payment_void" ? "Внесок скасовано" : H[e.kind];
}
function G(e) {
	let t = e.balance_cents > 0 ? `Борг ${n(e.balance_cents)}` : "Боргу немає";
	return e.limit_cents == null ? e.balance_cents > 0 ? `${t} · під запис більше не можна` : t : e.locked ? `${t} · записи заблоковано` : e.balance_cents > e.limit_cents ? `${t} · понад ліміт на ${n(e.balance_cents - e.limit_cents)}` : `${t} · ще можна ${n(e.available_cents ?? 0)}`;
}
function K(e) {
	return e.limit_cents != null && e.balance_cents > e.limit_cents;
}
function q(e) {
	let t = e.replace(/\s/g, "").replace(",", ".");
	return t === "" || !/^\d+(\.\d{1,2})?$/.test(t) ? null : Math.round(Number(t) * 100);
}
var J = 1e7;
export { d as A, N as C, k as D, U as E, l as F, h as I, f as M, p as N, u as O, m as P, M as S, S as T, E as _, z as a, b, g as c, B as d, P as f, D as g, O as h, W as i, c as j, s as k, q as l, T as m, R as n, K as o, x as p, G as r, y as s, J as t, j as u, A as v, _ as w, V as x, L as y };
