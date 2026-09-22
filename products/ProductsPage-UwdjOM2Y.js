import { t as e } from "./componentOptions-CV1UZTqA.js";
import { createElement as t, forwardRef as n, useEffect as r, useMemo as i, useRef as a, useState as o } from "react";
import { DEFAULT_TAG_COLOR as s, TAG_COLORS as c, TAG_COLOR_KEYS as l, api as u, assetUrl as d, formatUah as f, isTagColorKey as p, uahInputToCents as m, useAuthStore as h, useVertical as g } from "@pos/platform";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import { createPortal as b } from "react-dom";
//#region src/lib/ean13.ts
var x = [
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
], S = [
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
], C = x.map((e) => e.replace(/[01]/g, (e) => e === "0" ? "1" : "0")), w = [
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
], T = "101", E = "01010", D = "101", O = [
	0,
	2,
	46,
	48,
	92,
	94
];
function k(e) {
	return /^\d{13}$/.test(e);
}
function A(e) {
	let t = 0;
	for (let n = 0; n < e.length; n += 1) {
		let r = e.charCodeAt(n) - 48;
		t += n % 2 == 0 ? r : r * 3;
	}
	return (10 - t % 10) % 10;
}
function j(e) {
	return k(e) ? A(e.slice(0, 12)) === e.charCodeAt(12) - 48 : !1;
}
function M(e) {
	if (!k(e)) throw Error(`not an EAN-13: ${e}`);
	let t = [...e].map(Number), n = w[t[0]];
	return `${T}${t.slice(1, 7).map((e, t) => n[t] === "L" ? x[e] : S[e]).join("")}${E}${t.slice(7).map((e) => C[e]).join("")}${D}`;
}
function N(e) {
	let t = M(e), n = [], r = 0;
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
function P(e) {
	return e.label.trim();
}
function F(e, t = "шт") {
	return t === "шт" ? Math.max(1, Math.floor(e) || 0) : 1;
}
function ee(e, t) {
	return t.map(({ product: t, variant: n, copies: r }) => ({
		storeName: e,
		productName: t.name.trim(),
		variantLabel: P(n),
		priceCents: n.price_cents,
		sku: n.sku?.trim() || null,
		barcode: n.barcode && j(n.barcode.trim()) ? n.barcode.trim() : null,
		copies: r == null ? F(n.quantity, n.unit) : Math.max(0, Math.floor(r))
	}));
}
function I(e) {
	return e.flatMap((e) => Array.from({ length: e.copies }, () => e));
}
//#endregion
//#region src/lib/priceTagLayout.ts
var L = {
	58: .75,
	80: .5
}, R = {
	58: 48,
	80: 72
};
function z(e) {
	return Math.min(e * L[e], R[e]);
}
function B(e) {
	return z(e) / 117;
}
function V(e) {
	return B(e) * 56;
}
function H(e) {
	return `${Math.round(e * 1e3) / 1e3}mm`;
}
function U(e) {
	return {
		"--tag-w": H(z(e)),
		"--tag-barcode-h": H(V(e))
	};
}
async function te(e, t = {}, n) {
	return window.__TAURI_INTERNALS__.invoke(e, t, n);
}
//#endregion
//#region src/lib/triggerPrint.ts
var ne = typeof navigator < "u" && /mac/i.test(navigator.platform || navigator.userAgent);
function W() {
	if (ne) {
		te("print_webview").catch(() => window.print());
		return;
	}
	window.print();
}
//#endregion
//#region src/components/PriceTagsPrintable.tsx
function G(e) {
	return (e / 100).toFixed(2).replace(/\.00$/, "");
}
function re({ code: e }) {
	if (!j(e)) return null;
	let t = [...e];
	return /* @__PURE__ */ y("svg", {
		className: "price-tag-barcode",
		viewBox: "0 0 117 56",
		preserveAspectRatio: "none",
		role: "img",
		"aria-label": e,
		children: [
			/* @__PURE__ */ v("rect", {
				x: 0,
				y: 0,
				width: 117,
				height: 56,
				fill: "#fff"
			}),
			/* @__PURE__ */ v("g", {
				shapeRendering: "crispEdges",
				fill: "#000",
				children: N(e).map(([e, t]) => /* @__PURE__ */ v("rect", {
					x: 11 + e,
					y: 0,
					width: t,
					height: O.includes(e) ? 45 : 40
				}, e))
			}),
			/* @__PURE__ */ y("g", {
				fill: "#000",
				fontFamily: "'Courier New', monospace",
				fontSize: 9,
				textAnchor: "middle",
				children: [
					/* @__PURE__ */ v("text", {
						x: 11 / 2,
						y: 54,
						children: t[0]
					}),
					t.slice(1, 7).map((e, t) => /* @__PURE__ */ v("text", {
						x: 14 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `l${t}`)),
					t.slice(7).map((e, t) => /* @__PURE__ */ v("text", {
						x: 61 + t * 7 + 3.5,
						y: 54,
						children: e
					}, `r${t}`))
				]
			})
		]
	});
}
function ie({ tags: e, paperWidth: t }) {
	return !e || typeof document > "u" ? null : b(/* @__PURE__ */ v("div", {
		className: "price-tag-print-area",
		"data-paper": t,
		style: U(t),
		children: I(e).map((e, t) => /* @__PURE__ */ y("div", {
			className: "price-tag",
			children: [
				/* @__PURE__ */ v("p", {
					className: "price-tag-store",
					children: e.storeName
				}),
				/* @__PURE__ */ v("p", {
					className: "price-tag-name",
					children: e.productName
				}),
				e.variantLabel && /* @__PURE__ */ v("p", {
					className: "price-tag-variant",
					children: e.variantLabel
				}),
				/* @__PURE__ */ y("p", {
					className: "price-tag-price",
					children: [G(e.priceCents), " ₴"]
				}),
				e.barcode ? /* @__PURE__ */ v(re, { code: e.barcode }) : /* @__PURE__ */ v("p", {
					className: "price-tag-digits",
					children: "без штрихкоду"
				}),
				e.sku && /* @__PURE__ */ v("p", {
					className: "price-tag-sku",
					children: e.sku
				})
			]
		}, t))
	}), document.body);
}
//#endregion
//#region src/modules/products/components/PriceTagsDialog.tsx
var K = "pos.priceTagPaperWidth", q = "rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm disabled:opacity-50";
function ae() {
	try {
		return localStorage.getItem(K) === "80" ? 80 : 58;
	} catch {
		return 58;
	}
}
function oe({ products: e, storeName: t, onClose: n, onBarcodeGenerated: a }) {
	let [s, c] = o(ae), [l, d] = o(() => e.flatMap((e) => e.variants.filter((e) => e.is_active).map((t) => ({
		key: `${e.id}-${t.id}`,
		productName: e.name,
		variantId: t.id,
		label: P(t),
		unit: t.unit,
		priceCents: t.price_cents,
		sku: t.sku,
		barcode: t.barcode,
		copies: F(t.quantity, t.unit)
	})))), [p, m] = o(null), [h, g] = o(null);
	r(() => {
		if (!p) return;
		let e = () => m(null);
		window.addEventListener("afterprint", e);
		let t = requestAnimationFrame(W);
		return () => {
			window.removeEventListener("afterprint", e), cancelAnimationFrame(t);
		};
	}, [p]);
	let x = i(() => l.reduce((e, t) => e + t.copies, 0), [l]), S = i(() => l.filter((e) => !j(e.barcode ?? "")).length, [l]), C = i(() => l.filter((e) => k(e.barcode ?? "") && !j(e.barcode)).length, [l]);
	function w(e, t) {
		d((n) => n.map((n) => n.key === e ? {
			...n,
			copies: Math.max(0, Math.floor(t) || 0)
		} : n));
	}
	function T(e) {
		c(e);
		try {
			localStorage.setItem(K, String(e));
		} catch {}
	}
	async function E(e) {
		g(e.key);
		try {
			let t = await u.generateInternalBarcode();
			await u.updateVariant(e.variantId, { barcode: t }), d((n) => n.map((n) => n.key === e.key ? {
				...n,
				barcode: t
			} : n)), a();
		} catch {} finally {
			g(null);
		}
	}
	function D() {
		m(ee(t, l.map((e) => ({
			product: { name: e.productName },
			variant: {
				id: e.variantId,
				label: e.label,
				unit: e.unit,
				price_cents: e.priceCents,
				sku: e.sku,
				barcode: e.barcode,
				quantity: 0
			},
			copies: e.copies
		}))));
	}
	return /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v(ie, {
		tags: p,
		paperWidth: s
	}), b(/* @__PURE__ */ v("div", {
		"data-testid": "price-tags-overlay",
		className: "fixed inset-0 z-50 bg-black/40 grid place-items-center p-4",
		children: /* @__PURE__ */ y("div", {
			className: "bg-sq-surface rounded-sq w-full max-w-3xl max-h-[85vh] flex flex-col shadow-lg",
			children: [
				/* @__PURE__ */ y("div", {
					className: "p-5 border-b border-sq-divider",
					children: [/* @__PURE__ */ v("p", {
						className: "sq-section-label",
						children: "Друк цінників"
					}), /* @__PURE__ */ v("p", {
						className: "text-sm text-sq-secondary mt-1",
						children: "Кількість — за залишком на складі; змініть, якщо треба інакше. Кожен цінник друкується окремою сторінкою, тож принтер ріже їх так само, як чеки."
					})]
				}),
				/* @__PURE__ */ y("div", {
					className: "flex flex-wrap items-center gap-3 px-5 py-3 border-b border-sq-divider",
					children: [
						/* @__PURE__ */ v("span", {
							className: "text-sm text-sq-secondary",
							children: "Стрічка"
						}),
						[58, 80].map((e) => /* @__PURE__ */ y("button", {
							type: "button",
							onClick: () => T(e),
							className: `${q} ${s === e ? "border-[#006AFF] text-[#006AFF]" : ""}`,
							children: [e, " мм"]
						}, e)),
						/* @__PURE__ */ y("span", {
							className: "text-sm text-sq-secondary",
							children: [
								"Ширина цінника: ",
								z(s),
								" мм"
							]
						}),
						/* @__PURE__ */ y("span", {
							className: "text-sm text-sq-secondary ml-auto",
							children: ["Усього цінників: ", x]
						})
					]
				}),
				S > 0 && /* @__PURE__ */ y("p", {
					className: "mx-5 mt-3 rounded-sq bg-amber-50 text-amber-800 px-3 py-2 text-sm",
					children: [
						"Без придатного штрихкоду: ",
						S,
						C > 0 && ` (з них ${C} — з хибною контрольною цифрою)`,
						". Такі цінники надрукуються без коду — згенеруйте внутрішній, щоб касир міг сканувати."
					]
				}),
				/* @__PURE__ */ v("div", {
					className: "flex-1 overflow-y-auto px-5 py-3",
					children: /* @__PURE__ */ y("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ v("thead", {
							className: "text-sq-secondary",
							children: /* @__PURE__ */ y("tr", { children: [
								/* @__PURE__ */ v("th", {
									className: "text-left font-medium py-1",
									children: "Товар"
								}),
								/* @__PURE__ */ v("th", {
									className: "text-left font-medium py-1",
									children: "Ціна"
								}),
								/* @__PURE__ */ v("th", {
									className: "text-left font-medium py-1",
									children: "Штрихкод"
								}),
								/* @__PURE__ */ v("th", {
									className: "text-right font-medium py-1",
									children: "Цінників"
								})
							] })
						}), /* @__PURE__ */ v("tbody", {
							className: "divide-y divide-sq-divider",
							children: l.map((e) => /* @__PURE__ */ y("tr", { children: [
								/* @__PURE__ */ y("td", {
									className: "py-2 pr-2",
									children: [/* @__PURE__ */ v("p", {
										className: "text-sq-text",
										children: e.productName
									}), e.label && /* @__PURE__ */ v("p", {
										className: "text-xs text-sq-secondary",
										children: e.label
									})]
								}),
								/* @__PURE__ */ v("td", {
									className: "py-2 pr-2 whitespace-nowrap",
									children: f(e.priceCents)
								}),
								/* @__PURE__ */ v("td", {
									className: "py-2 pr-2",
									children: j(e.barcode ?? "") ? /* @__PURE__ */ v("span", {
										className: "font-mono text-xs",
										children: e.barcode
									}) : /* @__PURE__ */ y("div", {
										className: "flex flex-col items-start gap-1",
										children: [k(e.barcode ?? "") && /* @__PURE__ */ v("span", {
											className: "font-mono text-xs text-amber-700 line-through",
											children: e.barcode
										}), /* @__PURE__ */ v("button", {
											type: "button",
											disabled: h === e.key,
											onClick: () => void E(e),
											className: `${q} text-xs`,
											children: "Згенерувати"
										})]
									})
								}),
								/* @__PURE__ */ v("td", {
									className: "py-2 text-right",
									children: /* @__PURE__ */ v("input", {
										type: "number",
										min: 0,
										value: e.copies,
										onChange: (t) => w(e.key, Number(t.target.value)),
										className: "w-16 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1 text-right"
									})
								})
							] }, e.key))
						})]
					})
				}),
				/* @__PURE__ */ y("div", {
					className: "flex justify-end gap-2 p-5 border-t border-sq-divider",
					children: [/* @__PURE__ */ v("button", {
						type: "button",
						className: q,
						onClick: n,
						children: "Закрити"
					}), /* @__PURE__ */ y("button", {
						type: "button",
						className: "sq-btn-primary px-4 py-2 text-sm disabled:opacity-50",
						disabled: x === 0,
						onClick: D,
						children: ["Друкувати ", x]
					})]
				})
			]
		})
	}), document.body)] });
}
//#endregion
//#region src/modules/products/components/CompositionEditor.tsx
var J = "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm text-sq-text placeholder:text-sq-muted focus:outline-none focus:border-sq-blue";
function se({ value: e, options: t, onChange: n }) {
	let [r, a] = o(""), [s, c] = o("1"), l = i(() => new Map(t.map((e) => [e.variant_id, e])), [t]), u = i(() => new Set(e.map((e) => e.component_variant_id)), [e]), d = t.filter((e) => !u.has(e.variant_id));
	function f() {
		let t = Number(r), i = Number(s);
		!t || !Number.isInteger(i) || i <= 0 || (n([...e, {
			component_variant_id: t,
			quantity: i
		}]), a(""), c("1"));
	}
	return /* @__PURE__ */ y("div", {
		className: "space-y-2 rounded-sq border border-sq-divider bg-sq-bg/40 p-3",
		children: [
			/* @__PURE__ */ v("p", {
				className: "text-xs font-semibold text-sq-secondary",
				children: "Склад"
			}),
			e.length === 0 && /* @__PURE__ */ v("p", {
				className: "text-sm text-sq-muted",
				children: "Порожньо. Складений товар без складу продати не можна."
			}),
			e.map((t, r) => {
				let i = l.get(t.component_variant_id);
				return /* @__PURE__ */ y("div", {
					"data-testid": "composition-row",
					className: "grid grid-cols-[1fr_5rem_auto] gap-2 items-center",
					children: [
						/* @__PURE__ */ v("span", {
							className: "text-sm text-sq-text truncate",
							children: i?.caption ?? `Варіант ${t.component_variant_id}`
						}),
						/* @__PURE__ */ y("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ v("input", {
								className: J,
								inputMode: "numeric",
								"aria-label": "Кількість",
								value: String(t.quantity),
								onChange: (i) => {
									let a = [...e];
									a[r] = {
										...t,
										quantity: Number(i.target.value.replace(/\D/g, "")) || 0
									}, n(a);
								}
							}), /* @__PURE__ */ v("span", {
								className: "text-xs text-sq-muted shrink-0",
								children: i?.unit ?? ""
							})]
						}),
						/* @__PURE__ */ v("button", {
							type: "button",
							className: "text-sm font-semibold text-red-600 min-h-11 px-2",
							onClick: () => n(e.filter((e, t) => t !== r)),
							children: "Прибрати"
						})
					]
				}, t.component_variant_id);
			}),
			/* @__PURE__ */ y("div", {
				className: "grid grid-cols-[1fr_5rem_auto] gap-2 items-center pt-1 border-t border-sq-divider",
				children: [
					/* @__PURE__ */ y("select", {
						className: J,
						"aria-label": "Складник",
						value: r,
						onChange: (e) => a(e.target.value === "" ? "" : Number(e.target.value)),
						children: [/* @__PURE__ */ v("option", {
							value: "",
							children: "Оберіть складник…"
						}), d.map((e) => /* @__PURE__ */ v("option", {
							value: e.variant_id,
							children: e.caption
						}, e.variant_id))]
					}),
					/* @__PURE__ */ v("input", {
						className: J,
						inputMode: "numeric",
						"aria-label": "Кількість складника",
						value: s,
						onChange: (e) => c(e.target.value.replace(/\D/g, ""))
					}),
					/* @__PURE__ */ v("button", {
						type: "button",
						className: "text-sm font-semibold text-sq-blue min-h-11 px-2",
						onClick: f,
						disabled: r === "",
						children: "+ Додати"
					})
				]
			})
		]
	});
}
//#endregion
//#region src/modules/products/components/ModifierGroupChips.tsx
function ce({ groups: e, value: t, onChange: n }) {
	let r = e.filter((e) => e.is_active || t.includes(e.id));
	function i(e) {
		n(t.includes(e) ? t.filter((t) => t !== e) : [...t, e]);
	}
	return /* @__PURE__ */ y("div", {
		className: "sm:col-span-2",
		children: [/* @__PURE__ */ v("p", {
			className: "text-xs font-semibold text-sq-secondary mb-2",
			children: "Модифікатори"
		}), /* @__PURE__ */ y("div", {
			className: "flex flex-wrap gap-2",
			children: [r.map((e) => {
				let n = t.indexOf(e.id), r = n >= 0;
				return /* @__PURE__ */ y("button", {
					type: "button",
					onClick: () => i(e.id),
					"aria-pressed": r,
					"data-testid": `modifier-group-chip-${e.id}`,
					className: `inline-flex items-center gap-1.5 text-sm border rounded-full px-2.5 py-1 ${r ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-sq-bg text-sq-text"}`,
					children: [
						r && /* @__PURE__ */ v("span", {
							className: "text-[11px] font-semibold tabular-nums",
							children: n + 1
						}),
						e.name,
						/* @__PURE__ */ v("span", {
							className: `text-[11px] ${r ? "opacity-80" : "text-sq-secondary"}`,
							children: e.min_select >= 1 ? "обовʼязково" : "за бажанням"
						})
					]
				}, e.id);
			}), r.length === 0 && /* @__PURE__ */ v("span", {
				className: "text-sm text-sq-muted",
				children: "Немає груп — заведіть їх на сторінці «Модифікатори»"
			})]
		})]
	});
}
//#endregion
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var le = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), Y = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), ue = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, de = n(({ color: e = "currentColor", size: n = 24, strokeWidth: r = 2, absoluteStrokeWidth: i, className: a = "", children: o, iconNode: s, ...c }, l) => t("svg", {
	ref: l,
	...ue,
	width: n,
	height: n,
	stroke: e,
	strokeWidth: i ? Number(r) * 24 / Number(n) : r,
	className: Y("lucide", a),
	...c
}, [...s.map(([e, n]) => t(e, n)), ...Array.isArray(o) ? o : [o]])), fe = (e, r) => {
	let i = n(({ className: n, ...i }, a) => t(de, {
		ref: a,
		iconNode: r,
		className: Y(`lucide-${le(e)}`, n),
		...i
	}));
	return i.displayName = `${e}`, i;
}, pe = fe("ImagePlus", [
	["path", {
		d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
		key: "31hg93"
	}],
	["line", {
		x1: "16",
		x2: "22",
		y1: "5",
		y2: "5",
		key: "ez7e4s"
	}],
	["line", {
		x1: "19",
		x2: "19",
		y1: "2",
		y2: "8",
		key: "1gkr8c"
	}],
	["circle", {
		cx: "9",
		cy: "9",
		r: "2",
		key: "af1f0g"
	}],
	["path", {
		d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
		key: "1xmnt7"
	}]
]), me = fe("Trash2", [
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
		key: "4alrt4"
	}],
	["path", {
		d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
		key: "v07s0e"
	}],
	["line", {
		x1: "10",
		x2: "10",
		y1: "11",
		y2: "17",
		key: "1uufr5"
	}],
	["line", {
		x1: "14",
		x2: "14",
		y1: "11",
		y2: "17",
		key: "xtxkd"
	}]
]);
//#endregion
//#region src/components/ProductPhotoField.tsx
function he({ value: e, onChange: t, label: n = "Фото" }) {
	let r = a(null), [i, s] = o(!1), [c, l] = o(null);
	async function f(e) {
		if (e) {
			l(null), s(!0);
			try {
				let { url: n } = await u.uploadProductImage(e);
				t(n);
			} catch (e) {
				let t = typeof e == "object" && e && "response" in e && e.response?.data?.error ? String(e.response?.data?.error) : "Не вдалося завантажити фото";
				l(t);
			} finally {
				s(!1), r.current && (r.current.value = "");
			}
		}
	}
	return /* @__PURE__ */ y("div", {
		className: "sm:col-span-2 space-y-2",
		children: [/* @__PURE__ */ v("p", {
			className: "text-xs font-semibold text-sq-secondary",
			children: n
		}), /* @__PURE__ */ y("div", {
			className: "flex flex-wrap items-start gap-3",
			children: [/* @__PURE__ */ v("div", {
				className: "w-28 h-28 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden grid place-items-center shrink-0",
				children: e ? /* @__PURE__ */ v("img", {
					src: d(e) ?? void 0,
					alt: "",
					className: "w-full h-full object-cover"
				}) : /* @__PURE__ */ v(pe, {
					size: 28,
					className: "text-sq-muted",
					strokeWidth: 1.5
				})
			}), /* @__PURE__ */ y("div", {
				className: "flex flex-col gap-2 min-w-0",
				children: [
					/* @__PURE__ */ v("input", {
						ref: r,
						type: "file",
						accept: "image/jpeg,image/png,image/webp,image/gif",
						className: "hidden",
						onChange: (e) => void f(e.target.files?.[0])
					}),
					/* @__PURE__ */ v("button", {
						type: "button",
						disabled: i,
						onClick: () => r.current?.click(),
						className: "sq-btn-primary px-3 py-2 text-sm w-fit",
						children: i ? "Завантаження…" : e ? "Змінити фото" : "Додати фото"
					}),
					e && /* @__PURE__ */ y("button", {
						type: "button",
						disabled: i,
						onClick: () => t(null),
						className: "inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 w-fit",
						children: [/* @__PURE__ */ v(me, { size: 14 }), "Прибрати"]
					}),
					/* @__PURE__ */ v("p", {
						className: "text-xs text-sq-muted",
						children: "JPEG, PNG, WebP або GIF · до 5 МБ"
					}),
					c && /* @__PURE__ */ v("p", {
						className: "text-xs text-red-600",
						children: c
					})
				]
			})]
		})]
	});
}
//#endregion
//#region src/hooks/useDragScroll.ts
var ge = 6;
function _e() {
	let e = a(null);
	return r(() => {
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
			!n.moved && Math.hypot(r, i) > ge && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
//#region src/components/AttributeFields.tsx
var X = "w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text";
function ve({ schema: e, value: t, onChange: n, unit: r, disabled: i, className: a = "grid gap-2 sm:grid-cols-2" }) {
	function o(e, r) {
		let i = { ...t };
		r === "" ? delete i[e] : i[e] = r, n(i);
	}
	let s = r != null && r.options.length > 1;
	return e.length === 0 && !s ? null : /* @__PURE__ */ y("div", {
		className: a,
		children: [e.map((e) => {
			let n = t[e.key], r = n == null ? "" : String(n), a = e.unitSuffix ? `${e.label}, ${e.unitSuffix}` : e.label;
			return /* @__PURE__ */ y("label", {
				className: "block",
				children: [/* @__PURE__ */ y("span", {
					className: "text-xs text-sq-secondary",
					children: [a, e.required && /* @__PURE__ */ v("span", {
						className: "text-rose-600",
						children: " *"
					})]
				}), e.type === "select" ? /* @__PURE__ */ y("select", {
					className: `${X} mt-1`,
					value: r,
					disabled: i,
					onChange: (t) => o(e.key, t.target.value),
					children: [/* @__PURE__ */ v("option", {
						value: "",
						children: "—"
					}), (e.options ?? []).map((e) => /* @__PURE__ */ v("option", {
						value: e,
						children: e
					}, e))]
				}) : /* @__PURE__ */ v("input", {
					className: `${X} mt-1`,
					type: e.type === "number" ? "number" : "text",
					inputMode: e.type === "number" ? "decimal" : void 0,
					value: r,
					disabled: i,
					placeholder: e.placeholder ?? e.label,
					onChange: (t) => o(e.key, t.target.value)
				})]
			}, e.key);
		}), s && /* @__PURE__ */ y("label", {
			className: "block",
			children: [/* @__PURE__ */ v("span", {
				className: "text-xs text-sq-secondary",
				children: "Одиниця"
			}), /* @__PURE__ */ v("select", {
				className: `${X} mt-1`,
				value: r.value,
				disabled: i,
				onChange: (e) => r.onChange(e.target.value),
				children: r.options.map((e) => /* @__PURE__ */ v("option", {
					value: e,
					children: e
				}, e))
			})]
		})]
	});
}
//#endregion
//#region src/modules/products/components/TagColorSwatches.tsx
function ye({ value: e, onChange: t, size: n = "md" }) {
	let r = p(e) ? e : s, i = n === "sm" ? "w-5 h-5" : "w-7 h-7";
	return /* @__PURE__ */ v("div", {
		className: "flex flex-wrap gap-1.5",
		role: "listbox",
		"aria-label": "Колір мітки",
		children: l.map((e) => {
			let n = r === e;
			return /* @__PURE__ */ v("button", {
				type: "button",
				role: "option",
				"aria-selected": n,
				title: e,
				onClick: () => t(e),
				className: `${i} rounded-sq shrink-0 ${n ? "ring-2 ring-sq-blue ring-offset-1" : "ring-1 ring-black/10"}`,
				style: { backgroundColor: c[e] }
			}, e);
		})
	});
}
//#endregion
//#region src/modules/products/pages/ProductsPage.tsx
var be = 3;
function xe(e) {
	return e.kind === "composite" ? e.stock_mode === "derived" ? "derived" : "own" : "";
}
function Se(e) {
	return e === "derived" ? "Продаж спише складники зі складу." : "Складники спише документ виробництва — «Склад → Виробництво».";
}
var Ce = [
	{
		value: "",
		label: "Звичайний товар"
	},
	{
		value: "derived",
		label: "Складений — збирається при продажу"
	},
	{
		value: "own",
		label: "Складений — збираємо заздалегідь"
	}
];
function we(e) {
	let t = [];
	for (let n of e) t.push(n), n.children?.length && t.push(...we(n.children));
	return t;
}
function Te(e, t) {
	let n = [t.name], r = t;
	for (; r.parent_id != null;) {
		let t = e.find((e) => e.id === r.parent_id);
		if (!t) break;
		n.unshift(t.name), r = t;
	}
	return n.join(" / ");
}
var Z = "rounded-sq border border-sq-divider bg-sq-bg px-3 py-2.5 text-sm text-sq-text w-full";
function Q() {
	let [t, n] = o([]), [a, c] = o([]), [l, f] = o(null), [p, _] = o("all"), [b, x] = o(/* @__PURE__ */ new Set()), [S, C] = o(!1), w = h((e) => e.auth?.store.name ?? ""), [T, E] = o(!1), [D, O] = o(null), [k, A] = o(""), [j, M] = o(s), [N, P] = o(!1), [F, ee] = o(""), [I, L] = o(null), R = g(), [z, B] = o(""), [V, H] = o({}), [U, te] = o(R.defaultUnit), [ne, W] = o("690"), [G, re] = o("1"), [ie, K] = o(""), [q, ae] = o(""), [J, le] = o(null), [Y, ue] = o(""), [de, fe] = o(!0), [pe, me] = o([]), [ge, _e] = o([]), [X, xe] = o([]), Q = i(() => we(a), [a]), Ae = R.maxCompositionDepth ?? 1, je = i(() => e(t, { maxDepth: Ae }), [t, Ae]);
	async function $() {
		let [e, t, r] = await Promise.all([
			u.getProducts(),
			u.getTags(),
			u.listModifierGroups()
		]);
		n(e), c(t), xe(r);
	}
	r(() => {
		$().catch(() => f("Не вдалося завантажити"));
	}, []);
	let Ne = t.filter((e) => e.is_active ? p === "needs_review" ? !!e.needs_review : p === "all" || e.tag_ids?.includes(p) : !1), Pe = t.filter((e) => e.is_active && e.needs_review).length;
	async function Fe(e) {
		e.preventDefault(), f(null);
		try {
			let e = await u.createProduct({
				name: z,
				image_url: J,
				...Y ? {
					kind: "composite",
					stock_mode: Y
				} : {},
				sellable: de,
				variants: [{
					attributes: V,
					unit: U,
					sku: q || void 0,
					barcode: ie || void 0,
					price_cents: m(ne),
					quantity: Y === "derived" ? 0 : Number(G) || 0,
					...Y ? { components: pe } : {}
				}]
			});
			ge.length && await u.setProductModifierGroups(e.id, ge), E(!1), B(""), K(""), ae(""), le(null), ue(""), fe(!0), me([]), _e([]), await $();
		} catch (e) {
			f(Ee(e, "Не вдалося створити товар"));
		}
	}
	async function Ie(e) {
		e.preventDefault();
		try {
			await u.createTag({
				name: k,
				parent_id: null,
				color: j,
				show_in_catalog_bar: N
			}), A(""), M(s), P(!1), await $();
		} catch {
			f("Не вдалося створити групу");
		}
	}
	async function Le(e, t) {
		f(null);
		try {
			await u.createTag({
				name: t,
				parent_id: e,
				color: s
			}), await $();
		} catch {
			f(`Не вдалося створити підгрупу (макс. ${be} рівні)`);
		}
	}
	async function Re(e, t) {
		L(e.id), f(null);
		try {
			await u.updateTag(e.id, t), await $();
		} catch {
			f("Не вдалося оновити мітку");
		} finally {
			L(null);
		}
	}
	async function ze() {
		if (F !== "" && b.size !== 0) try {
			await u.assignTag(Number(F), [...b]), x(/* @__PURE__ */ new Set()), await $();
		} catch {
			f("Не вдалося призначити мітку");
		}
	}
	async function Be(e) {
		confirm(`Архівувати «${e.name}»? Зникне з каси, історія продажів збережеться.`) && (await u.archiveProduct(e.id), D === e.id && O(null), await $());
	}
	function Ve(e) {
		x((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	return /* @__PURE__ */ y("div", {
		className: "space-y-6 animate-fade-up",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex flex-wrap items-start justify-between gap-3",
				children: [/* @__PURE__ */ y("div", { children: [/* @__PURE__ */ v("h2", {
					className: "text-2xl font-semibold",
					children: "Товари"
				}), /* @__PURE__ */ v("p", {
					className: "text-sm text-sq-secondary mt-1",
					children: "Мітки, варіанти та залишки."
				})] }), /* @__PURE__ */ v("button", {
					type: "button",
					onClick: () => {
						E((e) => !e), O(null);
					},
					className: "sq-btn-primary px-4 py-2.5 text-sm",
					children: T ? "Сховати" : "Додати товар"
				})]
			}),
			l && /* @__PURE__ */ v("div", {
				className: "rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				children: l
			}),
			/* @__PURE__ */ y("div", {
				className: "grid lg:grid-cols-[260px_1fr] gap-4",
				children: [/* @__PURE__ */ y("section", {
					className: "border border-sq-divider rounded-sq bg-sq-surface p-4 space-y-3 shadow-sm",
					children: [
						/* @__PURE__ */ v("p", {
							className: "sq-section-label",
							children: "Мітки"
						}),
						/* @__PURE__ */ v("button", {
							type: "button",
							onClick: () => _("all"),
							className: `w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${p === "all" ? "sq-nav-active" : "sq-nav-idle"}`,
							children: "Усі товари"
						}),
						/* @__PURE__ */ y("button", {
							type: "button",
							onClick: () => _("needs_review"),
							className: `w-full text-left px-3 py-2 rounded-[4px] text-sm font-medium ${p === "needs_review" ? "sq-nav-active" : "sq-nav-idle"}`,
							children: ["З приходу — перевірте", Pe > 0 ? ` (${Pe})` : ""]
						}),
						a.map((e) => /* @__PURE__ */ v(ke, {
							tag: e,
							depth: 1,
							filterTag: p,
							savingTagId: I,
							onFilter: _,
							onColor: (e, t) => void Re(e, { color: t }),
							onCatalogBar: (e, t) => void Re(e, { show_in_catalog_bar: t }),
							onStation: (e, t) => void Re(e, { station: t }),
							showStation: R.id === "cafe",
							onCreateChild: Le
						}, e.id)),
						/* @__PURE__ */ y("form", {
							onSubmit: Ie,
							className: "pt-3 border-t border-sq-divider space-y-2",
							children: [
								/* @__PURE__ */ v("p", {
									className: "text-xs font-semibold text-sq-secondary",
									children: "Нова коренева група"
								}),
								/* @__PURE__ */ v("input", {
									className: Z,
									placeholder: "Назва",
									value: k,
									onChange: (e) => A(e.target.value),
									required: !0
								}),
								/* @__PURE__ */ y("div", {
									className: "space-y-1",
									children: [/* @__PURE__ */ v("p", {
										className: "text-[11px] text-sq-secondary",
										children: "Колір плитки"
									}), /* @__PURE__ */ v(ye, {
										value: j,
										onChange: M,
										size: "sm"
									})]
								}),
								/* @__PURE__ */ y("label", {
									className: "flex items-start gap-2 text-sm text-sq-text cursor-pointer",
									children: [/* @__PURE__ */ v("input", {
										type: "checkbox",
										className: "mt-0.5",
										checked: N,
										onChange: (e) => P(e.target.checked)
									}), /* @__PURE__ */ y("span", { children: ["Показувати в рядку категорій", /* @__PURE__ */ v("span", {
										className: "block text-[11px] text-sq-secondary",
										children: "Рядок категорій на касі"
									})] })]
								}),
								/* @__PURE__ */ v("button", {
									type: "submit",
									className: "sq-btn-primary w-full py-2.5 text-sm",
									children: "Додати групу"
								})
							]
						})
					]
				}), /* @__PURE__ */ y("div", {
					className: "space-y-4",
					children: [
						b.size > 0 && /* @__PURE__ */ y("div", {
							className: "flex flex-wrap items-center gap-2 border border-sq-divider rounded-sq p-3 bg-sq-bg",
							children: [
								/* @__PURE__ */ y("span", {
									className: "text-sm text-sq-secondary",
									children: ["Обрано: ", b.size]
								}),
								/* @__PURE__ */ y("select", {
									className: "rounded-sq border border-sq-divider px-3 py-2 text-sm",
									value: F,
									onChange: (e) => ee(e.target.value === "" ? "" : Number(e.target.value)),
									children: [/* @__PURE__ */ v("option", {
										value: "",
										children: "Мітка…"
									}), Q.map((e) => /* @__PURE__ */ v("option", {
										value: e.id,
										children: Te(Q, e)
									}, e.id))]
								}),
								/* @__PURE__ */ v("button", {
									type: "button",
									onClick: () => void ze(),
									className: "sq-btn-primary px-3 py-2 text-sm",
									children: "Додати мітку"
								}),
								/* @__PURE__ */ v("button", {
									type: "button",
									onClick: () => C(!0),
									className: "rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm",
									children: "Друк цінників"
								})
							]
						}),
						S && /* @__PURE__ */ v(oe, {
							products: t.filter((e) => b.has(e.id)),
							storeName: w,
							onClose: () => C(!1),
							onBarcodeGenerated: () => void $()
						}),
						T && /* @__PURE__ */ y("form", {
							onSubmit: Fe,
							className: "border border-sq-divider rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm",
							children: [
								/* @__PURE__ */ v("p", {
									className: "sm:col-span-2 text-sm font-semibold text-sq-text",
									children: "Новий товар"
								}),
								/* @__PURE__ */ v(he, {
									value: J,
									onChange: le
								}),
								/* @__PURE__ */ v("input", {
									className: Z,
									placeholder: "Назва",
									value: z,
									onChange: (e) => B(e.target.value),
									required: !0
								}),
								/* @__PURE__ */ y("label", {
									className: "block space-y-1",
									children: [/* @__PURE__ */ v("span", {
										className: "text-xs text-sq-secondary",
										children: "Що це за товар"
									}), /* @__PURE__ */ v("select", {
										className: Z,
										value: Y,
										onChange: (e) => ue(e.target.value),
										children: Ce.map((e) => /* @__PURE__ */ v("option", {
											value: e.value,
											children: e.label
										}, e.value))
									})]
								}),
								/* @__PURE__ */ y("label", {
									className: "flex items-start gap-2 text-sm text-sq-text cursor-pointer sm:col-span-2",
									children: [/* @__PURE__ */ v("input", {
										type: "checkbox",
										className: "mt-0.5",
										checked: de,
										onChange: (e) => fe(e.target.checked)
									}), /* @__PURE__ */ y("span", { children: ["Продається на касі", /* @__PURE__ */ v("span", {
										className: "block text-[11px] text-sq-secondary",
										children: "Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран продажу — ні"
									})] })]
								}),
								/* @__PURE__ */ v(ce, {
									groups: X,
									value: ge,
									onChange: _e
								}),
								/* @__PURE__ */ v(ve, {
									className: "sm:col-span-2 grid gap-2 sm:grid-cols-2",
									schema: R.attributes,
									value: V,
									onChange: H,
									unit: {
										value: U,
										options: R.units,
										onChange: te
									}
								}),
								/* @__PURE__ */ v("input", {
									className: Z,
									placeholder: "Ціна, грн",
									value: ne,
									onChange: (e) => W(e.target.value)
								}),
								Y === "derived" ? /* @__PURE__ */ v("p", {
									className: "text-xs text-sq-secondary self-center",
									children: "Залишок рахується зі складників."
								}) : /* @__PURE__ */ v("input", {
									className: Z,
									placeholder: "Залишок",
									value: G,
									onChange: (e) => re(e.target.value)
								}),
								Y && /* @__PURE__ */ y("div", {
									className: "sm:col-span-2",
									children: [/* @__PURE__ */ v(se, {
										value: pe,
										options: je,
										onChange: me
									}), /* @__PURE__ */ v("p", {
										className: "text-xs text-sq-secondary mt-1",
										children: Se(Y)
									})]
								}),
								/* @__PURE__ */ y("label", {
									className: "block space-y-1",
									children: [/* @__PURE__ */ v("span", {
										className: "text-xs text-sq-secondary",
										children: "Артикул (SKU) — ваш внутрішній код"
									}), /* @__PURE__ */ v("input", {
										className: Z,
										value: q,
										onChange: (e) => ae(e.target.value)
									})]
								}),
								/* @__PURE__ */ y("label", {
									className: "block space-y-1",
									children: [/* @__PURE__ */ v("span", {
										className: "text-xs text-sq-secondary",
										children: "Штрихкод — те, що читає сканер"
									}), /* @__PURE__ */ y("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ v("input", {
											className: Z,
											value: ie,
											onChange: (e) => K(e.target.value)
										}), /* @__PURE__ */ v(De, { onGenerated: K })]
									})]
								}),
								/* @__PURE__ */ v("button", {
									type: "submit",
									className: "sq-btn-primary sm:col-span-2 py-2.5 text-sm",
									children: "Зберегти"
								})
							]
						}),
						/* @__PURE__ */ y("div", {
							className: "space-y-3",
							children: [Ne.map((n) => D === n.id ? /* @__PURE__ */ v(Me, {
								product: n,
								flatTags: Q,
								groups: X,
								partOptions: e(t, {
									excludeProductId: n.id,
									maxDepth: Ae
								}),
								onCancel: () => O(null),
								onSaved: async () => {
									await $();
								},
								onCloseAfterSave: () => O(null)
							}, n.id) : /* @__PURE__ */ v("section", {
								className: "border border-sq-divider rounded-sq p-4 bg-sq-surface shadow-sm",
								children: /* @__PURE__ */ y("div", {
									className: "flex items-start gap-3",
									children: [/* @__PURE__ */ v("input", {
										type: "checkbox",
										className: "mt-1",
										checked: b.has(n.id),
										onChange: () => Ve(n.id)
									}), /* @__PURE__ */ y("div", {
										className: "flex-1 min-w-0",
										children: [
											/* @__PURE__ */ y("div", {
												className: "flex flex-wrap items-center justify-between gap-2",
												children: [/* @__PURE__ */ y("div", {
													className: "flex items-center gap-3 min-w-0",
													children: [/* @__PURE__ */ v("div", {
														className: "w-12 h-12 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden shrink-0 grid place-items-center",
														children: n.image_url ? /* @__PURE__ */ v("img", {
															src: d(n.image_url) ?? void 0,
															alt: "",
															className: "w-full h-full object-cover"
														}) : /* @__PURE__ */ v("span", {
															className: "text-[10px] text-sq-muted",
															children: "фото"
														})
													}), /* @__PURE__ */ v("div", {
														className: "min-w-0",
														children: /* @__PURE__ */ y("div", {
															className: "flex flex-wrap items-center gap-2",
															children: [
																/* @__PURE__ */ v("h3", {
																	className: "font-semibold text-sq-text truncate",
																	children: n.name
																}),
																n.needs_review && /* @__PURE__ */ v("span", {
																	className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]",
																	children: "Потребує перевірки"
																}),
																n.kind === "composite" && /* @__PURE__ */ v("span", {
																	className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#EEF4FF] text-[#2B4ACB]",
																	children: n.stock_mode === "derived" ? "Складений · при продажу" : "Складений · збираємо"
																}),
																n.sellable === !1 && /* @__PURE__ */ v("span", {
																	className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-sq-bg text-sq-secondary",
																	children: "Не на касі"
																}),
																(n.modifier_group_ids?.length ?? 0) > 0 && /* @__PURE__ */ y("span", {
																	className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#EEF4FF] text-[#2B4ACB]",
																	children: ["Модифікатори · ", n.modifier_group_ids?.length]
																})
															]
														})
													})]
												}), /* @__PURE__ */ y("div", {
													className: "flex gap-3 text-sm font-semibold",
													children: [/* @__PURE__ */ v("button", {
														type: "button",
														className: "text-sq-blue",
														onClick: () => {
															E(!1), O(n.id);
														},
														children: "Редагувати"
													}), /* @__PURE__ */ v("button", {
														type: "button",
														className: "text-red-600",
														onClick: () => void Be(n),
														children: "Архів"
													})]
												})]
											}),
											/* @__PURE__ */ v("div", {
												className: "flex flex-wrap gap-1.5 mt-2",
												children: (n.tag_ids ?? []).map((e) => {
													let t = Q.find((t) => t.id === e);
													return /* @__PURE__ */ v("span", {
														className: "text-xs px-2 py-0.5 rounded-full bg-sq-bg text-sq-secondary border border-sq-divider",
														children: t?.name ?? e
													}, e);
												})
											}),
											/* @__PURE__ */ v(Oe, {
												variants: n.variants.filter((e) => e.is_active),
												derived: n.kind === "composite" && n.stock_mode === "derived"
											})
										]
									})]
								})
							}, n.id)), Ne.length === 0 && /* @__PURE__ */ v("p", {
								className: "text-sm text-sq-secondary",
								children: "Немає товарів у цьому фільтрі."
							})]
						})
					]
				})]
			})
		]
	});
}
function Ee(e, t) {
	return (typeof e == "object" && e && "response" in e ? e.response?.status : void 0) === 409 ? "Такий артикул або штрихкод уже є в цьому магазині — змініть його або згенеруйте новий" : t;
}
function De({ onGenerated: e }) {
	let [t, n] = o(!1);
	async function r() {
		n(!0);
		try {
			e(await u.generateInternalBarcode());
		} catch {} finally {
			n(!1);
		}
	}
	return /* @__PURE__ */ v("button", {
		type: "button",
		onClick: () => void r(),
		disabled: t,
		title: "Внутрішній код магазину — коли бирка не сканується",
		className: "shrink-0 rounded-sq border border-sq-divider bg-sq-surface px-3 text-sm whitespace-nowrap disabled:opacity-50",
		children: "Згенерувати"
	});
}
function Oe({ variants: e, derived: t }) {
	let n = _e();
	return /* @__PURE__ */ v("div", {
		ref: n,
		className: "mt-3 overflow-x-auto select-none",
		children: /* @__PURE__ */ y("table", {
			className: "w-full text-sm",
			children: [/* @__PURE__ */ v("thead", { children: /* @__PURE__ */ y("tr", {
				className: "text-left text-sq-secondary",
				children: [
					/* @__PURE__ */ v("th", {
						className: "py-1 pr-2 font-medium",
						children: "Варіант"
					}),
					/* @__PURE__ */ v("th", {
						className: "py-1 pr-2 font-medium",
						children: "Ціна"
					}),
					/* @__PURE__ */ v("th", {
						className: "py-1 pr-2 font-medium",
						children: t ? "Можна зібрати" : "Залишок"
					}),
					/* @__PURE__ */ v("th", {
						className: "py-1 pr-2 font-medium",
						children: "Артикул"
					}),
					/* @__PURE__ */ v("th", {
						className: "py-1 font-medium",
						children: "Штрихкод"
					})
				]
			}) }), /* @__PURE__ */ v("tbody", { children: e.map((e) => /* @__PURE__ */ y("tr", {
				className: "border-t border-sq-divider",
				children: [
					/* @__PURE__ */ v("td", {
						className: "py-2 pr-2",
						children: e.label || "—"
					}),
					/* @__PURE__ */ v("td", {
						className: "py-2 pr-2",
						children: f(e.price_cents)
					}),
					/* @__PURE__ */ y("td", {
						className: "py-2 pr-2",
						children: [e.quantity, e.unit ? /* @__PURE__ */ y("span", {
							className: "text-xs text-sq-muted",
							children: [" ", e.unit]
						}) : null]
					}),
					/* @__PURE__ */ v("td", {
						className: "py-2 pr-2 font-mono text-xs",
						children: e.sku || "—"
					}),
					/* @__PURE__ */ v("td", {
						className: "py-2 font-mono text-xs",
						children: e.barcode || "—"
					})
				]
			}, e.id)) })]
		})
	});
}
function ke({ tag: e, depth: t, filterTag: n, savingTagId: r, onFilter: i, onColor: a, onCatalogBar: s, onStation: c, showStation: l, onCreateChild: u }) {
	let [d, f] = o(!1), [p, m] = o(""), h = e.children ?? [];
	async function g(t) {
		t.preventDefault();
		let n = p.trim();
		n && (await u(e.id, n), m(""), f(!1));
	}
	return /* @__PURE__ */ y("div", {
		className: "space-y-1",
		children: [/* @__PURE__ */ v(Ae, {
			tag: e,
			nested: t > 1,
			active: n === e.id,
			saving: r === e.id,
			canAddChild: t < be,
			onFilter: () => i(e.id),
			onColor: (t) => a(e, t),
			onCatalogBar: (t) => s(e, t),
			onStation: l ? (t) => c(e, t) : void 0,
			onAddChild: () => f((e) => !e)
		}), (d || h.length > 0) && /* @__PURE__ */ y("div", {
			className: "ml-3 space-y-1 border-l border-sq-divider pl-2",
			children: [h.map((e) => /* @__PURE__ */ v(ke, {
				tag: e,
				depth: t + 1,
				filterTag: n,
				savingTagId: r,
				onFilter: i,
				onColor: a,
				onCatalogBar: s,
				onStation: c,
				showStation: l,
				onCreateChild: u
			}, e.id)), d && /* @__PURE__ */ y("form", {
				onSubmit: (e) => void g(e),
				className: "flex gap-1.5 pt-1",
				children: [/* @__PURE__ */ v("input", {
					autoFocus: !0,
					className: Z,
					placeholder: `Підгрупа в «${e.name}»`,
					value: p,
					onChange: (e) => m(e.target.value),
					required: !0
				}), /* @__PURE__ */ v("button", {
					type: "submit",
					className: "sq-btn-primary px-3 text-sm shrink-0",
					children: "OK"
				})]
			})]
		})]
	});
}
function Ae({ tag: e, nested: t, active: n, saving: r, canAddChild: i, onFilter: a, onColor: o, onCatalogBar: s, onStation: c, onAddChild: l }) {
	return /* @__PURE__ */ y("div", {
		className: `rounded-[4px] border border-transparent p-1.5 space-y-1.5 ${n ? "bg-sq-blue/10 border-sq-blue/30" : ""} ${r ? "opacity-60" : ""}`,
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-1",
				children: [/* @__PURE__ */ y("button", {
					type: "button",
					onClick: a,
					className: `flex-1 text-left px-2 py-1 rounded-[4px] font-medium ${t ? "text-sm text-[#6E6E6E]" : "text-sm"} ${n ? "text-sq-blue" : "text-sq-text"}`,
					children: [e.name, e.show_in_catalog_bar && /* @__PURE__ */ v("span", {
						className: "ml-1.5 text-[10px] font-normal text-sq-blue",
						children: "рядок"
					})]
				}), i && /* @__PURE__ */ v("button", {
					type: "button",
					onClick: l,
					title: "Додати підгрупу",
					className: "shrink-0 text-xs font-semibold text-sq-blue px-1.5 py-1 rounded-[4px] hover:bg-sq-blue/10",
					children: "+ підгрупа"
				})]
			}),
			/* @__PURE__ */ v(ye, {
				value: e.color,
				onChange: o,
				size: "sm"
			}),
			/* @__PURE__ */ y("label", {
				className: "flex items-center gap-1.5 px-1 text-[11px] text-sq-secondary cursor-pointer",
				children: [/* @__PURE__ */ v("input", {
					type: "checkbox",
					checked: e.show_in_catalog_bar,
					disabled: r,
					onChange: (e) => s(e.target.checked)
				}), "У рядку категорій"]
			}),
			c && /* @__PURE__ */ y("div", {
				className: "flex items-center gap-1 px-1 text-[11px] text-sq-secondary",
				"data-testid": `tag-station-${e.id}`,
				children: [/* @__PURE__ */ v("span", {
					className: "mr-0.5",
					children: "Станція:"
				}), je.map(([t, n]) => {
					let i = (e.station ?? null) === t;
					return /* @__PURE__ */ v("button", {
						type: "button",
						disabled: r,
						"aria-pressed": i,
						onClick: () => {
							i || c(t);
						},
						className: `rounded-full border px-2 py-0.5 ${i ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider text-sq-text"}`,
						children: n
					}, n);
				})]
			})
		]
	});
}
var je = [
	[null, "—"],
	["kitchen", "Кухня"],
	["bar", "Бар"]
];
function Me({ product: e, flatTags: t, groups: n, partOptions: r, onCancel: i, onSaved: a, onCloseAfterSave: s }) {
	let c = g(), l = xe(e), [d, f] = o(l), p = d !== "", [h, _] = o(e.name), [b, x] = o(e.description ?? ""), [S, C] = o(e.image_url), [w, T] = o(e.sellable !== !1), [E, D] = o(e.tag_ids ?? []), [O, k] = o(e.modifier_group_ids ?? []), [A, j] = o(e.variants.filter((e) => e.is_active)), [M, N] = o(() => Object.fromEntries(e.variants.filter((e) => e.is_active).map((e) => [e.id, (e.components ?? []).map((e) => ({
		component_variant_id: e.component_variant_id,
		quantity: e.quantity
	}))]))), [P, F] = o({}), [ee, I] = o(c.defaultUnit), [L, R] = o("690"), [z, B] = o([]), [V, H] = o(null), [U, te] = o(!1);
	function ne(e) {
		D((t) => t.includes(e) ? t.filter((t) => t !== e) : [...t, e]);
	}
	async function W(e) {
		for (let t of A) await u.updateVariant(t.id, {
			attributes: t.attributes,
			unit: t.unit,
			price_cents: t.price_cents,
			compare_at_cents: t.compare_at_cents ?? null,
			sku: t.sku ?? "",
			barcode: t.barcode ?? "",
			...e === "clear" ? { components: [] } : p ? { components: M[t.id] ?? [] } : {}
		});
	}
	async function G() {
		let t = {
			name: h,
			description: b,
			image_url: S,
			sellable: w
		};
		if (d === l) {
			await u.updateProduct(e.id, t), await W("keep");
			return;
		}
		if (d === "") {
			await W("clear"), await u.updateProduct(e.id, {
				...t,
				kind: "simple"
			});
			return;
		}
		await u.updateProduct(e.id, {
			...t,
			kind: "composite",
			stock_mode: "own"
		}), await W("keep"), d === "derived" && await u.updateProduct(e.id, { stock_mode: "derived" });
	}
	async function re(t) {
		t.preventDefault(), H(null), te(!0);
		try {
			await G(), await u.setProductTags(e.id, E), await u.setProductModifierGroups(e.id, O), await a(), s();
		} catch (e) {
			H(Ee(e, "Не вдалося зберегти"));
		} finally {
			te(!1);
		}
	}
	async function ie() {
		try {
			let t = (await u.addVariant(e.id, {
				attributes: P,
				unit: ee,
				price_cents: m(L),
				quantity: 0,
				...p ? { components: z } : {}
			})).variants.filter((e) => e.is_active);
			j(t), N(Object.fromEntries(t.map((e) => [e.id, (e.components ?? []).map((e) => ({
				component_variant_id: e.component_variant_id,
				quantity: e.quantity
			}))]))), F({}), I(c.defaultUnit), R("690"), B([]), await a();
		} catch {
			H("Не вдалося додати варіант");
		}
	}
	async function K(e) {
		if (!confirm("Архівувати варіант? Зникне з каси.")) return;
		let t = await u.archiveVariant(e);
		j(t.variants.filter((e) => e.is_active)), await a();
	}
	return /* @__PURE__ */ y("form", {
		onSubmit: (e) => void re(e),
		className: "border border-sq-blue/40 rounded-sq p-4 grid sm:grid-cols-2 gap-3 bg-sq-surface shadow-sm",
		children: [
			/* @__PURE__ */ y("div", {
				className: "sm:col-span-2 flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ v("p", {
					className: "text-sm font-semibold text-sq-text",
					children: "Редагування"
				}), /* @__PURE__ */ v("button", {
					type: "button",
					className: "text-sm text-sq-secondary font-medium",
					onClick: i,
					children: "Сховати"
				})]
			}),
			V && /* @__PURE__ */ v("p", {
				className: "sm:col-span-2 text-sm text-red-600",
				children: V
			}),
			/* @__PURE__ */ v(he, {
				value: S,
				onChange: C
			}),
			/* @__PURE__ */ v("input", {
				className: Z,
				placeholder: "Назва",
				value: h,
				onChange: (e) => _(e.target.value),
				required: !0
			}),
			/* @__PURE__ */ v("input", {
				className: Z,
				placeholder: "Опис",
				value: b,
				onChange: (e) => x(e.target.value)
			}),
			/* @__PURE__ */ y("label", {
				className: "block space-y-1 sm:col-span-2",
				children: [
					/* @__PURE__ */ v("span", {
						className: "text-xs text-sq-secondary",
						children: "Що це за товар"
					}),
					/* @__PURE__ */ v("select", {
						className: Z,
						value: d,
						onChange: (e) => f(e.target.value),
						children: Ce.map((e) => /* @__PURE__ */ v("option", {
							value: e.value,
							children: e.label
						}, e.value))
					}),
					d !== "" && /* @__PURE__ */ v("span", {
						className: "text-xs text-sq-secondary",
						children: Se(d)
					})
				]
			}),
			/* @__PURE__ */ y("label", {
				className: "flex items-start gap-2 text-sm text-sq-text cursor-pointer sm:col-span-2",
				children: [/* @__PURE__ */ v("input", {
					type: "checkbox",
					className: "mt-0.5",
					checked: w,
					onChange: (e) => T(e.target.checked)
				}), /* @__PURE__ */ y("span", { children: ["Продається на касі", /* @__PURE__ */ v("span", {
					className: "block text-[11px] text-sq-secondary",
					children: "Вимкніть для інгредієнта чи заготовки: склад і рецепти його бачать, екран продажу — ні"
				})] })]
			}),
			/* @__PURE__ */ y("div", {
				className: "sm:col-span-2",
				children: [/* @__PURE__ */ v("p", {
					className: "text-xs font-semibold text-sq-secondary mb-2",
					children: "Мітки"
				}), /* @__PURE__ */ y("div", {
					className: "flex flex-wrap gap-2",
					children: [t.map((e) => /* @__PURE__ */ y("label", {
						className: "inline-flex items-center gap-1.5 text-sm border border-sq-divider rounded-full px-2.5 py-1 bg-sq-bg",
						children: [/* @__PURE__ */ v("input", {
							type: "checkbox",
							checked: E.includes(e.id),
							onChange: () => ne(e.id)
						}), Te(t, e)]
					}, e.id)), t.length === 0 && /* @__PURE__ */ v("span", {
						className: "text-sm text-sq-muted",
						children: "Немає міток"
					})]
				})]
			}),
			/* @__PURE__ */ v(ce, {
				groups: n,
				value: O,
				onChange: k
			}),
			/* @__PURE__ */ y("div", {
				className: "sm:col-span-2 space-y-3",
				children: [
					/* @__PURE__ */ v("p", {
						className: "text-xs font-semibold text-sq-secondary",
						children: "Варіанти"
					}),
					A.map((e, t) => /* @__PURE__ */ y("div", {
						className: "border border-sq-divider rounded-sq p-3 space-y-2 bg-sq-bg/40",
						children: [
							/* @__PURE__ */ v(ve, {
								schema: c.attributes,
								value: e.attributes,
								onChange: (n) => {
									let r = [...A];
									r[t] = {
										...e,
										attributes: n
									}, j(r);
								},
								unit: {
									value: e.unit,
									options: c.units,
									onChange: (n) => {
										let r = [...A];
										r[t] = {
											...e,
											unit: n
										}, j(r);
									}
								}
							}),
							/* @__PURE__ */ y("div", {
								className: "grid sm:grid-cols-[1fr_auto] gap-2 items-center",
								children: [/* @__PURE__ */ v("input", {
									className: Z,
									value: (e.price_cents / 100).toFixed(2),
									onChange: (n) => {
										let r = [...A];
										r[t] = {
											...e,
											price_cents: m(n.target.value)
										}, j(r);
									},
									placeholder: "Ціна, грн"
								}), /* @__PURE__ */ v("button", {
									type: "button",
									className: "text-sm font-semibold text-red-600 min-h-11 px-2",
									onClick: () => void K(e.id),
									children: "Архів"
								})]
							}),
							/* @__PURE__ */ v($, {
								priceCents: e.price_cents,
								compareAtCents: e.compare_at_cents ?? null,
								onChange: (n, r) => {
									let i = [...A];
									i[t] = {
										...e,
										price_cents: n,
										compare_at_cents: r
									}, j(i);
								}
							}),
							p && /* @__PURE__ */ v(se, {
								value: M[e.id] ?? [],
								options: r,
								onChange: (t) => N((n) => ({
									...n,
									[e.id]: t
								}))
							}),
							/* @__PURE__ */ y("div", {
								className: "grid sm:grid-cols-2 gap-2",
								children: [/* @__PURE__ */ y("label", {
									className: "block space-y-1",
									children: [/* @__PURE__ */ v("span", {
										className: "text-xs text-sq-secondary",
										children: "Артикул (SKU)"
									}), /* @__PURE__ */ v("input", {
										className: Z,
										value: e.sku ?? "",
										onChange: (n) => {
											let r = [...A];
											r[t] = {
												...e,
												sku: n.target.value
											}, j(r);
										}
									})]
								}), /* @__PURE__ */ y("label", {
									className: "block space-y-1",
									children: [/* @__PURE__ */ v("span", {
										className: "text-xs text-sq-secondary",
										children: "Штрихкод"
									}), /* @__PURE__ */ y("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ v("input", {
											className: Z,
											value: e.barcode ?? "",
											onChange: (n) => {
												let r = [...A];
												r[t] = {
													...e,
													barcode: n.target.value
												}, j(r);
											}
										}), /* @__PURE__ */ v(De, { onGenerated: (n) => {
											let r = [...A];
											r[t] = {
												...e,
												barcode: n
											}, j(r);
										} })]
									})]
								})]
							})
						]
					}, e.id)),
					/* @__PURE__ */ y("div", {
						className: "space-y-2 pt-1 border-t border-sq-divider",
						children: [
							/* @__PURE__ */ v(ve, {
								schema: c.attributes,
								value: P,
								onChange: F,
								unit: {
									value: ee,
									options: c.units,
									onChange: I
								}
							}),
							p && /* @__PURE__ */ v(se, {
								value: z,
								options: r,
								onChange: B
							}),
							/* @__PURE__ */ y("div", {
								className: "grid sm:grid-cols-[1fr_auto] gap-2 items-center",
								children: [/* @__PURE__ */ v("input", {
									className: Z,
									placeholder: "Ціна, грн",
									value: L,
									onChange: (e) => R(e.target.value)
								}), /* @__PURE__ */ v("button", {
									type: "button",
									className: "text-sm font-semibold text-sq-blue min-h-11 px-2",
									onClick: () => void ie(),
									children: "+ Варіант"
								})]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ v("button", {
				type: "submit",
				disabled: U,
				className: "sq-btn-primary sm:col-span-2 py-2.5 text-sm",
				children: U ? "Збереження…" : "Зберегти"
			})
		]
	});
}
function $({ priceCents: e, compareAtCents: t, onChange: n }) {
	let [r, i] = o(""), [a, s] = o("");
	return /* @__PURE__ */ y("div", {
		className: "space-y-1.5 text-sm",
		children: [
			/* @__PURE__ */ v("p", {
				className: "text-[11px] font-semibold text-sq-secondary",
				children: "Знижка товару"
			}),
			t != null && t > e ? /* @__PURE__ */ y("p", {
				className: "text-xs text-sq-secondary",
				children: [
					"Стара: ",
					(t / 100).toFixed(2),
					" ₴ → нова: ",
					(e / 100).toFixed(2),
					" ₴",
					/* @__PURE__ */ v("button", {
						type: "button",
						className: "ml-2 text-sq-blue font-medium",
						onClick: () => n(t, null),
						children: "Скинути знижку"
					})
				]
			}) : /* @__PURE__ */ v("p", {
				className: "text-xs text-sq-muted",
				children: "Без знижки"
			}),
			/* @__PURE__ */ y("div", {
				className: "flex flex-wrap gap-2 items-center",
				children: [
					/* @__PURE__ */ v("input", {
						className: `${Z} max-w-[100px]`,
						placeholder: "% знижки",
						value: r,
						onChange: (e) => i(e.target.value)
					}),
					/* @__PURE__ */ v("button", {
						type: "button",
						className: "text-xs font-semibold text-sq-blue px-2 py-1",
						onClick: () => {
							let a = Number(r);
							if (!Number.isFinite(a) || a <= 0 || a >= 100) return;
							let o = t ?? e;
							n(Math.round(o * (100 - a) / 100), o), i("");
						},
						children: "За %"
					}),
					/* @__PURE__ */ v("input", {
						className: `${Z} max-w-[120px]`,
						placeholder: "Нова ціна, грн",
						value: a,
						onChange: (e) => s(e.target.value)
					}),
					/* @__PURE__ */ v("button", {
						type: "button",
						className: "text-xs font-semibold text-sq-blue px-2 py-1",
						onClick: () => {
							let r = m(a);
							r <= 0 || r >= e || (n(r, t ?? e), s(""));
						},
						children: "За новою ціною"
					})
				]
			})
		]
	});
}
//#endregion
export { Q as ProductsPage };
