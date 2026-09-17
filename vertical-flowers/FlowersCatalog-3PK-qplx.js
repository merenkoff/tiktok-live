import { Suspense as e, createElement as t, forwardRef as n, lazy as r, useEffect as i, useRef as a, useState as o } from "react";
import { jsx as s, jsxs as c } from "react/jsx-runtime";
import * as l from "@pos/platform";
import { useCartStore as u, useSalesCatalog as d, useVertical as f } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var p = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), m = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), h = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, g = n(({ color: e = "currentColor", size: n = 24, strokeWidth: r = 2, absoluteStrokeWidth: i, className: a = "", children: o, iconNode: s, ...c }, l) => t("svg", {
	ref: l,
	...h,
	width: n,
	height: n,
	stroke: e,
	strokeWidth: i ? Number(r) * 24 / Number(n) : r,
	className: m("lucide", a),
	...c
}, [...s.map(([e, n]) => t(e, n)), ...Array.isArray(o) ? o : [o]])), _ = (e, r) => {
	let i = n(({ className: n, ...i }, a) => t(g, {
		ref: a,
		iconNode: r,
		className: m(`lucide-${p(e)}`, n),
		...i
	}));
	return i.displayName = `${e}`, i;
}, v = _("Camera", [["path", {
	d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
	key: "1tc9qg"
}], ["circle", {
	cx: "12",
	cy: "13",
	r: "3",
	key: "1vg3eu"
}]]), y = _("Folder", [["path", {
	d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	key: "1kt360"
}]]), b = _("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), x = 6;
function S() {
	let e = a(null);
	return i(() => {
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
			!n.moved && Math.hypot(r, i) > x && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
function C(e) {
	return `${(e / 100).toFixed(2).replace(".", ",")} ₴`;
}
//#endregion
//#region src/lib/urls.ts
function w() {
	return "".replace(/\/$/, "");
}
function T(e) {
	if (!e) return null;
	if (/^(https?:|blob:|data:)/i.test(e)) return e;
	let t = w(), n = e.startsWith("/") ? e : `/${e}`;
	return t ? `${t}${n}` : n;
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function E({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: l }) {
	let [u, d] = o(!1), f = u ? null : T(r);
	return /* @__PURE__ */ c("button", {
		type: "button",
		disabled: l,
		onClick: a,
		className: "aspect-square rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed",
		children: [
			f ? /* @__PURE__ */ s("img", {
				src: f,
				alt: "",
				className: "absolute inset-0 w-full h-full object-cover",
				onError: () => d(!0)
			}) : /* @__PURE__ */ s("div", {
				className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium",
				children: t || " "
			}),
			/* @__PURE__ */ s("div", { className: "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" }),
			/* @__PURE__ */ c("div", {
				className: "absolute bottom-2 left-2 right-2 text-white",
				children: [/* @__PURE__ */ s("p", {
					className: "text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm",
					children: e
				}), n != null && /* @__PURE__ */ s("p", {
					className: "text-[12px] mt-0.5 opacity-95 drop-shadow-sm",
					children: C(n)
				})]
			}),
			i != null && i <= 0 && /* @__PURE__ */ s("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq",
				children: "немає"
			})
		]
	});
}
//#endregion
//#region src/lib/tagColors.ts
var D = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], O = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, k = "slate";
function A(e) {
	return !!e && D.includes(e);
}
function j(e) {
	return A(e) ? O[e] : O[k];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function M({ name: e, color: t, onClick: n }) {
	let r = j(t);
	return /* @__PURE__ */ c("button", {
		type: "button",
		onClick: n,
		className: "aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]",
		style: { backgroundColor: r },
		children: [/* @__PURE__ */ s(y, {
			size: 22,
			strokeWidth: 1.75,
			className: "text-white/95 absolute top-2.5 left-2.5"
		}), /* @__PURE__ */ s("span", {
			className: "absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white",
			children: e
		})]
	});
}
//#endregion
//#region src/components/cashier/VariantPicker.tsx
function N({ productName: e, variants: t, onPick: n, onClose: r }) {
	let i = S(), a = [...t].sort((e, t) => e.quantity <= 0 && t.quantity > 0 ? 1 : e.quantity > 0 && t.quantity <= 0 ? -1 : 0);
	return /* @__PURE__ */ s("div", {
		className: "fixed inset-0 z-40 bg-black/40 grid place-items-end md:place-items-center p-4",
		children: /* @__PURE__ */ c("div", {
			className: "bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg",
			children: [/* @__PURE__ */ c("div", {
				className: "px-4 py-3.5 border-b border-sq-divider flex justify-between items-center gap-3",
				children: [/* @__PURE__ */ s("h3", {
					className: "font-semibold text-sq-text truncate",
					children: e
				}), /* @__PURE__ */ s("button", {
					type: "button",
					onClick: r,
					className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
					children: "Закрити"
				})]
			}), /* @__PURE__ */ s("ul", {
				ref: i,
				className: "divide-y divide-sq-divider max-h-[60vh] overflow-auto select-none",
				children: a.map((e) => {
					let t = e.label || "Стандарт", r = e.quantity <= 0;
					return /* @__PURE__ */ s("li", { children: /* @__PURE__ */ c("button", {
						type: "button",
						disabled: r,
						onClick: () => n(e),
						className: "w-full min-h-14 text-left px-4 py-3.5 disabled:opacity-50 hover:bg-sq-bg focus-visible:bg-sq-bg outline-none",
						children: [/* @__PURE__ */ c("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ s("span", {
								className: `font-medium ${r ? "text-sq-muted" : "text-sq-blue"}`,
								children: t
							}), /* @__PURE__ */ s("span", {
								className: "font-medium text-sq-text shrink-0",
								children: C(e.price_cents)
							})]
						}), /* @__PURE__ */ s("p", {
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
function P({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = S(), l = (e) => `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${e ? "font-semibold text-sq-text border-sq-text" : "font-medium text-sq-secondary border-transparent"}`;
	return /* @__PURE__ */ c("div", {
		ref: o,
		className: "flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none",
		children: [
			n && /* @__PURE__ */ c("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap",
				children: ["‹ ", r]
			}),
			/* @__PURE__ */ s("button", {
				type: "button",
				onClick: () => i(null),
				className: l(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ s("button", {
				type: "button",
				onClick: () => i(e),
				className: l(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
//#endregion
//#region src/components/cashier/ScanWedge.tsx
function F({ active: e, onScan: t }) {
	let n = a(null);
	return i(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ s("input", {
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
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function I(e) {
	"@babel/helpers - typeof";
	return I = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, I(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function L(e, t) {
	if (I(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (I(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function R(e) {
	var t = L(e, "string");
	return I(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function z(e, t, n) {
	return (t = R(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-flowers/lib/hostPlatform.ts
var B = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical"
], V = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), z(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function H(e) {
	return typeof e == "function";
}
function U() {
	let e = l;
	return B.filter((t) => !H(e[t]));
}
//#endregion
//#region src/modules/vertical-flowers/FlowersCatalog.tsx
var W = r(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function G({ active: e, stockEpoch: t }) {
	let n = U();
	if (n.length > 0) throw new V(n);
	return /* @__PURE__ */ s(K, {
		active: e,
		stockEpoch: t
	});
}
function K({ active: t, stockEpoch: n }) {
	let r = d(), a = f(), l = u((e) => e.addItem), p = u((e) => e.setBanner), m = S(), [h, g] = o(!1), [_, y] = o(null);
	i(() => {
		n > 0 && r.refresh();
	}, [n]);
	async function x(e) {
		let t = await r.lookupBarcode(e);
		if (t.length === 1) {
			l(t[0]), r.setQuery("");
			return;
		}
		if (t.length === 0) {
			p("Штрихкод не знайдено");
			return;
		}
		y(t);
	}
	return /* @__PURE__ */ c("section", {
		className: "flex flex-col min-h-0 bg-white",
		"data-testid": "flowers-catalog",
		children: [
			/* @__PURE__ */ s(F, {
				active: t && !_ && !h,
				onScan: (e) => void x(e)
			}),
			/* @__PURE__ */ c("div", {
				className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
				children: [/* @__PURE__ */ c("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ c("div", {
						className: "relative flex-1",
						children: [/* @__PURE__ */ s(b, {
							size: 18,
							className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
						}), /* @__PURE__ */ s("input", {
							className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
							placeholder: "Пошук",
							value: r.query,
							onChange: (e) => r.setQuery(e.target.value)
						})]
					}), /* @__PURE__ */ s("button", {
						type: "button",
						onClick: () => g(!0),
						className: "min-h-12 min-w-12 grid place-items-center rounded-sq text-sq-blue border border-sq-divider bg-white",
						"aria-label": "Камера",
						children: /* @__PURE__ */ s(v, { size: 20 })
					})]
				}), !r.query.trim() && /* @__PURE__ */ s(P, {
					tags: r.catalogBarTags,
					activeId: r.catalogBarActiveId,
					showBack: r.showBack,
					backLabel: r.backLabel,
					onSelect: r.selectCatalogBarTag,
					onBack: r.goBackOne
				})]
			}),
			/* @__PURE__ */ c("div", {
				ref: m,
				className: "flex-1 overflow-auto p-3 bg-white select-none",
				children: [
					r.loading && /* @__PURE__ */ s("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ c("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2",
						children: [r.folderTiles.map((e) => /* @__PURE__ */ s(M, {
							name: e.name,
							color: e.color,
							onClick: () => r.enterTag(e)
						}, e.id)), r.grouped.map(([e, t]) => {
							let n = t[0], r = Math.min(...t.map((e) => e.price_cents)), i = t.reduce((e, t) => e + t.quantity, 0), o = n.unit || a.defaultUnit;
							return /* @__PURE__ */ s(E, {
								name: n.product_name,
								subtitle: [n.label, `${i} ${o}`].filter(Boolean).join(" · "),
								priceCents: r,
								imageUrl: n.image_url,
								stock: i,
								disabled: i <= 0,
								onClick: () => t.length === 1 ? l(t[0]) : y(t)
							}, e);
						})]
					}),
					!r.loading && r.folderTiles.length === 0 && r.grouped.length === 0 && /* @__PURE__ */ s("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			h && /* @__PURE__ */ s(e, {
				fallback: null,
				children: /* @__PURE__ */ s(W, {
					onScan: (e) => {
						g(!1), x(e);
					},
					onClose: () => g(!1)
				})
			}),
			_ && /* @__PURE__ */ s(N, {
				productName: _[0]?.product_name ?? "",
				variants: _,
				onPick: (e) => {
					l(e), y(null);
				},
				onClose: () => y(null)
			})
		]
	});
}
//#endregion
export { G as default };
