import { a as e, n as t, t as n } from "./hostPlatform-BSaDrC_D.js";
import { Suspense as r, lazy as i, useEffect as a, useRef as o, useState as s } from "react";
import { Fragment as c, jsx as l, jsxs as u } from "react/jsx-runtime";
import { assetUrl as d, defaultModifierIds as f, groupsOf as p, needsModifierSheet as m, useCartStore as h, useSalesCatalog as g, useVertical as _ } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/camera.js
var v = e("Camera", [["path", {
	d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
	key: "1tc9qg"
}], ["circle", {
	cx: "12",
	cy: "13",
	r: "3",
	key: "1vg3eu"
}]]), y = e("Folder", [["path", {
	d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	key: "1kt360"
}]]), b = e("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), x = 6;
function S() {
	let e = o(null);
	return a(() => {
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
//#region src/components/cashier/ProductTile.tsx
function w({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: o, count: c, onMore: f, badge: p }) {
	let [m, h] = s(!1), g = m ? null : d(r), _ = /* @__PURE__ */ u("button", {
		type: "button",
		disabled: o,
		onClick: a,
		className: `${f ? "w-full h-full" : "aspect-square"} rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : ""}`,
		children: [
			g ? /* @__PURE__ */ l("img", {
				src: g,
				alt: "",
				className: "absolute inset-0 w-full h-full object-cover pointer-events-none",
				onError: () => h(!0)
			}) : /* @__PURE__ */ l("div", {
				className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
				children: t || " "
			}),
			/* @__PURE__ */ l("div", { className: "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" }),
			/* @__PURE__ */ u("div", {
				className: "absolute bottom-2 left-2 right-2 text-white pointer-events-none",
				children: [/* @__PURE__ */ l("p", {
					className: "text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm",
					children: e
				}), n != null && /* @__PURE__ */ l("p", {
					className: "text-[12px] mt-0.5 opacity-95 drop-shadow-sm",
					children: C(n)
				})]
			}),
			c != null && c > 0 && /* @__PURE__ */ l("span", {
				className: "absolute top-2 left-2 min-w-7 h-7 px-1.5 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-semibold tabular-nums shadow-sm pointer-events-none",
				"data-testid": "tile-count",
				children: c
			}),
			p ? /* @__PURE__ */ l("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				"data-testid": "tile-badge",
				children: p
			}) : i != null && i <= 0 && /* @__PURE__ */ l("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				children: "немає"
			})
		]
	});
	return f ? /* @__PURE__ */ u("div", {
		className: "relative aspect-square",
		children: [_, !o && /* @__PURE__ */ l("button", {
			type: "button",
			onClick: f,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-1 right-1 w-11 h-11 grid place-items-center rounded-full bg-black/45 text-white text-xl leading-none shadow-sm hover:bg-black/60",
			"data-testid": "tile-more",
			children: "⋯"
		})]
	}) : _;
}
//#endregion
//#region src/lib/tagColors.ts
var T = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], E = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, D = "slate";
function O(e) {
	return !!e && T.includes(e);
}
function k(e) {
	return O(e) ? E[e] : E[D];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function A({ name: e, color: t, onClick: n }) {
	let r = k(t);
	return /* @__PURE__ */ u("button", {
		type: "button",
		onClick: n,
		className: "aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]",
		style: { backgroundColor: r },
		children: [/* @__PURE__ */ l(y, {
			size: 22,
			strokeWidth: 1.75,
			className: "text-white/95 absolute top-2.5 left-2.5"
		}), /* @__PURE__ */ l("span", {
			className: "absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white",
			children: e
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function j({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = S(), s = (e) => `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${e ? "font-semibold text-sq-text border-sq-text" : "font-medium text-sq-secondary border-transparent"}`;
	return /* @__PURE__ */ u("div", {
		ref: o,
		className: "flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none",
		children: [
			n && /* @__PURE__ */ u("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap",
				children: ["‹ ", r]
			}),
			/* @__PURE__ */ l("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ l("button", {
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
function M({ active: e, onScan: t }) {
	let n = o(null);
	return a(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ l("input", {
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
function N(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function P(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function F(e, t) {
	let n = /* @__PURE__ */ new Map();
	e.forEach((e, t) => {
		e.modifiers.forEach((r, i) => {
			n.set(r.id, {
				group: e,
				groupIndex: t,
				modifier: r,
				index: i
			});
		});
	});
	let r = null, i = [];
	for (let e of P(t)) {
		let t = n.get(e);
		if (!t) {
			r ?? (r = `Модифікатор ${e} недоступний для цього товару`);
			continue;
		}
		i.push(t);
	}
	let a = /* @__PURE__ */ new Map();
	for (let e of i) a.set(e.group.id, (a.get(e.group.id) ?? 0) + 1);
	for (let t of e) {
		if (r) break;
		let e = a.get(t.id) ?? 0;
		e < t.min_select ? r = t.min_select === 1 ? `Оберіть «${t.name}»` : `«${t.name}»: оберіть щонайменше ${t.min_select}` : e > t.max_select && (r = `«${t.name}»: не більше ${t.max_select}`);
	}
	i.sort((e, t) => e.groupIndex - t.groupIndex || e.index - t.index);
	let o = /* @__PURE__ */ new Map(), s = 0, c = [], l = [];
	for (let { group: e, modifier: t } of i) s += t.price_delta_cents, l.push(t.name), c.push({
		id: t.id,
		group_name: e.name,
		name: t.name,
		price_delta_cents: t.price_delta_cents
	}), t.component_variant_id != null && t.component_quantity != null && o.set(t.component_variant_id, (o.get(t.component_variant_id) ?? 0) + t.component_quantity);
	return {
		snapshot: c,
		deltaCents: s,
		names: l,
		components: [...o.entries()].map(([e, t]) => ({
			component_variant_id: e,
			quantity: t
		})),
		error: r
	};
}
function I(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function L({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: o, onAdd: d, onClose: f }) {
	let [p, m] = s(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [h, g] = s(() => i ?? []), [_, v] = s(o ?? ""), y = S(), b = t.find((e) => e.variant_id === p) ?? null, x = I(t), w = F(x, h), T = b ? b.price_cents + w.deltaCents : null, E = b == null ? `Оберіть «${n}»` : w.error ?? (T != null && T < 0 ? "Ціна не може бути відʼємною" : null), D = E == null && b != null;
	a(() => {
		let e = (e) => {
			e.key === "Escape" && f();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [f]);
	function O(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function k(e, t) {
		g((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : O(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function A() {
		D && b && d({
			item: b,
			modifiers: w.snapshot.map((e) => e.id),
			note: N(_)
		});
	}
	return /* @__PURE__ */ u("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ l("button", {
			type: "button",
			"aria-label": "Закрити",
			className: "absolute inset-0 bg-black/30",
			onClick: f
		}), /* @__PURE__ */ u("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-sq shadow-lg animate-fade-up flex flex-col max-h-[85%]",
			children: [
				/* @__PURE__ */ u("div", {
					className: "px-4 py-3 border-b border-sq-divider flex justify-between items-center gap-3 shrink-0",
					children: [/* @__PURE__ */ u("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ l("h3", {
							className: "font-semibold text-sq-text truncate",
							children: e
						}), b && /* @__PURE__ */ l("p", {
							className: "text-xs text-sq-secondary truncate",
							children: [b.label, C(b.price_cents)].filter(Boolean).join(" · ")
						})]
					}), /* @__PURE__ */ l("button", {
						type: "button",
						onClick: f,
						className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
						"data-testid": "modifier-close",
						children: "Закрити"
					})]
				}),
				/* @__PURE__ */ u("div", {
					ref: y,
					className: "flex-1 overflow-auto select-none px-4 py-3 space-y-4",
					children: [t.length > 1 && /* @__PURE__ */ u("div", {
						"data-testid": "modifier-variants",
						children: [/* @__PURE__ */ l(R, {
							name: n,
							hint: "обовʼязково"
						}), /* @__PURE__ */ l("div", {
							className: "flex flex-wrap gap-2",
							children: t.map((e) => {
								let t = e.variant_id === p, n = e.quantity <= 0;
								return /* @__PURE__ */ u("button", {
									type: "button",
									disabled: n,
									"aria-pressed": t,
									onClick: () => m(e.variant_id),
									className: z(t, n),
									"data-testid": `modifier-variant-${e.variant_id}`,
									children: [e.label || "Стандарт", n ? " · немає" : ""]
								}, e.variant_id);
							})
						})]
					}), x.map((e) => {
						let t = O(e, h), n = e.max_select > 1 && t >= e.max_select, r = e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select > 1 ? n ? `не більше ${e.max_select}` : `до ${e.max_select}` : null;
						return /* @__PURE__ */ u("div", {
							"data-testid": `modifier-group-${e.id}`,
							children: [/* @__PURE__ */ l(R, {
								name: e.name,
								hint: r
							}), /* @__PURE__ */ l("div", {
								className: "flex flex-wrap gap-2",
								children: e.modifiers.map((t) => {
									let r = h.includes(t.id), i = !r && n;
									return /* @__PURE__ */ u("button", {
										type: "button",
										"aria-pressed": r,
										"aria-disabled": i || void 0,
										onClick: () => k(e, t),
										className: z(r, i),
										"data-testid": `modifier-chip-${t.id}`,
										children: [t.name, B(t.price_delta_cents)]
									}, t.id);
								})
							})]
						}, e.id);
					})]
				}),
				/* @__PURE__ */ u("div", {
					className: "shrink-0 border-t border-sq-divider px-4 py-3 space-y-2",
					children: [
						/* @__PURE__ */ l("input", {
							className: "pos-field w-full",
							value: _,
							maxLength: 120,
							placeholder: "Коментар для кухні",
							enterKeyHint: "done",
							onChange: (e) => v(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && (e.preventDefault(), A());
							},
							"data-testid": "modifier-note"
						}),
						E && /* @__PURE__ */ l("p", {
							className: "text-xs text-red-600",
							"data-testid": "modifier-error",
							children: E
						}),
						/* @__PURE__ */ u("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-12",
							disabled: !D,
							onClick: A,
							"data-testid": "modifier-add",
							children: ["Додати в чек", T != null && /* @__PURE__ */ u(c, { children: [" · ", /* @__PURE__ */ l("span", {
								"data-testid": "modifier-price",
								children: C(T)
							})] })]
						})
					]
				})
			]
		})]
	});
}
function R({ name: e, hint: t }) {
	return /* @__PURE__ */ u("p", {
		className: "text-xs font-semibold text-sq-secondary mb-2",
		children: [e, t && /* @__PURE__ */ u("span", {
			className: "font-normal",
			children: [" · ", t]
		})]
	});
}
function z(e, t) {
	return [
		"min-h-11 px-3 rounded-full border text-sm font-medium transition-colors",
		e ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-white text-sq-text",
		t ? "opacity-40" : ""
	].join(" ");
}
function B(e) {
	return e > 0 ? ` +${C(e)}` : e < 0 ? ` −${C(-e)}` : "";
}
//#endregion
//#region src/modules/vertical-cafe/lib/stopList.ts
function V(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function H(e, t = V()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/vertical-cafe/CafeCatalog.tsx
var U = i(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function W({ active: e, stockEpoch: r }) {
	let i = t();
	if (i.length > 0) throw new n(i);
	return /* @__PURE__ */ l(G, {
		active: e,
		stockEpoch: r
	});
}
function G({ active: e, stockEpoch: t }) {
	let n = g(), i = _(), o = h((e) => e.addItem), c = h((e) => e.setBanner), d = S(), [y, x] = s(!1), [C, T] = s(null), E = i.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	a(() => {
		t > 0 && n.refresh();
	}, [t]);
	function D(e, { ask: t = !1 } = {}) {
		let n = p(e);
		if (t || m(e, n)) {
			T({
				variants: e,
				initialVariantId: e.length === 1 ? e[0].variant_id : null
			});
			return;
		}
		o(e[0], 1, {
			modifiers: f(n),
			note: ""
		});
	}
	async function O(e) {
		let t = await n.lookupBarcode(e);
		if (t.length === 0) {
			c("Штрихкод не знайдено");
			return;
		}
		D(t), n.setQuery("");
	}
	return /* @__PURE__ */ u("section", {
		className: "relative flex flex-col min-h-0 bg-white",
		"data-testid": "cafe-catalog",
		children: [
			/* @__PURE__ */ l(M, {
				active: e && !y && !C,
				onScan: (e) => void O(e)
			}),
			/* @__PURE__ */ u("div", {
				className: "px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0",
				children: [/* @__PURE__ */ u("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ u("div", {
						className: "relative flex-1",
						children: [/* @__PURE__ */ l(b, {
							size: 18,
							className: "absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
						}), /* @__PURE__ */ l("input", {
							className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
							placeholder: "Пошук",
							value: n.query,
							onChange: (e) => n.setQuery(e.target.value)
						})]
					}), /* @__PURE__ */ l("button", {
						type: "button",
						onClick: () => x(!0),
						className: "min-h-12 min-w-12 grid place-items-center rounded-sq text-sq-blue border border-sq-divider bg-white",
						"aria-label": "Камера",
						children: /* @__PURE__ */ l(v, { size: 20 })
					})]
				}), !n.query.trim() && /* @__PURE__ */ l(j, {
					tags: n.catalogBarTags,
					activeId: n.catalogBarActiveId,
					showBack: n.showBack,
					backLabel: n.backLabel,
					onSelect: n.selectCatalogBarTag,
					onBack: n.goBackOne
				})]
			}),
			/* @__PURE__ */ u("div", {
				ref: d,
				className: "flex-1 overflow-auto p-3 bg-white select-none",
				children: [
					n.loading && /* @__PURE__ */ l("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ u("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2",
						children: [n.folderTiles.map((e) => /* @__PURE__ */ l(A, {
							name: e.name,
							color: e.color,
							onClick: () => n.enterTag(e)
						}, e.id)), n.grouped.map(([e, t]) => {
							let n = t[0], r = p(t), i = Math.min(...t.map((e) => e.price_cents)), a = t.reduce((e, t) => e + t.quantity, 0), o = H(n), s = t.length > 1 ? t.map((e) => e.label).filter(Boolean).join(" / ") : n.label;
							return /* @__PURE__ */ l(w, {
								name: n.product_name,
								subtitle: s,
								priceCents: i,
								imageUrl: n.image_url,
								stock: a,
								disabled: a <= 0 || o,
								badge: o ? "стоп" : void 0,
								onClick: () => D(t),
								onMore: r.length > 0 ? () => D(t, { ask: !0 }) : void 0
							}, e);
						})]
					}),
					!n.loading && n.folderTiles.length === 0 && n.grouped.length === 0 && /* @__PURE__ */ l("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			y && /* @__PURE__ */ l(r, {
				fallback: null,
				children: /* @__PURE__ */ l(U, {
					onScan: (e) => {
						x(!1), O(e);
					},
					onClose: () => x(!1)
				})
			}),
			C && /* @__PURE__ */ l(L, {
				productName: C.variants[0]?.product_name ?? "",
				variants: C.variants,
				variantLabel: E,
				initialVariantId: C.initialVariantId,
				initialModifierIds: f(p(C.variants)),
				onAdd: ({ item: e, modifiers: t, note: n }) => {
					o(e, 1, {
						modifiers: t,
						note: n
					}), T(null);
				},
				onClose: () => T(null)
			})
		]
	});
}
//#endregion
export { W as default };
