import { C as e, _ as t, b as n, c as r, f as i, g as a, h as o, m as s, n as c, p as l, s as u, t as d, u as f } from "./hostPlatform-D3rxsd42.js";
import { Suspense as p, lazy as m, useEffect as h, useRef as g, useState as _ } from "react";
import { Fragment as v, jsx as y, jsxs as b } from "react/jsx-runtime";
import { assetUrl as x, defaultModifierIds as S, groupsOf as C, needsModifierSheet as w, useCartStore as T, useSalesCatalog as E, useVertical as D } from "@pos/platform";
//#region src/hooks/useDragScroll.ts
var O = 6;
function k() {
	let e = g(null);
	return h(() => {
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
			!n.moved && Math.hypot(r, i) > O && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var A = "\xA0";
function j(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, A);
}
function M(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${j(n)},${r} ₴`;
}
function N(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${j(String(Math.abs(e) / 100))} ₴` : M(e);
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function P({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: s, count: c, onMore: l, badge: u, testId: d }) {
	let [f, p] = _(!1), m = f ? null : x(r), h = s || !!u || i != null && i <= 0, g = /* @__PURE__ */ b("button", {
		type: "button",
		disabled: s,
		onClick: a,
		"data-testid": d,
		className: `w-full ${l ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ b("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				m ? /* @__PURE__ */ y("img", {
					src: m,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${h ? "opacity-45" : ""}`,
					onError: () => p(!0)
				}) : /* @__PURE__ */ y("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				c != null && c > 0 && /* @__PURE__ */ y("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: c
				}),
				u ? /* @__PURE__ */ y("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: u
				}) : i != null && i <= 0 && /* @__PURE__ */ y("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ b("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ y("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${h ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ y("p", {
				className: "text-[14px] text-sq-secondary tabular-nums",
				children: M(n)
			})]
		})]
	});
	return l ? /* @__PURE__ */ b("div", {
		className: "relative",
		children: [g, !s && /* @__PURE__ */ y("button", {
			type: "button",
			onClick: l,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": d ? `${d}-more` : "tile-more",
			children: /* @__PURE__ */ y("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ y(o, { size: 20 })
			})
		})]
	}) : g;
}
//#endregion
//#region src/lib/tagColors.ts
var F = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], I = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, L = "slate";
function R(e) {
	return !!e && F.includes(e);
}
function z(e) {
	return R(e) ? I[e] : I[L];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function B({ name: e, color: t, onClick: n }) {
	let r = z(t);
	return /* @__PURE__ */ b("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ y("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ y(l, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ b("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ y("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function V({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = k(), s = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ b("div", {
		ref: o,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ b("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ y(f, { size: 16 }), r]
			}),
			/* @__PURE__ */ y("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ y("button", {
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
function H({ active: e, onScan: t }) {
	let n = g(null);
	return h(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ y("input", {
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
function U(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function W(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function G(e, t) {
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
	for (let e of W(t)) {
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
function ee(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function te(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function K({ productName: n, variants: o, variantLabel: c = "Варіант", initialVariantId: l, initialModifierIds: u, initialNote: d, submitLabel: f = "Додати в чек", withQuantity: p = !0, notePlaceholder: m = "Коментар для кухні", onAdd: g, onClose: S }) {
	let [C, w] = _(() => l ?? (o.length === 1 ? o[0].variant_id : null)), [T, E] = _(() => u ?? []), [D, O] = _(d ?? ""), [A, j] = _(1), P = k(), F = o.find((e) => e.variant_id === C) ?? null, I = te(o), L = G(I, T), R = F ? F.price_cents + L.deltaCents : null, z = F == null ? `Оберіть «${c}»` : L.error ?? (R != null && R < 0 ? "Ціна не може бути відʼємною" : null), B = z == null && F != null;
	h(() => {
		let e = (e) => {
			e.key === "Escape" && S();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [S]);
	function V(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function H(e, t) {
		E((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : V(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function W() {
		B && F && g({
			item: F,
			modifiers: L.snapshot.map((e) => e.id),
			note: U(D),
			quantity: p ? A : 1
		});
	}
	let K = F ? ee(F.label, L.error ? [] : L.names) : "", Z = x((F ?? o[0])?.image_url ?? null), Q = o.length ? Math.min(...o.map((e) => e.price_cents)) : null, $ = [...o].sort((e, t) => e.price_cents - t.price_cents);
	return /* @__PURE__ */ b("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ y("div", {
			"aria-hidden": !0,
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: S,
			"data-testid": "modifier-scrim"
		}), /* @__PURE__ */ b("div", {
			role: "dialog",
			"aria-label": n,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]",
			children: [
				/* @__PURE__ */ y("div", {
					"aria-hidden": !0,
					className: "w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0"
				}),
				/* @__PURE__ */ b("div", {
					className: "px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0",
					children: [
						Z ? /* @__PURE__ */ y("img", {
							src: Z,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ y("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ y(i, { size: 24 })
						}),
						/* @__PURE__ */ b("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ y("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: n
							}), Q != null && /* @__PURE__ */ y("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: o.length > 1 ? `від ${M(Q)}` : M(Q)
							})]
						}),
						/* @__PURE__ */ y("button", {
							type: "button",
							onClick: S,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ y(e, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					ref: P,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						o.length > 1 && /* @__PURE__ */ b("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ y(Y, {
								name: c,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ y("div", {
								className: "flex flex-wrap gap-2",
								children: $.map((e) => {
									let t = e.variant_id === C, n = e.quantity <= 0;
									return /* @__PURE__ */ b("button", {
										type: "button",
										disabled: n,
										"aria-pressed": t,
										onClick: () => w(e.variant_id),
										className: X(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ y(r, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ y("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : N(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						I.map((e) => {
							let t = V(e, T), n = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ b("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ y(Y, {
									name: e.name,
									hint: ne(e, n),
									required: e.min_select >= 1
								}), /* @__PURE__ */ y("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let i = T.includes(t.id), a = !i && n;
										return /* @__PURE__ */ b("button", {
											type: "button",
											"aria-pressed": i,
											"aria-disabled": a || void 0,
											onClick: () => H(e, t),
											className: X(i, a),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												i && /* @__PURE__ */ y(r, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ y("span", {
													className: i ? "font-medium" : "font-medium text-sq-secondary",
													children: re(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ b("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ y(a, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ y("input", {
								className: "flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted",
								value: D,
								maxLength: 120,
								placeholder: m,
								"aria-label": m,
								enterKeyHint: "done",
								onChange: (e) => O(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && (e.preventDefault(), W());
								},
								"data-testid": "modifier-note"
							})]
						})
					]
				}),
				/* @__PURE__ */ b("div", {
					className: "shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]",
					children: [
						p && /* @__PURE__ */ b("div", {
							className: "flex items-center gap-1.5",
							"data-testid": "modifier-qty",
							children: [
								/* @__PURE__ */ y("button", {
									type: "button",
									"aria-label": "Менше",
									disabled: A <= 1,
									onClick: () => j((e) => Math.max(1, e - 1)),
									className: J,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ y(s, { size: 20 })
								}),
								/* @__PURE__ */ y("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: A
								}),
								/* @__PURE__ */ y("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: A >= q,
									onClick: () => j((e) => Math.min(q, e + 1)),
									className: J,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ y(t, { size: 20 })
								})
							]
						}),
						z ? /* @__PURE__ */ y("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: z
						}) : /* @__PURE__ */ y("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: K
						}),
						/* @__PURE__ */ y("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !B,
							onClick: W,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ b("span", { children: [f, R != null && /* @__PURE__ */ b(v, { children: [" · ", /* @__PURE__ */ y("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: M(R * A)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var q = 99, J = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function Y({ name: e, hint: t, required: n }) {
	return /* @__PURE__ */ b("div", {
		className: "flex items-baseline gap-2 mb-2.5",
		children: [/* @__PURE__ */ y("span", {
			className: "text-base font-bold text-sq-heading",
			children: e
		}), t && /* @__PURE__ */ y("span", {
			className: `text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
			children: t
		})]
	});
}
function ne(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function X(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function re(e) {
	return e > 0 ? `+${N(e)}` : e < 0 ? `−${N(-e)}` : "";
}
//#endregion
//#region src/modules/vertical-cafe/lib/stopList.ts
function Z(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function Q(e, t = Z()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/vertical-cafe/lib/station.ts
function $(e, t) {
	let n = new Set(e?.tag_ids ?? []);
	if (n.size === 0) return null;
	let r = null, i = (e) => {
		for (let t of e) n.has(t.id) && t.station && (t.station === "kitchen" ? r = "kitchen" : r ?? (r = t.station)), t.children?.length && i(t.children);
	};
	return i(t), r;
}
//#endregion
//#region src/modules/vertical-cafe/CafeCatalog.tsx
var ie = m(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function ae({ active: e, stockEpoch: t }) {
	let n = c();
	if (n.length > 0) throw new d(n);
	return /* @__PURE__ */ y(oe, {
		active: e,
		stockEpoch: t
	});
}
function oe({ active: e, stockEpoch: t }) {
	let r = E(), i = D(), a = T((e) => e.addItem), o = T((e) => e.setBanner), s = k(), [c, l] = _(!1), [d, f] = _(null), m = i.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	h(() => {
		t > 0 && r.refresh();
	}, [t]);
	function g(e, { ask: t = !1 } = {}) {
		let n = C(e);
		if (t || w(e, n)) {
			f({
				variants: e,
				initialVariantId: e.length === 1 ? e[0].variant_id : null
			});
			return;
		}
		a(e[0], 1, {
			modifiers: S(n),
			note: ""
		});
	}
	async function v(e) {
		let t = await r.lookupBarcode(e);
		if (t.length === 0) {
			o("Штрихкод не знайдено");
			return;
		}
		g(t), r.setQuery("");
	}
	return /* @__PURE__ */ b("section", {
		className: "relative flex flex-col min-h-0 bg-white",
		"data-testid": "cafe-catalog",
		children: [
			/* @__PURE__ */ y(H, {
				active: e && !c && !d,
				onScan: (e) => void v(e)
			}),
			/* @__PURE__ */ b("div", {
				className: "px-4 pt-3 pb-1 space-y-2 shrink-0",
				children: [/* @__PURE__ */ b("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ b("div", {
						className: "relative flex-1",
						children: [/* @__PURE__ */ y(n, {
							size: 20,
							className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
						}), /* @__PURE__ */ y("input", {
							className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
							placeholder: "Пошук або скан штрихкоду",
							value: r.query,
							onChange: (e) => r.setQuery(e.target.value)
						})]
					}), /* @__PURE__ */ y("button", {
						type: "button",
						onClick: () => l(!0),
						className: "min-h-12 min-w-12 grid place-items-center rounded-xl text-sq-blue bg-sq-empty hover:bg-sq-selected transition-colors",
						"aria-label": "Камера",
						children: /* @__PURE__ */ y(u, { size: 20 })
					})]
				}), !r.query.trim() && /* @__PURE__ */ y(V, {
					tags: r.catalogBarTags,
					activeId: r.catalogBarActiveId,
					showBack: r.showBack,
					backLabel: r.backLabel,
					onSelect: r.selectCatalogBarTag,
					onBack: r.goBackOne
				})]
			}),
			/* @__PURE__ */ b("div", {
				ref: s,
				className: "flex-1 overflow-auto px-4 pt-2 pb-4 bg-white select-none",
				children: [
					r.loading && /* @__PURE__ */ y("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ b("div", {
						className: "grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3",
						children: [r.folderTiles.map((e) => /* @__PURE__ */ y(B, {
							name: e.name,
							color: e.color,
							onClick: () => r.enterTag(e)
						}, e.id)), r.grouped.map(([e, t]) => {
							let n = t[0], r = C(t), i = Math.min(...t.map((e) => e.price_cents)), a = t.reduce((e, t) => e + t.quantity, 0), o = Q(n), s = t.length > 1 ? t.map((e) => e.label).filter(Boolean).join(" / ") : n.label;
							return /* @__PURE__ */ y(P, {
								name: n.product_name,
								subtitle: s,
								priceCents: i,
								imageUrl: n.image_url,
								stock: a,
								disabled: a <= 0 || o,
								badge: o ? "стоп" : void 0,
								onClick: () => g(t),
								onMore: r.length > 0 ? () => g(t, { ask: !0 }) : void 0
							}, e);
						})]
					}),
					!r.loading && r.folderTiles.length === 0 && r.grouped.length === 0 && /* @__PURE__ */ y("div", {
						className: "rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4",
						children: "Порожньо"
					})
				]
			}),
			c && /* @__PURE__ */ y(p, {
				fallback: null,
				children: /* @__PURE__ */ y(ie, {
					onScan: (e) => {
						l(!1), v(e);
					},
					onClose: () => l(!1)
				})
			}),
			d && /* @__PURE__ */ y(K, {
				productName: d.variants[0]?.product_name ?? "",
				variants: d.variants,
				variantLabel: m,
				initialVariantId: d.initialVariantId,
				initialModifierIds: S(C(d.variants)),
				notePlaceholder: $(d.variants[0], r.catalogBarTags) === "bar" ? "Коментар для бару" : "Коментар для кухні",
				onAdd: ({ item: e, modifiers: t, note: n, quantity: r }) => {
					a(e, r, {
						modifiers: t,
						note: n
					}), f(null);
				},
				onClose: () => f(null)
			})
		]
	});
}
//#endregion
export { ae as default };
