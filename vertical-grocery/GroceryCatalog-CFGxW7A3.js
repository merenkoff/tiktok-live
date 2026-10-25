import { Suspense as e, lazy as t, useEffect as n, useMemo as r, useRef as i, useState as a } from "react";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
import * as c from "@pos/platform";
import { assetUrl as l, cashierApi as u, displayUnit as d, isWeighed as f, useCartStore as p, usePosShell as m, useSalesCatalog as h } from "@pos/platform";
// src/platform/glyphs.tsx
function g({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...t,
		children: [
			/* @__PURE__ */ o("rect", {
				x: "2",
				y: "5",
				width: "12",
				height: "9",
				rx: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M6 5l1-2h2l1 2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("circle", {
				cx: "8",
				cy: "9.5",
				r: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	}) : /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...t,
		children: [
			/* @__PURE__ */ o("rect", {
				x: "2",
				y: "6",
				width: "16",
				height: "11",
				rx: "2.5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M7 6 8.25 3.5h3.5L13 6",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("circle", {
				cx: "10",
				cy: "11.5",
				r: "3",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function _({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M10 3.5 5.5 8 10 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M12 4.5 6.5 10 12 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function v({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronRight",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M6 3.5 10.5 8 6 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronRight",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M8 4.5 13.5 10 8 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function y({ size: e = 20, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Delete",
		...t,
		children: [/* @__PURE__ */ o("path", {
			d: "M7 4h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7L2 10Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M10 8l4 4M14 8l-4 4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function b({ size: e = 20, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Folder",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function x({ size: e = 20, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "MoreHorizontal",
		...t,
		children: /* @__PURE__ */ s("g", {
			fill: "currentColor",
			children: [
				/* @__PURE__ */ o("circle", {
					cx: "4",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ o("circle", {
					cx: "10",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ o("circle", {
					cx: "16",
					cy: "10",
					r: "1.75"
				})
			]
		})
	});
}
function S({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...t,
		children: [/* @__PURE__ */ o("circle", {
			cx: "7",
			cy: "7",
			r: "4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M10 10 13 13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	}) : /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...t,
		children: [/* @__PURE__ */ o("circle", {
			cx: "8.5",
			cy: "8.5",
			r: "5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M12.5 12.5 16.5 16.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function C({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M5 5 15 15M15 5 5 15",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
// src/hooks/useDragScroll.ts
var w = 6;
function T() {
	let e = i(null);
	return n(() => {
		let t = e.current;
		if (!t) return;
		let n = {
			active: !1,
			moved: !1,
			startX: 0,
			startY: 0,
			scrollLeft: 0,
			scrollTop: 0,
			pointerId: -1
		}, r = (e) => {
			e.pointerType === "mouse" && e.button === 0 && (n.active = !0, n.moved = !1, n.startX = e.clientX, n.startY = e.clientY, n.scrollLeft = t.scrollLeft, n.scrollTop = t.scrollTop, n.pointerId = e.pointerId);
		}, i = (e) => {
			if (!n.active || e.pointerId !== n.pointerId) return;
			let r = e.clientX - n.startX, i = e.clientY - n.startY;
			!n.moved && Math.hypot(r, i) > w && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
		}, a = (e) => {
			e.pointerId === n.pointerId && (n.active = !1);
		}, o = (e) => {
			n.moved && (e.stopPropagation(), e.preventDefault(), n.moved = !1);
		};
		return t.addEventListener("pointerdown", r), t.addEventListener("pointermove", i), t.addEventListener("pointerup", a), t.addEventListener("pointercancel", a), t.addEventListener("click", o, !0), () => {
			t.removeEventListener("pointerdown", r), t.removeEventListener("pointermove", i), t.removeEventListener("pointerup", a), t.removeEventListener("pointercancel", a), t.removeEventListener("click", o, !0);
		};
	}, []), e;
}
// src/lib/money.ts
var E = "\xA0";
function D(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, E);
}
function O(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${D(n)},${r} ₴`;
}
// src/components/cashier/ProductTile.tsx
function ee({ name: e, subtitle: t, priceCents: n, compareAtCents: r, priceUnit: i, imageUrl: c, stock: u, onClick: d, disabled: f, count: p, onMore: m, badge: h, testId: g }) {
	let [_, v] = a(!1), y = _ ? null : l(c), b = f || !!h || u != null && u <= 0, S = /* @__PURE__ */ s("button", {
		type: "button",
		disabled: f,
		onClick: d,
		"data-testid": g,
		className: `w-full ${m ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${p ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ s("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				y ? /* @__PURE__ */ o("img", {
					src: y,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${b ? "opacity-45" : ""}`,
					onError: () => v(!0)
				}) : /* @__PURE__ */ o("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				p != null && p > 0 && /* @__PURE__ */ o("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: p
				}),
				h ? /* @__PURE__ */ o("span", {
					className: `absolute ${p ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: h
				}) : u != null && u <= 0 && /* @__PURE__ */ o("span", {
					className: `absolute ${p ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ s("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ o("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${b ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ s("p", {
				className: "text-[14px] text-sq-secondary tabular-nums flex items-baseline gap-1.5",
				children: [r != null && r > n && /* @__PURE__ */ o("s", {
					className: "text-[12px] text-sq-muted",
					"data-testid": "tile-old-price",
					children: O(r)
				}), /* @__PURE__ */ s("span", { children: [O(n), i ? `/${i}` : ""] })]
			})]
		})]
	});
	return m ? /* @__PURE__ */ s("div", {
		className: "relative",
		children: [S, !f && /* @__PURE__ */ o("button", {
			type: "button",
			onClick: m,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": g ? `${g}-more` : "tile-more",
			children: /* @__PURE__ */ o("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ o(x, { size: 20 })
			})
		})]
	}) : S;
}
// src/lib/tagColors.ts
var te = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], k = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, A = "slate";
function ne(e) {
	return !!e && te.includes(e);
}
function re(e) {
	return ne(e) ? k[e] : k[A];
}
// src/components/cashier/TagFolderTile.tsx
function ie({ name: e, color: t, onClick: n }) {
	let r = re(t);
	return /* @__PURE__ */ s("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ o("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ o(b, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ s("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ o("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
// src/lib/lineMoney.ts
function j(e, t, n = 1) {
	if (n === 1) return e * t;
	if (!Number.isInteger(n) || n <= 0) throw Error(`price_per must be a positive integer, got ${n}`);
	return Math.floor((2 * e * t + n) / (2 * n));
}
// src/lib/weighed.ts
var M = 1e3, N = {
	г: "кг",
	мл: "л"
}, P = "вагу введено вручну";
function F(e) {
	return Number(e) > 1;
}
function I(e, t = 1) {
	return F(t) ? N[e] ?? e : e;
}
function L(e, t, n = 1) {
	if (F(n)) {
		let r = String(n).length - 1;
		return `${Math.trunc(e / n)},${String(Math.abs(e % n)).padStart(r, "0")} ${I(t, n)}`;
	}
	return t ? `${e} ${t}` : String(e);
}
function R(e, t, n = 1) {
	return F(n) ? `${O(e)}/${I(t, n)}` : O(e);
}
function ae(e, t, n) {
	let r = n ? "" : e;
	if (t === "del") return n ? "" : r.slice(0, -1);
	if (t === ",") return r.includes(",") ? r : `${r || "0"},`;
	let [i, a] = r.split(",");
	return a === void 0 ? i === "0" ? t : i.length >= 3 ? r : r + t : a.length >= 3 ? r : r + t;
}
function oe(e) {
	let t = e.replace(/\s/g, "").replace(".", ","), n = /^(\d{1,6})(?:,(\d{0,3}))?$/.exec(t) ?? /^,(\d{1,3})$/.exec(t);
	if (!n) return null;
	let [r, i] = t.startsWith(",") ? ["0", n[1]] : [n[1], n[2] ?? ""];
	return Number(r) * M + Number(i.padEnd(3, "0"));
}
function se(e) {
	return `${Math.trunc(e / M)},${String(e % M).padStart(3, "0")}`;
}
function ce(e, t, n = M) {
	return e == null || e <= 0 ? "Введіть вагу" : e > 999999 ? "Вага понад 999,999 — перевірте введення" : j(e, t, n) <= 0 ? "Сума рядка 0,00 ₴ — вага замала або в товару немає ціни" : null;
}
// src/lib/sizeLadder.ts
var z = [
	{
		cm: 56,
		from: 0,
		to: 1
	},
	{
		cm: 62,
		from: 1,
		to: 3
	},
	{
		cm: 68,
		from: 3,
		to: 6
	},
	{
		cm: 74,
		from: 6,
		to: 9
	},
	{
		cm: 80,
		from: 9,
		to: 12
	},
	{
		cm: 86,
		from: 12,
		to: 18
	},
	{
		cm: 92,
		from: 18,
		to: 24
	},
	{
		cm: 98,
		from: 24,
		to: 36
	},
	{
		cm: 104,
		from: 36,
		to: 48
	},
	{
		cm: 110,
		from: 48,
		to: 60
	},
	{
		cm: 116,
		from: 60,
		to: 72
	},
	{
		cm: 122,
		from: 72,
		to: 84
	},
	{
		cm: 128,
		from: 84,
		to: 96
	},
	{
		cm: 134,
		from: 96,
		to: 108
	},
	{
		cm: 140,
		from: 108,
		to: 120
	},
	{
		cm: 146,
		from: 120,
		to: 132
	},
	{
		cm: 152,
		from: 132,
		to: 144
	},
	{
		cm: 158,
		from: 144,
		to: 156
	},
	{
		cm: 164,
		from: 156,
		to: 168
	}
], B = z[z.length - 1].to, le = 50, V = 170;
function H(e) {
	return z.find((t) => t.cm === e) ?? null;
}
function U(e) {
	return e >= 0 ? e >= B ? z[z.length - 1] : z.find((t) => e >= t.from && e < t.to) ?? null : null;
}
function W(e) {
	return !(e >= 0) || e > B ? null : z.find((t) => t.to >= e) ?? null;
}
function ue(e, t, n, r) {
	let i = Math.abs(e), a = i % 100, o = i % 10;
	return a >= 11 && a <= 14 ? r : o === 1 ? t : o >= 2 && o <= 4 ? n : r;
}
var de = (e) => ue(e, "рік", "роки", "років");
function fe(e, t) {
	return `${e}–${t} міс`;
}
function pe(e, t) {
	if (t <= 24) return fe(e, t);
	let n = e % 12 == 0 ? String(e / 12) : `${e} міс`, r = t / 12;
	return `${n}–${r} ${de(r)}`;
}
function me(e) {
	return e.trim().toLowerCase().replace(/[–—/]/g, "-").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ");
}
var he = /^(\d{2,3})(?:-(\d{2,3}))?(?: ?см)?$/, ge = /^(\d{1,2})(?:-(\d{1,2}))? ?(?:міс|місяць|місяці|місяців)\.?$/, _e = /^(\d{1,2})-(\d{1,2}) ?(?:р|рік|роки|років|рр)\.?$/;
function G(e) {
	let t = me(e), n = he.exec(t);
	if (n) {
		let e = Number(n[1]), t = n[2] === void 0 ? e : Number(n[2]);
		return e < le || t > V || e > t || n[2] !== void 0 && e === t ? null : {
			kind: "height",
			low: e,
			high: t
		};
	}
	if (n = ge.exec(t), n) {
		let e = Number(n[1]), t = n[2] === void 0 ? e : Number(n[2]);
		if (e > t) return null;
		let r = U(e), i = W(t);
		return !r || !i ? null : {
			kind: "months",
			low: Math.min(r.cm, i.cm),
			high: i.cm
		};
	}
	if (n = _e.exec(t), n) {
		let e = Number(n[1]), t = Number(n[2]);
		if (e >= t) return null;
		let r = U(e * 12), i = W(t * 12);
		return !r || !i ? null : {
			kind: "years",
			low: Math.min(r.cm, i.cm),
			high: i.cm
		};
	}
	return null;
}
function ve(e, t) {
	return e === t ? `≈ ${e} см` : `≈ ${e}–${t} см`;
}
function ye(e) {
	let t = G(e);
	if (!t) return null;
	if (t.kind === "height") {
		let e = H(t.low), n = H(t.high);
		return !e || !n ? null : pe(e.from, n.to);
	}
	return ve(t.low, t.high);
}
// src/lib/sizeFinder.ts
var K = "(\\d+(?:[.,]\\d+)?)", be = RegExp(`^${K} ?(?:см|cm)\\.?$`), xe = RegExp(`^${K} ?(?:міс|місяць|місяці|місяців|м|mo|mos|month|months)\\.?$`), Se = RegExp(`^${K} ?(?:р|рік|року|роки|років|рр|y|yr|yrs|year|years)\\.?$`), Ce = RegExp(`^${K}$`), q = (e) => Number(e.replace(",", "."));
function we(e) {
	let t = e.trim().toLowerCase().replace(/\s+/g, " ");
	if (t === "") return null;
	if (/^півтора( року| роки)?$/.test(t)) return {
		kind: "age",
		months: 18
	};
	if (/^піврока|^півроку$/.test(t)) return {
		kind: "age",
		months: 6
	};
	let n = be.exec(t);
	if (n) {
		let e = q(n[1]);
		return e >= 40 && e <= 180 ? {
			kind: "height",
			cm: e
		} : null;
	}
	if (n = xe.exec(t), n) {
		let e = q(n[1]);
		return e >= 0 && e <= 168 ? {
			kind: "age",
			months: e
		} : null;
	}
	if (n = Se.exec(t), n) {
		let e = q(n[1]);
		return e >= 0 && e <= 14 ? {
			kind: "age",
			months: Math.round(e * 12)
		} : null;
	}
	if (n = Ce.exec(t), n) {
		let e = q(n[1]);
		if (e >= 50 && e <= 170) return {
			kind: "height",
			cm: e
		};
		if (e >= 0 && e <= 14) return {
			kind: "age",
			months: Math.round(e * 12)
		};
	}
	return null;
}
function Te(e) {
	if (e.kind === "age") return U(e.months);
	let t = z[0], n = z[z.length - 1];
	return e.cm > n.cm ? null : e.cm <= t.cm ? t : z.find((t) => t.cm >= e.cm) ?? null;
}
function Ee(e, t) {
	let n = Te(e);
	if (!n) return null;
	let r = z[z.indexOf(n) + 1] ?? null, i = [], a = [];
	for (let e of t) {
		let t = G(e);
		t && (t.low <= n.cm && n.cm <= t.high ? i.push(e) : r && t.low <= r.cm && r.cm <= t.high && a.push(e));
	}
	return {
		rung: n,
		fit: i,
		room: a
	};
}
// src/components/cashier/VariantPicker.tsx
var J = (e) => String(e.attributes?.size ?? "").trim(), Y = (e) => e.quantity <= 0 && !F(e.price_per), De = (e) => String(e.attributes?.color ?? "").trim(), X = (e) => e.compare_at_cents != null && e.compare_at_cents > e.price_cents ? e.compare_at_cents : null;
function Oe({ variants: e, onPick: t, fit: n, room: i }) {
	let a = r(() => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) {
			let e = De(n);
			t.set(e, [...t.get(e) ?? [], n]);
		}
		return [...t.entries()];
	}, [e]), c = new Set(e.map((e) => e.price_cents)).size === 1 ? e[0].price_cents : null, l = new Set(e.map(X)), u = c !== null && l.size === 1 ? [...l][0] : null;
	return /* @__PURE__ */ s("div", {
		className: "px-4 pb-3 max-h-[52vh] overflow-auto",
		"data-testid": "size-chips",
		children: [c !== null && /* @__PURE__ */ s("p", {
			className: "text-[15px] font-semibold text-sq-text tabular-nums pb-1 flex items-baseline gap-1.5",
			children: [u != null && /* @__PURE__ */ o("s", {
				className: "text-[13px] font-normal text-sq-muted",
				"data-testid": "picker-old-price",
				children: O(u)
			}), /* @__PURE__ */ o("span", { children: O(c) })]
		}), a.map(([e, r]) => /* @__PURE__ */ s("section", {
			className: "pt-2",
			children: [(a.length > 1 || e) && /* @__PURE__ */ o("h4", {
				className: "text-[13px] font-semibold text-sq-secondary pb-1.5",
				children: e || "Без кольору"
			}), /* @__PURE__ */ o("div", {
				className: "flex flex-wrap gap-2",
				children: r.map((e) => {
					let r = J(e), a = ye(r), l = e.quantity <= 0, d = n.has(r) ? "fit" : i.has(r) ? "room" : null, f = u == null ? X(e) : null;
					return /* @__PURE__ */ s("button", {
						type: "button",
						disabled: l,
						onClick: () => t(e),
						"aria-label": d === "fit" ? `${r}, підходить` : d === "room" ? `${r}, на виріст` : r,
						"data-state": d ?? void 0,
						className: `min-w-[4.5rem] min-h-14 px-3 py-1.5 rounded-[14px] flex flex-col items-center justify-center text-center leading-tight ring-1 ring-inset transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sq-blue disabled:cursor-not-allowed ${l ? "bg-sq-sidebar text-sq-muted ring-sq-divider opacity-60" : d === "fit" ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue" : d === "room" ? "bg-sq-surface ring-sq-blue/50 text-sq-text" : "bg-sq-surface ring-sq-divider text-sq-text hover:bg-sq-sidebar active:bg-sq-selected"}`,
						children: [
							/* @__PURE__ */ o("span", {
								className: "text-[17px] font-semibold tabular-nums",
								children: r
							}),
							/* @__PURE__ */ o("span", {
								"aria-hidden": "true",
								className: `text-[11px] ${l ? "text-red-600" : "text-sq-muted"}`,
								children: l ? "немає" : a ?? `${e.quantity} ${e.unit || "шт"}`
							}),
							!l && (c === null || f != null) && /* @__PURE__ */ s("span", {
								"aria-hidden": "true",
								className: "text-[12px] font-semibold tabular-nums flex items-baseline gap-1",
								children: [f != null && /* @__PURE__ */ o("s", {
									className: "font-normal text-sq-muted",
									"data-testid": "picker-old-price",
									children: O(f)
								}), /* @__PURE__ */ o("span", { children: O(e.price_cents) })]
							}),
							d === "room" && /* @__PURE__ */ o("span", {
								"aria-hidden": "true",
								className: "text-[10px] text-sq-blue",
								children: "на виріст"
							})
						]
					}, e.variant_id);
				})
			})]
		}, e || "none"))]
	});
}
function ke({ productName: e, variants: t, onPick: n, onClose: i }) {
	let c = T(), l = [...t].sort((e, t) => Y(e) && !Y(t) ? 1 : !Y(e) && Y(t) ? -1 : 0), u = t.length > 0 && t.every((e) => J(e) !== ""), d = u && t.some((e) => G(J(e)) !== null), [f, p] = a(""), m = we(f), h = r(() => m ? Ee(m, [...new Set(t.filter((e) => e.quantity > 0).map(J))]) : null, [f, t]), g = new Set(h?.fit ?? []), _ = new Set(h?.room ?? []);
	return /* @__PURE__ */ o("div", {
		className: "fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ s("div", {
			role: "dialog",
			"aria-label": e,
			className: "bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
			"data-testid": "variant-picker",
			children: [
				/* @__PURE__ */ s("div", {
					className: "pl-5 pr-3 pt-4 pb-2 flex justify-between items-center gap-3",
					children: [/* @__PURE__ */ o("h3", {
						className: "text-[19px] font-bold text-sq-heading truncate",
						children: e
					}), /* @__PURE__ */ o("button", {
						type: "button",
						onClick: i,
						"aria-label": "Закрити",
						className: "w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0",
						children: /* @__PURE__ */ o(C, { size: 20 })
					})]
				}),
				d && /* @__PURE__ */ s("div", {
					className: "px-5 pb-2",
					children: [/* @__PURE__ */ o("input", {
						type: "text",
						inputMode: "text",
						"aria-label": "Вік або зріст дитини",
						placeholder: "Вік або зріст: 2 роки, 18 міс, 98",
						value: f,
						onChange: (e) => p(e.target.value),
						className: "sq-input w-full"
					}), f.trim() !== "" && /* @__PURE__ */ o("p", {
						role: "status",
						className: "mt-1.5 text-[13px] text-sq-secondary",
						"data-testid": "size-finder-status",
						children: m ? h ? h.fit.length === 0 && h.room.length === 0 ? `Розмір ${h.rung.cm} не в наявності` : h.fit.length > 0 ? `Підходить: ${h.fit.join(", ")}${h.room.length ? ` · на виріст: ${h.room.join(", ")}` : ""}` : `Потрібного розміру немає · на виріст: ${h.room.join(", ")}` : "Такого розміру в каталозі немає" : "Напишіть вік («2 роки», «18 міс») або зріст («98»)"
					})]
				}),
				u ? /* @__PURE__ */ o(Oe, {
					variants: t,
					onPick: n,
					fit: g,
					room: _
				}) : /* @__PURE__ */ o("ul", {
					ref: c,
					className: "px-2 pb-2 max-h-[60vh] overflow-auto select-none",
					children: l.map((e) => {
						let t = e.label || "Стандарт", r = Y(e), i = F(e.price_per), a = X(e);
						return /* @__PURE__ */ o("li", { children: /* @__PURE__ */ s("button", {
							type: "button",
							disabled: r,
							onClick: () => n(e),
							className: "w-full min-h-16 rounded-[14px] text-left px-3.5 py-2.5 flex items-center gap-3 disabled:opacity-50 hover:bg-sq-sidebar focus-visible:bg-sq-sidebar active:bg-sq-selected outline-none",
							children: [
								/* @__PURE__ */ s("span", {
									className: "flex-1 min-w-0",
									children: [/* @__PURE__ */ o("span", {
										className: `block text-[17px] font-semibold truncate ${r ? "text-sq-muted" : "text-sq-text"}`,
										children: t
									}), /* @__PURE__ */ o("span", {
										className: `block text-[13px] ${r ? "text-red-600" : "text-sq-muted"}`,
										children: r ? "Немає в наявності" : i ? `на вагу · за обліком ${L(Math.max(0, e.quantity), e.unit, e.price_per)}` : `${e.quantity} ${e.unit || "шт"}`
									})]
								}),
								/* @__PURE__ */ s("span", {
									className: "flex flex-col items-end shrink-0 tabular-nums",
									children: [a != null && /* @__PURE__ */ o("s", {
										className: "text-[13px] text-sq-muted",
										"data-testid": "picker-old-price",
										children: O(a)
									}), /* @__PURE__ */ o("span", {
										className: "text-[17px] font-semibold text-sq-text",
										children: R(e.price_cents, e.unit, e.price_per)
									})]
								}),
								/* @__PURE__ */ o(v, {
									size: 20,
									className: "text-sq-muted shrink-0"
								})
							]
						}) }, e.variant_id);
					})
				})
			]
		})
	});
}
// src/components/cashier/CatalogTagBar.tsx
function Ae({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let c = T(), l = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ s("div", {
		ref: c,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ s("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ o(_, { size: 16 }), r]
			}),
			/* @__PURE__ */ o("button", {
				type: "button",
				onClick: () => i(null),
				className: l(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ o("button", {
				type: "button",
				onClick: () => i(e),
				className: l(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
var je = 2e3, Me = {
	Minus: ["-", "_"],
	NumpadSubtract: ["-", "-"],
	Equal: ["=", "+"],
	NumpadAdd: ["+", "+"],
	Slash: ["/", "?"],
	NumpadDivide: ["/", "/"],
	Period: [".", ">"],
	NumpadDecimal: [".", "."],
	Comma: [",", "<"],
	Space: [" ", " "],
	Semicolon: [";", ":"],
	Quote: ["'", "\""],
	BracketLeft: ["[", "{"],
	BracketRight: ["]", "}"],
	Backslash: ["\\", "|"],
	Backquote: ["`", "~"],
	NumpadMultiply: ["*", "*"]
};
function Ne(e, t, n, r = !1) {
	if (/^[\x20-\x7e]$/.test(e)) return e;
	let i = /^Key([A-Z])$/.exec(t);
	if (i) return n === r ? i[1].toLowerCase() : i[1];
	let a = /^(?:Digit|Numpad)([0-9])$/.exec(t);
	if (a) return a[1];
	let o = Me[t];
	return o ? n ? o[1] : o[0] : e;
}
function Pe(e) {
	let t = e?.value;
	return typeof t == "string" ? t : null;
}
function Fe() {
	let e = null;
	function t(t) {
		if (t.ctrlKey || t.altKey || t.metaKey || t.isComposing || t.key === "Process" || t.repeat) return e = null, { kind: "pass" };
		if (t.key === "Enter") {
			let n = e;
			if (e = null, !n || !n.chars.trim() || n.field !== t.field) return { kind: "pass" };
			let r = t.time - n.last;
			if (n.field === null) {
				if (r > 2e3) return { kind: "pass" };
			} else if (n.chars.length < 4 || r > 120) return { kind: "pass" };
			return {
				kind: "scan",
				code: n.chars.trim(),
				field: n.field,
				restore: n.before
			};
		}
		if (t.key === "Shift" || t.key === "CapsLock") return { kind: "pass" };
		if (t.key.length !== 1) return e = null, { kind: "pass" };
		let n = Ne(t.key, t.code, t.shiftKey, t.capsLock), r = e ? t.time - e.last : Infinity, i = t.field === null ? je : 60;
		return !e || e.field !== t.field || r > i ? e = {
			chars: n,
			last: t.time,
			field: t.field,
			before: Pe(t.field)
		} : (e.chars += n, e.last = t.time), { kind: "pass" };
	}
	return {
		feed: t,
		reset() {
			e = null;
		}
	};
}
// src/components/cashier/ScanWedge.tsx
function Ie({ active: e, onScan: t }) {
	let r = m(), a = i(null), s = i(t);
	n(() => {
		s.current = t;
	});
	let c = i(e);
	n(() => {
		c.current = e;
	});
	let l = r !== "tablet";
	return n(() => {
		if (!l) return;
		let e = Fe(), t = !0, n = (n) => {
			let r = c.current && !Re(a.current);
			r !== t && e.reset(), t = r;
			let i = Be(n.target), o = e.feed({
				key: n.key,
				code: n.code,
				shiftKey: n.shiftKey,
				capsLock: n.getModifierState?.("CapsLock") ?? !1,
				ctrlKey: n.ctrlKey,
				altKey: n.altKey,
				metaKey: n.metaKey,
				repeat: n.repeat,
				isComposing: n.isComposing,
				time: n.timeStamp || performance.now(),
				field: i ?? (r ? null : Z)
			});
			o.kind === "scan" && (n.preventDefault(), n.stopPropagation(), o.field && o.field !== Z && o.restore !== null && Ve(o.field, o.restore), r && s.current(o.code));
		};
		return window.addEventListener("keydown", n, !0), () => window.removeEventListener("keydown", n, !0);
	}, [l]), r === "tablet" ? null : /* @__PURE__ */ o("span", {
		ref: a,
		hidden: !0,
		"data-scan-wedge": ""
	});
}
var Le = "[role=\"dialog\"], [role=\"alertdialog\"], [aria-modal=\"true\"]", Z = new EventTarget();
function Re(e) {
	for (let t of document.querySelectorAll(Le)) if (!e || !t.contains(e)) return !0;
	return !1;
}
var ze = /* @__PURE__ */ new Set([
	"button",
	"checkbox",
	"radio",
	"range",
	"color",
	"file",
	"submit",
	"reset",
	"image"
]);
function Be(e) {
	return e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement ? e : e instanceof HTMLInputElement ? ze.has(e.type) ? null : e : e instanceof HTMLElement && e.isContentEditable ? e : null;
}
function Ve(e, t) {
	let n = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
	n && (Object.getOwnPropertyDescriptor(n, "value")?.set?.call(e, t), e.dispatchEvent(new Event("input", { bubbles: !0 })));
}
// src/components/cashier/WeightPad.tsx
var He = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	",",
	"0",
	"del"
];
function Q({ productName: e, variantLabel: t, unit: r, pricePer: i, priceCents: c, initialQuantity: l, stock: u, confirmLabel: d = "Додати", onConfirm: f, onClose: p }) {
	let [m, h] = a(() => l ? se(l) : ""), [g, _] = a(l != null);
	n(() => {
		let e = (e) => {
			e.key === "Escape" && p();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [p]);
	let v = oe(m), b = ce(v, c, i), x = v != null && v > 0 ? j(v, c, i) : 0, S = I(r, i);
	function w(e) {
		h((t) => ae(t, e, g)), _(!1);
	}
	function T(e) {
		e.preventDefault(), !(b || v == null) && f(v, "manual");
	}
	return /* @__PURE__ */ o("div", {
		className: "fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ s("form", {
			role: "dialog",
			"aria-label": `Вага: ${e}`,
			onSubmit: T,
			noValidate: !0,
			className: "bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)] flex flex-col",
			"data-testid": "weight-pad",
			children: [
				/* @__PURE__ */ s("div", {
					className: "pl-5 pr-3 pt-4 pb-1 flex justify-between items-start gap-3",
					children: [/* @__PURE__ */ s("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ o("h3", {
							className: "text-[19px] font-bold text-sq-heading truncate",
							children: e
						}), /* @__PURE__ */ o("p", {
							className: "text-[14px] text-sq-secondary truncate tabular-nums",
							children: [t, R(c, r, i)].filter(Boolean).join(" · ")
						})]
					}), /* @__PURE__ */ o("button", {
						type: "button",
						onClick: p,
						"aria-label": "Закрити",
						className: "w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0",
						children: /* @__PURE__ */ o(C, { size: 20 })
					})]
				}),
				/* @__PURE__ */ s("div", {
					className: "px-5 pt-2 space-y-3",
					children: [
						/* @__PURE__ */ s("label", {
							className: "rounded-[14px] ring-2 ring-sq-blue px-4 py-3 flex flex-col cursor-text",
							children: [/* @__PURE__ */ s("span", {
								className: "text-[13px] text-sq-secondary flex items-center gap-2",
								children: ["Вага", /* @__PURE__ */ o("span", {
									className: "text-[11px] font-semibold uppercase tracking-wide text-sq-secondary bg-sq-sidebar rounded px-1.5 py-0.5",
									children: "вручну"
								})]
							}), /* @__PURE__ */ s("span", {
								className: "flex items-baseline gap-1.5 text-[30px] font-bold text-sq-heading tabular-nums",
								children: [/* @__PURE__ */ o("input", {
									"aria-label": `Вага, ${S}`,
									className: "min-w-0 w-full bg-transparent outline-none border-0 p-0",
									value: m,
									placeholder: "0,000",
									inputMode: "none",
									autoFocus: !0,
									onFocus: (e) => e.currentTarget.select(),
									onChange: (e) => {
										let t = e.target.value.replace(/\s/g, "").replace(".", ",");
										/^\d{0,3}(,\d{0,3})?$/.test(t) && (h(t), _(!1));
									},
									"data-testid": "weight-pad-input"
								}), /* @__PURE__ */ o("span", {
									className: "shrink-0",
									children: S
								})]
							})]
						}),
						/* @__PURE__ */ s("div", {
							className: "flex items-baseline justify-between gap-3 min-h-6",
							children: [m !== "" && b ? /* @__PURE__ */ o("p", {
								className: "text-[14px] text-sq-danger",
								role: "status",
								"data-testid": "weight-pad-problem",
								children: b
							}) : /* @__PURE__ */ s("p", {
								className: "text-[14px] text-sq-secondary tabular-nums",
								"data-testid": "weight-pad-sum",
								children: ["Сума ", /* @__PURE__ */ o("span", {
									className: "font-semibold text-sq-heading",
									children: O(x)
								})]
							}), u != null && /* @__PURE__ */ s("p", {
								className: "text-[13px] text-sq-muted tabular-nums shrink-0",
								children: ["за обліком ", L(u, r, i)]
							})]
						}),
						/* @__PURE__ */ s("p", {
							className: "text-[13px] text-sq-muted",
							children: [
								"Як на дисплеї ваг, у кілограмах. У чеку буде «",
								P,
								"»."
							]
						})
					]
				}),
				/* @__PURE__ */ o("div", {
					className: "px-5 pt-3 grid grid-cols-3 gap-2 auto-rows-fr",
					children: He.map((e) => /* @__PURE__ */ o("button", {
						type: "button",
						onClick: () => w(e),
						"aria-label": e === "del" ? "Стерти" : e === "," ? "Кома" : void 0,
						className: "min-h-14 rounded-xl bg-sq-sidebar hover:bg-sq-selected active:bg-sq-selected text-[22px] font-semibold text-sq-text grid place-items-center",
						"data-testid": `weight-pad-key-${e === "," ? "comma" : e}`,
						children: e === "del" ? /* @__PURE__ */ o(y, { size: 20 }) : e
					}, e))
				}),
				/* @__PURE__ */ o("div", {
					className: "p-5",
					children: /* @__PURE__ */ o("button", {
						type: "submit",
						disabled: b != null,
						className: "pos-btn-primary w-full min-h-[56px] rounded-xl text-[17px] tabular-nums",
						"data-testid": "weight-pad-confirm",
						children: b != null || v == null ? d : `${d} · ${L(v, r, i)} · ${O(x)}`
					})
				})
			]
		})
	});
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/typeof.js
function $(e) {
	"@babel/helpers - typeof";
	return $ = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, $(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPrimitive.js
function Ue(e, t) {
	if ($(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if ($(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPropertyKey.js
function We(e) {
	var t = Ue(e, "string");
	return $(t) == "symbol" ? t : t + "";
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/defineProperty.js
function Ge(e, t, n) {
	return (t = We(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
// src/modules/vertical-grocery/lib/hostPlatform.ts
var Ke = [
	"useSalesCatalog",
	"useCartStore",
	"assetUrl",
	"isWeighed",
	"displayUnit",
	"lineAmountCents",
	"cashierApi.getCatalog"
], qe = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), Ge(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function Je(e) {
	return typeof e == "function";
}
function Ye(e) {
	return e.split(".").reduce((e, t) => e?.[t], c);
}
function Xe() {
	return Ke.filter((e) => !Je(Ye(e)));
}
// src/modules/vertical-grocery/lib/tile.ts
function Ze(e) {
	if (e.length === 0) return {
		compareAtCents: null,
		disabled: !0
	};
	let t = e.filter((e) => f(e.price_per));
	if (t.length > 0 && t.length < e.length) return {
		compareAtCents: null,
		disabled: !1
	};
	let n = Math.min(...e.map((e) => e.price_cents)), r = Qe(e, n);
	if (t.length === e.length) {
		let t = new Set(e.map((e) => d(e.unit, e.price_per)));
		return t.size > 1 ? {
			compareAtCents: null,
			disabled: !1
		} : {
			priceCents: n,
			priceUnit: [...t][0],
			compareAtCents: r,
			disabled: !1
		};
	}
	let i = e.reduce((e, t) => e + t.quantity, 0);
	return {
		priceCents: n,
		compareAtCents: r,
		stock: i,
		disabled: i <= 0
	};
}
function Qe(e, t) {
	let n;
	for (let r of e) {
		if (r.price_cents !== t) continue;
		let e = r.compare_at_cents ?? null;
		if (n === void 0) n = e;
		else if (n !== e) return null;
	}
	return n != null && n > t ? n : null;
}
// src/modules/vertical-grocery/GroceryCatalog.tsx
var $e = t(() => import("./BarcodeScanner-CQcblLVh.js").then((e) => ({ default: e.BarcodeScanner })));
function et({ active: e, stockEpoch: t }) {
	let n = Xe();
	if (n.length > 0) throw new qe(n);
	return /* @__PURE__ */ o(tt, {
		active: e,
		stockEpoch: t
	});
}
function tt({ active: t, stockEpoch: r }) {
	let i = h(), c = p((e) => e.addItem), l = p((e) => e.addWeighed), d = p((e) => e.setBanner), m = T(), [_, v] = a(!1), [y, b] = a(null), [x, C] = a(null);
	n(() => {
		r > 0 && i.refresh();
	}, [r]);
	function w(e) {
		f(e.price_per) ? C(e) : c(e);
	}
	async function E(e) {
		let t = e.trim();
		if (!t) return;
		let n;
		try {
			n = await u.getCatalog({ barcode: t });
		} catch {
			d("Не вдалося знайти штрихкод — спробуйте ще раз");
			return;
		}
		n.length === 0 ? d("Штрихкод не знайдено") : n.length === 1 ? w(n[0]) : b(n);
	}
	function D(e) {
		e.length === 1 ? w(e[0]) : b(e);
	}
	return /* @__PURE__ */ s("section", {
		className: "flex flex-col min-h-0 bg-white",
		"data-testid": "grocery-catalog",
		children: [
			/* @__PURE__ */ o(Ie, {
				active: t && !y && !_ && !x,
				onScan: (e) => void E(e)
			}),
			/* @__PURE__ */ s("div", {
				className: "px-4 pt-3 pb-1 space-y-2 shrink-0",
				children: [/* @__PURE__ */ s("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ s("div", {
						className: "relative flex-1",
						children: [/* @__PURE__ */ o(S, {
							size: 20,
							className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
						}), /* @__PURE__ */ o("input", {
							className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
							placeholder: "Пошук або скан штрихкоду",
							value: i.query,
							onChange: (e) => i.setQuery(e.target.value)
						})]
					}), /* @__PURE__ */ o("button", {
						type: "button",
						onClick: () => v(!0),
						className: "min-h-12 min-w-12 grid place-items-center rounded-xl text-sq-blue bg-sq-empty hover:bg-sq-selected transition-colors",
						"aria-label": "Камера",
						children: /* @__PURE__ */ o(g, { size: 20 })
					})]
				}), !i.query.trim() && /* @__PURE__ */ o(Ae, {
					tags: i.catalogBarTags,
					activeId: i.catalogBarActiveId,
					showBack: i.showBack,
					backLabel: i.backLabel,
					onSelect: i.selectCatalogBarTag,
					onBack: i.goBackOne
				})]
			}),
			/* @__PURE__ */ s("div", {
				ref: m,
				className: "flex-1 overflow-auto px-4 pt-2 pb-4 bg-white select-none",
				children: [
					i.loading && /* @__PURE__ */ o("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ s("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3",
						children: [i.folderTiles.map((e) => /* @__PURE__ */ o(ie, {
							name: e.name,
							color: e.color,
							onClick: () => i.enterTag(e)
						}, e.id)), i.grouped.map(([e, t]) => {
							let n = t[0], r = Ze(t);
							return /* @__PURE__ */ o(ee, {
								name: n.product_name,
								subtitle: n.label,
								priceCents: r.priceCents,
								priceUnit: r.priceUnit,
								compareAtCents: r.compareAtCents,
								imageUrl: n.image_url,
								stock: r.stock,
								disabled: r.disabled,
								onClick: () => D(t),
								testId: `grocery-tile-${e}`
							}, e);
						})]
					}),
					!i.loading && i.folderTiles.length === 0 && i.grouped.length === 0 && /* @__PURE__ */ o("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			_ && /* @__PURE__ */ o(e, {
				fallback: null,
				children: /* @__PURE__ */ o($e, {
					onScan: (e) => {
						v(!1), E(e);
					},
					onClose: () => v(!1)
				})
			}),
			y && /* @__PURE__ */ o(ke, {
				productName: y[0]?.product_name ?? "",
				variants: y,
				onPick: (e) => {
					b(null), w(e);
				},
				onClose: () => b(null)
			}),
			x && /* @__PURE__ */ o(Q, {
				productName: x.product_name,
				variantLabel: x.label,
				unit: x.unit,
				pricePer: x.price_per ?? 1,
				priceCents: x.price_cents,
				stock: x.quantity,
				onConfirm: (e, t) => {
					l(x, e, t) === null && C(null);
				},
				onClose: () => C(null)
			})
		]
	});
}
export { et as default };
