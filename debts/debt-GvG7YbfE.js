import "react";
import { formatQuantity as e, formatUah as t, isWeighed as n, refundLineAmount as r } from "@pos/platform";
import { jsx as i, jsxs as a } from "react/jsx-runtime";
// src/platform/glyphs.tsx
function o({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ i("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
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
function s({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "CreditCard",
		...t,
		children: [
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "5",
				width: "20",
				height: "14",
				rx: "3",
				fill: "#1B9DF0"
			}),
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "8",
				width: "20",
				height: "3",
				fill: "#000000",
				fillOpacity: ".22"
			}),
			/* @__PURE__ */ i("rect", {
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
function c({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Wallet",
		...t,
		children: [
			/* @__PURE__ */ i("path", {
				d: "M5 6 16 3l1 3Z",
				fill: "#C0A96B",
				fillOpacity: ".55"
			}),
			/* @__PURE__ */ i("rect", {
				x: "3",
				y: "6",
				width: "18",
				height: "15",
				rx: "3",
				fill: "#C0A96B"
			}),
			/* @__PURE__ */ i("rect", {
				x: "14",
				y: "10",
				width: "8",
				height: "7",
				rx: "2",
				fill: "#FFFFFF",
				fillOpacity: ".45"
			}),
			/* @__PURE__ */ i("circle", {
				cx: "17.5",
				cy: "13.5",
				r: "1.25",
				fill: "#C0A96B"
			})
		]
	});
}
function l({ size: e = 20, ...t }) {
	return /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function u({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function d({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function f({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function p({ size: e = 20, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Printer",
		...t,
		children: [
			/* @__PURE__ */ i("path", {
				d: "M5 8V3h10v5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ i("rect", {
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
			/* @__PURE__ */ i("path", {
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
function m({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ i("path", {
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
function h(e) {
	return e.map((e) => ({
		variant_id: e.variant_id,
		quantity: e.quantity,
		...e.modifiers?.length ? { modifiers: e.modifiers.map((e) => e.id).sort((e, t) => e - t) } : {},
		...e.note ? { note: e.note } : {},
		...e.weight_source ? { weight_source: e.weight_source } : {}
	}));
}
function g(e) {
	return n(e.price_per);
}
function _(e) {
	return e.some((e) => (e.components?.length ?? 0) > 0);
}
function v(e) {
	if (e.customerId == null) return {
		code: "no_customer",
		text: "Оберіть покупця — під запис записують на людину"
	};
	if (!e.online && !e.queue) return {
		code: "offline",
		text: "Під запис — лише з мережею"
	};
	if (_(e.lines)) return {
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
	let n = e.credit;
	if (!n) return null;
	if (n.limit_cents == null) return {
		code: "no_credit",
		text: "Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця."
	};
	if (n.locked) return {
		code: "locked",
		text: "Власник заблокував записи під запис для цього покупця"
	};
	let r = n.available_cents ?? 0;
	return e.totalCents > r ? {
		code: "over_limit",
		text: `Понад ліміт: ще можна ${t(r)}, а в кошику ${t(e.totalCents)}`
	} : null;
}
function y(e) {
	let t = [], n = 0;
	for (let r of e) n += r.owed_cents, t.push(n);
	return t;
}
function b(e, t) {
	let n = y(e), r = 0;
	for (let e of n) {
		if (e > t) break;
		r += 1;
	}
	return {
		count: r,
		total: r > 0 ? n[r - 1] : 0
	};
}
function x(e, t) {
	return t + 1 === e && e > 1 ? e - 1 : t + 1;
}
function S(e, t) {
	return t <= 0 ? 0 : r(e.line_total_cents, e.quantity, e.returned_quantity, t);
}
function C(e, t) {
	let n = t.trim().toLowerCase();
	if (!n || e.name.toLowerCase().includes(n)) return !0;
	let r = n.replace(/\D/g, "");
	return r.length >= 2 && e.phone.replace(/\D/g, "").includes(r);
}
var w = 864e5;
function T(e, t = /* @__PURE__ */ new Date()) {
	let n = new Date(e), r = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), i = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.max(0, Math.round((i - r) / w));
}
function E(e, t, n, r) {
	let i = e % 10, a = e % 100;
	return i === 1 && a !== 11 ? t : i >= 2 && i <= 4 && (a < 12 || a > 14) ? n : r;
}
function D(e, t = /* @__PURE__ */ new Date()) {
	let n = T(e, t);
	return n === 0 ? "сьогодні" : n === 1 ? "вчора" : `${n} ${E(n, "день", "дні", "днів")}`;
}
function O(e) {
	return `${e} ${E(e, "товар", "товари", "товарів")}`;
}
function k(e) {
	return e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
}
function A(t, r, i = 1) {
	return n(i) ? e(t, r, i) : `${t} ${r || "шт"}`;
}
var j = {
	issue: "Під запис",
	return: "Повернуто товар",
	payment: "Погашено",
	payment_void: "Погашення скасовано",
	writeoff: "Списано"
};
function M(e) {
	let n = e.balance_cents > 0 ? `Борг ${t(e.balance_cents)}` : "Боргу немає";
	return e.limit_cents == null ? e.balance_cents > 0 ? `${n} · під запис більше не можна` : n : e.locked ? `${n} · записи заблоковано` : e.balance_cents > e.limit_cents ? `${n} · понад ліміт на ${t(e.balance_cents - e.limit_cents)}` : `${n} · ще можна ${t(e.available_cents ?? 0)}`;
}
function N(e) {
	return e.limit_cents != null && e.balance_cents > e.limit_cents;
}
function P(e) {
	let t = e.replace(/\s/g, "").replace(",", ".");
	return t === "" || !/^\d+(\.\d{1,2})?$/.test(t) ? null : Math.round(Number(t) * 100);
}
var F = 1e7;
export { d as C, m as D, c as E, s as S, p as T, S as _, O as a, o as b, h as c, b as d, C as f, A as g, y as h, M as i, P as l, E as m, F as n, N as o, x as p, D as r, v as s, j as t, k as u, g as v, f as w, u as x, l as y };
