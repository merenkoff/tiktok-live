import "react";
import { formatUah as e, refundLineAmount as t } from "@pos/platform";
import { jsx as n, jsxs as r } from "react/jsx-runtime";
// src/platform/glyphs.tsx
function i({ size: e = 24, ...t }) {
	return /* @__PURE__ */ r("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ n("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ n("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ n("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ n("rect", {
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
function a({ size: e = 24, ...t }) {
	return /* @__PURE__ */ r("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "CreditCard",
		...t,
		children: [
			/* @__PURE__ */ n("rect", {
				x: "2",
				y: "5",
				width: "20",
				height: "14",
				rx: "3",
				fill: "#1B9DF0"
			}),
			/* @__PURE__ */ n("rect", {
				x: "2",
				y: "8",
				width: "20",
				height: "3",
				fill: "#000000",
				fillOpacity: ".22"
			}),
			/* @__PURE__ */ n("rect", {
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
function o({ size: e = 24, ...t }) {
	return /* @__PURE__ */ r("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Wallet",
		...t,
		children: [
			/* @__PURE__ */ n("path", {
				d: "M5 6 16 3l1 3Z",
				fill: "#C0A96B",
				fillOpacity: ".55"
			}),
			/* @__PURE__ */ n("rect", {
				x: "3",
				y: "6",
				width: "18",
				height: "15",
				rx: "3",
				fill: "#C0A96B"
			}),
			/* @__PURE__ */ n("rect", {
				x: "14",
				y: "10",
				width: "8",
				height: "7",
				rx: "2",
				fill: "#FFFFFF",
				fillOpacity: ".45"
			}),
			/* @__PURE__ */ n("circle", {
				cx: "17.5",
				cy: "13.5",
				r: "1.25",
				fill: "#C0A96B"
			})
		]
	});
}
function s({ size: e = 20, ...t }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function c({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function l({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function u({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function d({ size: e = 20, ...t }) {
	return /* @__PURE__ */ r("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Printer",
		...t,
		children: [
			/* @__PURE__ */ n("path", {
				d: "M5 8V3h10v5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ n("rect", {
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
			/* @__PURE__ */ n("path", {
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
function f({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ n("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ n("path", {
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
function p(e) {
	return e.map((e) => ({
		variant_id: e.variant_id,
		quantity: e.quantity,
		...e.modifiers?.length ? { modifiers: e.modifiers.map((e) => e.id).sort((e, t) => e - t) } : {},
		...e.note ? { note: e.note } : {}
	}));
}
function m(e) {
	return e.some((e) => (e.components?.length ?? 0) > 0);
}
function h(t) {
	if (t.customerId == null) return {
		code: "no_customer",
		text: "Оберіть покупця — під запис записують на людину"
	};
	if (!t.online && !t.queue) return {
		code: "offline",
		text: "Під запис — лише з мережею"
	};
	if (m(t.lines)) return {
		code: "assembled",
		text: "Букет, зібраний на касі, під запис не записується — продайте його або запишіть готовий букет з каталогу"
	};
	if (!t.online && t.noMirror) return {
		code: "no_mirror",
		text: "Без мережі каса не знає, кому можна під запис: вона ще жодного разу не отримала ліміти покупців. Потрібна мережа."
	};
	if (t.customerId < 0) return {
		code: "no_credit",
		text: "Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця."
	};
	let n = t.credit;
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
	return t.totalCents > r ? {
		code: "over_limit",
		text: `Понад ліміт: ще можна ${e(r)}, а в кошику ${e(t.totalCents)}`
	} : null;
}
function g(e) {
	let t = [], n = 0;
	for (let r of e) n += r.owed_cents, t.push(n);
	return t;
}
function _(e, t) {
	let n = g(e), r = 0;
	for (let e of n) {
		if (e > t) break;
		r += 1;
	}
	return {
		count: r,
		total: r > 0 ? n[r - 1] : 0
	};
}
function v(e, t) {
	return t + 1 === e && e > 1 ? e - 1 : t + 1;
}
function y(e, n) {
	return n <= 0 ? 0 : t(e.line_total_cents, e.quantity, e.returned_quantity, n);
}
function b(e, t) {
	let n = t.trim().toLowerCase();
	if (!n || e.name.toLowerCase().includes(n)) return !0;
	let r = n.replace(/\D/g, "");
	return r.length >= 2 && e.phone.replace(/\D/g, "").includes(r);
}
var x = 864e5;
function S(e, t = /* @__PURE__ */ new Date()) {
	let n = new Date(e), r = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), i = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
	return Math.max(0, Math.round((i - r) / x));
}
function C(e, t, n, r) {
	let i = e % 10, a = e % 100;
	return i === 1 && a !== 11 ? t : i >= 2 && i <= 4 && (a < 12 || a > 14) ? n : r;
}
function w(e, t = /* @__PURE__ */ new Date()) {
	let n = S(e, t);
	return n === 0 ? "сьогодні" : n === 1 ? "вчора" : `${n} ${C(n, "день", "дні", "днів")}`;
}
function T(e) {
	return `${e} ${C(e, "товар", "товари", "товарів")}`;
}
function E(e) {
	return e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
}
function D(e, t) {
	return `${e} ${t || "шт"}`;
}
var O = {
	issue: "Під запис",
	return: "Повернуто товар",
	payment: "Погашено",
	payment_void: "Погашення скасовано",
	writeoff: "Списано"
};
function k(t) {
	let n = t.balance_cents > 0 ? `Борг ${e(t.balance_cents)}` : "Боргу немає";
	return t.limit_cents == null ? t.balance_cents > 0 ? `${n} · під запис більше не можна` : n : t.locked ? `${n} · записи заблоковано` : t.balance_cents > t.limit_cents ? `${n} · понад ліміт на ${e(t.balance_cents - t.limit_cents)}` : `${n} · ще можна ${e(t.available_cents ?? 0)}`;
}
function A(e) {
	return e.limit_cents != null && e.balance_cents > e.limit_cents;
}
function j(e) {
	let t = e.replace(/\s/g, "").replace(",", ".");
	return t === "" || !/^\d+(\.\d{1,2})?$/.test(t) ? null : Math.round(Number(t) * 100);
}
var M = 1e7;
export { u as C, f as E, l as S, o as T, y as _, T as a, c as b, p as c, _ as d, b as f, D as g, g as h, k as i, j as l, C as m, M as n, A as o, v as p, w as r, h as s, O as t, E as u, s as v, d as w, a as x, i as y };
