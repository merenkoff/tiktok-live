import { _ as e, a as t, c as n, d as r, f as i, g as a, h as o, i as s, l as c, m as l, n as u, o as d, p as f, r as p, s as m, u as h } from "./glyphs-yCl9Zx5o.js";
import { t as g } from "./BouquetPhoto-CymTfdUQ.js";
import { Suspense as _, lazy as v, useCallback as y, useEffect as b, useMemo as x, useRef as S, useState as C } from "react";
import { jsx as w, jsxs as T } from "react/jsx-runtime";
import * as E from "@pos/platform";
import { api as D, assetUrl as O, buildPriceTags as ee, customBouquetLabel as te, formatUah as k, priceOfComponents as ne, triggerPrint as re, uahInputToCents as A, useAuthStore as j, useCartStore as M, useOfflineStatus as ie, useSalesCatalog as ae, useVertical as oe, withLabour as N } from "@pos/platform";
import { createPortal as P } from "react-dom";
//#region src/hooks/useDragScroll.ts
var F = 6;
function I() {
	let e = S(null);
	return b(() => {
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
			!n.moved && Math.hypot(r, i) > F && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var se = "\xA0";
function L(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, se);
}
function R(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${L(n)},${r} ₴`;
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function z({ name: e, subtitle: t, priceCents: n, imageUrl: i, stock: a, onClick: o, disabled: s, count: c, onMore: l, badge: u, testId: d }) {
	let [f, p] = C(!1), m = f ? null : O(i), h = s || !!u || a != null && a <= 0, g = /* @__PURE__ */ T("button", {
		type: "button",
		disabled: s,
		onClick: o,
		"data-testid": d,
		className: `w-full ${l ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ T("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				m ? /* @__PURE__ */ w("img", {
					src: m,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${h ? "opacity-45" : ""}`,
					onError: () => p(!0)
				}) : /* @__PURE__ */ w("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				c != null && c > 0 && /* @__PURE__ */ w("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: c
				}),
				u ? /* @__PURE__ */ w("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: u
				}) : a != null && a <= 0 && /* @__PURE__ */ w("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ T("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ w("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${h ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ w("p", {
				className: "text-[14px] text-sq-secondary tabular-nums",
				children: R(n)
			})]
		})]
	});
	return l ? /* @__PURE__ */ T("div", {
		className: "relative",
		children: [g, !s && /* @__PURE__ */ w("button", {
			type: "button",
			onClick: l,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": d ? `${d}-more` : "tile-more",
			children: /* @__PURE__ */ w("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ w(r, { size: 20 })
			})
		})]
	}) : g;
}
//#endregion
//#region src/lib/tagColors.ts
var ce = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], B = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, V = "slate";
function le(e) {
	return !!e && ce.includes(e);
}
function H(e) {
	return le(e) ? B[e] : B[V];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function U({ name: e, color: t, onClick: n }) {
	let r = H(t);
	return /* @__PURE__ */ T("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ w("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ w(c, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ T("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ w("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
//#endregion
//#region src/components/cashier/VariantPicker.tsx
function ue({ productName: t, variants: n, onPick: r, onClose: i }) {
	let a = I(), o = [...n].sort((e, t) => e.quantity <= 0 && t.quantity > 0 ? 1 : e.quantity > 0 && t.quantity <= 0 ? -1 : 0);
	return /* @__PURE__ */ w("div", {
		className: "fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ T("div", {
			role: "dialog",
			"aria-label": t,
			className: "bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
			"data-testid": "variant-picker",
			children: [/* @__PURE__ */ T("div", {
				className: "pl-5 pr-3 pt-4 pb-2 flex justify-between items-center gap-3",
				children: [/* @__PURE__ */ w("h3", {
					className: "text-[19px] font-bold text-sq-heading truncate",
					children: t
				}), /* @__PURE__ */ w("button", {
					type: "button",
					onClick: i,
					"aria-label": "Закрити",
					className: "w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0",
					children: /* @__PURE__ */ w(e, { size: 20 })
				})]
			}), /* @__PURE__ */ w("ul", {
				ref: a,
				className: "px-2 pb-2 max-h-[60vh] overflow-auto select-none",
				children: o.map((e) => {
					let t = e.label || "Стандарт", n = e.quantity <= 0;
					return /* @__PURE__ */ w("li", { children: /* @__PURE__ */ T("button", {
						type: "button",
						disabled: n,
						onClick: () => r(e),
						className: "w-full min-h-16 rounded-[14px] text-left px-3.5 py-2.5 flex items-center gap-3 disabled:opacity-50 hover:bg-sq-sidebar focus-visible:bg-sq-sidebar active:bg-sq-selected outline-none",
						children: [
							/* @__PURE__ */ T("span", {
								className: "flex-1 min-w-0",
								children: [/* @__PURE__ */ w("span", {
									className: `block text-[17px] font-semibold truncate ${n ? "text-sq-muted" : "text-sq-text"}`,
									children: t
								}), /* @__PURE__ */ w("span", {
									className: `block text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
									children: n ? "Немає в наявності" : `${e.quantity} ${e.unit || "шт"}`
								})]
							}),
							/* @__PURE__ */ w("span", {
								className: "text-[17px] font-semibold text-sq-text tabular-nums shrink-0",
								children: R(e.price_cents)
							}),
							/* @__PURE__ */ w(d, {
								size: 20,
								className: "text-sq-muted shrink-0"
							})
						]
					}) }, e.variant_id);
				})
			})]
		})
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function de({ tags: e, activeId: n, showBack: r, backLabel: i, onSelect: a, onBack: o }) {
	let s = I(), c = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ T("div", {
		ref: s,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			r && /* @__PURE__ */ T("button", {
				type: "button",
				onClick: o,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ w(t, { size: 16 }), i]
			}),
			/* @__PURE__ */ w("button", {
				type: "button",
				onClick: () => a(null),
				className: c(n === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ w("button", {
				type: "button",
				onClick: () => a(e),
				className: c(n === e.id),
				children: e.name
			}, e.id))
		]
	});
}
//#endregion
//#region src/components/cashier/ScanWedge.tsx
function W({ active: e, onScan: t }) {
	let n = S(null);
	return b(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ w("input", {
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
var G = [
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
], K = [
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
], q = G.map((e) => e.replace(/[01]/g, (e) => e === "0" ? "1" : "0")), fe = [
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
], pe = "101", me = "01010", he = "101", ge = [
	0,
	2,
	46,
	48,
	92,
	94
];
function _e(e) {
	return /^\d{13}$/.test(e);
}
function ve(e) {
	let t = 0;
	for (let n = 0; n < e.length; n += 1) {
		let r = e.charCodeAt(n) - 48;
		t += n % 2 == 0 ? r : r * 3;
	}
	return (10 - t % 10) % 10;
}
function ye(e) {
	return _e(e) ? ve(e.slice(0, 12)) === e.charCodeAt(12) - 48 : !1;
}
function be(e) {
	if (!_e(e)) throw Error(`not an EAN-13: ${e}`);
	let t = [...e].map(Number), n = fe[t[0]];
	return `${pe}${t.slice(1, 7).map((e, t) => n[t] === "L" ? G[e] : K[e]).join("")}${me}${t.slice(7).map((e) => q[e]).join("")}${he}`;
}
function xe(e) {
	let t = be(e), n = [], r = 0;
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
var Se = {
	58: .75,
	80: .5
}, Ce = {
	58: 48,
	80: 72
};
function we(e) {
	return Math.min(e * Se[e], Ce[e]);
}
function Te(e) {
	return we(e) / 117;
}
function Ee(e) {
	return Te(e) * 56;
}
function De(e) {
	return `${Math.round(e * 1e3) / 1e3}mm`;
}
function Oe(e) {
	return {
		"--tag-w": De(we(e)),
		"--tag-barcode-h": De(Ee(e))
	};
}
//#endregion
//#region src/lib/priceTag.ts
function ke(e) {
	return e.flatMap((e) => Array.from({ length: e.copies }, () => e));
}
//#endregion
//#region src/components/PriceTagsPrintable.tsx
function Ae(e) {
	return (e / 100).toFixed(2).replace(/\.00$/, "");
}
function je({ code: e }) {
	if (!ye(e)) return null;
	let t = [...e];
	return /* @__PURE__ */ T("svg", {
		className: "price-tag-barcode",
		viewBox: "0 0 117 56",
		preserveAspectRatio: "none",
		role: "img",
		"aria-label": e,
		children: [
			/* @__PURE__ */ w("rect", {
				x: 0,
				y: 0,
				width: 117,
				height: 56,
				fill: "#fff"
			}),
			/* @__PURE__ */ w("g", {
				shapeRendering: "crispEdges",
				fill: "#000",
				children: xe(e).map(([e, t]) => /* @__PURE__ */ w("rect", {
					x: 11 + e,
					y: 0,
					width: t,
					height: ge.includes(e) ? 45 : 40
				}, e))
			}),
			/* @__PURE__ */ T("g", {
				fill: "#000",
				fontFamily: "'Courier New', monospace",
				fontSize: 9,
				textAnchor: "middle",
				children: [
					/* @__PURE__ */ w("text", {
						x: 11 / 2,
						y: 54,
						children: t[0]
					}),
					t.slice(1, 7).map((e, t) => /* @__PURE__ */ w("text", {
						x: 14 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `l${t}`)),
					t.slice(7).map((e, t) => /* @__PURE__ */ w("text", {
						x: 61 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `r${t}`))
				]
			})
		]
	});
}
function Me({ tags: e, paperWidth: t }) {
	return !e || typeof document > "u" ? null : P(/* @__PURE__ */ w("div", {
		className: "price-tag-print-area",
		"data-paper": t,
		style: Oe(t),
		children: ke(e).map((e, t) => /* @__PURE__ */ T("div", {
			className: "price-tag",
			children: [
				/* @__PURE__ */ w("p", {
					className: "price-tag-store",
					children: e.storeName
				}),
				/* @__PURE__ */ w("p", {
					className: "price-tag-name",
					children: e.productName
				}),
				e.variantLabel && /* @__PURE__ */ w("p", {
					className: "price-tag-variant",
					children: e.variantLabel
				}),
				/* @__PURE__ */ T("p", {
					className: "price-tag-price",
					children: [Ae(e.priceCents), " ₴"]
				}),
				e.barcode ? /* @__PURE__ */ w(je, { code: e.barcode }) : /* @__PURE__ */ w("p", {
					className: "price-tag-digits",
					children: "без штрихкоду"
				}),
				e.sku && /* @__PURE__ */ w("p", {
					className: "price-tag-sku",
					children: e.sku
				})
			]
		}, t))
	}), document.body);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function J(e) {
	"@babel/helpers - typeof";
	return J = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, J(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function Ne(e, t) {
	if (J(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (J(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function Pe(e) {
	var t = Ne(e, "string");
	return J(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function Fe(e, t, n) {
	return (t = Pe(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-flowers/lib/hostPlatform.ts
var Ie = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical",
	"withLabour",
	"priceOfComponents",
	"customBouquetLabel",
	"buildPriceTags",
	"triggerPrint",
	"assetUrl"
], Le = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), Fe(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function Re(e) {
	return typeof e == "function";
}
function ze() {
	let e = E;
	return Ie.filter((t) => !Re(e[t]));
}
//#endregion
//#region src/modules/vertical-flowers/bench/RecipeSheet.tsx
function Be({ computedCents: t, components: n, onSaved: r, onClose: i }) {
	let [a, o] = C(""), [s, c] = C((t / 100).toFixed(2).replace(".", ",")), [l, d] = C(null), [f, p] = C(!1), [m, h] = C(null), _ = A(s), v = _ !== t;
	async function y() {
		p(!0), h(null);
		try {
			r((await D.saveBouquetRecipe({
				name: a.trim(),
				components: n,
				price_cents: v ? _ : null,
				image_url: l
			})).name);
		} catch (e) {
			let t = e.response?.data?.error;
			h(t || "Не вдалося зберегти рецепт");
		} finally {
			p(!1);
		}
	}
	return /* @__PURE__ */ w("div", {
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ T("div", {
			className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
			"data-testid": "recipe-sheet",
			children: [/* @__PURE__ */ T("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ w("h3", {
					className: "font-semibold text-sq-text",
					children: "Зберегти як рецепт"
				}), /* @__PURE__ */ w("button", {
					type: "button",
					onClick: i,
					disabled: f,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ w(e, { size: 20 })
				})]
			}), /* @__PURE__ */ T("div", {
				className: "p-4 space-y-4",
				children: [
					/* @__PURE__ */ w("p", {
						className: "text-xs text-sq-muted",
						children: "Букет лишиться на столі — рецепт це шаблон, який можна збирати знову. Стебла зараз не списуються."
					}),
					/* @__PURE__ */ w(g, {
						value: l,
						onChange: d,
						disabled: f
					}),
					/* @__PURE__ */ T("label", {
						className: "block",
						children: [/* @__PURE__ */ w("span", {
							className: "text-sm text-sq-secondary",
							children: "Назва рецепта"
						}), /* @__PURE__ */ w("input", {
							className: "pos-field mt-1.5",
							value: a,
							onChange: (e) => o(e.target.value),
							placeholder: "Весняний",
							autoFocus: !0,
							"data-testid": "recipe-name"
						})]
					}),
					/* @__PURE__ */ T("label", {
						className: "block",
						children: [
							/* @__PURE__ */ w("span", {
								className: "text-sm text-sq-secondary",
								children: "Ціна"
							}),
							/* @__PURE__ */ w("input", {
								className: "pos-field mt-1.5 text-lg",
								inputMode: "decimal",
								value: s,
								onChange: (e) => c(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "recipe-price"
							}),
							/* @__PURE__ */ w("span", {
								className: "mt-1 block text-xs text-sq-muted",
								children: v ? `Розраховано: ${k(t)}` : "Стебла та робота флориста"
							})
						]
					}),
					m && /* @__PURE__ */ w("p", {
						className: "text-sm text-red-600",
						"data-testid": "recipe-error",
						children: m
					}),
					/* @__PURE__ */ T("button", {
						type: "button",
						disabled: f || !a.trim() || _ <= 0,
						onClick: () => void y(),
						className: "sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2",
						"data-testid": "recipe-submit",
						children: [/* @__PURE__ */ w(u, { size: 20 }), f ? "Зберігаємо…" : "Зберегти рецепт"]
					})
				]
			})]
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/ShowcaseSheet.tsx
function Ve({ computedCents: t, busy: n, error: r, onSubmit: i, onClose: a }) {
	let [s, c] = C(""), [l, u] = C((t / 100).toFixed(2).replace(".", ",")), [d, p] = C(null), m = A(l), h = m !== t;
	function _(e) {
		i({
			name: s.trim() || null,
			priceCents: h ? m : null,
			imageUrl: d,
			print: e
		});
	}
	return /* @__PURE__ */ w("div", {
		className: "fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ T("div", {
			role: "dialog",
			"aria-label": "Букет на вітрину",
			className: "bg-white rounded-card w-full max-w-[460px] overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
			"data-testid": "showcase-sheet",
			children: [/* @__PURE__ */ T("div", {
				className: "px-5 pt-[18px] pb-3.5 flex items-center gap-2.5",
				children: [
					/* @__PURE__ */ w(o, { size: 24 }),
					/* @__PURE__ */ w("h3", {
						className: "flex-1 text-[19px] font-bold text-sq-heading",
						children: "Букет на вітрину"
					}),
					/* @__PURE__ */ w("button", {
						type: "button",
						onClick: a,
						disabled: n,
						className: "w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40",
						"aria-label": "Закрити",
						children: /* @__PURE__ */ w(e, { size: 20 })
					})
				]
			}), /* @__PURE__ */ T("div", {
				className: "px-5 pb-5 flex flex-col gap-3.5",
				children: [
					/* @__PURE__ */ w(g, {
						value: d,
						onChange: p,
						disabled: n
					}),
					/* @__PURE__ */ T("label", {
						className: "flex flex-col gap-1.5",
						children: [/* @__PURE__ */ w("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Назва"
						}), /* @__PURE__ */ w("input", {
							className: He,
							value: s,
							onChange: (e) => c(e.target.value),
							placeholder: "Букет №… — за номером документа",
							"data-testid": "showcase-name"
						})]
					}),
					/* @__PURE__ */ T("label", {
						className: "flex flex-col gap-1.5",
						children: [
							/* @__PURE__ */ w("span", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Ціна на цінник"
							}),
							/* @__PURE__ */ w("input", {
								className: `${He} text-lg font-semibold tabular-nums`,
								inputMode: "decimal",
								value: l,
								onChange: (e) => u(e.target.value.replace(/[^\d.,]/g, "")),
								"data-testid": "showcase-price"
							}),
							/* @__PURE__ */ w("span", {
								className: "text-[13px] text-sq-muted",
								children: h ? `Стебла й робота флориста — ${k(t)}, округлено` : "Стебла та робота флориста"
							})
						]
					}),
					r && /* @__PURE__ */ w("p", {
						className: "text-sm text-red-600",
						"data-testid": "showcase-error",
						children: r
					}),
					/* @__PURE__ */ T("button", {
						type: "button",
						disabled: n || m <= 0,
						onClick: () => _(!0),
						className: "pos-btn-primary min-h-[52px] rounded-xl w-full text-[17px] gap-2",
						"data-testid": "showcase-submit-print",
						children: [/* @__PURE__ */ w(f, { size: 20 }), n ? "Робимо…" : "Зробити і надрукувати цінник"]
					}),
					/* @__PURE__ */ w("button", {
						type: "button",
						disabled: n || m <= 0,
						onClick: () => _(!1),
						className: "min-h-11 w-full text-base font-semibold text-sq-blue disabled:opacity-50",
						"data-testid": "showcase-submit",
						children: "Зробити без цінника"
					})
				]
			})]
		})
	});
}
var He = "h-[46px] rounded-[10px] bg-sq-empty px-3.5 text-base text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white placeholder:text-sq-muted";
//#endregion
//#region src/modules/vertical-flowers/bench/BudgetBar.tsx
function Y({ totalCents: e, budgetCents: t, ratio: n, remainingCents: r, over: i, nextStems: a, onOpenBudget: o }) {
	return t == null ? /* @__PURE__ */ w("button", {
		type: "button",
		onClick: o,
		className: "w-full min-h-11 rounded-xl bg-sq-empty text-[15px] font-semibold text-sq-secondary hover:text-sq-text hover:bg-sq-selected",
		"data-testid": "bench-set-budget",
		children: "Поставити бюджет"
	}) : /* @__PURE__ */ T("button", {
		type: "button",
		onClick: o,
		className: "w-full flex flex-col gap-1.5 text-left min-h-11 justify-center",
		"data-testid": "bench-budget",
		children: [/* @__PURE__ */ T("span", {
			className: "w-full flex items-baseline justify-between gap-3 text-[13px]",
			children: [/* @__PURE__ */ w("span", {
				className: i ? "text-sq-danger font-semibold" : "text-sq-secondary",
				children: i ? `Перебір на ${k(-r)}` : a != null && a > 0 ? `Бюджет · ще ≈ ${a} ${Ue(a)}` : "Бюджет · у межах"
			}), /* @__PURE__ */ T("span", {
				className: "font-semibold text-sq-text tabular-nums shrink-0",
				children: [
					k(e),
					" з ",
					k(t)
				]
			})]
		}), /* @__PURE__ */ w("span", {
			className: "block w-full h-2 rounded-full bg-sq-empty overflow-hidden",
			children: /* @__PURE__ */ w("span", {
				className: `block h-full rounded-full transition-[width] duration-150 ${i ? "bg-sq-danger" : "bg-sq-success"}`,
				style: { width: `${Math.round(n * 100)}%` }
			})
		})]
	});
}
function Ue(e) {
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
function We({ stems: e, totals: t, labourBps: n, selectedId: r, onSelect: o, onStep: s, onRemove: c }) {
	let l = I(), u = S(null);
	return b(() => {
		u.current?.scrollIntoView({ block: "nearest" });
	}, [r, e.length]), /* @__PURE__ */ T("div", {
		className: "flex flex-col min-h-0 flex-1",
		"data-testid": "bench-composition",
		children: [e.length === 0 ? /* @__PURE__ */ w("div", {
			className: "flex-1 grid place-items-center p-6 text-center",
			children: /* @__PURE__ */ w("p", {
				className: "text-sm text-sq-muted max-w-[22ch]",
				children: "Торкніться квітки, щоб покласти її в букет"
			})
		}) : /* @__PURE__ */ w("ul", {
			ref: l,
			className: "flex-1 overflow-auto px-3 pb-2 space-y-2 select-none",
			children: e.map((e) => {
				let t = e.item.variant_id === r;
				return /* @__PURE__ */ T("li", {
					ref: t ? u : void 0,
					className: `rounded-[14px] pl-3.5 pr-3 py-3 flex flex-col gap-2 transition-colors ${t ? "bg-white shadow-card" : ""}`,
					"data-testid": "bench-stem",
					"data-selected": t ? "true" : void 0,
					children: [/* @__PURE__ */ T("div", {
						className: "flex items-baseline justify-between gap-3",
						children: [/* @__PURE__ */ T("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ w("p", {
								className: "text-base font-semibold text-sq-text truncate",
								children: e.item.product_name
							}), e.item.label && /* @__PURE__ */ w("p", {
								className: "text-[13px] text-sq-muted truncate",
								children: e.item.label
							})]
						}), /* @__PURE__ */ w("p", {
							className: "text-base font-semibold text-sq-text tabular-nums shrink-0",
							children: k(e.item.price_cents * e.quantity)
						})]
					}), /* @__PURE__ */ T("div", {
						className: "flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ w("button", {
								type: "button",
								onClick: () => s(e.item.variant_id, -1),
								className: Ge,
								"aria-label": `Менше: ${e.item.product_name}`,
								children: /* @__PURE__ */ w(h, { size: 20 })
							}),
							/* @__PURE__ */ w("button", {
								type: "button",
								onClick: () => o(e.item.variant_id),
								className: `w-11 h-10 rounded-[10px] text-center text-[17px] font-semibold tabular-nums text-sq-text ${t ? "bg-white ring-2 ring-sq-blue" : ""}`,
								"aria-label": `Набрати кількість: ${e.item.product_name}`,
								"data-testid": "bench-stem-qty",
								children: e.quantity
							}),
							/* @__PURE__ */ w("button", {
								type: "button",
								onClick: () => s(e.item.variant_id, 1),
								disabled: e.quantity >= e.item.quantity,
								className: Ge,
								"aria-label": `Більше: ${e.item.product_name}`,
								children: /* @__PURE__ */ w(i, { size: 20 })
							}),
							/* @__PURE__ */ T("span", {
								className: "text-[13px] text-sq-muted ml-1.5 truncate flex-1",
								children: [e.item.quantity, " на полиці"]
							}),
							/* @__PURE__ */ w("button", {
								type: "button",
								onClick: () => c(e.item.variant_id),
								className: "w-10 h-10 grid place-items-center rounded-full text-sq-muted hover:text-red-600 shrink-0",
								"aria-label": `Прибрати: ${e.item.product_name}`,
								children: /* @__PURE__ */ w(a, { size: 20 })
							})
						]
					})]
				}, e.item.variant_id);
			})
		}), /* @__PURE__ */ T("div", {
			className: "mx-3 px-2 pt-3 pb-2.5 space-y-1.5 shrink-0 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]",
			children: [
				/* @__PURE__ */ w(Ke, {
					label: "Квіти",
					valueCents: t.partsCents
				}),
				n > 0 && /* @__PURE__ */ w(Ke, {
					label: `Робота флориста · ${qe(n)}`,
					valueCents: t.labourCents
				}),
				/* @__PURE__ */ T("div", {
					className: "flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ w("span", {
						className: "text-[17px] font-bold text-sq-heading",
						children: "Разом"
					}), /* @__PURE__ */ w("span", {
						className: "text-[26px] font-bold text-sq-heading tabular-nums",
						"data-testid": "bench-total",
						children: k(t.totalCents)
					})]
				})
			]
		})]
	});
}
var Ge = "w-10 h-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider text-sq-text disabled:opacity-40";
function Ke({ label: e, valueCents: t }) {
	return /* @__PURE__ */ T("div", {
		className: "flex items-baseline justify-between gap-3",
		children: [/* @__PURE__ */ w("span", {
			className: "text-[15px] text-sq-secondary",
			children: e
		}), /* @__PURE__ */ w("span", {
			className: "text-[15px] text-sq-secondary tabular-nums",
			children: k(t)
		})]
	});
}
function qe(e) {
	let t = e / 100;
	return `${Number.isInteger(t) ? t : t.toFixed(1).replace(".", ",")} %`;
}
//#endregion
//#region src/modules/vertical-flowers/bench/QuantityPad.tsx
var Je = [
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
	"C",
	"0",
	"del"
], X = "min-h-11 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)] text-lg font-semibold text-sq-text grid place-items-center disabled:opacity-40 active:bg-sq-selected";
function Z({ targetName: e, onDigit: t, onBackspace: n, onClear: r }) {
	let i = e == null;
	return /* @__PURE__ */ T("div", {
		className: "px-3 pt-1.5 pb-3",
		"data-testid": "bench-pad",
		children: [/* @__PURE__ */ w("p", {
			className: "sr-only",
			"aria-live": "polite",
			children: i ? "Торкніться квітки, щоб набрати кількість" : `Кількість: ${e}`
		}), /* @__PURE__ */ w("div", {
			className: "grid grid-cols-6 gap-1.5",
			children: Je.map((e) => e === "del" ? /* @__PURE__ */ w("button", {
				type: "button",
				disabled: i,
				onClick: n,
				className: X,
				"aria-label": "Стерти цифру",
				"data-testid": "bench-pad-backspace",
				children: /* @__PURE__ */ w(m, { size: 20 })
			}, e) : e === "C" ? /* @__PURE__ */ w("button", {
				type: "button",
				disabled: i,
				onClick: r,
				className: X,
				"aria-label": "Скинути до одного",
				"data-testid": "bench-pad-clear",
				children: "C"
			}, e) : /* @__PURE__ */ w("button", {
				type: "button",
				disabled: i,
				onClick: () => t(Number(e)),
				className: X,
				"data-testid": `bench-pad-${e}`,
				children: e
			}, e))
		})]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/StemGrid.tsx
function Ye({ grouped: e, folderTiles: t, loading: n, defaultUnit: r, countOf: i, onPick: a, onEnterTag: o }) {
	let s = I();
	return /* @__PURE__ */ T("div", {
		ref: s,
		className: "flex-1 overflow-auto px-5 pt-3 pb-4 bg-white select-none",
		"data-testid": "bench-grid",
		children: [
			n && /* @__PURE__ */ w("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			/* @__PURE__ */ T("div", {
				className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-3",
				children: [t.map((e) => /* @__PURE__ */ w(U, {
					name: e.name,
					color: e.color,
					onClick: () => o(e)
				}, e.id)), e.map(([e, t]) => {
					let n = t[0], o = Math.min(...t.map((e) => e.price_cents)), s = t.reduce((e, t) => e + t.quantity, 0), c = t.reduce((e, t) => e + i(t.variant_id), 0), l = n.unit || r;
					return /* @__PURE__ */ w(z, {
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
			!n && t.length === 0 && e.length === 0 && /* @__PURE__ */ w("div", {
				className: "rounded-card bg-sq-sidebar p-8 text-center text-sq-muted text-sm mt-4",
				children: "Порожньо"
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-flowers/bench/stems.ts
function Xe(e) {
	return (e.kind ?? "simple") !== "composite";
}
function Q(e) {
	return e.kind === "composite" && e.stock_mode === "derived";
}
//#endregion
//#region src/modules/vertical-flowers/bench/useBench.ts
function Ze(e) {
	let [t, n] = C([]), [r, i] = C(null), [a, o] = C(null), [s, c] = C(!1), l = y((e) => t.find((t) => t.item.variant_id === e)?.quantity ?? 0, [t]), u = y((e, t = 1) => {
		o(e.variant_id), c(!1), n((n) => {
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
	}, []), d = y((e, t) => {
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
	}, []), f = y(() => {
		n([]), i(null), o(null), c(!1);
	}, []), p = y((e) => {
		let t = e.map(({ item: e, quantity: t }) => ({
			item: e,
			quantity: Math.min(t, Math.max(0, e.quantity))
		})).filter((e) => e.quantity > 0);
		n(t), o(t.length > 0 ? t[t.length - 1].item.variant_id : null), c(!1);
	}, []), m = y((e) => {
		o(e), c(!1);
	}, []), h = y((e) => {
		a != null && (s || e !== 0) && (n((t) => {
			let n = t.findIndex((e) => e.item.variant_id === a);
			if (n === -1) return t;
			let r = s ? t[n].quantity * 10 + e : e, i = Math.min(r, Math.max(0, t[n].item.quantity));
			if (i <= 0) return t;
			let o = [...t];
			return o[n] = {
				...o[n],
				quantity: i
			}, o;
		}), c(!0));
	}, [a, s]), g = y(() => {
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
	}, [a]), _ = y(() => {
		a != null && (n((e) => e.map((e) => e.item.variant_id === a && e.item.quantity >= 1 ? {
			...e,
			quantity: 1
		} : e)), c(!1));
	}, [a]), v = x(() => t.map((e) => ({
		component_variant_id: e.item.variant_id,
		quantity: e.quantity,
		product_name: e.item.product_name,
		label: e.item.label,
		unit: e.item.unit,
		unit_price_cents: e.item.price_cents
	})), [t]);
	return {
		stems: t,
		countOf: l,
		add: u,
		setQuantity: d,
		clear: f,
		totals: x(() => {
			let n = new Map(t.map((e) => [e.item.variant_id, e.item])), r = ne(v.map((e) => ({
				component_variant_id: e.component_variant_id,
				quantity: e.quantity
			})), n, 0), i = N(r, e);
			return {
				partsCents: r,
				labourCents: i - r,
				totalCents: i,
				stemCount: t.reduce((e, t) => e + t.quantity, 0)
			};
		}, [
			t,
			v,
			e
		]),
		labourBps: e,
		budgetCents: r,
		setBudgetCents: i,
		components: v,
		selectedId: a,
		select: m,
		typeDigit: h,
		backspace: g,
		clearTyped: _,
		loadComposition: p
	};
}
function Qe(e, t, n, r) {
	if (t == null || t <= 0) return {
		ratio: 0,
		remainingCents: 0,
		over: !1,
		nextStems: null
	};
	let i = t - e, a = n && n > 0 ? N(n, r) : 0;
	return {
		ratio: Math.min(1, e / t),
		remainingCents: i,
		over: i < 0,
		nextStems: a > 0 && i > 0 ? Math.floor(i / a) : null
	};
}
//#endregion
//#region src/modules/vertical-flowers/bench/FloristBench.tsx
function $e(e) {
	return e.response?.data?.error || "Не вдалося зробити букет. Спробуйте ще раз.";
}
function et() {
	try {
		return localStorage.getItem("pos.priceTagPaperWidth") === "80" ? 80 : 58;
	} catch {
		return 58;
	}
}
function tt({ card: t, labourBps: r, catalog: i, onDone: a, onShowcased: c, onRecipeSaved: d, onClose: f }) {
	let p = Ze(r), m = oe(), [h, g] = C(null), [_, v] = C(!1), [y, E] = C(!1), O = ie((e) => e.online), te = j((e) => e.auth?.store.name ?? ""), [ne, A] = C(!1), [M, ae] = C(null), [N, P] = C(null), [F, I] = C(!1), [se, L] = C(null), [R, z] = C(null);
	b(() => {
		if (!R) return;
		let e = () => z(null);
		window.addEventListener("afterprint", e);
		let t = requestAnimationFrame(re);
		return () => {
			window.removeEventListener("afterprint", e), cancelAnimationFrame(t);
		};
	}, [R]);
	async function ce(e) {
		if (N) {
			I(!0), L(null);
			try {
				let t = await D.assembleShowcase({
					client_uuid: N.uuid,
					components: p.components.map((e) => ({
						component_variant_id: e.component_variant_id,
						quantity: e.quantity
					})),
					name: e.name,
					price_cents: e.priceCents,
					image_url: e.imageUrl
				});
				e.print && z(ee(te, [{
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
				}])), i.refresh(), c(t.name, t.price_cents);
			} catch (e) {
				L($e(e));
			} finally {
				I(!1);
			}
		}
	}
	let B = x(() => i.grouped.map(([e, t]) => [e, t.filter(Xe)]).filter(([, e]) => e.length > 0).map(([e, t]) => [e, t]), [i.grouped]), V = S(!1);
	b(() => {
		if (V.current) return;
		let e = t.components ?? [];
		if (e.length === 0 || i.loading) return;
		V.current = !0;
		let n = new Map(i.grouped.flatMap(([, e]) => e).map((e) => [e.variant_id, e])), r = e.map((e) => {
			let t = n.get(e.component_variant_id);
			return t ? {
				item: t,
				quantity: e.quantity
			} : null;
		}).filter((e) => e !== null);
		p.loadComposition(r), r.length < e.length && ae("Деяких квітів із рецепта вже немає — перевірте склад");
	}, [
		t,
		i.loading,
		i.grouped
	]);
	let le = p.stems.length > 0 ? p.stems[p.stems.length - 1].item : null, H = Qe(p.totals.totalCents, p.budgetCents, le?.price_cents ?? null, r);
	function U(e) {
		if (e.length === 1) {
			p.add(e[0]);
			return;
		}
		g(e);
	}
	async function G(e) {
		let t = (await i.lookupBarcode(e)).filter(Xe);
		t.length === 1 ? p.add(t[0]) : t.length > 1 && g(t);
	}
	let K = p.stems.length === 0, q = p.stems.find((e) => e.item.variant_id === p.selectedId)?.item.product_name ?? null;
	return /* @__PURE__ */ T("div", {
		className: "fixed inset-0 z-40 bg-white flex flex-col",
		"data-testid": "florist-bench",
		children: [
			/* @__PURE__ */ w(W, {
				active: !h && !_,
				onScan: (e) => void G(e)
			}),
			/* @__PURE__ */ T("header", {
				className: "min-h-[72px] pl-6 pr-5 py-2 flex items-center gap-6 shrink-0 shadow-[0_1px_0_#E6E8EC]",
				children: [
					/* @__PURE__ */ T("div", {
						className: "flex items-center gap-3 min-w-0 flex-1",
						children: [/* @__PURE__ */ w(n, { size: 24 }), /* @__PURE__ */ T("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ w("h2", {
								className: "text-xl font-bold text-sq-heading truncate",
								children: t.product_name
							}), /* @__PURE__ */ w("p", {
								className: `text-[13px] truncate ${M ? "text-amber-700" : "text-sq-muted"}`,
								children: M ?? (p.totals.stemCount > 0 ? `${p.totals.stemCount} у букеті` : "Збираємо букет")
							})]
						})]
					}),
					/* @__PURE__ */ w("div", {
						className: "hidden lg:block w-[380px] shrink-0",
						children: /* @__PURE__ */ w(Y, {
							totalCents: p.totals.totalCents,
							budgetCents: p.budgetCents,
							ratio: H.ratio,
							remainingCents: H.remainingCents,
							over: H.over,
							nextStems: H.nextStems,
							onOpenBudget: () => v(!0)
						})
					}),
					/* @__PURE__ */ w("button", {
						type: "button",
						onClick: f,
						className: "w-11 h-11 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0",
						"aria-label": "Закрити",
						children: /* @__PURE__ */ w(e, { size: 20 })
					})
				]
			}),
			/* @__PURE__ */ T("div", {
				className: "flex-1 flex min-h-0",
				children: [/* @__PURE__ */ T("section", {
					className: "flex-1 flex flex-col min-w-0 min-h-0",
					children: [/* @__PURE__ */ T("div", {
						className: "px-5 pt-3.5 space-y-2.5 shrink-0",
						children: [/* @__PURE__ */ T("div", {
							className: "relative",
							children: [/* @__PURE__ */ w(l, {
								size: 20,
								className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ w("input", {
								className: "w-full h-11 rounded-xl bg-sq-empty pl-11 pr-3.5 text-[15px] text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white placeholder:text-sq-muted",
								placeholder: "Пошук стебла",
								value: i.query,
								onChange: (e) => i.setQuery(e.target.value)
							})]
						}), !i.query.trim() && /* @__PURE__ */ w(de, {
							tags: i.catalogBarTags,
							activeId: i.catalogBarActiveId,
							showBack: i.showBack,
							backLabel: i.backLabel,
							onSelect: i.selectCatalogBarTag,
							onBack: i.goBackOne
						})]
					}), /* @__PURE__ */ w(Ye, {
						grouped: B,
						folderTiles: i.folderTiles,
						loading: i.loading,
						defaultUnit: m.defaultUnit,
						countOf: p.countOf,
						onPick: U,
						onEnterTag: i.enterTag
					})]
				}), /* @__PURE__ */ T("aside", {
					className: "hidden lg:flex w-[22rem] xl:w-[25rem] shrink-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC] min-h-0",
					children: [
						/* @__PURE__ */ T("div", {
							className: "px-5 pt-4 pb-2 flex items-baseline justify-between shrink-0",
							children: [/* @__PURE__ */ w("h3", {
								className: "text-[17px] font-bold text-sq-heading",
								children: "Склад букета"
							}), p.stems.length > 0 && /* @__PURE__ */ w("span", {
								className: "text-[13px] text-sq-muted",
								children: rt(p.stems.length)
							})]
						}),
						/* @__PURE__ */ w(We, {
							stems: p.stems,
							totals: p.totals,
							labourBps: r,
							selectedId: p.selectedId,
							onSelect: p.select,
							onStep: (e, t) => {
								let n = p.stems.find((t) => t.item.variant_id === e);
								n && p.add(n.item, t);
							},
							onRemove: (e) => p.setQuantity(e, 0)
						}),
						/* @__PURE__ */ w(Z, {
							targetName: q,
							onDigit: p.typeDigit,
							onBackspace: p.backspace,
							onClear: p.clearTyped
						})
					]
				})]
			}),
			/* @__PURE__ */ T("div", {
				className: "lg:hidden px-4 py-2.5 bg-white shrink-0 space-y-2 shadow-[0_-1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ w(Y, {
					totalCents: p.totals.totalCents,
					budgetCents: p.budgetCents,
					ratio: H.ratio,
					remainingCents: H.remainingCents,
					over: H.over,
					nextStems: H.nextStems,
					onOpenBudget: () => v(!0)
				}), /* @__PURE__ */ T("button", {
					type: "button",
					onClick: () => E(!0),
					className: "w-full min-h-12 flex items-center justify-between gap-3 rounded-xl bg-sq-sidebar px-4",
					"data-testid": "bench-open-sheet",
					children: [/* @__PURE__ */ T("span", {
						className: "text-[15px] font-semibold text-sq-text",
						children: ["Склад букета · ", p.totals.stemCount || "—"]
					}), /* @__PURE__ */ T("span", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ w("span", {
							className: "text-lg font-bold tabular-nums text-sq-heading",
							"data-testid": "bench-total-mobile",
							children: k(p.totals.totalCents)
						}), /* @__PURE__ */ w(s, {
							size: 20,
							className: "text-sq-muted rotate-180"
						})]
					})]
				})]
			}),
			/* @__PURE__ */ T("footer", {
				className: "min-h-[76px] px-5 py-3 flex items-center gap-2.5 shrink-0 bg-white shadow-[0_-1px_0_#E6E8EC]",
				children: [
					/* @__PURE__ */ w("button", {
						type: "button",
						onClick: f,
						className: $,
						children: "Скасувати"
					}),
					/* @__PURE__ */ T("button", {
						type: "button",
						disabled: K || !O,
						title: O ? void 0 : "Потрібна мережа",
						onClick: () => {
							L(null), P({ uuid: crypto.randomUUID() });
						},
						className: $,
						"data-testid": "bench-to-showcase",
						children: [/* @__PURE__ */ w(o, { size: 24 }), /* @__PURE__ */ w("span", {
							className: "hidden sm:inline",
							children: O ? "На вітрину" : "Потрібна мережа"
						})]
					}),
					/* @__PURE__ */ T("button", {
						type: "button",
						disabled: K || !O,
						title: O ? void 0 : "Потрібна мережа",
						onClick: () => A(!0),
						className: $,
						"data-testid": "bench-save-recipe",
						children: [/* @__PURE__ */ w(u, { size: 20 }), /* @__PURE__ */ w("span", {
							className: "hidden lg:inline",
							children: "Зберегти рецепт"
						})]
					}),
					/* @__PURE__ */ T("button", {
						type: "button",
						disabled: K,
						onClick: () => a({
							unit_price_cents: p.totals.totalCents,
							components: p.components
						}),
						className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] flex-1",
						"data-testid": "bench-add-to-cart",
						children: ["Додати в чек · ", k(p.totals.totalCents)]
					})
				]
			}),
			y && /* @__PURE__ */ T("div", {
				className: "fixed inset-0 z-50 lg:hidden",
				children: [/* @__PURE__ */ w("button", {
					type: "button",
					className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
					"aria-label": "Закрити склад",
					onClick: () => E(!1)
				}), /* @__PURE__ */ T("div", {
					className: "absolute inset-x-0 bottom-0 max-h-[88dvh] bg-sq-sidebar rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] flex flex-col animate-fade-up overflow-hidden",
					children: [
						/* @__PURE__ */ T("div", {
							className: "px-5 pt-2 pb-3 bg-white shrink-0 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ w("div", {
									"aria-hidden": !0,
									className: "w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2"
								}),
								/* @__PURE__ */ T("div", {
									className: "flex items-center justify-between",
									children: [/* @__PURE__ */ w("h3", {
										className: "text-[17px] font-bold text-sq-heading",
										children: "Склад букета"
									}), /* @__PURE__ */ w("button", {
										type: "button",
										onClick: () => E(!1),
										className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
										"aria-label": "Закрити",
										children: /* @__PURE__ */ w(e, { size: 20 })
									})]
								}),
								/* @__PURE__ */ w("div", {
									className: "mt-1",
									children: /* @__PURE__ */ w(Y, {
										totalCents: p.totals.totalCents,
										budgetCents: p.budgetCents,
										ratio: H.ratio,
										remainingCents: H.remainingCents,
										over: H.over,
										nextStems: H.nextStems,
										onOpenBudget: () => v(!0)
									})
								})
							]
						}),
						/* @__PURE__ */ w(We, {
							stems: p.stems,
							totals: p.totals,
							labourBps: r,
							selectedId: p.selectedId,
							onSelect: p.select,
							onStep: (e, t) => {
								let n = p.stems.find((t) => t.item.variant_id === e);
								n && p.add(n.item, t);
							},
							onRemove: (e) => p.setQuantity(e, 0)
						}),
						/* @__PURE__ */ w(Z, {
							targetName: q,
							onDigit: p.typeDigit,
							onBackspace: p.backspace,
							onClear: p.clearTyped
						})
					]
				})]
			}),
			ne && /* @__PURE__ */ w(Be, {
				computedCents: p.totals.totalCents,
				onClose: () => A(!1),
				onSaved: (e) => {
					A(!1), d(e);
				},
				components: p.components.map((e) => ({
					component_variant_id: e.component_variant_id,
					quantity: e.quantity
				}))
			}),
			N && /* @__PURE__ */ w(Ve, {
				computedCents: p.totals.totalCents,
				busy: F,
				error: se,
				onSubmit: (e) => void ce(e),
				onClose: () => P(null)
			}),
			/* @__PURE__ */ w(Me, {
				tags: R,
				paperWidth: et()
			}),
			_ && /* @__PURE__ */ w(nt, {
				valueCents: p.budgetCents,
				onSubmit: (e) => {
					p.setBudgetCents(e), v(!1);
				},
				onClose: () => v(!1)
			}),
			h && /* @__PURE__ */ w(ue, {
				productName: h[0]?.product_name ?? "",
				variants: h,
				onPick: (e) => {
					p.add(e), g(null);
				},
				onClose: () => g(null)
			})
		]
	});
}
function nt({ valueCents: t, onSubmit: n, onClose: r }) {
	let [i, a] = C(t == null ? "" : String(t / 100));
	return /* @__PURE__ */ w("div", {
		className: "fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ T("div", {
			className: "bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
			children: [/* @__PURE__ */ T("div", {
				className: "px-5 pt-4 pb-2 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ w("h3", {
					className: "text-[19px] font-bold text-sq-heading",
					children: "Бюджет клієнта"
				}), /* @__PURE__ */ w("button", {
					type: "button",
					onClick: r,
					className: "min-h-11 min-w-11 grid place-items-center text-sq-secondary",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ w(e, { size: 20 })
				})]
			}), /* @__PURE__ */ T("div", {
				className: "px-5 pb-5 space-y-3",
				children: [
					/* @__PURE__ */ w("input", {
						className: "w-full h-12 rounded-[10px] bg-sq-empty px-3.5 text-lg font-semibold tabular-nums text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white",
						inputMode: "decimal",
						autoFocus: !0,
						placeholder: "1500",
						value: i,
						onChange: (e) => a(e.target.value.replace(/[^\d.,]/g, "")),
						"aria-label": "Бюджет, ₴",
						"data-testid": "bench-budget-input"
					}),
					/* @__PURE__ */ w("p", {
						className: "text-xs text-sq-secondary",
						children: "Підказка, а не ціна: смуга показує, скільки ще влізе. Ціна завжди рахується зі складу букета."
					}),
					/* @__PURE__ */ T("div", {
						className: "flex gap-2",
						children: [t != null && /* @__PURE__ */ w("button", {
							type: "button",
							onClick: () => n(null),
							className: "min-h-12 px-4 rounded-xl bg-white ring-1 ring-sq-divider font-semibold text-sq-text",
							children: "Прибрати"
						}), /* @__PURE__ */ w("button", {
							type: "button",
							onClick: () => n(A(i) || null),
							className: "pos-btn-primary min-h-12 rounded-xl flex-1",
							children: "Готово"
						})]
					})
				]
			})]
		})
	});
}
var $ = "min-h-[52px] px-[18px] rounded-xl bg-white ring-1 ring-sq-divider text-base font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-sq-sidebar";
function rt(e) {
	let t = e % 100, n = e % 10;
	return t >= 11 && t <= 14 ? `${e} позицій` : n === 1 ? `${e} позиція` : n >= 2 && n <= 4 ? `${e} позиції` : `${e} позицій`;
}
//#endregion
//#region src/modules/vertical-flowers/FlowersCatalog.tsx
var it = v(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function at({ active: e, stockEpoch: t }) {
	let n = ze();
	if (n.length > 0) throw new Le(n);
	return /* @__PURE__ */ w(ot, {
		active: e,
		stockEpoch: t
	});
}
function ot({ active: e, stockEpoch: t }) {
	let r = ae(), i = oe(), a = M((e) => e.addItem), o = M((e) => e.addAssembled), s = M((e) => e.setBanner), c = I(), u = j((e) => e.auth?.store.florist_labour_bps ?? 0), [d, f] = C(!1), [m, h] = C(null), [g, v] = C(null), y = S([]), E = x(() => r.grouped.flatMap(([, e]) => e).filter(Q), [r.grouped]);
	E.length > y.current.length && (y.current = E), b(() => {
		t > 0 && r.refresh();
	}, [t]);
	async function D(e) {
		let t = await r.lookupBarcode(e);
		if (t.length === 1) {
			a(t[0]), r.setQuery("");
			return;
		}
		if (t.length === 0) {
			s("Штрихкод не знайдено");
			return;
		}
		h(t);
	}
	return /* @__PURE__ */ T("section", {
		className: "flex flex-col min-h-0 bg-white",
		"data-testid": "flowers-catalog",
		children: [
			/* @__PURE__ */ w(W, {
				active: e && !m && !d && !g,
				onScan: (e) => void D(e)
			}),
			/* @__PURE__ */ T("div", {
				className: "px-4 pt-3 pb-1 space-y-2 shrink-0",
				children: [/* @__PURE__ */ T("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ T("div", {
							className: "relative flex-1",
							children: [/* @__PURE__ */ w(l, {
								size: 20,
								className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
							}), /* @__PURE__ */ w("input", {
								className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
								placeholder: "Пошук або скан штрихкоду",
								value: r.query,
								onChange: (e) => r.setQuery(e.target.value)
							})]
						}),
						/* @__PURE__ */ w("button", {
							type: "button",
							onClick: () => f(!0),
							className: "min-h-12 min-w-12 grid place-items-center rounded-xl text-sq-blue bg-sq-empty hover:bg-sq-selected transition-colors",
							"aria-label": "Камера",
							children: /* @__PURE__ */ w(p, { size: 20 })
						}),
						y.current.length > 0 && /* @__PURE__ */ T("button", {
							type: "button",
							onClick: () => {
								let e = y.current, t = e.filter((e) => (e.components ?? []).length === 0), n = t.length > 0 ? t : e;
								n.length === 1 ? v(n[0]) : h(n);
							},
							className: "min-h-12 px-3 flex items-center gap-2 rounded-sq text-white bg-sq-blue font-medium shrink-0",
							"data-testid": "start-bouquet",
							children: [/* @__PURE__ */ w(n, { size: 24 }), /* @__PURE__ */ w("span", {
								className: "hidden sm:inline",
								children: "Зібрати букет"
							})]
						})
					]
				}), !r.query.trim() && /* @__PURE__ */ w(de, {
					tags: r.catalogBarTags,
					activeId: r.catalogBarActiveId,
					showBack: r.showBack,
					backLabel: r.backLabel,
					onSelect: r.selectCatalogBarTag,
					onBack: r.goBackOne
				})]
			}),
			/* @__PURE__ */ T("div", {
				ref: c,
				className: "flex-1 overflow-auto px-4 pt-2 pb-4 bg-white select-none",
				children: [
					r.loading && /* @__PURE__ */ w("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ T("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3",
						children: [r.folderTiles.map((e) => /* @__PURE__ */ w(U, {
							name: e.name,
							color: e.color,
							onClick: () => r.enterTag(e)
						}, e.id)), r.grouped.map(([e, t]) => {
							let n = t[0], r = Math.min(...t.map((e) => e.price_cents)), o = t.reduce((e, t) => e + t.quantity, 0), s = n.unit || i.defaultUnit;
							return /* @__PURE__ */ w(z, {
								name: n.product_name,
								subtitle: [n.label, `${o} ${s}`].filter(Boolean).join(" · "),
								priceCents: r,
								imageUrl: n.image_url,
								stock: o,
								disabled: o <= 0,
								onClick: () => {
									if (t.length > 1) {
										h(t);
										return;
									}
									Q(t[0]) ? v(t[0]) : a(t[0]);
								}
							}, e);
						})]
					}),
					!r.loading && r.folderTiles.length === 0 && r.grouped.length === 0 && /* @__PURE__ */ w("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			d && /* @__PURE__ */ w(_, {
				fallback: null,
				children: /* @__PURE__ */ w(it, {
					onScan: (e) => {
						f(!1), D(e);
					},
					onClose: () => f(!1)
				})
			}),
			g && /* @__PURE__ */ w(tt, {
				card: g,
				labourBps: u,
				catalog: r,
				onClose: () => v(null),
				onRecipeSaved: (e) => {
					s(`Рецепт «${e}» збережено`);
				},
				onShowcased: (e, t) => {
					s(`${e} — на вітрині, ${k(t)}`), v(null);
				},
				onDone: ({ unit_price_cents: e, components: t }) => {
					o({
						variant_id: g.variant_id,
						product_name: g.product_name,
						variant_label: te(t),
						unit: g.unit,
						unit_price_cents: e,
						quantity: 1,
						image_url: g.image_url,
						components: t
					}), v(null);
				}
			}),
			m && /* @__PURE__ */ w(ue, {
				productName: m[0]?.product_name ?? "",
				variants: m,
				onPick: (e) => {
					h(null), Q(e) ? v(e) : a(e);
				},
				onClose: () => h(null)
			})
		]
	});
}
//#endregion
export { at as default };
