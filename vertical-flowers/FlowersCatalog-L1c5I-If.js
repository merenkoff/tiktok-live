import { n as e, t } from "./flower-2-DQVy9i5h.js";
import { n, t as r } from "./BouquetPhoto-C0wJlYvp.js";
import { t as i } from "./trash-2-CBFgWIf2.js";
import { Suspense as a, lazy as o, useCallback as s, useEffect as c, useMemo as l, useRef as u, useState as d } from "react";
import { jsx as f, jsxs as p } from "react/jsx-runtime";
import * as m from "@pos/platform";
import { api as h, assetUrl as g, buildPriceTags as _, customBouquetLabel as v, formatUah as y, priceOfComponents as b, triggerPrint as x, uahInputToCents as S, useAuthStore as C, useCartStore as w, useOfflineStatus as T, useSalesCatalog as E, useVertical as ee, withLabour as D } from "@pos/platform";
import { createPortal as O } from "react-dom";
//#region node_modules/lucide-react/dist/esm/icons/book-marked.js
var k = e("BookMarked", [["path", {
	d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20",
	key: "t4utmx"
}], ["polyline", {
	points: "10 2 10 10 13 7 16 10 16 2",
	key: "13o6vz"
}]]), A = e("ChevronDown", [["path", {
	d: "m6 9 6 6 6-6",
	key: "qrunsl"
}]]), j = e("Delete", [
	["path", {
		d: "M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z",
		key: "1oy587"
	}],
	["line", {
		x1: "18",
		x2: "12",
		y1: "9",
		y2: "15",
		key: "1olkx5"
	}],
	["line", {
		x1: "12",
		x2: "18",
		y1: "9",
		y2: "15",
		key: "1n50pc"
	}]
]), M = e("Folder", [["path", {
	d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	key: "1kt360"
}]]), N = e("Minus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}]]), te = e("Plus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}], ["path", {
	d: "M12 5v14",
	key: "s699le"
}]]), P = e("Printer", [
	["path", {
		d: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
		key: "143wyd"
	}],
	["path", {
		d: "M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
		key: "1itne7"
	}],
	["rect", {
		x: "6",
		y: "14",
		width: "12",
		height: "8",
		rx: "1",
		key: "1ue0tg"
	}]
]), F = e("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), ne = e("Store", [
	["path", {
		d: "m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",
		key: "ztvudi"
	}],
	["path", {
		d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
		key: "1b2hhj"
	}],
	["path", {
		d: "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",
		key: "2ebpfo"
	}],
	["path", {
		d: "M2 7h20",
		key: "1fcdvo"
	}],
	["path", {
		d: "M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7",
		key: "jon5kx"
	}]
]), I = e("X", [["path", {
	d: "M18 6 6 18",
	key: "1bl5f8"
}], ["path", {
	d: "m6 6 12 12",
	key: "d8bk6v"
}]]), L = 6;
function R() {
	let e = u(null);
	return c(() => {
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
			!n.moved && Math.hypot(r, i) > L && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
//#endregion
//#region src/lib/money.ts
function z(e) {
	return `${(e / 100).toFixed(2).replace(".", ",")} ₴`;
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function B({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: o, count: s, onMore: c, badge: l }) {
	let [u, m] = d(!1), h = u ? null : g(r), _ = /* @__PURE__ */ p("button", {
		type: "button",
		disabled: o,
		onClick: a,
		className: `${c ? "w-full h-full" : "aspect-square"} rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${s ? "ring-2 ring-sq-blue" : ""}`,
		children: [
			h ? /* @__PURE__ */ f("img", {
				src: h,
				alt: "",
				className: "absolute inset-0 w-full h-full object-cover pointer-events-none",
				onError: () => m(!0)
			}) : /* @__PURE__ */ f("div", {
				className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
				children: t || " "
			}),
			/* @__PURE__ */ f("div", { className: "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" }),
			/* @__PURE__ */ p("div", {
				className: "absolute bottom-2 left-2 right-2 text-white pointer-events-none",
				children: [/* @__PURE__ */ f("p", {
					className: "text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm",
					children: e
				}), n != null && /* @__PURE__ */ f("p", {
					className: "text-[12px] mt-0.5 opacity-95 drop-shadow-sm",
					children: z(n)
				})]
			}),
			s != null && s > 0 && /* @__PURE__ */ f("span", {
				className: "absolute top-2 left-2 min-w-7 h-7 px-1.5 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-semibold tabular-nums shadow-sm pointer-events-none",
				"data-testid": "tile-count",
				children: s
			}),
			l ? /* @__PURE__ */ f("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				"data-testid": "tile-badge",
				children: l
			}) : i != null && i <= 0 && /* @__PURE__ */ f("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				children: "немає"
			})
		]
	});
	return c ? /* @__PURE__ */ p("div", {
		className: "relative aspect-square",
		children: [_, !o && /* @__PURE__ */ f("button", {
			type: "button",
			onClick: c,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-1 right-1 w-11 h-11 grid place-items-center rounded-full bg-black/45 text-white text-xl leading-none shadow-sm hover:bg-black/60",
			"data-testid": "tile-more",
			children: "⋯"
		})]
	}) : _;
}
//#endregion
//#region src/lib/tagColors.ts
var V = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], H = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, U = "slate";
function re(e) {
	return !!e && V.includes(e);
}
function ie(e) {
	return re(e) ? H[e] : H[U];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function W({ name: e, color: t, onClick: n }) {
	let r = ie(t);
	return /* @__PURE__ */ p("button", {
		type: "button",
		onClick: n,
		className: "aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]",
		style: { backgroundColor: r },
		children: [/* @__PURE__ */ f(M, {
			size: 22,
			strokeWidth: 1.75,
			className: "text-white/95 absolute top-2.5 left-2.5"
		}), /* @__PURE__ */ f("span", {
			className: "absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white",
			children: e
		})]
	});
}
//#endregion
//#region src/components/cashier/VariantPicker.tsx
function ae({ productName: e, variants: t, onPick: n, onClose: r }) {
	let i = R(), a = [...t].sort((e, t) => e.quantity <= 0 && t.quantity > 0 ? 1 : e.quantity > 0 && t.quantity <= 0 ? -1 : 0);
	return /* @__PURE__ */ f("div", {
		className: "fixed inset-0 z-40 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ p("div", {
			className: "bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg",
			children: [/* @__PURE__ */ p("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex justify-between items-center gap-3",
				children: [/* @__PURE__ */ f("h3", {
					className: "font-semibold text-sq-text truncate",
					children: e
				}), /* @__PURE__ */ f("button", {
					type: "button",
					onClick: r,
					className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
					children: "Закрити"
				})]
			}), /* @__PURE__ */ f("ul", {
				ref: i,
				className: "divide-y divide-sq-divider max-h-[60vh] overflow-auto select-none",
				children: a.map((e) => {
					let t = e.label || "Стандарт", r = e.quantity <= 0;
					return /* @__PURE__ */ f("li", { children: /* @__PURE__ */ p("button", {
						type: "button",
						disabled: r,
						onClick: () => n(e),
						className: "w-full min-h-14 text-left px-4 py-3.5 disabled:opacity-50 hover:bg-sq-bg focus-visible:bg-sq-bg outline-none",
						children: [/* @__PURE__ */ p("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ f("span", {
								className: `font-medium ${r ? "text-sq-muted" : "text-sq-blue"}`,
								children: t
							}), /* @__PURE__ */ f("span", {
								className: "font-medium text-sq-text shrink-0",
								children: z(e.price_cents)
							})]
						}), /* @__PURE__ */ f("p", {
							className: `text-xs mt-1 ${r ? "text-red-600" : "text-sq-secondary"}`,
							children: r ? "Немає в наявності" : `${e.quantity} шт`
						})]
					}) }, e.variant_id);
				})
			})]
		})
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function oe({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = R(), s = (e) => `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${e ? "font-semibold text-sq-text border-sq-text" : "font-medium text-sq-secondary border-transparent"}`;
	return /* @__PURE__ */ p("div", {
		ref: o,
		className: "flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none",
		children: [
			n && /* @__PURE__ */ p("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap",
				children: ["‹ ", r]
			}),
			/* @__PURE__ */ f("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ f("button", {
				type: "button",
				onClick: () => i(e),
				className: s(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
//#endregion
//#region src/components/cashier/ScanWedge.tsx
function G({ active: e, onScan: t }) {
	let n = u(null);
	return c(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ f("input", {
		ref: n,
		className: "sr-only",
		"aria-hidden": !0,
		tabIndex: -1,
		onKeyDown: (e) => {
			if (e.key !== "Enter") return;
			let n = e.target, r = n.value;
			n.value = "", r.trim() && t(r);
		}
	});
}
//#endregion
//#region src/lib/ean13.ts
var K = [
	"0001101",
	"0011001",
	"0010011",
	"0111101",
	"0100011",
	"0110001",
	"0101111",
	"0111011",
	"0110111",
	"0001011"
], q = [
	"0100111",
	"0110011",
	"0011011",
	"0100001",
	"0011101",
	"0111001",
	"0000101",
	"0010001",
	"0001001",
	"0010111"
], J = K.map((e) => e.replace(/[01]/g, (e) => e === "0" ? "1" : "0")), se = [
	"LLLLLL",
	"LLGLGG",
	"LLGGLG",
	"LLGGGL",
	"LGLLGG",
	"LGGLLG",
	"LGGGLL",
	"LGLGLG",
	"LGLGGL",
	"LGGLGL"
], Y = "101", X = "01010", ce = "101", le = [
	0,
	2,
	46,
	48,
	92,
	94
];
function ue(e) {
	return /^\d{13}$/.test(e);
}
function de(e) {
	let t = 0;
	for (let n = 0; n < e.length; n += 1) {
		let r = e.charCodeAt(n) - 48;
		t += n % 2 == 0 ? r : r * 3;
	}
	return (10 - t % 10) % 10;
}
function fe(e) {
	return ue(e) ? de(e.slice(0, 12)) === e.charCodeAt(12) - 48 : !1;
}
function pe(e) {
	if (!ue(e)) throw Error(`not an EAN-13: ${e}`);
	let t = [...e].map(Number), n = se[t[0]];
	return `${Y}${t.slice(1, 7).map((e, t) => n[t] === "L" ? K[e] : q[e]).join("")}${X}${t.slice(7).map((e) => J[e]).join("")}${ce}`;
}
function me(e) {
	let t = pe(e), n = [], r = 0;
	for (let e = 0; e < t.length; e++) {
		if (t[e] === "1") {
			r += 1;
			continue;
		}
		r > 0 && n.push([e - r, r]), r = 0;
	}
	return r > 0 && n.push([t.length - r, r]), n;
}
//#endregion
//#region src/lib/priceTagLayout.ts
var he = {
	58: .75,
	80: .5
}, ge = {
	58: 48,
	80: 72
};
function _e(e) {
	return Math.min(e * he[e], ge[e]);
}
function ve(e) {
	return _e(e) / 117;
}
function ye(e) {
	return ve(e) * 56;
}
function be(e) {
	return `${Math.round(e * 1e3) / 1e3}mm`;
}
function xe(e) {
	return {
		"--tag-w": be(_e(e)),
		"--tag-barcode-h": be(ye(e))
	};
}
//#endregion
//#region src/lib/priceTag.ts
function Se(e) {
	return e.flatMap((e) => Array.from({ length: e.copies }, () => e));
}
//#endregion
//#region src/components/PriceTagsPrintable.tsx
function Ce(e) {
	return (e / 100).toFixed(2).replace(/\.00$/, "");
}
function we({ code: e }) {
	if (!fe(e)) return null;
	let t = [...e];
	return /* @__PURE__ */ p("svg", {
		className: "price-tag-barcode",
		viewBox: "0 0 117 56",
		preserveAspectRatio: "none",
		role: "img",
		"aria-label": e,
		children: [
			/* @__PURE__ */ f("rect", {
				x: 0,
				y: 0,
				width: 117,
				height: 56,
				fill: "#fff"
			}),
			/* @__PURE__ */ f("g", {
				shapeRendering: "crispEdges",
				fill: "#000",
				children: me(e).map(([e, t]) => /* @__PURE__ */ f("rect", {
					x: 11 + e,
					y: 0,
					width: t,
					height: le.includes(e) ? 45 : 40
				}, e))
			}),
			/* @__PURE__ */ p("g", {
				fill: "#000",
				fontFamily: "'Courier New', monospace",
				fontSize: 9,
				textAnchor: "middle",
				children: [
					/* @__PURE__ */ f("text", {
						x: 11 / 2,
						y: 54,
						children: t[0]
					}),
					t.slice(1, 7).map((e, t) => /* @__PURE__ */ f("text", {
						x: 14 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `l${t}`)),
					t.slice(7).map((e, t) => /* @__PURE__ */ f("text", {
						x: 61 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `r${t}`))
				]
			})
		]
	});
}
function Te({ tags: e, paperWidth: t }) {
	return !e || typeof document > "u" ? null : O(/* @__PURE__ */ f("div", {
		className: "price-tag-print-area",
		"data-paper": t,
		style: xe(t),
		children: Se(e).map((e, t) => /* @__PURE__ */ p("div", {
			className: "price-tag",
			children: [
				/* @__PURE__ */ f("p", {
					className: "price-tag-store",
					children: e.storeName
				}),
				/* @__PURE__ */ f("p", {
					className: "price-tag-name",
					children: e.productName
				}),
				e.variantLabel && /* @__PURE__ */ f("p", {
					className: "price-tag-variant",
					children: e.variantLabel
				}),
				/* @__PURE__ */ p("p", {
					className: "price-tag-price",
					children: [Ce(e.priceCents), " ₴"]
				}),
				e.barcode ? /* @__PURE__ */ f(we, { code: e.barcode }) : /* @__PURE__ */ f("p", {
					className: "price-tag-digits",
					children: "без штрихкоду"
				}),
				e.sku && /* @__PURE__ */ f("p", {
					className: "price-tag-sku",
					children: e.sku
				})
			]
		}, t))
	}), document.body);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function Z(e) {
	"@babel/helpers - typeof";
	return Z = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, Z(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function Ee(e, t) {
	if (Z(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (Z(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function De(e) {
	var t = Ee(e, "string");
	return Z(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function Oe(e, t, n) {
	return (t = De(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-flowers/lib/hostPlatform.ts
var ke = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical",
	"withLabour",
	"priceOfComponents",
	"customBouquetLabel",
	"buildPriceTags",
	"triggerPrint",
	"assetUrl"
], Ae = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), Oe(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function je(e) {
	return typeof e == "function";
}
function Me() {
	let e = m;
	return ke.filter((t) => !je(e[t]));
}
//#endregion
//#region src/modules/vertical-flowers/bench/RecipeSheet.tsx
function Ne({ computedCents: e, components: t, onSaved: n, onClose: i }) {
	let [a, o] = d(""), [s, c] = d((e / 100).toFixed(2).replace(".", ",")), [l, u] = d(null), [m, g] = d(!1), [_, v] = d(null), b = S(s), x = b !== e;
	async function C() {
		g(!0), v(null);
		try {
			n((await h.saveBouquetRecipe({
				name: a.trim(),
				components: t,
				price_cents: x ? b : null,
				image_url: l
			})).name);
		} catch (e) {
			let t = e.response?.data?.error;
			v(t || "Не вдалося зберегти рецепт");
		} finally {
			g(!1);
		}
	}
	return /* @__PURE__ */ f("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ p("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			"data-testid": "recipe-sheet",
			children: [/* @__PURE__ */ p("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ f("h3", {
					className: "font-semibold text-sq-text",
					children: "Зберегти як рецепт"
				}), /* @__PURE__ */ f("button", {
					type: "button",
					onClick: i,
					disabled: m,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ f(I, { size: 20 })
				})]
			}), /* @__PURE__ */ p("div", {
				className: "p-4 space-y-4",
				children: [
					/* @__PURE__ */ f("p", {
						className: "text-xs text-sq-muted",
						children: "Букет лишиться на столі — рецепт це шаблон, який можна збирати знову. Стебла зараз не списуються."
					}),
					/* @__PURE__ */ f(r, {
						value: l,
						onChange: u,
						disabled: m
					}),
					/* @__PURE__ */ p("label", {
						className: "block",
						children: [/* @__PURE__ */ f("span", {
							className: "text-sm text-sq-secondary",
							children: "Назва рецепта"
						}), /* @__PURE__ */ f("input", {
							className: "pos-field mt-1.5",
							value: a,
							onChange: (e) => o(e.target.value),
							placeholder: "Весняний",
							autoFocus: !0,
							"data-testid": "recipe-name"
						})]
					}),
					/* @__PURE__ */ p("label", {
						className: "block",
						children: [
							/* @__PURE__ */ f("span", {
								className: "text-sm text-sq-secondary",
								children: "Ціна"
							}),
							/* @__PURE__ */ f("input", {
								className: "pos-field mt-1.5 text-lg",
								inputMode: "decimal",
								value: s,
								onChange: (e) => c(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "recipe-price"
							}),
							/* @__PURE__ */ f("span", {
								className: "mt-1 block text-xs text-sq-muted",
								children: x ? `Розраховано: ${y(e)}` : "Стебла та робота флориста"
							})
						]
					}),
					_ && /* @__PURE__ */ f("p", {
						className: "text-sm text-red-600",
						"data-testid": "recipe-error",
						children: _
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						disabled: m || !a.trim() || b <= 0,
						onClick: () => void C(),
						className: "sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2",
						"data-testid": "recipe-submit",
						children: [/* @__PURE__ */ f(k, { size: 18 }), m ? "Зберігаємо…" : "Зберегти рецепт"]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/ShowcaseSheet.tsx
function Pe({ computedCents: e, busy: t, error: n, onSubmit: i, onClose: a }) {
	let [o, s] = d(""), [c, l] = d((e / 100).toFixed(2).replace(".", ",")), [u, m] = d(null), h = S(c), g = h !== e;
	function _(e) {
		i({
			name: o.trim() || null,
			priceCents: g ? h : null,
			imageUrl: u,
			print: e
		});
	}
	return /* @__PURE__ */ f("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ p("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			"data-testid": "showcase-sheet",
			children: [/* @__PURE__ */ p("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ f("h3", {
					className: "font-semibold text-sq-text",
					children: "Букет на вітрину"
				}), /* @__PURE__ */ f("button", {
					type: "button",
					onClick: a,
					disabled: t,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ f(I, { size: 20 })
				})]
			}), /* @__PURE__ */ p("div", {
				className: "p-4 space-y-4",
				children: [
					/* @__PURE__ */ f(r, {
						value: u,
						onChange: m,
						disabled: t
					}),
					/* @__PURE__ */ p("label", {
						className: "block",
						children: [/* @__PURE__ */ f("span", {
							className: "text-sm text-sq-secondary",
							children: "Назва"
						}), /* @__PURE__ */ f("input", {
							className: "pos-field mt-1.5",
							value: o,
							onChange: (e) => s(e.target.value),
							placeholder: "Букет №… — за номером документа",
							"data-testid": "showcase-name"
						})]
					}),
					/* @__PURE__ */ p("label", {
						className: "block",
						children: [
							/* @__PURE__ */ f("span", {
								className: "text-sm text-sq-secondary",
								children: "Ціна на цінник"
							}),
							/* @__PURE__ */ f("input", {
								className: "pos-field mt-1.5 text-lg",
								inputMode: "decimal",
								value: c,
								onChange: (e) => l(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "showcase-price"
							}),
							/* @__PURE__ */ f("span", {
								className: "mt-1 block text-xs text-sq-muted",
								children: g ? `Розраховано: ${y(e)}` : "Стебла та робота флориста"
							})
						]
					}),
					n && /* @__PURE__ */ f("p", {
						className: "text-sm text-red-600",
						"data-testid": "showcase-error",
						children: n
					}),
					/* @__PURE__ */ p("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ p("button", {
							type: "button",
							disabled: t || h <= 0,
							onClick: () => _(!0),
							className: "sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2",
							"data-testid": "showcase-submit-print",
							children: [/* @__PURE__ */ f(P, { size: 18 }), t ? "Робимо…" : "Зробити і надрукувати цінник"]
						}), /* @__PURE__ */ f("button", {
							type: "button",
							disabled: t || h <= 0,
							onClick: () => _(!1),
							className: "min-h-12 w-full rounded-sq border border-sq-divider text-sq-text disabled:opacity-50",
							"data-testid": "showcase-submit",
							children: "Зробити без цінника"
						})]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/BudgetBar.tsx
function Q({ totalCents: e, budgetCents: t, ratio: n, remainingCents: r, over: i, nextStems: a, onOpenBudget: o }) {
	return t == null ? /* @__PURE__ */ f("button", {
		type: "button",
		onClick: o,
		className: "w-full min-h-11 rounded-sq border border-dashed border-sq-divider text-sm text-sq-secondary hover:text-sq-text hover:border-sq-blue",
		"data-testid": "bench-set-budget",
		children: "Поставити бюджет"
	}) : /* @__PURE__ */ p("div", {
		"data-testid": "bench-budget",
		children: [/* @__PURE__ */ f("div", {
			className: "h-2.5 rounded-full bg-sq-bg overflow-hidden",
			children: /* @__PURE__ */ f("div", {
				className: `h-full rounded-full transition-[width] duration-150 ${i ? "bg-red-500" : "bg-sq-blue"}`,
				style: { width: `${Math.round(n * 100)}%` }
			})
		}), /* @__PURE__ */ p("button", {
			type: "button",
			onClick: o,
			className: "mt-1.5 w-full min-h-11 flex items-baseline justify-between gap-3 text-left",
			children: [/* @__PURE__ */ f("span", {
				className: `text-sm ${i ? "text-red-600 font-medium" : "text-sq-secondary"}`,
				children: i ? `Перебір на ${y(-r)}` : a != null && a > 0 ? `Ще ≈${a} ${Fe(a)}` : "У бюджеті"
			}), /* @__PURE__ */ p("span", {
				className: "text-sm text-sq-secondary tabular-nums shrink-0",
				children: [
					y(e),
					" / ",
					y(t)
				]
			})]
		})]
	});
}
function Fe(e) {
	let t = e % 100;
	if (t >= 11 && t <= 14) return "стебел";
	switch (e % 10) {
		case 1: return "стебло";
		case 2:
		case 3:
		case 4: return "стебла";
		default: return "стебел";
	}
}
//#endregion
//#region src/modules/vertical-flowers/bench/CompositionPanel.tsx
function Ie({ stems: e, totals: t, labourBps: n, selectedId: r, onSelect: a, onStep: o, onRemove: s }) {
	let l = R(), d = u(null);
	return c(() => {
		d.current?.scrollIntoView({ block: "nearest" });
	}, [r, e.length]), /* @__PURE__ */ p("div", {
		className: "flex flex-col min-h-0 flex-1",
		"data-testid": "bench-composition",
		children: [e.length === 0 ? /* @__PURE__ */ f("div", {
			className: "flex-1 grid place-items-center p-6 text-center",
			children: /* @__PURE__ */ f("p", {
				className: "text-sm text-sq-muted max-w-[22ch]",
				children: "Торкніться квітки, щоб покласти її в букет"
			})
		}) : /* @__PURE__ */ f("ul", {
			ref: l,
			className: "flex-1 overflow-auto divide-y divide-sq-divider select-none",
			children: e.map((e) => /* @__PURE__ */ p("li", {
				ref: e.item.variant_id === r ? d : void 0,
				className: `px-4 py-3 border-l-4 ${e.item.variant_id === r ? "border-sq-blue" : "border-transparent"}`,
				"data-testid": "bench-stem",
				"data-selected": e.item.variant_id === r ? "true" : void 0,
				children: [
					/* @__PURE__ */ p("div", {
						className: "flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ f("p", {
							className: "font-medium text-sq-text truncate",
							children: e.item.product_name
						}), /* @__PURE__ */ f("p", {
							className: "text-sm font-medium text-sq-text tabular-nums shrink-0",
							children: y(e.item.price_cents * e.quantity)
						})]
					}),
					e.item.label && /* @__PURE__ */ f("p", {
						className: "text-xs text-sq-secondary truncate mt-0.5",
						children: e.item.label
					}),
					/* @__PURE__ */ p("div", {
						className: "mt-2 flex items-center gap-2",
						children: [
							/* @__PURE__ */ f("button", {
								type: "button",
								onClick: () => o(e.item.variant_id, -1),
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white",
								"aria-label": `Менше: ${e.item.product_name}`,
								children: /* @__PURE__ */ f(N, { size: 18 })
							}),
							/* @__PURE__ */ f("button", {
								type: "button",
								onClick: () => a(e.item.variant_id),
								className: `min-h-11 min-w-12 rounded-sq text-center text-base font-semibold tabular-nums ${e.item.variant_id === r ? "text-sq-blue ring-2 ring-sq-blue" : "text-sq-text"}`,
								"aria-label": `Набрати кількість: ${e.item.product_name}`,
								"data-testid": "bench-stem-qty",
								children: e.quantity
							}),
							/* @__PURE__ */ f("button", {
								type: "button",
								onClick: () => o(e.item.variant_id, 1),
								disabled: e.quantity >= e.item.quantity,
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white disabled:opacity-40",
								"aria-label": `Більше: ${e.item.product_name}`,
								children: /* @__PURE__ */ f(te, { size: 18 })
							}),
							/* @__PURE__ */ p("span", {
								className: "text-xs text-sq-muted ml-1 truncate",
								children: [
									e.item.quantity,
									" ",
									e.item.unit,
									" на полиці"
								]
							}),
							/* @__PURE__ */ f("button", {
								type: "button",
								onClick: () => s(e.item.variant_id),
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-muted hover:text-red-600 ml-auto shrink-0",
								"aria-label": `Прибрати: ${e.item.product_name}`,
								children: /* @__PURE__ */ f(i, { size: 18 })
							})
						]
					})
				]
			}, e.item.variant_id))
		}), /* @__PURE__ */ p("div", {
			className: "border-t border-sq-divider px-4 py-3 space-y-1.5 bg-white shrink-0",
			children: [
				/* @__PURE__ */ f(Le, {
					label: "Квіти",
					valueCents: t.partsCents
				}),
				n > 0 && /* @__PURE__ */ f(Le, {
					label: `Робота (${Re(n)})`,
					valueCents: t.labourCents
				}),
				/* @__PURE__ */ p("div", {
					className: "flex items-baseline justify-between gap-3 pt-1.5 border-t border-sq-divider",
					children: [/* @__PURE__ */ f("span", {
						className: "font-semibold text-sq-text",
						children: "Разом"
					}), /* @__PURE__ */ f("span", {
						className: "text-xl font-semibold text-sq-text tabular-nums",
						"data-testid": "bench-total",
						children: y(t.totalCents)
					})]
				})
			]
		})]
	});
}
function Le({ label: e, valueCents: t }) {
	return /* @__PURE__ */ p("div", {
		className: "flex items-baseline justify-between gap-3",
		children: [/* @__PURE__ */ f("span", {
			className: "text-sm text-sq-secondary",
			children: e
		}), /* @__PURE__ */ f("span", {
			className: "text-sm text-sq-text tabular-nums",
			children: y(t)
		})]
	});
}
function Re(e) {
	let t = e / 100;
	return `${Number.isInteger(t) ? t : t.toFixed(1).replace(".", ",")}%`;
}
//#endregion
//#region src/modules/vertical-flowers/bench/QuantityPad.tsx
var ze = [
	1,
	2,
	3,
	4,
	5,
	6,
	7,
	8,
	9
];
function Be({ targetName: e, onDigit: t, onBackspace: n }) {
	let r = e == null;
	return /* @__PURE__ */ p("div", {
		className: "px-3 py-2 border-t border-sq-divider bg-white",
		"data-testid": "bench-pad",
		children: [/* @__PURE__ */ f("p", {
			className: "text-xs text-sq-muted mb-1.5 truncate h-4",
			children: r ? "Торкніться квітки, щоб набрати кількість" : `Кількість: ${e}`
		}), /* @__PURE__ */ p("div", {
			className: "grid grid-cols-5 gap-1.5",
			children: [ze.map((e) => /* @__PURE__ */ f("button", {
				type: "button",
				disabled: r,
				onClick: () => t(e),
				className: "min-h-11 rounded-sq border border-sq-divider bg-white text-base font-semibold text-sq-text disabled:opacity-40",
				"data-testid": `bench-pad-${e}`,
				children: e
			}, e)), /* @__PURE__ */ f("button", {
				type: "button",
				disabled: r,
				onClick: n,
				className: "min-h-11 rounded-sq border border-sq-divider bg-white grid place-items-center text-sq-secondary disabled:opacity-40",
				"aria-label": "Стерти цифру",
				"data-testid": "bench-pad-backspace",
				children: /* @__PURE__ */ f(j, { size: 18 })
			})]
		})]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/StemGrid.tsx
function Ve({ grouped: e, folderTiles: t, loading: n, defaultUnit: r, countOf: i, onPick: a, onEnterTag: o }) {
	let s = R();
	return /* @__PURE__ */ p("div", {
		ref: s,
		className: "flex-1 overflow-auto p-3 bg-white select-none",
		"data-testid": "bench-grid",
		children: [
			n && /* @__PURE__ */ f("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			/* @__PURE__ */ p("div", {
				className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2",
				children: [t.map((e) => /* @__PURE__ */ f(W, {
					name: e.name,
					color: e.color,
					onClick: () => o(e)
				}, e.id)), e.map(([e, t]) => {
					let n = t[0], o = Math.min(...t.map((e) => e.price_cents)), s = t.reduce((e, t) => e + t.quantity, 0), c = t.reduce((e, t) => e + i(t.variant_id), 0), l = n.unit || r;
					return /* @__PURE__ */ f(B, {
						name: n.product_name,
						subtitle: [n.label, `${s} ${l}`].filter(Boolean).join(" · "),
						priceCents: o,
						imageUrl: n.image_url,
						stock: s,
						count: c,
						disabled: s <= 0,
						onClick: () => a(t)
					}, e);
				})]
			}),
			!n && t.length === 0 && e.length === 0 && /* @__PURE__ */ f("div", {
				className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
				children: "Порожньо"
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/stems.ts
function He(e) {
	return (e.kind ?? "simple") !== "composite";
}
function $(e) {
	return e.kind === "composite" && e.stock_mode === "derived";
}
//#endregion
//#region src/modules/vertical-flowers/bench/useBench.ts
function Ue(e) {
	let [t, n] = d([]), [r, i] = d(null), [a, o] = d(null), [c, u] = d(!1), f = s((e) => t.find((t) => t.item.variant_id === e)?.quantity ?? 0, [t]), p = s((e, t = 1) => {
		o(e.variant_id), u(!1), n((n) => {
			let r = n.findIndex((t) => t.item.variant_id === e.variant_id);
			if (r === -1) return t <= 0 ? n : [...n, {
				item: e,
				quantity: Math.min(t, Math.max(0, e.quantity))
			}];
			let i = [...n], a = i[r].quantity + t, o = Math.min(a, Math.max(0, e.quantity));
			return o <= 0 ? i.filter((e, t) => t !== r) : (i[r] = {
				...i[r],
				quantity: o
			}, i);
		});
	}, []), m = s((e, t) => {
		n((n) => {
			let r = n.findIndex((t) => t.item.variant_id === e);
			if (r === -1) return n;
			let i = Math.min(Math.max(0, t), Math.max(0, n[r].item.quantity));
			if (i <= 0) return n.filter((e, t) => t !== r);
			let a = [...n];
			return a[r] = {
				...a[r],
				quantity: i
			}, a;
		});
	}, []), h = s(() => {
		n([]), i(null), o(null), u(!1);
	}, []), g = s((e) => {
		let t = e.map(({ item: e, quantity: t }) => ({
			item: e,
			quantity: Math.min(t, Math.max(0, e.quantity))
		})).filter((e) => e.quantity > 0);
		n(t), o(t.length > 0 ? t[t.length - 1].item.variant_id : null), u(!1);
	}, []), _ = s((e) => {
		o(e), u(!1);
	}, []), v = s((e) => {
		a != null && (n((t) => {
			let n = t.findIndex((e) => e.item.variant_id === a);
			if (n === -1) return t;
			let r = c ? t[n].quantity * 10 + e : e, i = Math.min(r, Math.max(0, t[n].item.quantity));
			if (i <= 0) return t;
			let o = [...t];
			return o[n] = {
				...o[n],
				quantity: i
			}, o;
		}), u(!0));
	}, [a, c]), y = s(() => {
		a != null && n((e) => {
			let t = e.findIndex((e) => e.item.variant_id === a);
			if (t === -1) return e;
			let n = Math.floor(e[t].quantity / 10);
			if (n <= 0) return e.filter((e, n) => n !== t);
			let r = [...e];
			return r[t] = {
				...r[t],
				quantity: n
			}, r;
		});
	}, [a]), x = l(() => t.map((e) => ({
		component_variant_id: e.item.variant_id,
		quantity: e.quantity,
		product_name: e.item.product_name,
		label: e.item.label,
		unit: e.item.unit,
		unit_price_cents: e.item.price_cents
	})), [t]);
	return {
		stems: t,
		countOf: f,
		add: p,
		setQuantity: m,
		clear: h,
		totals: l(() => {
			let n = new Map(t.map((e) => [e.item.variant_id, e.item])), r = b(x.map((e) => ({
				component_variant_id: e.component_variant_id,
				quantity: e.quantity
			})), n, 0), i = D(r, e);
			return {
				partsCents: r,
				labourCents: i - r,
				totalCents: i,
				stemCount: t.reduce((e, t) => e + t.quantity, 0)
			};
		}, [
			t,
			x,
			e
		]),
		labourBps: e,
		budgetCents: r,
		setBudgetCents: i,
		components: x,
		selectedId: a,
		select: _,
		typeDigit: v,
		backspace: y,
		loadComposition: g
	};
}
function We(e, t, n, r) {
	if (t == null || t <= 0) return {
		ratio: 0,
		remainingCents: 0,
		over: !1,
		nextStems: null
	};
	let i = t - e, a = n && n > 0 ? D(n, r) : 0;
	return {
		ratio: Math.min(1, e / t),
		remainingCents: i,
		over: i < 0,
		nextStems: a > 0 && i > 0 ? Math.floor(i / a) : null
	};
}
//#endregion
//#region src/modules/vertical-flowers/bench/FloristBench.tsx
function Ge(e) {
	return e.response?.data?.error || "Не вдалося зробити букет. Спробуйте ще раз.";
}
function Ke() {
	try {
		return localStorage.getItem("pos.priceTagPaperWidth") === "80" ? 80 : 58;
	} catch {
		return 58;
	}
}
function qe({ card: e, labourBps: t, catalog: n, onDone: r, onShowcased: i, onRecipeSaved: a, onClose: o }) {
	let s = Ue(t), m = ee(), [g, v] = d(null), [b, S] = d(!1), [w, E] = d(!1), D = T((e) => e.online), O = C((e) => e.auth?.store.name ?? ""), [j, M] = d(!1), [N, te] = d(null), [P, L] = d(null), [R, z] = d(!1), [B, V] = d(null), [H, U] = d(null);
	c(() => {
		if (!H) return;
		let e = () => U(null);
		window.addEventListener("afterprint", e);
		let t = requestAnimationFrame(x);
		return () => {
			window.removeEventListener("afterprint", e), cancelAnimationFrame(t);
		};
	}, [H]);
	async function re(e) {
		if (P) {
			z(!0), V(null);
			try {
				let t = await h.assembleShowcase({
					client_uuid: P.uuid,
					components: s.components.map((e) => ({
						component_variant_id: e.component_variant_id,
						quantity: e.quantity
					})),
					name: e.name,
					price_cents: e.priceCents,
					image_url: e.imageUrl
				});
				e.print && U(_(O, [{
					product: { name: t.name },
					variant: {
						id: t.variant_id,
						label: "",
						unit: "шт",
						price_cents: t.price_cents,
						sku: null,
						barcode: t.barcode,
						quantity: 1
					},
					copies: 1
				}])), n.refresh(), i(t.name, t.price_cents);
			} catch (e) {
				V(Ge(e));
			} finally {
				z(!1);
			}
		}
	}
	let ie = l(() => n.grouped.map(([e, t]) => [e, t.filter(He)]).filter(([, e]) => e.length > 0).map(([e, t]) => [e, t]), [n.grouped]), W = u(!1);
	c(() => {
		if (W.current) return;
		let t = e.components ?? [];
		if (t.length === 0 || n.loading) return;
		W.current = !0;
		let r = new Map(n.grouped.flatMap(([, e]) => e).map((e) => [e.variant_id, e])), i = t.map((e) => {
			let t = r.get(e.component_variant_id);
			return t ? {
				item: t,
				quantity: e.quantity
			} : null;
		}).filter((e) => e !== null);
		s.loadComposition(i), i.length < t.length && te("Деяких квітів із рецепта вже немає — перевірте склад");
	}, [
		e,
		n.loading,
		n.grouped
	]);
	let K = s.stems.length > 0 ? s.stems[s.stems.length - 1].item : null, q = We(s.totals.totalCents, s.budgetCents, K?.price_cents ?? null, t);
	function J(e) {
		if (e.length === 1) {
			s.add(e[0]);
			return;
		}
		v(e);
	}
	async function se(e) {
		let t = (await n.lookupBarcode(e)).filter(He);
		t.length === 1 ? s.add(t[0]) : t.length > 1 && v(t);
	}
	let Y = s.stems.length === 0, X = s.stems.find((e) => e.item.variant_id === s.selectedId)?.item.product_name ?? null;
	return /* @__PURE__ */ p("div", {
		className: "fixed inset-0 z-40 bg-white flex flex-col",
		"data-testid": "florist-bench",
		children: [
			/* @__PURE__ */ f(G, {
				active: !g && !b,
				onScan: (e) => void se(e)
			}),
			/* @__PURE__ */ p("header", {
				className: "px-4 py-3 border-b border-sq-divider flex items-center gap-3 shrink-0",
				children: [
					/* @__PURE__ */ p("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ f("h2", {
							className: "font-semibold text-sq-text truncate",
							children: e.product_name
						}), /* @__PURE__ */ f("p", {
							className: `text-xs ${N ? "text-amber-700" : "text-sq-secondary"}`,
							children: N ?? (s.totals.stemCount > 0 ? `${s.totals.stemCount} у букеті` : "Збираємо букет")
						})]
					}),
					/* @__PURE__ */ f("div", {
						className: "hidden lg:block w-80 xl:w-96 ml-auto",
						children: /* @__PURE__ */ f(Q, {
							totalCents: s.totals.totalCents,
							budgetCents: s.budgetCents,
							ratio: q.ratio,
							remainingCents: q.remainingCents,
							over: q.over,
							nextStems: q.nextStems,
							onOpenBudget: () => S(!0)
						})
					}),
					/* @__PURE__ */ f("button", {
						type: "button",
						onClick: o,
						className: "min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-secondary hover:text-sq-text lg:ml-0 ml-auto shrink-0",
						"aria-label": "Закрити",
						children: /* @__PURE__ */ f(I, { size: 20 })
					})
				]
			}),
			/* @__PURE__ */ p("div", {
				className: "flex-1 flex min-h-0",
				children: [/* @__PURE__ */ p("section", {
					className: "flex-1 flex flex-col min-w-0 min-h-0",
					children: [/* @__PURE__ */ p("div", {
						className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
						children: [/* @__PURE__ */ p("div", {
							className: "relative",
							children: [/* @__PURE__ */ f(F, {
								size: 18,
								className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ f("input", {
								className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
								placeholder: "Пошук",
								value: n.query,
								onChange: (e) => n.setQuery(e.target.value)
							})]
						}), !n.query.trim() && /* @__PURE__ */ f(oe, {
							tags: n.catalogBarTags,
							activeId: n.catalogBarActiveId,
							showBack: n.showBack,
							backLabel: n.backLabel,
							onSelect: n.selectCatalogBarTag,
							onBack: n.goBackOne
						})]
					}), /* @__PURE__ */ f(Ve, {
						grouped: ie,
						folderTiles: n.folderTiles,
						loading: n.loading,
						defaultUnit: m.defaultUnit,
						countOf: s.countOf,
						onPick: J,
						onEnterTag: n.enterTag
					})]
				}), /* @__PURE__ */ p("aside", {
					className: "hidden lg:flex w-[22rem] xl:w-[26rem] shrink-0 flex-col border-l border-sq-divider bg-sq-sidebar min-h-0",
					children: [
						/* @__PURE__ */ f("h3", {
							className: "px-4 py-3 text-sm font-semibold text-sq-text border-b border-sq-divider bg-white shrink-0",
							children: "Склад букета"
						}),
						/* @__PURE__ */ f(Ie, {
							stems: s.stems,
							totals: s.totals,
							labourBps: t,
							selectedId: s.selectedId,
							onSelect: s.select,
							onStep: (e, t) => {
								let n = s.stems.find((t) => t.item.variant_id === e);
								n && s.add(n.item, t);
							},
							onRemove: (e) => s.setQuantity(e, 0)
						}),
						/* @__PURE__ */ f(Be, {
							targetName: X,
							onDigit: s.typeDigit,
							onBackspace: s.backspace
						})
					]
				})]
			}),
			/* @__PURE__ */ p("div", {
				className: "lg:hidden border-t border-sq-divider px-4 py-2 bg-white shrink-0 space-y-2",
				children: [/* @__PURE__ */ f(Q, {
					totalCents: s.totals.totalCents,
					budgetCents: s.budgetCents,
					ratio: q.ratio,
					remainingCents: q.remainingCents,
					over: q.over,
					nextStems: q.nextStems,
					onOpenBudget: () => S(!0)
				}), /* @__PURE__ */ p("button", {
					type: "button",
					onClick: () => E(!0),
					className: "w-full min-h-12 flex items-center justify-between gap-3 rounded-sq border border-sq-divider px-3",
					"data-testid": "bench-open-sheet",
					children: [/* @__PURE__ */ p("span", {
						className: "text-sm text-sq-secondary",
						children: ["Склад · ", s.totals.stemCount || "—"]
					}), /* @__PURE__ */ p("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ f("span", {
							className: "text-lg font-semibold tabular-nums",
							"data-testid": "bench-total-mobile",
							children: y(s.totals.totalCents)
						}), /* @__PURE__ */ f(A, {
							size: 18,
							className: "text-sq-muted rotate-180"
						})]
					})]
				})]
			}),
			/* @__PURE__ */ p("footer", {
				className: "border-t border-sq-divider px-4 py-3 flex items-center gap-3 shrink-0 bg-white",
				children: [
					/* @__PURE__ */ f("button", {
						type: "button",
						onClick: o,
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text",
						children: "Скасувати"
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						disabled: Y || !D,
						title: D ? void 0 : "Потрібна мережа",
						onClick: () => {
							V(null), L({ uuid: crypto.randomUUID() });
						},
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text disabled:opacity-50 flex items-center gap-2",
						"data-testid": "bench-to-showcase",
						children: [/* @__PURE__ */ f(ne, { size: 18 }), /* @__PURE__ */ f("span", {
							className: "hidden sm:inline",
							children: D ? "На вітрину" : "Потрібна мережа"
						})]
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						disabled: Y || !D,
						title: D ? void 0 : "Потрібна мережа",
						onClick: () => M(!0),
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text disabled:opacity-50 flex items-center gap-2",
						"data-testid": "bench-save-recipe",
						children: [/* @__PURE__ */ f(k, { size: 18 }), /* @__PURE__ */ f("span", {
							className: "hidden lg:inline",
							children: "Рецепт"
						})]
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						disabled: Y,
						onClick: () => r({
							unit_price_cents: s.totals.totalCents,
							components: s.components
						}),
						className: "sq-btn-primary min-h-12 flex-1",
						"data-testid": "bench-add-to-cart",
						children: ["Додати в чек · ", y(s.totals.totalCents)]
					})
				]
			}),
			w && /* @__PURE__ */ p("div", {
				className: "fixed inset-0 z-50 lg:hidden",
				children: [/* @__PURE__ */ f("button", {
					type: "button",
					className: "absolute inset-0 bg-black/40",
					"aria-label": "Закрити склад",
					onClick: () => E(!1)
				}), /* @__PURE__ */ p("div", {
					className: "absolute inset-x-0 bottom-0 max-h-[85dvh] bg-sq-sidebar rounded-t-sq flex flex-col animate-fade-up",
					children: [
						/* @__PURE__ */ p("div", {
							className: "px-4 py-3 border-b border-sq-divider bg-white shrink-0",
							children: [/* @__PURE__ */ p("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ f("h3", {
									className: "font-semibold text-sq-text",
									children: "Склад букета"
								}), /* @__PURE__ */ f("button", {
									type: "button",
									onClick: () => E(!1),
									className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
									"aria-label": "Закрити",
									children: /* @__PURE__ */ f(I, { size: 20 })
								})]
							}), /* @__PURE__ */ f("div", {
								className: "mt-1",
								children: /* @__PURE__ */ f(Q, {
									totalCents: s.totals.totalCents,
									budgetCents: s.budgetCents,
									ratio: q.ratio,
									remainingCents: q.remainingCents,
									over: q.over,
									nextStems: q.nextStems,
									onOpenBudget: () => S(!0)
								})
							})]
						}),
						/* @__PURE__ */ f(Ie, {
							stems: s.stems,
							totals: s.totals,
							labourBps: t,
							selectedId: s.selectedId,
							onSelect: s.select,
							onStep: (e, t) => {
								let n = s.stems.find((t) => t.item.variant_id === e);
								n && s.add(n.item, t);
							},
							onRemove: (e) => s.setQuantity(e, 0)
						}),
						/* @__PURE__ */ f(Be, {
							targetName: X,
							onDigit: s.typeDigit,
							onBackspace: s.backspace
						})
					]
				})]
			}),
			j && /* @__PURE__ */ f(Ne, {
				computedCents: s.totals.totalCents,
				onClose: () => M(!1),
				onSaved: (e) => {
					M(!1), a(e);
				},
				components: s.components.map((e) => ({
					component_variant_id: e.component_variant_id,
					quantity: e.quantity
				}))
			}),
			P && /* @__PURE__ */ f(Pe, {
				computedCents: s.totals.totalCents,
				busy: R,
				error: B,
				onSubmit: (e) => void re(e),
				onClose: () => L(null)
			}),
			/* @__PURE__ */ f(Te, {
				tags: H,
				paperWidth: Ke()
			}),
			b && /* @__PURE__ */ f(Je, {
				valueCents: s.budgetCents,
				onSubmit: (e) => {
					s.setBudgetCents(e), S(!1);
				},
				onClose: () => S(!1)
			}),
			g && /* @__PURE__ */ f(ae, {
				productName: g[0]?.product_name ?? "",
				variants: g,
				onPick: (e) => {
					s.add(e), v(null);
				},
				onClose: () => v(null)
			})
		]
	});
}
function Je({ valueCents: e, onSubmit: t, onClose: n }) {
	let [r, i] = d(e == null ? "" : String(e / 100));
	return /* @__PURE__ */ f("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ p("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			children: [/* @__PURE__ */ p("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ f("h3", {
					className: "font-semibold text-sq-text",
					children: "Бюджет клієнта"
				}), /* @__PURE__ */ f("button", {
					type: "button",
					onClick: n,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ f(I, { size: 20 })
				})]
			}), /* @__PURE__ */ p("div", {
				className: "p-4 space-y-3",
				children: [
					/* @__PURE__ */ f("input", {
						className: "pos-field text-lg",
						inputMode: "decimal",
						autoFocus: !0,
						placeholder: "1500",
						value: r,
						onChange: (e) => i(e.target.value.replace(/[^\d.,]/g, "")),
						"aria-label": "Бюджет, ₴",
						"data-testid": "bench-budget-input"
					}),
					/* @__PURE__ */ f("p", {
						className: "text-xs text-sq-secondary",
						children: "Підказка, а не ціна: смуга показує, скільки ще влізе. Ціна завжди рахується зі складу букета."
					}),
					/* @__PURE__ */ p("div", {
						className: "flex gap-2",
						children: [e != null && /* @__PURE__ */ f("button", {
							type: "button",
							onClick: () => t(null),
							className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text",
							children: "Прибрати"
						}), /* @__PURE__ */ f("button", {
							type: "button",
							onClick: () => t(S(r) || null),
							className: "sq-btn-primary min-h-12 flex-1",
							children: "Готово"
						})]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/FlowersCatalog.tsx
var Ye = o(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function Xe({ active: e, stockEpoch: t }) {
	let n = Me();
	if (n.length > 0) throw new Ae(n);
	return /* @__PURE__ */ f(Ze, {
		active: e,
		stockEpoch: t
	});
}
function Ze({ active: e, stockEpoch: r }) {
	let i = E(), o = ee(), s = w((e) => e.addItem), m = w((e) => e.addAssembled), h = w((e) => e.setBanner), g = R(), _ = C((e) => e.auth?.store.florist_labour_bps ?? 0), [b, x] = d(!1), [S, T] = d(null), [D, O] = d(null), k = u([]), A = l(() => i.grouped.flatMap(([, e]) => e).filter($), [i.grouped]);
	A.length > k.current.length && (k.current = A), c(() => {
		r > 0 && i.refresh();
	}, [r]);
	async function j(e) {
		let t = await i.lookupBarcode(e);
		if (t.length === 1) {
			s(t[0]), i.setQuery("");
			return;
		}
		if (t.length === 0) {
			h("Штрихкод не знайдено");
			return;
		}
		T(t);
	}
	return /* @__PURE__ */ p("section", {
		className: "flex flex-col min-h-0 bg-white",
		"data-testid": "flowers-catalog",
		children: [
			/* @__PURE__ */ f(G, {
				active: e && !S && !b && !D,
				onScan: (e) => void j(e)
			}),
			/* @__PURE__ */ p("div", {
				className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
				children: [/* @__PURE__ */ p("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ p("div", {
							className: "relative flex-1",
							children: [/* @__PURE__ */ f(F, {
								size: 18,
								className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ f("input", {
								className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
								placeholder: "Пошук",
								value: i.query,
								onChange: (e) => i.setQuery(e.target.value)
							})]
						}),
						/* @__PURE__ */ f("button", {
							type: "button",
							onClick: () => x(!0),
							className: "min-h-12 min-w-12 grid place-items-center rounded-sq text-sq-blue border border-sq-divider bg-white",
							"aria-label": "Камера",
							children: /* @__PURE__ */ f(n, { size: 20 })
						}),
						k.current.length > 0 && /* @__PURE__ */ p("button", {
							type: "button",
							onClick: () => {
								let e = k.current, t = e.filter((e) => (e.components ?? []).length === 0), n = t.length > 0 ? t : e;
								n.length === 1 ? O(n[0]) : T(n);
							},
							className: "min-h-12 px-3 flex items-center gap-2 rounded-sq text-white bg-sq-blue font-medium shrink-0",
							"data-testid": "start-bouquet",
							children: [/* @__PURE__ */ f(t, { size: 18 }), /* @__PURE__ */ f("span", {
								className: "hidden sm:inline",
								children: "Зібрати букет"
							})]
						})
					]
				}), !i.query.trim() && /* @__PURE__ */ f(oe, {
					tags: i.catalogBarTags,
					activeId: i.catalogBarActiveId,
					showBack: i.showBack,
					backLabel: i.backLabel,
					onSelect: i.selectCatalogBarTag,
					onBack: i.goBackOne
				})]
			}),
			/* @__PURE__ */ p("div", {
				ref: g,
				className: "flex-1 overflow-auto p-3 bg-white select-none",
				children: [
					i.loading && /* @__PURE__ */ f("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ p("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2",
						children: [i.folderTiles.map((e) => /* @__PURE__ */ f(W, {
							name: e.name,
							color: e.color,
							onClick: () => i.enterTag(e)
						}, e.id)), i.grouped.map(([e, t]) => {
							let n = t[0], r = Math.min(...t.map((e) => e.price_cents)), i = t.reduce((e, t) => e + t.quantity, 0), a = n.unit || o.defaultUnit;
							return /* @__PURE__ */ f(B, {
								name: n.product_name,
								subtitle: [n.label, `${i} ${a}`].filter(Boolean).join(" · "),
								priceCents: r,
								imageUrl: n.image_url,
								stock: i,
								disabled: i <= 0,
								onClick: () => {
									if (t.length > 1) {
										T(t);
										return;
									}
									$(t[0]) ? O(t[0]) : s(t[0]);
								}
							}, e);
						})]
					}),
					!i.loading && i.folderTiles.length === 0 && i.grouped.length === 0 && /* @__PURE__ */ f("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			b && /* @__PURE__ */ f(a, {
				fallback: null,
				children: /* @__PURE__ */ f(Ye, {
					onScan: (e) => {
						x(!1), j(e);
					},
					onClose: () => x(!1)
				})
			}),
			D && /* @__PURE__ */ f(qe, {
				card: D,
				labourBps: _,
				catalog: i,
				onClose: () => O(null),
				onRecipeSaved: (e) => {
					h(`Рецепт «${e}» збережено`);
				},
				onShowcased: (e, t) => {
					h(`${e} — на вітрині, ${y(t)}`), O(null);
				},
				onDone: ({ unit_price_cents: e, components: t }) => {
					m({
						variant_id: D.variant_id,
						product_name: D.product_name,
						variant_label: v(t),
						unit: D.unit,
						unit_price_cents: e,
						quantity: 1,
						image_url: D.image_url,
						components: t
					}), O(null);
				}
			}),
			S && /* @__PURE__ */ f(ae, {
				productName: S[0]?.product_name ?? "",
				variants: S,
				onPick: (e) => {
					T(null), $(e) ? O(e) : s(e);
				},
				onClose: () => T(null)
			})
		]
	});
}
//#endregion
export { Xe as default };
