import { n as e, r as t, t as n } from "./trash-2-J8IpCBHX.js";
import { n as r, t as i } from "./BouquetPhoto-DgI0gXjX.js";
import { Suspense as a, lazy as o, useCallback as s, useEffect as c, useMemo as l, useRef as u, useState as d } from "react";
import { Fragment as f, jsx as p, jsxs as m } from "react/jsx-runtime";
import * as h from "@pos/platform";
import { api as g, assetUrl as _, buildPriceTags as v, customBouquetLabel as y, formatUah as b, priceOfComponents as x, triggerPrint as S, uahInputToCents as C, useAuthStore as ee, useCartStore as w, useOfflineStatus as T, useSalesCatalog as E, useVertical as D, withLabour as O } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/book-marked.js
var k = t("BookMarked", [["path", {
	d: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20",
	key: "t4utmx"
}], ["polyline", {
	points: "10 2 10 10 13 7 16 10 16 2",
	key: "13o6vz"
}]]), A = t("ChevronDown", [["path", {
	d: "m6 9 6 6 6-6",
	key: "qrunsl"
}]]), j = t("Delete", [
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
]), M = t("Folder", [["path", {
	d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	key: "1kt360"
}]]), N = t("Minus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}]]), P = t("Plus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}], ["path", {
	d: "M12 5v14",
	key: "s699le"
}]]), F = t("Printer", [
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
]), te = t("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), ne = t("Store", [
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
]), I = t("X", [["path", {
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
function B({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: o, count: s }) {
	let [c, l] = d(!1), u = c ? null : _(r);
	return /* @__PURE__ */ m("button", {
		type: "button",
		disabled: o,
		onClick: a,
		className: `aspect-square rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${s ? "ring-2 ring-sq-blue" : ""}`,
		children: [
			u ? /* @__PURE__ */ p("img", {
				src: u,
				alt: "",
				className: "absolute inset-0 w-full h-full object-cover pointer-events-none",
				onError: () => l(!0)
			}) : /* @__PURE__ */ p("div", {
				className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
				children: t || " "
			}),
			/* @__PURE__ */ p("div", { className: "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" }),
			/* @__PURE__ */ m("div", {
				className: "absolute bottom-2 left-2 right-2 text-white pointer-events-none",
				children: [/* @__PURE__ */ p("p", {
					className: "text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm",
					children: e
				}), n != null && /* @__PURE__ */ p("p", {
					className: "text-[12px] mt-0.5 opacity-95 drop-shadow-sm",
					children: z(n)
				})]
			}),
			s != null && s > 0 && /* @__PURE__ */ p("span", {
				className: "absolute top-2 left-2 min-w-7 h-7 px-1.5 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-semibold tabular-nums shadow-sm pointer-events-none",
				"data-testid": "tile-count",
				children: s
			}),
			i != null && i <= 0 && /* @__PURE__ */ p("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				children: "немає"
			})
		]
	});
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
	return /* @__PURE__ */ m("button", {
		type: "button",
		onClick: n,
		className: "aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]",
		style: { backgroundColor: r },
		children: [/* @__PURE__ */ p(M, {
			size: 22,
			strokeWidth: 1.75,
			className: "text-white/95 absolute top-2.5 left-2.5"
		}), /* @__PURE__ */ p("span", {
			className: "absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white",
			children: e
		})]
	});
}
//#endregion
//#region src/components/cashier/VariantPicker.tsx
function G({ productName: e, variants: t, onPick: n, onClose: r }) {
	let i = R(), a = [...t].sort((e, t) => e.quantity <= 0 && t.quantity > 0 ? 1 : e.quantity > 0 && t.quantity <= 0 ? -1 : 0);
	return /* @__PURE__ */ p("div", {
		className: "fixed inset-0 z-40 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ m("div", {
			className: "bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg",
			children: [/* @__PURE__ */ m("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex justify-between items-center gap-3",
				children: [/* @__PURE__ */ p("h3", {
					className: "font-semibold text-sq-text truncate",
					children: e
				}), /* @__PURE__ */ p("button", {
					type: "button",
					onClick: r,
					className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
					children: "Закрити"
				})]
			}), /* @__PURE__ */ p("ul", {
				ref: i,
				className: "divide-y divide-sq-divider max-h-[60vh] overflow-auto select-none",
				children: a.map((e) => {
					let t = e.label || "Стандарт", r = e.quantity <= 0;
					return /* @__PURE__ */ p("li", { children: /* @__PURE__ */ m("button", {
						type: "button",
						disabled: r,
						onClick: () => n(e),
						className: "w-full min-h-14 text-left px-4 py-3.5 disabled:opacity-50 hover:bg-sq-bg focus-visible:bg-sq-bg outline-none",
						children: [/* @__PURE__ */ m("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ p("span", {
								className: `font-medium ${r ? "text-sq-muted" : "text-sq-blue"}`,
								children: t
							}), /* @__PURE__ */ p("span", {
								className: "font-medium text-sq-text shrink-0",
								children: z(e.price_cents)
							})]
						}), /* @__PURE__ */ p("p", {
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
function ae({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = R(), s = (e) => `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${e ? "font-semibold text-sq-text border-sq-text" : "font-medium text-sq-secondary border-transparent"}`;
	return /* @__PURE__ */ m("div", {
		ref: o,
		className: "flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none",
		children: [
			n && /* @__PURE__ */ m("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap",
				children: ["‹ ", r]
			}),
			/* @__PURE__ */ p("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ p("button", {
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
function K({ active: e, onScan: t }) {
	let n = u(null);
	return c(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ p("input", {
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
var q = [
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
], J = [
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
], oe = q.map((e) => e.replace(/[01]/g, (e) => e === "0" ? "1" : "0")), se = [
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
], Y = "101", X = "01010", ce = "101";
function le(e) {
	return /^\d{13}$/.test(e);
}
function ue(e) {
	if (!le(e)) throw Error(`not an EAN-13: ${e}`);
	let t = [...e].map(Number), n = se[t[0]];
	return `${Y}${t.slice(1, 7).map((e, t) => n[t] === "L" ? q[e] : J[e]).join("")}${X}${t.slice(7).map((e) => oe[e]).join("")}${ce}`;
}
function de(e) {
	let t = ue(e), n = [], r = 0;
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
//#region src/lib/priceTag.ts
function fe(e) {
	return e.flatMap((e) => Array.from({ length: e.copies }, () => e));
}
//#endregion
//#region src/components/PriceTagsPrintable.tsx
function pe(e) {
	return (e / 100).toFixed(2).replace(/\.00$/, "");
}
function me({ code: e }) {
	return /* @__PURE__ */ p("svg", {
		className: "price-tag-barcode",
		viewBox: "0 0 95 30",
		preserveAspectRatio: "none",
		shapeRendering: "crispEdges",
		"aria-hidden": "true",
		children: de(e).map(([e, t]) => /* @__PURE__ */ p("rect", {
			x: e,
			y: 0,
			width: t,
			height: 30,
			fill: "#000"
		}, e))
	});
}
function he({ tags: e, paperWidth: t }) {
	return e ? /* @__PURE__ */ p("div", {
		className: "price-tag-print-area",
		"data-paper": t,
		children: fe(e).map((e, t) => /* @__PURE__ */ m("div", {
			className: "price-tag",
			children: [
				/* @__PURE__ */ p("p", {
					className: "price-tag-store",
					children: e.storeName
				}),
				/* @__PURE__ */ p("p", {
					className: "price-tag-name",
					children: e.productName
				}),
				e.variantLabel && /* @__PURE__ */ p("p", {
					className: "price-tag-variant",
					children: e.variantLabel
				}),
				/* @__PURE__ */ m("p", {
					className: "price-tag-price",
					children: [pe(e.priceCents), " ₴"]
				}),
				e.barcode ? /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p(me, { code: e.barcode }), /* @__PURE__ */ p("p", {
					className: "price-tag-digits",
					children: e.barcode
				})] }) : /* @__PURE__ */ p("p", {
					className: "price-tag-digits",
					children: "без штрихкоду"
				}),
				e.sku && /* @__PURE__ */ p("p", {
					className: "price-tag-sku",
					children: e.sku
				})
			]
		}, t))
	}) : null;
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
function ge(e, t) {
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
function _e(e) {
	var t = ge(e, "string");
	return Z(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function ve(e, t, n) {
	return (t = _e(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-flowers/lib/hostPlatform.ts
var ye = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical",
	"withLabour",
	"priceOfComponents",
	"customBouquetLabel",
	"buildPriceTags",
	"triggerPrint",
	"assetUrl"
], be = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), ve(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function xe(e) {
	return typeof e == "function";
}
function Se() {
	let e = h;
	return ye.filter((t) => !xe(e[t]));
}
//#endregion
//#region src/modules/vertical-flowers/bench/RecipeSheet.tsx
function Ce({ computedCents: e, components: t, onSaved: n, onClose: r }) {
	let [a, o] = d(""), [s, c] = d((e / 100).toFixed(2).replace(".", ",")), [l, u] = d(null), [f, h] = d(!1), [_, v] = d(null), y = C(s), x = y !== e;
	async function S() {
		h(!0), v(null);
		try {
			n((await g.saveBouquetRecipe({
				name: a.trim(),
				components: t,
				price_cents: x ? y : null,
				image_url: l
			})).name);
		} catch (e) {
			let t = e.response?.data?.error;
			v(t || "Не вдалося зберегти рецепт");
		} finally {
			h(!1);
		}
	}
	return /* @__PURE__ */ p("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ m("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			"data-testid": "recipe-sheet",
			children: [/* @__PURE__ */ m("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ p("h3", {
					className: "font-semibold text-sq-text",
					children: "Зберегти як рецепт"
				}), /* @__PURE__ */ p("button", {
					type: "button",
					onClick: r,
					disabled: f,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ p(I, { size: 20 })
				})]
			}), /* @__PURE__ */ m("div", {
				className: "p-4 space-y-4",
				children: [
					/* @__PURE__ */ p("p", {
						className: "text-xs text-sq-muted",
						children: "Букет лишиться на столі — рецепт це шаблон, який можна збирати знову. Стебла зараз не списуються."
					}),
					/* @__PURE__ */ p(i, {
						value: l,
						onChange: u,
						disabled: f
					}),
					/* @__PURE__ */ m("label", {
						className: "block",
						children: [/* @__PURE__ */ p("span", {
							className: "text-sm text-sq-secondary",
							children: "Назва рецепта"
						}), /* @__PURE__ */ p("input", {
							className: "pos-field mt-1.5",
							value: a,
							onChange: (e) => o(e.target.value),
							placeholder: "Весняний",
							autoFocus: !0,
							"data-testid": "recipe-name"
						})]
					}),
					/* @__PURE__ */ m("label", {
						className: "block",
						children: [
							/* @__PURE__ */ p("span", {
								className: "text-sm text-sq-secondary",
								children: "Ціна"
							}),
							/* @__PURE__ */ p("input", {
								className: "pos-field mt-1.5 text-lg",
								inputMode: "decimal",
								value: s,
								onChange: (e) => c(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "recipe-price"
							}),
							/* @__PURE__ */ p("span", {
								className: "mt-1 block text-xs text-sq-muted",
								children: x ? `Розраховано: ${b(e)}` : "Стебла та робота флориста"
							})
						]
					}),
					_ && /* @__PURE__ */ p("p", {
						className: "text-sm text-red-600",
						"data-testid": "recipe-error",
						children: _
					}),
					/* @__PURE__ */ m("button", {
						type: "button",
						disabled: f || !a.trim() || y <= 0,
						onClick: () => void S(),
						className: "sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2",
						"data-testid": "recipe-submit",
						children: [/* @__PURE__ */ p(k, { size: 18 }), f ? "Зберігаємо…" : "Зберегти рецепт"]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/ShowcaseSheet.tsx
function we({ computedCents: e, busy: t, error: n, onSubmit: r, onClose: a }) {
	let [o, s] = d(""), [c, l] = d((e / 100).toFixed(2).replace(".", ",")), [u, f] = d(null), h = C(c), g = h !== e;
	function _(e) {
		r({
			name: o.trim() || null,
			priceCents: g ? h : null,
			imageUrl: u,
			print: e
		});
	}
	return /* @__PURE__ */ p("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ m("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			"data-testid": "showcase-sheet",
			children: [/* @__PURE__ */ m("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ p("h3", {
					className: "font-semibold text-sq-text",
					children: "Букет на вітрину"
				}), /* @__PURE__ */ p("button", {
					type: "button",
					onClick: a,
					disabled: t,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ p(I, { size: 20 })
				})]
			}), /* @__PURE__ */ m("div", {
				className: "p-4 space-y-4",
				children: [
					/* @__PURE__ */ p(i, {
						value: u,
						onChange: f,
						disabled: t
					}),
					/* @__PURE__ */ m("label", {
						className: "block",
						children: [/* @__PURE__ */ p("span", {
							className: "text-sm text-sq-secondary",
							children: "Назва"
						}), /* @__PURE__ */ p("input", {
							className: "pos-field mt-1.5",
							value: o,
							onChange: (e) => s(e.target.value),
							placeholder: "Букет №… — за номером документа",
							"data-testid": "showcase-name"
						})]
					}),
					/* @__PURE__ */ m("label", {
						className: "block",
						children: [
							/* @__PURE__ */ p("span", {
								className: "text-sm text-sq-secondary",
								children: "Ціна на цінник"
							}),
							/* @__PURE__ */ p("input", {
								className: "pos-field mt-1.5 text-lg",
								inputMode: "decimal",
								value: c,
								onChange: (e) => l(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "showcase-price"
							}),
							/* @__PURE__ */ p("span", {
								className: "mt-1 block text-xs text-sq-muted",
								children: g ? `Розраховано: ${b(e)}` : "Стебла та робота флориста"
							})
						]
					}),
					n && /* @__PURE__ */ p("p", {
						className: "text-sm text-red-600",
						"data-testid": "showcase-error",
						children: n
					}),
					/* @__PURE__ */ m("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ m("button", {
							type: "button",
							disabled: t || h <= 0,
							onClick: () => _(!0),
							className: "sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2",
							"data-testid": "showcase-submit-print",
							children: [/* @__PURE__ */ p(F, { size: 18 }), t ? "Робимо…" : "Зробити і надрукувати цінник"]
						}), /* @__PURE__ */ p("button", {
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
	return t == null ? /* @__PURE__ */ p("button", {
		type: "button",
		onClick: o,
		className: "w-full min-h-11 rounded-sq border border-dashed border-sq-divider text-sm text-sq-secondary hover:text-sq-text hover:border-sq-blue",
		"data-testid": "bench-set-budget",
		children: "Поставити бюджет"
	}) : /* @__PURE__ */ m("div", {
		"data-testid": "bench-budget",
		children: [/* @__PURE__ */ p("div", {
			className: "h-2.5 rounded-full bg-sq-bg overflow-hidden",
			children: /* @__PURE__ */ p("div", {
				className: `h-full rounded-full transition-[width] duration-150 ${i ? "bg-red-500" : "bg-sq-blue"}`,
				style: { width: `${Math.round(n * 100)}%` }
			})
		}), /* @__PURE__ */ m("button", {
			type: "button",
			onClick: o,
			className: "mt-1.5 w-full min-h-11 flex items-baseline justify-between gap-3 text-left",
			children: [/* @__PURE__ */ p("span", {
				className: `text-sm ${i ? "text-red-600 font-medium" : "text-sq-secondary"}`,
				children: i ? `Перебір на ${b(-r)}` : a != null && a > 0 ? `Ще ≈${a} ${Te(a)}` : "У бюджеті"
			}), /* @__PURE__ */ m("span", {
				className: "text-sm text-sq-secondary tabular-nums shrink-0",
				children: [
					b(e),
					" / ",
					b(t)
				]
			})]
		})]
	});
}
function Te(e) {
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
function Ee({ stems: e, totals: t, labourBps: r, selectedId: i, onSelect: a, onStep: o, onRemove: s }) {
	let l = R(), d = u(null);
	return c(() => {
		d.current?.scrollIntoView({ block: "nearest" });
	}, [i, e.length]), /* @__PURE__ */ m("div", {
		className: "flex flex-col min-h-0 flex-1",
		"data-testid": "bench-composition",
		children: [e.length === 0 ? /* @__PURE__ */ p("div", {
			className: "flex-1 grid place-items-center p-6 text-center",
			children: /* @__PURE__ */ p("p", {
				className: "text-sm text-sq-muted max-w-[22ch]",
				children: "Торкніться квітки, щоб покласти її в букет"
			})
		}) : /* @__PURE__ */ p("ul", {
			ref: l,
			className: "flex-1 overflow-auto divide-y divide-sq-divider select-none",
			children: e.map((e) => /* @__PURE__ */ m("li", {
				ref: e.item.variant_id === i ? d : void 0,
				className: `px-4 py-3 border-l-4 ${e.item.variant_id === i ? "border-sq-blue" : "border-transparent"}`,
				"data-testid": "bench-stem",
				"data-selected": e.item.variant_id === i ? "true" : void 0,
				children: [
					/* @__PURE__ */ m("div", {
						className: "flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ p("p", {
							className: "font-medium text-sq-text truncate",
							children: e.item.product_name
						}), /* @__PURE__ */ p("p", {
							className: "text-sm font-medium text-sq-text tabular-nums shrink-0",
							children: b(e.item.price_cents * e.quantity)
						})]
					}),
					e.item.label && /* @__PURE__ */ p("p", {
						className: "text-xs text-sq-secondary truncate mt-0.5",
						children: e.item.label
					}),
					/* @__PURE__ */ m("div", {
						className: "mt-2 flex items-center gap-2",
						children: [
							/* @__PURE__ */ p("button", {
								type: "button",
								onClick: () => o(e.item.variant_id, -1),
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white",
								"aria-label": `Менше: ${e.item.product_name}`,
								children: /* @__PURE__ */ p(N, { size: 18 })
							}),
							/* @__PURE__ */ p("button", {
								type: "button",
								onClick: () => a(e.item.variant_id),
								className: `min-h-11 min-w-12 rounded-sq text-center text-base font-semibold tabular-nums ${e.item.variant_id === i ? "text-sq-blue ring-2 ring-sq-blue" : "text-sq-text"}`,
								"aria-label": `Набрати кількість: ${e.item.product_name}`,
								"data-testid": "bench-stem-qty",
								children: e.quantity
							}),
							/* @__PURE__ */ p("button", {
								type: "button",
								onClick: () => o(e.item.variant_id, 1),
								disabled: e.quantity >= e.item.quantity,
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text bg-white disabled:opacity-40",
								"aria-label": `Більше: ${e.item.product_name}`,
								children: /* @__PURE__ */ p(P, { size: 18 })
							}),
							/* @__PURE__ */ m("span", {
								className: "text-xs text-sq-muted ml-1 truncate",
								children: [
									e.item.quantity,
									" ",
									e.item.unit,
									" на полиці"
								]
							}),
							/* @__PURE__ */ p("button", {
								type: "button",
								onClick: () => s(e.item.variant_id),
								className: "min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-muted hover:text-red-600 ml-auto shrink-0",
								"aria-label": `Прибрати: ${e.item.product_name}`,
								children: /* @__PURE__ */ p(n, { size: 18 })
							})
						]
					})
				]
			}, e.item.variant_id))
		}), /* @__PURE__ */ m("div", {
			className: "border-t border-sq-divider px-4 py-3 space-y-1.5 bg-white shrink-0",
			children: [
				/* @__PURE__ */ p(De, {
					label: "Квіти",
					valueCents: t.partsCents
				}),
				r > 0 && /* @__PURE__ */ p(De, {
					label: `Робота (${Oe(r)})`,
					valueCents: t.labourCents
				}),
				/* @__PURE__ */ m("div", {
					className: "flex items-baseline justify-between gap-3 pt-1.5 border-t border-sq-divider",
					children: [/* @__PURE__ */ p("span", {
						className: "font-semibold text-sq-text",
						children: "Разом"
					}), /* @__PURE__ */ p("span", {
						className: "text-xl font-semibold text-sq-text tabular-nums",
						"data-testid": "bench-total",
						children: b(t.totalCents)
					})]
				})
			]
		})]
	});
}
function De({ label: e, valueCents: t }) {
	return /* @__PURE__ */ m("div", {
		className: "flex items-baseline justify-between gap-3",
		children: [/* @__PURE__ */ p("span", {
			className: "text-sm text-sq-secondary",
			children: e
		}), /* @__PURE__ */ p("span", {
			className: "text-sm text-sq-text tabular-nums",
			children: b(t)
		})]
	});
}
function Oe(e) {
	let t = e / 100;
	return `${Number.isInteger(t) ? t : t.toFixed(1).replace(".", ",")}%`;
}
//#endregion
//#region src/modules/vertical-flowers/bench/QuantityPad.tsx
var ke = [
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
function Ae({ targetName: e, onDigit: t, onBackspace: n }) {
	let r = e == null;
	return /* @__PURE__ */ m("div", {
		className: "px-3 py-2 border-t border-sq-divider bg-white",
		"data-testid": "bench-pad",
		children: [/* @__PURE__ */ p("p", {
			className: "text-xs text-sq-muted mb-1.5 truncate h-4",
			children: r ? "Торкніться квітки, щоб набрати кількість" : `Кількість: ${e}`
		}), /* @__PURE__ */ m("div", {
			className: "grid grid-cols-5 gap-1.5",
			children: [ke.map((e) => /* @__PURE__ */ p("button", {
				type: "button",
				disabled: r,
				onClick: () => t(e),
				className: "min-h-11 rounded-sq border border-sq-divider bg-white text-base font-semibold text-sq-text disabled:opacity-40",
				"data-testid": `bench-pad-${e}`,
				children: e
			}, e)), /* @__PURE__ */ p("button", {
				type: "button",
				disabled: r,
				onClick: n,
				className: "min-h-11 rounded-sq border border-sq-divider bg-white grid place-items-center text-sq-secondary disabled:opacity-40",
				"aria-label": "Стерти цифру",
				"data-testid": "bench-pad-backspace",
				children: /* @__PURE__ */ p(j, { size: 18 })
			})]
		})]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/StemGrid.tsx
function je({ grouped: e, folderTiles: t, loading: n, defaultUnit: r, countOf: i, onPick: a, onEnterTag: o }) {
	let s = R();
	return /* @__PURE__ */ m("div", {
		ref: s,
		className: "flex-1 overflow-auto p-3 bg-white select-none",
		"data-testid": "bench-grid",
		children: [
			n && /* @__PURE__ */ p("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			/* @__PURE__ */ m("div", {
				className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2",
				children: [t.map((e) => /* @__PURE__ */ p(W, {
					name: e.name,
					color: e.color,
					onClick: () => o(e)
				}, e.id)), e.map(([e, t]) => {
					let n = t[0], o = Math.min(...t.map((e) => e.price_cents)), s = t.reduce((e, t) => e + t.quantity, 0), c = t.reduce((e, t) => e + i(t.variant_id), 0), l = n.unit || r;
					return /* @__PURE__ */ p(B, {
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
			!n && t.length === 0 && e.length === 0 && /* @__PURE__ */ p("div", {
				className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
				children: "Порожньо"
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/stems.ts
function Me(e) {
	return (e.kind ?? "simple") !== "composite";
}
function $(e) {
	return e.kind === "composite" && e.stock_mode === "derived";
}
//#endregion
//#region src/modules/vertical-flowers/bench/useBench.ts
function Ne(e) {
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
	}, [a]), b = l(() => t.map((e) => ({
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
			let n = new Map(t.map((e) => [e.item.variant_id, e.item])), r = x(b.map((e) => ({
				component_variant_id: e.component_variant_id,
				quantity: e.quantity
			})), n, 0), i = O(r, e);
			return {
				partsCents: r,
				labourCents: i - r,
				totalCents: i,
				stemCount: t.reduce((e, t) => e + t.quantity, 0)
			};
		}, [
			t,
			b,
			e
		]),
		labourBps: e,
		budgetCents: r,
		setBudgetCents: i,
		components: b,
		selectedId: a,
		select: _,
		typeDigit: v,
		backspace: y,
		loadComposition: g
	};
}
function Pe(e, t, n, r) {
	if (t == null || t <= 0) return {
		ratio: 0,
		remainingCents: 0,
		over: !1,
		nextStems: null
	};
	let i = t - e, a = n && n > 0 ? O(n, r) : 0;
	return {
		ratio: Math.min(1, e / t),
		remainingCents: i,
		over: i < 0,
		nextStems: a > 0 && i > 0 ? Math.floor(i / a) : null
	};
}
//#endregion
//#region src/modules/vertical-flowers/bench/FloristBench.tsx
function Fe(e) {
	return e.response?.data?.error || "Не вдалося зробити букет. Спробуйте ще раз.";
}
function Ie() {
	try {
		return localStorage.getItem("pos.priceTagPaperWidth") === "80" ? 80 : 58;
	} catch {
		return 58;
	}
}
function Le({ card: e, labourBps: t, catalog: n, onDone: r, onShowcased: i, onRecipeSaved: a, onClose: o }) {
	let s = Ne(t), f = D(), [h, _] = d(null), [y, x] = d(!1), [C, w] = d(!1), E = T((e) => e.online), O = ee((e) => e.auth?.store.name ?? ""), [j, M] = d(!1), [N, P] = d(null), [F, L] = d(null), [R, z] = d(!1), [B, V] = d(null), [H, U] = d(null);
	c(() => {
		if (!H) return;
		let e = () => U(null);
		window.addEventListener("afterprint", e);
		let t = requestAnimationFrame(S);
		return () => {
			window.removeEventListener("afterprint", e), cancelAnimationFrame(t);
		};
	}, [H]);
	async function re(e) {
		if (F) {
			z(!0), V(null);
			try {
				let t = await g.assembleShowcase({
					client_uuid: F.uuid,
					components: s.components.map((e) => ({
						component_variant_id: e.component_variant_id,
						quantity: e.quantity
					})),
					name: e.name,
					price_cents: e.priceCents,
					image_url: e.imageUrl
				});
				e.print && U(v(O, [{
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
				V(Fe(e));
			} finally {
				z(!1);
			}
		}
	}
	let ie = l(() => n.grouped.map(([e, t]) => [e, t.filter(Me)]).filter(([, e]) => e.length > 0).map(([e, t]) => [e, t]), [n.grouped]), W = u(!1);
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
		s.loadComposition(i), i.length < t.length && P("Деяких квітів із рецепта вже немає — перевірте склад");
	}, [
		e,
		n.loading,
		n.grouped
	]);
	let q = s.stems.length > 0 ? s.stems[s.stems.length - 1].item : null, J = Pe(s.totals.totalCents, s.budgetCents, q?.price_cents ?? null, t);
	function oe(e) {
		if (e.length === 1) {
			s.add(e[0]);
			return;
		}
		_(e);
	}
	async function se(e) {
		let t = (await n.lookupBarcode(e)).filter(Me);
		t.length === 1 ? s.add(t[0]) : t.length > 1 && _(t);
	}
	let Y = s.stems.length === 0, X = s.stems.find((e) => e.item.variant_id === s.selectedId)?.item.product_name ?? null;
	return /* @__PURE__ */ m("div", {
		className: "fixed inset-0 z-40 bg-white flex flex-col",
		"data-testid": "florist-bench",
		children: [
			/* @__PURE__ */ p(K, {
				active: !h && !y,
				onScan: (e) => void se(e)
			}),
			/* @__PURE__ */ m("header", {
				className: "px-4 py-3 border-b border-sq-divider flex items-center gap-3 shrink-0",
				children: [
					/* @__PURE__ */ m("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ p("h2", {
							className: "font-semibold text-sq-text truncate",
							children: e.product_name
						}), /* @__PURE__ */ p("p", {
							className: `text-xs ${N ? "text-amber-700" : "text-sq-secondary"}`,
							children: N ?? (s.totals.stemCount > 0 ? `${s.totals.stemCount} у букеті` : "Збираємо букет")
						})]
					}),
					/* @__PURE__ */ p("div", {
						className: "hidden lg:block w-80 xl:w-96 ml-auto",
						children: /* @__PURE__ */ p(Q, {
							totalCents: s.totals.totalCents,
							budgetCents: s.budgetCents,
							ratio: J.ratio,
							remainingCents: J.remainingCents,
							over: J.over,
							nextStems: J.nextStems,
							onOpenBudget: () => x(!0)
						})
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						onClick: o,
						className: "min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-secondary hover:text-sq-text lg:ml-0 ml-auto shrink-0",
						"aria-label": "Закрити",
						children: /* @__PURE__ */ p(I, { size: 20 })
					})
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "flex-1 flex min-h-0",
				children: [/* @__PURE__ */ m("section", {
					className: "flex-1 flex flex-col min-w-0 min-h-0",
					children: [/* @__PURE__ */ m("div", {
						className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
						children: [/* @__PURE__ */ m("div", {
							className: "relative",
							children: [/* @__PURE__ */ p(te, {
								size: 18,
								className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ p("input", {
								className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
								placeholder: "Пошук",
								value: n.query,
								onChange: (e) => n.setQuery(e.target.value)
							})]
						}), !n.query.trim() && /* @__PURE__ */ p(ae, {
							tags: n.catalogBarTags,
							activeId: n.catalogBarActiveId,
							showBack: n.showBack,
							backLabel: n.backLabel,
							onSelect: n.selectCatalogBarTag,
							onBack: n.goBackOne
						})]
					}), /* @__PURE__ */ p(je, {
						grouped: ie,
						folderTiles: n.folderTiles,
						loading: n.loading,
						defaultUnit: f.defaultUnit,
						countOf: s.countOf,
						onPick: oe,
						onEnterTag: n.enterTag
					})]
				}), /* @__PURE__ */ m("aside", {
					className: "hidden lg:flex w-[22rem] xl:w-[26rem] shrink-0 flex-col border-l border-sq-divider bg-sq-sidebar min-h-0",
					children: [
						/* @__PURE__ */ p("h3", {
							className: "px-4 py-3 text-sm font-semibold text-sq-text border-b border-sq-divider bg-white shrink-0",
							children: "Склад букета"
						}),
						/* @__PURE__ */ p(Ee, {
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
						/* @__PURE__ */ p(Ae, {
							targetName: X,
							onDigit: s.typeDigit,
							onBackspace: s.backspace
						})
					]
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "lg:hidden border-t border-sq-divider px-4 py-2 bg-white shrink-0 space-y-2",
				children: [/* @__PURE__ */ p(Q, {
					totalCents: s.totals.totalCents,
					budgetCents: s.budgetCents,
					ratio: J.ratio,
					remainingCents: J.remainingCents,
					over: J.over,
					nextStems: J.nextStems,
					onOpenBudget: () => x(!0)
				}), /* @__PURE__ */ m("button", {
					type: "button",
					onClick: () => w(!0),
					className: "w-full min-h-12 flex items-center justify-between gap-3 rounded-sq border border-sq-divider px-3",
					"data-testid": "bench-open-sheet",
					children: [/* @__PURE__ */ m("span", {
						className: "text-sm text-sq-secondary",
						children: ["Склад · ", s.totals.stemCount || "—"]
					}), /* @__PURE__ */ m("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ p("span", {
							className: "text-lg font-semibold tabular-nums",
							"data-testid": "bench-total-mobile",
							children: b(s.totals.totalCents)
						}), /* @__PURE__ */ p(A, {
							size: 18,
							className: "text-sq-muted rotate-180"
						})]
					})]
				})]
			}),
			/* @__PURE__ */ m("footer", {
				className: "border-t border-sq-divider px-4 py-3 flex items-center gap-3 shrink-0 bg-white",
				children: [
					/* @__PURE__ */ p("button", {
						type: "button",
						onClick: o,
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text",
						children: "Скасувати"
					}),
					/* @__PURE__ */ m("button", {
						type: "button",
						disabled: Y || !E,
						title: E ? void 0 : "Потрібна мережа",
						onClick: () => {
							V(null), L({ uuid: crypto.randomUUID() });
						},
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text disabled:opacity-50 flex items-center gap-2",
						"data-testid": "bench-to-showcase",
						children: [/* @__PURE__ */ p(ne, { size: 18 }), /* @__PURE__ */ p("span", {
							className: "hidden sm:inline",
							children: E ? "На вітрину" : "Потрібна мережа"
						})]
					}),
					/* @__PURE__ */ m("button", {
						type: "button",
						disabled: Y || !E,
						title: E ? void 0 : "Потрібна мережа",
						onClick: () => M(!0),
						className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text disabled:opacity-50 flex items-center gap-2",
						"data-testid": "bench-save-recipe",
						children: [/* @__PURE__ */ p(k, { size: 18 }), /* @__PURE__ */ p("span", {
							className: "hidden lg:inline",
							children: "Рецепт"
						})]
					}),
					/* @__PURE__ */ m("button", {
						type: "button",
						disabled: Y,
						onClick: () => r({
							unit_price_cents: s.totals.totalCents,
							components: s.components
						}),
						className: "sq-btn-primary min-h-12 flex-1",
						"data-testid": "bench-add-to-cart",
						children: ["Додати в чек · ", b(s.totals.totalCents)]
					})
				]
			}),
			C && /* @__PURE__ */ m("div", {
				className: "fixed inset-0 z-50 lg:hidden",
				children: [/* @__PURE__ */ p("button", {
					type: "button",
					className: "absolute inset-0 bg-black/40",
					"aria-label": "Закрити склад",
					onClick: () => w(!1)
				}), /* @__PURE__ */ m("div", {
					className: "absolute inset-x-0 bottom-0 max-h-[85dvh] bg-sq-sidebar rounded-t-sq flex flex-col animate-fade-up",
					children: [
						/* @__PURE__ */ m("div", {
							className: "px-4 py-3 border-b border-sq-divider bg-white shrink-0",
							children: [/* @__PURE__ */ m("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ p("h3", {
									className: "font-semibold text-sq-text",
									children: "Склад букета"
								}), /* @__PURE__ */ p("button", {
									type: "button",
									onClick: () => w(!1),
									className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
									"aria-label": "Закрити",
									children: /* @__PURE__ */ p(I, { size: 20 })
								})]
							}), /* @__PURE__ */ p("div", {
								className: "mt-1",
								children: /* @__PURE__ */ p(Q, {
									totalCents: s.totals.totalCents,
									budgetCents: s.budgetCents,
									ratio: J.ratio,
									remainingCents: J.remainingCents,
									over: J.over,
									nextStems: J.nextStems,
									onOpenBudget: () => x(!0)
								})
							})]
						}),
						/* @__PURE__ */ p(Ee, {
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
						/* @__PURE__ */ p(Ae, {
							targetName: X,
							onDigit: s.typeDigit,
							onBackspace: s.backspace
						})
					]
				})]
			}),
			j && /* @__PURE__ */ p(Ce, {
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
			F && /* @__PURE__ */ p(we, {
				computedCents: s.totals.totalCents,
				busy: R,
				error: B,
				onSubmit: (e) => void re(e),
				onClose: () => L(null)
			}),
			/* @__PURE__ */ p(he, {
				tags: H,
				paperWidth: Ie()
			}),
			y && /* @__PURE__ */ p(Re, {
				valueCents: s.budgetCents,
				onSubmit: (e) => {
					s.setBudgetCents(e), x(!1);
				},
				onClose: () => x(!1)
			}),
			h && /* @__PURE__ */ p(G, {
				productName: h[0]?.product_name ?? "",
				variants: h,
				onPick: (e) => {
					s.add(e), _(null);
				},
				onClose: () => _(null)
			})
		]
	});
}
function Re({ valueCents: e, onSubmit: t, onClose: n }) {
	let [r, i] = d(e == null ? "" : String(e / 100));
	return /* @__PURE__ */ p("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ m("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			children: [/* @__PURE__ */ m("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ p("h3", {
					className: "font-semibold text-sq-text",
					children: "Бюджет клієнта"
				}), /* @__PURE__ */ p("button", {
					type: "button",
					onClick: n,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ p(I, { size: 20 })
				})]
			}), /* @__PURE__ */ m("div", {
				className: "p-4 space-y-3",
				children: [
					/* @__PURE__ */ p("input", {
						className: "pos-field text-lg",
						inputMode: "decimal",
						autoFocus: !0,
						placeholder: "1500",
						value: r,
						onChange: (e) => i(e.target.value.replace(/[^\d.,]/g, "")),
						"aria-label": "Бюджет, ₴",
						"data-testid": "bench-budget-input"
					}),
					/* @__PURE__ */ p("p", {
						className: "text-xs text-sq-secondary",
						children: "Підказка, а не ціна: смуга показує, скільки ще влізе. Ціна завжди рахується зі складу букета."
					}),
					/* @__PURE__ */ m("div", {
						className: "flex gap-2",
						children: [e != null && /* @__PURE__ */ p("button", {
							type: "button",
							onClick: () => t(null),
							className: "min-h-12 px-4 rounded-sq border border-sq-divider text-sq-text",
							children: "Прибрати"
						}), /* @__PURE__ */ p("button", {
							type: "button",
							onClick: () => t(C(r) || null),
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
var ze = o(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function Be({ active: e, stockEpoch: t }) {
	let n = Se();
	if (n.length > 0) throw new be(n);
	return /* @__PURE__ */ p(Ve, {
		active: e,
		stockEpoch: t
	});
}
function Ve({ active: t, stockEpoch: n }) {
	let i = E(), o = D(), s = w((e) => e.addItem), f = w((e) => e.addAssembled), h = w((e) => e.setBanner), g = R(), _ = ee((e) => e.auth?.store.florist_labour_bps ?? 0), [v, x] = d(!1), [S, C] = d(null), [T, O] = d(null), k = u([]), A = l(() => i.grouped.flatMap(([, e]) => e).filter($), [i.grouped]);
	A.length > k.current.length && (k.current = A), c(() => {
		n > 0 && i.refresh();
	}, [n]);
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
		C(t);
	}
	return /* @__PURE__ */ m("section", {
		className: "flex flex-col min-h-0 bg-white",
		"data-testid": "flowers-catalog",
		children: [
			/* @__PURE__ */ p(K, {
				active: t && !S && !v && !T,
				onScan: (e) => void j(e)
			}),
			/* @__PURE__ */ m("div", {
				className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
				children: [/* @__PURE__ */ m("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ m("div", {
							className: "relative flex-1",
							children: [/* @__PURE__ */ p(te, {
								size: 18,
								className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ p("input", {
								className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
								placeholder: "Пошук",
								value: i.query,
								onChange: (e) => i.setQuery(e.target.value)
							})]
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							onClick: () => x(!0),
							className: "min-h-12 min-w-12 grid place-items-center rounded-sq text-sq-blue border border-sq-divider bg-white",
							"aria-label": "Камера",
							children: /* @__PURE__ */ p(r, { size: 20 })
						}),
						k.current.length > 0 && /* @__PURE__ */ m("button", {
							type: "button",
							onClick: () => {
								let e = k.current, t = e.filter((e) => (e.components ?? []).length === 0), n = t.length > 0 ? t : e;
								n.length === 1 ? O(n[0]) : C(n);
							},
							className: "min-h-12 px-3 flex items-center gap-2 rounded-sq text-white bg-sq-blue font-medium shrink-0",
							"data-testid": "start-bouquet",
							children: [/* @__PURE__ */ p(e, { size: 18 }), /* @__PURE__ */ p("span", {
								className: "hidden sm:inline",
								children: "Зібрати букет"
							})]
						})
					]
				}), !i.query.trim() && /* @__PURE__ */ p(ae, {
					tags: i.catalogBarTags,
					activeId: i.catalogBarActiveId,
					showBack: i.showBack,
					backLabel: i.backLabel,
					onSelect: i.selectCatalogBarTag,
					onBack: i.goBackOne
				})]
			}),
			/* @__PURE__ */ m("div", {
				ref: g,
				className: "flex-1 overflow-auto p-3 bg-white select-none",
				children: [
					i.loading && /* @__PURE__ */ p("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ m("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2",
						children: [i.folderTiles.map((e) => /* @__PURE__ */ p(W, {
							name: e.name,
							color: e.color,
							onClick: () => i.enterTag(e)
						}, e.id)), i.grouped.map(([e, t]) => {
							let n = t[0], r = Math.min(...t.map((e) => e.price_cents)), i = t.reduce((e, t) => e + t.quantity, 0), a = n.unit || o.defaultUnit;
							return /* @__PURE__ */ p(B, {
								name: n.product_name,
								subtitle: [n.label, `${i} ${a}`].filter(Boolean).join(" · "),
								priceCents: r,
								imageUrl: n.image_url,
								stock: i,
								disabled: i <= 0,
								onClick: () => {
									if (t.length > 1) {
										C(t);
										return;
									}
									$(t[0]) ? O(t[0]) : s(t[0]);
								}
							}, e);
						})]
					}),
					!i.loading && i.folderTiles.length === 0 && i.grouped.length === 0 && /* @__PURE__ */ p("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			v && /* @__PURE__ */ p(a, {
				fallback: null,
				children: /* @__PURE__ */ p(ze, {
					onScan: (e) => {
						x(!1), j(e);
					},
					onClose: () => x(!1)
				})
			}),
			T && /* @__PURE__ */ p(Le, {
				card: T,
				labourBps: _,
				catalog: i,
				onClose: () => O(null),
				onRecipeSaved: (e) => {
					h(`Рецепт «${e}» збережено`);
				},
				onShowcased: (e, t) => {
					h(`${e} — на вітрині, ${b(t)}`), O(null);
				},
				onDone: ({ unit_price_cents: e, components: t }) => {
					f({
						variant_id: T.variant_id,
						product_name: T.product_name,
						variant_label: y(t),
						unit: T.unit,
						unit_price_cents: e,
						quantity: 1,
						image_url: T.image_url,
						components: t
					}), O(null);
				}
			}),
			S && /* @__PURE__ */ p(G, {
				productName: S[0]?.product_name ?? "",
				variants: S,
				onPick: (e) => {
					C(null), $(e) ? O(e) : s(e);
				},
				onClose: () => C(null)
			})
		]
	});
}
//#endregion
export { Be as default };
