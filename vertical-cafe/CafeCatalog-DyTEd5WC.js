import { C as e, _ as t, b as n, c as r, f as i, g as a, h as o, m as s, n as c, p as l, s as u, t as d, u as f } from "./hostPlatform-C_l59Ii7.js";
import { Suspense as p, lazy as m, useEffect as h, useRef as g, useState as _ } from "react";
import { Fragment as v, jsx as y, jsxs as b } from "react/jsx-runtime";
import { assetUrl as x, defaultModifierIds as S, groupsOf as C, needsModifierSheet as w, useCartStore as T, usePosShell as E, useSalesCatalog as D, useVertical as O } from "@pos/platform";
//#region src/hooks/useDragScroll.ts
var k = 6;
function A() {
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
			!n.moved && Math.hypot(r, i) > k && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var j = "\xA0";
function M(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, j);
}
function N(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${M(n)},${r} ₴`;
}
function P(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${M(String(Math.abs(e) / 100))} ₴` : N(e);
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function F({ name: e, subtitle: t, priceCents: n, compareAtCents: r, imageUrl: i, stock: a, onClick: s, disabled: c, count: l, onMore: u, badge: d, testId: f }) {
	let [p, m] = _(!1), h = p ? null : x(i), g = c || !!d || a != null && a <= 0, v = /* @__PURE__ */ b("button", {
		type: "button",
		disabled: c,
		onClick: s,
		"data-testid": f,
		className: `w-full ${u ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${l ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ b("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				h ? /* @__PURE__ */ y("img", {
					src: h,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${g ? "opacity-45" : ""}`,
					onError: () => m(!0)
				}) : /* @__PURE__ */ y("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				l != null && l > 0 && /* @__PURE__ */ y("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: l
				}),
				d ? /* @__PURE__ */ y("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: d
				}) : a != null && a <= 0 && /* @__PURE__ */ y("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ b("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ y("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${g ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ b("p", {
				className: "text-[14px] text-sq-secondary tabular-nums flex items-baseline gap-1.5",
				children: [r != null && r > n && /* @__PURE__ */ y("s", {
					className: "text-[12px] text-sq-muted",
					"data-testid": "tile-old-price",
					children: N(r)
				}), /* @__PURE__ */ y("span", { children: N(n) })]
			})]
		})]
	});
	return u ? /* @__PURE__ */ b("div", {
		className: "relative",
		children: [v, !c && /* @__PURE__ */ y("button", {
			type: "button",
			onClick: u,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": f ? `${f}-more` : "tile-more",
			children: /* @__PURE__ */ y("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ y(o, { size: 20 })
			})
		})]
	}) : v;
}
//#endregion
//#region src/lib/tagColors.ts
var I = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], L = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, R = "slate";
function z(e) {
	return !!e && I.includes(e);
}
function B(e) {
	return z(e) ? L[e] : L[R];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function V({ name: e, color: t, onClick: n }) {
	let r = B(t);
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
function H({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = A(), s = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
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
function U({ active: e, onScan: t }) {
	let n = E(), r = g(null);
	return h(() => {
		e ? r.current?.focus() : r.current?.blur();
	}, [e]), n === "tablet" ? null : /* @__PURE__ */ y("input", {
		ref: r,
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
function W(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function G(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function K(e, t) {
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
	for (let e of G(t)) {
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
function q({ productName: n, variants: o, variantLabel: c = "Варіант", initialVariantId: l, initialModifierIds: u, initialNote: d, submitLabel: f = "Додати в чек", withQuantity: p = !0, notePlaceholder: m = "Коментар для кухні", onAdd: g, onClose: S }) {
	let [C, w] = _(() => l ?? (o.length === 1 ? o[0].variant_id : null)), [T, E] = _(() => u ?? []), [D, O] = _(d ?? ""), [k, j] = _(1), M = A(), F = o.find((e) => e.variant_id === C) ?? null, I = F?.modifier_groups?.length ? F.modifier_groups : te(o), L = K(I, T), R = F ? F.price_cents + L.deltaCents : null, z = F == null ? `Оберіть «${c}»` : L.error ?? (R != null && R < 0 ? "Ціна не може бути відʼємною" : null), B = z == null && F != null;
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
	function U() {
		B && F && g({
			item: F,
			modifiers: L.snapshot.map((e) => e.id),
			note: W(D),
			quantity: p ? k : 1
		});
	}
	let G = F ? ee(F.label, L.error ? [] : L.names) : "", q = x((F ?? o[0])?.image_url ?? null), Q = o.length ? Math.min(...o.map((e) => e.price_cents)) : null, $ = [...o].sort((e, t) => e.price_cents - t.price_cents);
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
						q ? /* @__PURE__ */ y("img", {
							src: q,
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
								children: o.length > 1 ? `від ${N(Q)}` : N(Q)
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
					ref: M,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						o.length > 1 && /* @__PURE__ */ b("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ y(X, {
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
										className: Z(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ y(r, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ y("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : P(e.price_cents)
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
								children: [/* @__PURE__ */ y(X, {
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
											className: Z(i, a),
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
									e.key === "Enter" && (e.preventDefault(), U());
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
									disabled: k <= 1,
									onClick: () => j((e) => Math.max(1, e - 1)),
									className: Y,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ y(s, { size: 20 })
								}),
								/* @__PURE__ */ y("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: k
								}),
								/* @__PURE__ */ y("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: k >= J,
									onClick: () => j((e) => Math.min(J, e + 1)),
									className: Y,
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
							children: G
						}),
						/* @__PURE__ */ y("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !B,
							onClick: U,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ b("span", { children: [f, R != null && /* @__PURE__ */ b(v, { children: [" · ", /* @__PURE__ */ y("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: N(R * k)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var J = 99, Y = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function X({ name: e, hint: t, required: n }) {
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
function Z(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function re(e) {
	return e > 0 ? `+${P(e)}` : e < 0 ? `−${P(-e)}` : "";
}
//#endregion
//#region src/modules/vertical-cafe/lib/stopList.ts
function Q(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function $(e, t = Q()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/vertical-cafe/lib/station.ts
function ie(e, t) {
	let n = new Set(e?.tag_ids ?? []);
	if (n.size === 0) return null;
	let r = null, i = (e) => {
		for (let t of e) n.has(t.id) && t.station && (t.station === "kitchen" ? r = "kitchen" : r ?? (r = t.station)), t.children?.length && i(t.children);
	};
	return i(t), r;
}
//#endregion
//#region src/modules/vertical-cafe/CafeCatalog.tsx
var ae = m(() => import("./BarcodeScanner-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function oe({ active: e, stockEpoch: t }) {
	let n = c();
	if (n.length > 0) throw new d(n);
	return /* @__PURE__ */ y(se, {
		active: e,
		stockEpoch: t
	});
}
function se({ active: e, stockEpoch: t }) {
	let r = D(), i = O(), a = T((e) => e.addItem), o = T((e) => e.setBanner), s = A(), [c, l] = _(!1), [d, f] = _(null), m = i.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
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
			/* @__PURE__ */ y(U, {
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
				}), !r.query.trim() && /* @__PURE__ */ y(H, {
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
						children: [r.folderTiles.map((e) => /* @__PURE__ */ y(V, {
							name: e.name,
							color: e.color,
							onClick: () => r.enterTag(e)
						}, e.id)), r.grouped.map(([e, t]) => {
							let n = t[0], r = C(t), i = Math.min(...t.map((e) => e.price_cents)), a = t.reduce((e, t) => e + t.quantity, 0), o = $(n), s = t.length > 1 ? t.map((e) => e.label).filter(Boolean).join(" / ") : n.label;
							return /* @__PURE__ */ y(F, {
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
				children: /* @__PURE__ */ y(ae, {
					onScan: (e) => {
						l(!1), v(e);
					},
					onClose: () => l(!1)
				})
			}),
			d && /* @__PURE__ */ y(q, {
				productName: d.variants[0]?.product_name ?? "",
				variants: d.variants,
				variantLabel: m,
				initialVariantId: d.initialVariantId,
				initialModifierIds: S(C(d.variants)),
				notePlaceholder: ie(d.variants[0], r.catalogBarTags) === "bar" ? "Коментар для бару" : "Коментар для кухні",
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
export { oe as default };
