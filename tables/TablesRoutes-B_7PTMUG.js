import { $ as e, A as t, B as n, D as r, F as i, G as a, H as o, I as s, J as c, K as l, L as u, M as d, N as f, O as p, P as m, Q as h, R as g, S as _, U as v, V as y, W as b, X as x, Y as S, Z as C, a as w, b as T, c as E, d as D, f as O, g as k, h as A, i as j, j as M, k as N, n as ee, nt as P, o as F, p as I, q as L, r as te, s as ne, t as R, tt as z, v as B, w as re, x as ie, y as ae, z as oe } from "./useHallMap-BvQLb8Lp.js";
import { useCallback as V, useEffect as H, useMemo as U, useRef as W, useState as G } from "react";
import { Fragment as K, jsx as q, jsxs as J } from "react/jsx-runtime";
import { DEFAULT_RECEIPT_PAPER_WIDTH as se, assetUrl as ce, cartLineUid as Y, defaultModifierIds as X, formatUah as Z, getMeta as le, groupsOf as ue, needsModifierSheet as de, printPrecheck as fe, resolveLineModifiers as pe, useAuthStore as me, useOfflineStatus as he, usePosShell as ge, useSalesCatalog as _e, useVertical as ve } from "@pos/platform";
import { Route as ye, Routes as be, useLocation as xe, useNavigate as Se, useParams as Ce } from "react-router-dom";
//#region src/hooks/useDragScroll.ts
var Q = 6;
function we() {
	let e = W(null);
	return H(() => {
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
			!n.moved && Math.hypot(r, i) > Q && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var Te = "\xA0";
function Ee(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, Te);
}
function $(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${Ee(n)},${r} ₴`;
}
function De(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${Ee(String(Math.abs(e) / 100))} ₴` : $(e);
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function Oe({ name: e, subtitle: t, priceCents: n, compareAtCents: r, imageUrl: i, stock: a, onClick: o, disabled: s, count: c, onMore: l, badge: u, testId: d }) {
	let [f, p] = G(!1), m = f ? null : ce(i), h = s || !!u || a != null && a <= 0, g = /* @__PURE__ */ J("button", {
		type: "button",
		disabled: s,
		onClick: o,
		"data-testid": d,
		className: `w-full ${l ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ J("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				m ? /* @__PURE__ */ q("img", {
					src: m,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${h ? "opacity-45" : ""}`,
					onError: () => p(!0)
				}) : /* @__PURE__ */ q("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				c != null && c > 0 && /* @__PURE__ */ q("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: c
				}),
				u ? /* @__PURE__ */ q("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: u
				}) : a != null && a <= 0 && /* @__PURE__ */ q("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ J("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ q("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${h ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ J("p", {
				className: "text-[14px] text-sq-secondary tabular-nums flex items-baseline gap-1.5",
				children: [r != null && r > n && /* @__PURE__ */ q("s", {
					className: "text-[12px] text-sq-muted",
					"data-testid": "tile-old-price",
					children: $(r)
				}), /* @__PURE__ */ q("span", { children: $(n) })]
			})]
		})]
	});
	return l ? /* @__PURE__ */ J("div", {
		className: "relative",
		children: [g, !s && /* @__PURE__ */ q("button", {
			type: "button",
			onClick: l,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": d ? `${d}-more` : "tile-more",
			children: /* @__PURE__ */ q("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ q(L, { size: 20 })
			})
		})]
	}) : g;
}
//#endregion
//#region src/lib/tagColors.ts
var ke = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Ae = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, je = "slate";
function Me(e) {
	return !!e && ke.includes(e);
}
function Ne(e) {
	return Me(e) ? Ae[e] : Ae[je];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function Pe({ name: e, color: t, onClick: n }) {
	let r = Ne(t);
	return /* @__PURE__ */ J("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ q("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ q(a, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ J("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ q("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function Fe({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let s = we(), c = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ J("div", {
		ref: s,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ J("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ q(o, { size: 16 }), r]
			}),
			/* @__PURE__ */ q("button", {
				type: "button",
				onClick: () => i(null),
				className: c(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ q("button", {
				type: "button",
				onClick: () => i(e),
				className: c(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
//#endregion
//#region src/components/cashier/ScanWedge.tsx
function Ie({ active: e, onScan: t }) {
	let n = ge(), r = W(null);
	return H(() => {
		e ? r.current?.focus() : r.current?.blur();
	}, [e]), n === "tablet" ? null : /* @__PURE__ */ q("input", {
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
function Le(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function Re(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function ze(e, t) {
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
	for (let e of Re(t)) {
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
function Be(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function Ve(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function He({ productName: e, variants: t, variantLabel: r = "Варіант", initialVariantId: i, initialModifierIds: a, initialNote: o, submitLabel: s = "Додати в чек", withQuantity: u = !0, notePlaceholder: d = "Коментар для кухні", onAdd: f, onClose: p }) {
	let [m, h] = G(() => i ?? (t.length === 1 ? t[0].variant_id : null)), [g, _] = G(() => a ?? []), [y, b] = G(o ?? ""), [x, C] = G(1), w = we(), T = t.find((e) => e.variant_id === m) ?? null, E = T?.modifier_groups?.length ? T.modifier_groups : Ve(t), D = ze(E, g), O = T ? T.price_cents + D.deltaCents : null, k = T == null ? `Оберіть «${r}»` : D.error ?? (O != null && O < 0 ? "Ціна не може бути відʼємною" : null), A = k == null && T != null;
	H(() => {
		let e = (e) => {
			e.key === "Escape" && p();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [p]);
	function j(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function M(e, t) {
		_((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : j(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function N() {
		A && T && f({
			item: T,
			modifiers: D.snapshot.map((e) => e.id),
			note: Le(y),
			quantity: u ? x : 1
		});
	}
	let ee = T ? Be(T.label, D.error ? [] : D.names) : "", F = ce((T ?? t[0])?.image_url ?? null), I = t.length ? Math.min(...t.map((e) => e.price_cents)) : null, L = [...t].sort((e, t) => e.price_cents - t.price_cents);
	return /* @__PURE__ */ J("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ q("div", {
			"aria-hidden": !0,
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: p,
			"data-testid": "modifier-scrim"
		}), /* @__PURE__ */ J("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]",
			children: [
				/* @__PURE__ */ q("div", {
					"aria-hidden": !0,
					className: "w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0"
				}),
				/* @__PURE__ */ J("div", {
					className: "px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0",
					children: [
						F ? /* @__PURE__ */ q("img", {
							src: F,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ q("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ q(v, { size: 24 })
						}),
						/* @__PURE__ */ J("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ q("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: e
							}), I != null && /* @__PURE__ */ q("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: t.length > 1 ? `від ${$(I)}` : $(I)
							})]
						}),
						/* @__PURE__ */ q("button", {
							type: "button",
							onClick: p,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ q(P, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ J("div", {
					ref: w,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						t.length > 1 && /* @__PURE__ */ J("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ q(Ge, {
								name: r,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ q("div", {
								className: "flex flex-wrap gap-2",
								children: L.map((e) => {
									let t = e.variant_id === m, r = e.quantity <= 0;
									return /* @__PURE__ */ J("button", {
										type: "button",
										disabled: r,
										"aria-pressed": t,
										onClick: () => h(e.variant_id),
										className: qe(t, r),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ q(n, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ q("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: r ? "немає" : De(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						E.map((e) => {
							let t = j(e, g), r = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ J("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ q(Ge, {
									name: e.name,
									hint: Ke(e, r),
									required: e.min_select >= 1
								}), /* @__PURE__ */ q("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let i = g.includes(t.id), a = !i && r;
										return /* @__PURE__ */ J("button", {
											type: "button",
											"aria-pressed": i,
											"aria-disabled": a || void 0,
											onClick: () => M(e, t),
											className: qe(i, a),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												i && /* @__PURE__ */ q(n, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ q("span", {
													className: i ? "font-medium" : "font-medium text-sq-secondary",
													children: Je(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ J("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ q(c, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ q("input", {
								className: "flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted",
								value: y,
								maxLength: 120,
								placeholder: d,
								"aria-label": d,
								enterKeyHint: "done",
								onChange: (e) => b(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && (e.preventDefault(), N());
								},
								"data-testid": "modifier-note"
							})]
						})
					]
				}),
				/* @__PURE__ */ J("div", {
					className: "shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]",
					children: [
						u && /* @__PURE__ */ J("div", {
							className: "flex items-center gap-1.5",
							"data-testid": "modifier-qty",
							children: [
								/* @__PURE__ */ q("button", {
									type: "button",
									"aria-label": "Менше",
									disabled: x <= 1,
									onClick: () => C((e) => Math.max(1, e - 1)),
									className: We,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ q(l, { size: 20 })
								}),
								/* @__PURE__ */ q("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: x
								}),
								/* @__PURE__ */ q("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: x >= Ue,
									onClick: () => C((e) => Math.min(Ue, e + 1)),
									className: We,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ q(S, { size: 20 })
								})
							]
						}),
						k ? /* @__PURE__ */ q("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: k
						}) : /* @__PURE__ */ q("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: ee
						}),
						/* @__PURE__ */ q("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !A,
							onClick: N,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ J("span", { children: [s, O != null && /* @__PURE__ */ J(K, { children: [" · ", /* @__PURE__ */ q("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: $(O * x)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var Ue = 99, We = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function Ge({ name: e, hint: t, required: n }) {
	return /* @__PURE__ */ J("div", {
		className: "flex items-baseline gap-2 mb-2.5",
		children: [/* @__PURE__ */ q("span", {
			className: "text-base font-bold text-sq-heading",
			children: e
		}), t && /* @__PURE__ */ q("span", {
			className: `text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
			children: t
		})]
	});
}
function Ke(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function qe(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function Je(e) {
	return e > 0 ? `+${De(e)}` : e < 0 ? `−${De(-e)}` : "";
}
//#endregion
//#region src/modules/tables/lib/bill.ts
var Ye = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function Xe(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function Ze(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Qe(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
//#endregion
//#region src/modules/tables/components/BillBar.tsx
var $e = 2;
function et({ draft: e, rounds: n, summary: r, owedCents: i, hasPending: a, busy: o, online: s, onOpen: l, onFire: u }) {
	let d = r.lines > 0, f = [...n].reverse().find((e) => e.cancelled_at == null && e.prep_status !== "served");
	return /* @__PURE__ */ J("div", {
		className: "shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ J("button", {
			type: "button",
			className: "block w-full text-left",
			"data-testid": "bill-bar-open",
			onClick: l,
			children: [
				/* @__PURE__ */ q("span", {
					"aria-hidden": !0,
					className: "block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5"
				}),
				/* @__PURE__ */ J("span", {
					className: "flex items-center gap-2.5 pb-1",
					children: [
						/* @__PURE__ */ q(c, {
							size: 20,
							className: "text-sq-blue shrink-0"
						}),
						/* @__PURE__ */ J("span", {
							className: "flex-1 min-w-0 truncate text-base font-bold text-sq-heading",
							children: [d ? `Чернетка · ${t(r.lines)}` : "Рахунок", a ? " · зберігаємо…" : ""]
						}),
						f && /* @__PURE__ */ J("span", {
							className: "shrink-0 text-sm text-sq-muted",
							children: [
								"Раунд ",
								f.seq,
								" ",
								Ye[f.prep_status]
							]
						})
					]
				}),
				e.slice(0, $e).map((e) => /* @__PURE__ */ J("span", {
					className: "flex items-start gap-2.5 py-1",
					children: [
						/* @__PURE__ */ J("span", {
							className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
							children: [e.quantity, "×"]
						}),
						/* @__PURE__ */ J("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ q("span", {
								className: "block truncate text-[15px] text-sq-text",
								children: e.product_name
							}), e.modifierNames.length > 0 && /* @__PURE__ */ q("span", {
								className: "block truncate text-[13px] text-sq-muted",
								children: e.modifierNames.join(" · ")
							})]
						}),
						/* @__PURE__ */ q("span", {
							className: "shrink-0 text-[15px] text-sq-text tabular-nums",
							children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
						})
					]
				}, e.key)),
				e.length > $e && /* @__PURE__ */ J("span", {
					className: "block py-0.5 text-[13px] text-sq-blue font-semibold",
					children: [
						"ще ",
						e.length - $e,
						"…"
					]
				})
			]
		}), /* @__PURE__ */ J("div", {
			className: "flex items-center gap-3 pt-2.5 mt-1 shadow-[0_-1px_0_#E6E8EC]",
			children: [/* @__PURE__ */ J("div", {
				className: "flex-1 min-w-0",
				children: [/* @__PURE__ */ q("p", {
					className: "text-[13px] text-sq-secondary",
					children: "До сплати"
				}), /* @__PURE__ */ q("p", {
					className: "text-2xl font-bold text-sq-heading tabular-nums",
					children: Z(i)
				})]
			}), /* @__PURE__ */ J("button", {
				type: "button",
				className: "pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2",
				"data-testid": "bill-bar-fire",
				disabled: o || !s || a || !d,
				onClick: u,
				children: [
					/* @__PURE__ */ q(y, { size: 24 }),
					"На кухню",
					d ? ` · ${r.lines}` : ""
				]
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/components/BillPane.tsx
function tt({ bill: e, draft: t, summary: n, owedCents: r, busy: i, online: a, hasPending: o, canPay: s, canPrecheck: u, printStatus: d, onLess: f, onMore: p, onEdit: m, onCancelRound: h, onFire: g, onPay: _, onPrecheck: v }) {
	let b = (e) => /* @__PURE__ */ q(at, {
		testId: `bill-line-${e.id}`,
		quantity: e.quantity,
		title: e.product_name,
		sub: [e.variant_label, e.note].filter(Boolean).join(" · "),
		price: Z(Ze(e))
	}, e.id);
	return /* @__PURE__ */ J("div", {
		className: "flex h-full min-h-0 flex-col",
		"data-testid": "bill-pane",
		children: [/* @__PURE__ */ J("div", {
			className: "flex-1 overflow-auto px-3.5 pt-3.5 pb-2 space-y-2.5",
			children: [e.rounds.map((e) => {
				let t = e.cancelled_at != null;
				return /* @__PURE__ */ J("section", {
					className: `rounded-2xl bg-white shadow-card px-4 py-3 ${t ? "opacity-60" : ""}`,
					"data-testid": `bill-round-${e.id}`,
					"data-cancelled": t ? "yes" : "no",
					children: [
						/* @__PURE__ */ J("div", {
							className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ q(y, { size: 24 }),
								/* @__PURE__ */ J("p", {
									className: "flex-1 text-[15px] font-bold text-sq-heading",
									children: [
										"Раунд ",
										e.seq,
										!t && /* @__PURE__ */ q("span", {
											className: "ml-2 font-normal text-[13px] text-sq-muted tabular-nums",
											children: Z(e.total_cents)
										}),
										e.fired_by == null && e.fired_by_name && /* @__PURE__ */ q("span", {
											className: "ml-2 rounded-md bg-[#F4891F]/15 px-1.5 py-0.5 text-[12px] font-semibold text-[#B35F0C]",
											"data-testid": `bill-round-guest-${e.id}`,
											children: e.fired_by_name
										})
									]
								}),
								/* @__PURE__ */ q("span", {
									className: `text-[13px] font-semibold ${t ? "text-sq-muted" : rt[e.prep_status]}`,
									children: t ? "скасовано" : e.prep_status === "new" ? `${Ye.new} · ${it(e.fired_at)} хв` : Ye[e.prep_status]
								})
							]
						}),
						/* @__PURE__ */ q("div", {
							className: "pt-1",
							children: e.items.map(b)
						}),
						Xe(e) && /* @__PURE__ */ q("button", {
							type: "button",
							className: "mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: i || !a || o,
							onClick: () => h(e.id),
							children: "Скасувати раунд"
						})
					]
				}, e.id);
			}), /* @__PURE__ */ J("section", {
				className: `rounded-2xl bg-white px-4 py-3 ${t.length > 0 ? "ring-2 ring-sq-blue" : "shadow-card"}`,
				"data-testid": "bill-draft",
				children: [/* @__PURE__ */ J("div", {
					className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
					children: [
						/* @__PURE__ */ q(c, {
							size: 20,
							className: "text-sq-blue"
						}),
						/* @__PURE__ */ q("p", {
							className: "flex-1 text-[15px] font-bold text-sq-heading",
							children: "Чернетка"
						}),
						/* @__PURE__ */ q("span", {
							className: "text-[13px] text-sq-muted",
							children: "ще не на кухні"
						})
					]
				}), t.length === 0 ? /* @__PURE__ */ q("p", {
					className: "py-2 text-sm text-sq-muted",
					children: "Нічого не набрано — тапніть страву в меню"
				}) : /* @__PURE__ */ q("div", {
					className: "pt-1",
					children: t.map((e) => {
						let t = [
							e.variant_label,
							...e.modifierNames,
							e.note
						].filter(Boolean).join(" · "), n = e.id != null && !e.pending;
						return /* @__PURE__ */ J("div", {
							className: `flex items-start gap-2.5 py-1.5 ${e.pending ? "opacity-60" : ""}`,
							"data-testid": e.id == null ? "bill-line-pending" : `bill-line-${e.id}`,
							"data-pending": e.pending ? "yes" : "no",
							children: [
								/* @__PURE__ */ J("span", {
									className: "w-7 pt-0.5 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}),
								/* @__PURE__ */ J("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ J("button", {
										type: "button",
										className: "block w-full text-left",
										"data-testid": e.id == null ? void 0 : `bill-line-edit-${e.id}`,
										disabled: i || !a || !n,
										onClick: () => m(e),
										children: [/* @__PURE__ */ q("span", {
											className: "block text-[15px] text-sq-text truncate",
											children: e.product_name
										}), t && /* @__PURE__ */ q("span", {
											className: "block text-[13px] text-sq-muted truncate",
											children: t
										})]
									}), e.id != null && /* @__PURE__ */ J("div", {
										className: "mt-1.5 flex items-center gap-1.5",
										children: [/* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Менше",
											className: nt,
											"data-testid": `bill-less-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => f(e),
											children: /* @__PURE__ */ q(l, { size: 16 })
										}), /* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Більше",
											className: nt,
											"data-testid": `bill-more-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => p(e),
											children: /* @__PURE__ */ q(S, { size: 16 })
										})]
									})]
								}),
								/* @__PURE__ */ q("span", {
									className: "shrink-0 pt-0.5 text-[15px] text-sq-text tabular-nums",
									children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
								})
							]
						}, e.key);
					})
				})]
			})]
		}), /* @__PURE__ */ J("footer", {
			className: "shrink-0 px-4 pt-3.5 pb-4 space-y-2.5 shadow-[0_-1px_0_#E6E8EC]",
			children: [
				t.length > 0 && /* @__PURE__ */ J("div", {
					className: "flex items-baseline justify-between text-sm text-sq-secondary",
					children: [/* @__PURE__ */ q("span", { children: "Чернетка, за сьогоднішніми цінами" }), /* @__PURE__ */ J("span", {
						className: "tabular-nums",
						"data-testid": "bill-draft-total",
						children: [n.exact ? "" : "≈ ", Z(n.cents)]
					})]
				}),
				/* @__PURE__ */ J("div", {
					className: "flex items-baseline justify-between",
					children: [/* @__PURE__ */ q("span", {
						className: "text-lg font-bold text-sq-heading",
						children: "До сплати"
					}), /* @__PURE__ */ q("span", {
						className: "text-[26px] font-bold text-sq-heading tabular-nums",
						"data-testid": "bill-owed",
						children: Z(r)
					})]
				}),
				/* @__PURE__ */ J("div", {
					className: "flex gap-2.5",
					children: [/* @__PURE__ */ J("button", {
						type: "button",
						className: "flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-40",
						"data-testid": "bill-fire",
						disabled: i || !a || o || t.length === 0,
						onClick: g,
						children: [
							/* @__PURE__ */ q(y, { size: 24 }),
							"На кухню",
							n.lines > 0 ? ` · ${n.lines}` : ""
						]
					}), /* @__PURE__ */ q("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[52px] rounded-xl text-[17px]",
						"data-testid": "bill-pay",
						disabled: i || !a || o || !s || t.length > 0,
						onClick: _,
						children: "Оплатити"
					})]
				}),
				/* @__PURE__ */ J("button", {
					type: "button",
					className: "w-full min-h-9 text-[15px] font-semibold text-sq-blue inline-flex items-center justify-center gap-1.5 disabled:opacity-40",
					"data-testid": "bill-precheck",
					disabled: i || !a || o || !u,
					onClick: v,
					children: [/* @__PURE__ */ q(x, { size: 20 }), e.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"]
				}),
				d && /* @__PURE__ */ q("p", {
					className: "text-xs text-sq-muted text-center",
					"data-testid": "bill-print-status",
					children: d
				})
			]
		})]
	});
}
var nt = "w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40", rt = {
	new: "text-[#D9730D]",
	ready: "text-sq-success",
	served: "text-sq-muted"
};
function it(e) {
	return Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 6e4));
}
function at({ testId: e, quantity: t, title: n, sub: r, price: i }) {
	return /* @__PURE__ */ J("div", {
		className: "flex items-start gap-2.5 py-1.5",
		"data-testid": e,
		children: [
			/* @__PURE__ */ J("span", {
				className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
				children: [t, "×"]
			}),
			/* @__PURE__ */ J("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ q("p", {
					className: "text-[15px] text-sq-text truncate",
					children: n
				}), r && /* @__PURE__ */ q("p", {
					className: "text-[13px] text-sq-muted truncate",
					children: r
				})]
			}),
			/* @__PURE__ */ q("span", {
				className: "shrink-0 text-[15px] text-sq-text tabular-nums",
				children: i
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/BillSheet.tsx
function ot({ title: e, onClose: t, children: n }) {
	return /* @__PURE__ */ J("div", {
		className: "fixed inset-0 z-40",
		"data-testid": "bill-sheet",
		children: [/* @__PURE__ */ q("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			"aria-label": "Закрити",
			onClick: t
		}), /* @__PURE__ */ J("div", {
			className: "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-sq-sidebar shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up overflow-hidden",
			children: [/* @__PURE__ */ J("div", {
				className: "flex items-center justify-between bg-white px-5 pt-2 pb-2.5 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ q("p", {
					className: "font-bold text-[17px] text-sq-heading",
					children: e
				}), /* @__PURE__ */ q("button", {
					type: "button",
					onClick: t,
					className: "grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty",
					"aria-label": "Закрити",
					"data-testid": "bill-sheet-close",
					children: /* @__PURE__ */ q(P, { size: 20 })
				})]
			}), /* @__PURE__ */ q("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/lib/guestOrders.ts
function st(e, t = Date.now()) {
	let n = Math.floor((t - new Date(e).getTime()) / 6e4);
	return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function ct(e, t = Date.now()) {
	let n = st(e, t);
	return n < 1 ? "щойно" : `${n} хв тому`;
}
function lt(e, t, n, r) {
	let i = e % 100, a = e % 10;
	return i >= 11 && i <= 14 ? `${e} ${r}` : a === 1 ? `${e} ${t}` : a >= 2 && a <= 4 ? `${e} ${n}` : `${e} ${r}`;
}
function ut(e) {
	return lt(e, "запит", "запити", "запитів");
}
function dt(e, t = /* @__PURE__ */ new Set()) {
	return e.lines.filter((e) => e.problem != null || t.has(e.id)).map((e) => e.id);
}
function ft(e, t = /* @__PURE__ */ new Set()) {
	let n = dt(e, t).length;
	return n === 0 ? "Прийняти" : n >= e.lines.length ? null : n === 1 ? "Прийняти без цієї" : "Прийняти без них";
}
function pt(e) {
	let t = e?.response?.data, n = Number(t?.item_id);
	return Number.isInteger(n) && n > 0 ? n : null;
}
var mt = [
	"Цієї страви вже немає",
	"Кухня зараз не приймає — підійдіть до офіціанта",
	"Підійде офіціант і прийме замовлення"
];
function ht(e) {
	return e === "bill" ? "Просить рахунок" : "Кличе офіціанта";
}
var gt = {
	requests: 0,
	waiter: !1,
	bill: !1,
	sent: 0
};
function _t(e) {
	let t = /* @__PURE__ */ new Map(), n = (e) => {
		let n = t.get(e);
		return n || (n = { ...gt }, t.set(e, n)), n;
	};
	for (let t of e.orders) n(t.table_id).requests += 1;
	for (let t of e.sent) n(t.table_id).sent += 1;
	for (let t of e.calls) n(t.table_id)[t.kind] = !0;
	return t;
}
function vt(e) {
	return e ? e.requests + e.sent + +!!e.waiter + +!!e.bill : 0;
}
function yt(e) {
	return /* @__PURE__ */ new Set([
		...e.orders.map((e) => `order:${e.id}`),
		...e.sent.map((e) => `sent:${e.id}`),
		...e.calls.map((e) => `call:${e.id}`)
	]);
}
function bt(e) {
	return e.round_seq == null ? "Уже на кухні" : `Уже на кухні · замовлення ${e.round_seq}`;
}
function xt(e) {
	let t = [];
	return e.calls > 0 && t.push(lt(e.calls, "виклик", "виклики", "викликів")), e.sent > 0 && t.push(`${e.sent} на кухні без офіціанта`), e.requests > 0 && t.push(ut(e.requests)), t.join(" · ");
}
function St(e, t) {
	let n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = (e, i, a, o) => {
		if (e === t) return;
		n.set(e, i);
		let s = r.get(e);
		(!s || a > s.score) && r.set(e, {
			score: a,
			words: o
		});
	};
	for (let t of e.orders) i(t.table_id, t.table_name, 1, "запит");
	for (let t of e.sent) i(t.table_id, t.table_name, 2, "замовив сам");
	for (let t of e.calls) i(t.table_id, t.table_name, t.kind === "waiter" ? 4 : 3, t.kind === "waiter" ? "кличе офіціанта" : "просить рахунок");
	return [...r.entries()].sort((e, t) => t[1].score - e[1].score || e[0] - t[0]).map(([e, { words: t }]) => ({
		table_id: e,
		table_name: n.get(e) ?? "",
		words: t
	}));
}
//#endregion
//#region src/modules/tables/lib/usePolling.ts
var Ct = 1e4;
function wt(e, t, n = Ct) {
	let r = W(e);
	r.current = e, H(() => {
		if (!t || typeof document > "u") return;
		let e = () => document.visibilityState === "visible", i = setInterval(() => {
			e() && r.current();
		}, n), a = () => {
			e() && r.current();
		};
		return document.addEventListener("visibilitychange", a), () => {
			clearInterval(i), document.removeEventListener("visibilitychange", a);
		};
	}, [t, n]);
}
//#endregion
//#region src/modules/tables/components/GuestAlertsPanel.tsx
var Tt = {
	waiter: "ring-[#8A6CEF]",
	bill: "ring-[#1B9DF0]"
};
function Et({ calls: e, sent: t, showTable: n, busy: r, onAnswer: i, onSeen: a, onOpenBill: o }) {
	let [s, c] = G(null), [l, u] = G(() => Date.now());
	if (wt(() => u(Date.now()), e.length + t.length > 0, 15e3), e.length === 0 && t.length === 0) return null;
	async function d(e, t) {
		if (!s) {
			c(e);
			try {
				await t();
			} finally {
				c(null);
			}
		}
	}
	let f = (e, t) => `Стіл ${e}${t ? ` · ${t}` : ""}`;
	return /* @__PURE__ */ J("div", {
		className: "space-y-2.5",
		"data-testid": "guest-alerts-panel",
		children: [e.map((e) => {
			let t = `call:${e.id}`;
			return /* @__PURE__ */ q("section", {
				className: `rounded-2xl bg-white ring-2 ${Tt[e.kind]} px-4 py-3`,
				"data-testid": `guest-call-${e.id}`,
				"data-kind": e.kind,
				"data-table": e.table_id,
				children: /* @__PURE__ */ J("div", {
					className: "flex items-center gap-2.5",
					children: [
						e.kind === "bill" ? /* @__PURE__ */ q(C, { size: 26 }) : /* @__PURE__ */ q(z, { size: 26 }),
						/* @__PURE__ */ J("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ J("p", {
								className: "break-words text-[16px] font-bold leading-snug text-sq-heading",
								children: [n ? `Стіл ${e.table_name} · ` : "", ht(e.kind)]
							}), /* @__PURE__ */ q("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								children: [
									n ? e.hall_name : "",
									ct(e.created_at, l),
									e.kind === "bill" && !e.has_open_bill ? "рахунку ще немає" : ""
								].filter(Boolean).join(" · ")
							})]
						}),
						/* @__PURE__ */ q("button", {
							type: "button",
							className: "pos-btn-primary min-h-[48px] shrink-0 rounded-xl px-5 text-[16px]",
							"data-testid": `guest-call-answer-${e.id}`,
							disabled: r || s != null,
							onClick: () => void d(t, () => i(e)),
							children: "Іду"
						})
					]
				})
			}, t);
		}), t.map((e) => {
			let t = `sent:${e.id}`;
			return /* @__PURE__ */ J("section", {
				className: "rounded-2xl bg-white ring-2 ring-[#F4891F] px-4 py-3",
				"data-testid": `guest-sent-${e.id}`,
				"data-table": e.table_id,
				children: [
					/* @__PURE__ */ J("div", {
						className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
						children: [
							/* @__PURE__ */ q(y, { size: 24 }),
							/* @__PURE__ */ J("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ q("p", {
									className: "truncate text-[15px] font-bold text-sq-heading",
									children: n ? f(e.table_name, e.hall_name) : "Гість замовив сам"
								}), /* @__PURE__ */ q("p", {
									className: "text-[13px] font-semibold text-[#B35F0C]",
									children: bt(e)
								})]
							}),
							/* @__PURE__ */ q("span", {
								className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
								children: ct(e.created_at, l)
							})
						]
					}),
					/* @__PURE__ */ q("div", {
						className: "pt-1",
						children: e.lines.map((e, t) => {
							let n = [e.caption, e.note ? `«${e.note}»` : ""].filter(Boolean).join(" · ");
							return /* @__PURE__ */ J("div", {
								className: "flex items-start gap-2.5 py-1",
								children: [/* @__PURE__ */ J("span", {
									className: "w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}), /* @__PURE__ */ J("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ q("p", {
										className: "text-[15px] text-sq-text",
										children: e.name
									}), n && /* @__PURE__ */ q("p", {
										className: "text-[13px] text-sq-muted",
										children: n
									})]
								})]
							}, t);
						})
					}),
					/* @__PURE__ */ J("p", {
						className: "pt-1 text-[13px] text-sq-muted",
						children: [
							e.bill_opened_by_guest ? "Рахунок відкрив гість, стіл ще нічий — «Бачу» закріпить його за вами." : "Гість замовив з телефону, кухня вже готує.",
							" ",
							/* @__PURE__ */ q("span", {
								className: "font-semibold text-sq-text tabular-nums",
								children: Z(e.total_cents)
							})
						]
					}),
					/* @__PURE__ */ J("div", {
						className: "flex gap-2.5 pt-2.5",
						children: [o && /* @__PURE__ */ q("button", {
							type: "button",
							className: "min-h-[48px] flex-1 rounded-xl bg-white ring-1 ring-sq-divider px-3 text-[15px] font-semibold text-sq-blue disabled:opacity-40",
							"data-testid": `guest-sent-open-${e.id}`,
							disabled: r || s != null,
							onClick: () => o(e.bill_id),
							children: "Відкрити рахунок"
						}), /* @__PURE__ */ q("button", {
							type: "button",
							className: "pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]",
							"data-testid": `guest-sent-seen-${e.id}`,
							disabled: r || s != null,
							onClick: () => void d(t, () => a(e)),
							children: "Бачу"
						})]
					})
				]
			}, t);
		})]
	});
}
//#endregion
//#region src/modules/tables/components/GuestOrdersPanel.tsx
function Dt({ orders: e, showTable: t, busy: n, onAccept: r, onReject: i }) {
	let [a, o] = G({}), [s, c] = G(null), [l, u] = G(() => Date.now());
	wt(() => u(Date.now()), e.length > 0, 15e3);
	let d = W(/* @__PURE__ */ new Map());
	if (H(() => {
		s != null && d.current.get(s)?.scrollIntoView?.({ block: "nearest" });
	}, [s]), e.length === 0) return null;
	async function f(e) {
		let t = a[e.id] ?? [], n = await r(e, dt(e, new Set(t)));
		if (!n.ok && n.refusedLineId != null) {
			let t = n.refusedLineId;
			o((n) => ({
				...n,
				[e.id]: [...n[e.id] ?? [], t]
			}));
		}
	}
	async function p(e, t) {
		await i(e, t) && c(null);
	}
	return /* @__PURE__ */ q("div", {
		className: "space-y-2.5",
		"data-testid": "guest-orders-panel",
		children: e.map((e) => {
			let r = new Set(a[e.id] ?? []), i = ft(e, r);
			return /* @__PURE__ */ J("section", {
				ref: (t) => {
					t ? d.current.set(e.id, t) : d.current.delete(e.id);
				},
				className: "rounded-2xl bg-white ring-2 ring-sq-blue px-4 py-3",
				"data-testid": `guest-order-${e.id}`,
				"data-table": e.table_id,
				children: [
					/* @__PURE__ */ J("div", {
						className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
						children: [
							/* @__PURE__ */ q(oe, {
								size: 22,
								className: "text-sq-blue"
							}),
							/* @__PURE__ */ q("p", {
								className: "min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading",
								children: t ? `Стіл ${e.table_name}${e.hall_name ? ` · ${e.hall_name}` : ""}` : "Гість просить"
							}),
							/* @__PURE__ */ q("span", {
								className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
								children: ct(e.created_at, l)
							})
						]
					}),
					/* @__PURE__ */ q("div", {
						className: "pt-1",
						children: e.lines.map((e) => {
							let t = e.problem != null || r.has(e.id), n = [e.caption, e.note ? `«${e.note}»` : ""].filter(Boolean).join(" · ");
							return /* @__PURE__ */ J("div", {
								className: "flex items-start gap-2.5 py-1.5",
								"data-testid": `guest-line-${e.id}`,
								"data-blocked": t ? "yes" : "no",
								children: [/* @__PURE__ */ J("span", {
									className: "w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}), /* @__PURE__ */ J("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ q("p", {
											className: `text-[15px] ${t ? "text-sq-muted line-through" : "text-sq-text"}`,
											children: e.name
										}),
										n && /* @__PURE__ */ q("p", {
											className: "text-[13px] text-sq-muted",
											children: n
										}),
										t && /* @__PURE__ */ q("p", {
											className: "text-[13px] font-semibold text-sq-danger",
											children: e.problem ?? "не вдалося додати — див. повідомлення вище"
										})
									]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ J("p", {
						className: "pt-1 text-[13px] text-sq-muted",
						children: [e.has_open_bill ? "Додасться до рахунку столу" : "Відкриється рахунок столу", " — на кухню піде після вашого «Прийняти»"]
					}),
					s === e.id ? /* @__PURE__ */ J("div", {
						className: "pt-2.5 space-y-1.5",
						"data-testid": `guest-order-reasons-${e.id}`,
						children: [
							/* @__PURE__ */ q("p", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Що прочитає гість:"
							}),
							mt.map((t, r) => /* @__PURE__ */ q("button", {
								type: "button",
								className: Ot,
								"data-testid": `guest-order-reason-${e.id}-${r}`,
								disabled: n,
								onClick: () => void p(e, t),
								children: t
							}, t)),
							/* @__PURE__ */ J("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ q("button", {
									type: "button",
									className: `${Ot} flex-1`,
									"data-testid": `guest-order-reason-none-${e.id}`,
									disabled: n,
									onClick: () => void p(e, null),
									children: "Без причини"
								}), /* @__PURE__ */ q("button", {
									type: "button",
									className: `${Ot} flex-1 text-sq-blue`,
									onClick: () => c(null),
									children: "Назад"
								})]
							})
						]
					}) : /* @__PURE__ */ J("div", {
						className: "flex gap-2.5 pt-2.5",
						children: [/* @__PURE__ */ q("button", {
							type: "button",
							className: "min-h-[48px] w-14 shrink-0 rounded-xl bg-white ring-1 ring-sq-divider text-sq-danger grid place-items-center disabled:opacity-40",
							"aria-label": "Відхилити",
							"data-testid": `guest-order-reject-${e.id}`,
							disabled: n,
							onClick: () => c(e.id),
							children: /* @__PURE__ */ q(P, { size: 22 })
						}), i == null ? /* @__PURE__ */ q("p", {
							className: "flex-1 self-center text-[13px] text-sq-muted",
							"data-testid": `guest-order-none-${e.id}`,
							children: "Жодну страву зараз не прийняти — відхиліть запит"
						}) : /* @__PURE__ */ q("button", {
							type: "button",
							className: "pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]",
							"data-testid": `guest-order-accept-${e.id}`,
							disabled: n,
							onClick: () => void f(e),
							children: i
						})]
					})
				]
			}, e.id);
		})
	});
}
var Ot = "w-full min-h-[44px] rounded-xl bg-white ring-1 ring-sq-divider px-3 text-left text-[15px] text-sq-text disabled:opacity-40";
//#endregion
//#region src/modules/tables/lib/menu.ts
function kt(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function At(e, t = kt()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/tables/components/MenuCatalog.tsx
function jt({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = _e(), c = ve(), l = we(), [u, d] = G(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	H(() => {
		i > 0 && s.refresh();
	}, [i]), H(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = ue(e);
		if (t || de(e, n)) {
			d({
				variants: e,
				initialVariantId: e.length === 1 ? e[0].variant_id : null
			});
			return;
		}
		a({
			item: e[0],
			modifiers: X(n),
			note: ""
		});
	}
	async function m(e) {
		let t = await s.lookupBarcode(e);
		t.length > 0 && p(t), s.setQuery("");
	}
	let g = !s.loading && s.folderTiles.length === 0 && s.grouped.length === 0;
	return /* @__PURE__ */ J("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ q(Ie, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ J("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ J("div", {
					className: "relative",
					children: [/* @__PURE__ */ q(h, {
						size: 20,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ q("input", {
						className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ q(Fe, {
					tags: s.catalogBarTags,
					activeId: s.catalogBarActiveId,
					showBack: s.showBack,
					backLabel: s.backLabel,
					onSelect: s.selectCatalogBarTag,
					onBack: s.goBackOne
				})]
			}),
			/* @__PURE__ */ J("div", {
				ref: l,
				className: "flex-1 select-none overflow-auto bg-white p-3",
				children: [
					s.loading && s.grouped.length === 0 && /* @__PURE__ */ q("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ J("div", {
						className: "grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5",
						children: [s.folderTiles.map((e) => /* @__PURE__ */ q("div", {
							"data-testid": `menu-folder-${e.id}`,
							children: /* @__PURE__ */ q(Pe, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = ue(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = At(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ q(Oe, {
								testId: `menu-tile-${n}`,
								name: i.product_name,
								subtitle: l,
								priceCents: o,
								imageUrl: i.image_url,
								stock: s,
								count: e.get(n) ?? 0,
								disabled: !t || s <= 0 || c,
								badge: c ? "стоп" : void 0,
								onClick: () => p(r),
								onMore: a.length > 0 ? () => p(r, { ask: !0 }) : void 0
							}, n);
						})]
					}),
					g && /* @__PURE__ */ q("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ q(He, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: X(ue(u.variants)),
				onAdd: ({ item: e, modifiers: t, note: n, quantity: r }) => {
					a({
						item: e,
						modifiers: t,
						note: n,
						quantity: r
					}), d(null);
				},
				onClose: () => d(null)
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/pay.ts
function Mt(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function Nt(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Pt(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + Nt(n) : e, 0);
}
function Ft(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function It(e) {
	return e.status !== "open" || Mt(e).length === 0;
}
//#endregion
//#region src/modules/tables/components/PaySheet.tsx
var Lt = [{
	id: "cash",
	label: "Готівка",
	glyph: g
}, {
	id: "card",
	label: "Картка",
	glyph: b
}];
function Rt({ bill: t, busy: r, onClose: i, onPay: a }) {
	let o = U(() => Mt(t), [t]), [s, c] = G(() => new Set(o.map(({ line: e }) => e.id))), [d, f] = G(1), [p, m] = G("card"), h = Pt(o, s), g = s.size === o.length, _ = Ft(h, d);
	function v(e) {
		c((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	function y() {
		h <= 0 || a([{
			...g ? {} : { line_ids: [...s] },
			payments: _.map((e) => ({
				method: p,
				amount_cents: e
			}))
		}]);
	}
	let b = o.filter(({ line: e }) => s.has(e.id)).length;
	return /* @__PURE__ */ J("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [/* @__PURE__ */ J("header", {
			className: "flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]",
			children: [/* @__PURE__ */ J("button", {
				type: "button",
				className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
				onClick: i,
				"data-testid": "pay-close",
				children: [
					/* @__PURE__ */ q(u, { size: 20 }),
					"Стіл ",
					t.table_name
				]
			}), /* @__PURE__ */ J("p", {
				className: "flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24",
				children: ["Оплата · стіл ", t.table_name]
			})]
		}), /* @__PURE__ */ J("div", {
			className: "flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-6 flex flex-col md:flex-row gap-4 md:gap-5",
			children: [/* @__PURE__ */ J("section", {
				className: "md:flex-1 min-w-0 rounded-card bg-white shadow-card px-5 py-4 flex flex-col md:min-h-0",
				children: [/* @__PURE__ */ J("div", {
					className: "flex items-center justify-between pb-2 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
					children: [/* @__PURE__ */ q("p", {
						className: "text-[15px] font-bold text-sq-blue",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ q("button", {
						type: "button",
						className: "min-h-9 text-[15px] font-semibold text-sq-blue",
						"data-testid": "pay-select-all",
						onClick: () => c(g ? /* @__PURE__ */ new Set() : new Set(o.map(({ line: e }) => e.id))),
						children: g ? "Зняти все" : "Обрати все"
					})]
				}), /* @__PURE__ */ q("div", {
					className: "md:flex-1 md:min-h-0 md:overflow-auto",
					children: o.map(({ line: e, round: t }) => {
						let i = s.has(e.id);
						return /* @__PURE__ */ J("button", {
							type: "button",
							"data-testid": `pay-line-${e.id}`,
							"aria-pressed": i,
							disabled: r,
							onClick: () => v(e.id),
							className: "flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ q("span", {
									"aria-hidden": !0,
									className: `w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${i ? "bg-sq-blue text-white" : "ring-2 ring-inset ring-sq-divider"}`,
									children: i && /* @__PURE__ */ q(n, { size: 16 })
								}),
								/* @__PURE__ */ J("span", {
									className: "min-w-0 flex-1 py-1.5",
									children: [/* @__PURE__ */ J("span", {
										className: `block truncate text-base ${i ? "text-sq-text" : "text-sq-secondary"}`,
										children: [e.quantity > 1 && /* @__PURE__ */ J("span", {
											className: "tabular-nums",
											children: [e.quantity, "× "]
										}), Qe(e, !0)]
									}), /* @__PURE__ */ J("span", {
										className: "block text-[13px] text-sq-muted",
										children: ["раунд ", t.seq]
									})]
								}),
								/* @__PURE__ */ q("span", {
									className: `shrink-0 text-base tabular-nums ${i ? "text-sq-text" : "text-sq-muted"}`,
									children: Z(Nt(e))
								})
							]
						}, e.id);
					})
				})]
			}), /* @__PURE__ */ J("section", {
				className: "md:w-[420px] md:shrink-0 flex flex-col gap-3.5",
				children: [
					/* @__PURE__ */ J("div", {
						className: "rounded-card bg-white shadow-card px-5 py-[18px] flex flex-col gap-2.5",
						children: [
							/* @__PURE__ */ J("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								children: [/* @__PURE__ */ J("span", { children: [
									"Вибрано ",
									b,
									" з ",
									o.length
								] }), /* @__PURE__ */ q("span", {
									className: "tabular-nums",
									children: Z(h)
								})]
							}),
							/* @__PURE__ */ J("div", {
								className: "flex items-center justify-between py-2 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]",
								children: [/* @__PURE__ */ J("span", {
									className: "flex items-center gap-2.5 text-base text-sq-text",
									children: [/* @__PURE__ */ q(e, { size: 24 }), "Порівну на"]
								}), /* @__PURE__ */ J("div", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Менше",
											className: zt,
											"data-testid": "pay-ways-less",
											disabled: r || d <= 1,
											onClick: () => f((e) => Math.max(1, e - 1)),
											children: /* @__PURE__ */ q(l, { size: 20 })
										}),
										/* @__PURE__ */ q("span", {
											className: "w-11 text-center text-[17px] font-semibold tabular-nums",
											"data-testid": "pay-ways",
											children: d
										}),
										/* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Більше",
											className: zt,
											"data-testid": "pay-ways-more",
											disabled: r || d >= 10,
											onClick: () => f((e) => Math.min(10, e + 1)),
											children: /* @__PURE__ */ q(S, { size: 20 })
										})
									]
								})]
							}),
							d > 1 && /* @__PURE__ */ J("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								"data-testid": "pay-shares",
								children: [
									_.map((e) => Z(e)).join(" + "),
									" — один чек, ",
									d,
									" оплат"
								]
							}),
							/* @__PURE__ */ J("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ q("span", {
									className: "text-lg font-bold text-sq-heading",
									children: "До сплати"
								}), /* @__PURE__ */ q("span", {
									className: "text-[30px] font-bold text-sq-heading tabular-nums",
									children: Z(h)
								})]
							})
						]
					}),
					/* @__PURE__ */ q("div", {
						className: "flex gap-2.5",
						children: Lt.map((e) => {
							let t = p === e.id, n = e.glyph;
							return /* @__PURE__ */ J("button", {
								type: "button",
								"data-testid": `pay-method-${e.id}`,
								"aria-pressed": t,
								onClick: () => m(e.id),
								className: `flex-1 min-h-16 rounded-[14px] bg-white inline-flex items-center justify-center gap-2.5 text-base font-semibold text-sq-text ${t ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider"}`,
								children: [/* @__PURE__ */ q(n, { size: 24 }), e.label]
							}, e.id);
						})
					}),
					/* @__PURE__ */ q("div", { className: "flex-1" }),
					/* @__PURE__ */ J("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[60px] rounded-xl text-lg",
						"data-testid": "pay-submit",
						disabled: r || h <= 0,
						onClick: y,
						children: [
							"Оплатити ",
							Z(h),
							g ? "" : " (частина)"
						]
					})
				]
			})]
		})]
	});
}
var zt = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
//#endregion
//#region src/modules/tables/lib/draft.ts
function Bt(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = pe(ue([n]), r);
	return {
		token: t,
		uid: Y(n.variant_id, r, i),
		variant_id: n.variant_id,
		product_id: n.product_id,
		product_name: n.product_name,
		variant_label: n.label,
		quantity: e.quantity ?? 1,
		modifiers: [...r],
		modifierNames: a.error ? [] : a.names,
		note: i,
		preview_cents: a.error ? null : n.price_cents + a.deltaCents
	};
}
function Vt(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return Y(e.variant_id, t, e.note);
}
function Ht(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: Vt(e),
		product_id: null,
		variant_id: e.variant_id,
		product_name: e.product_name,
		variant_label: e.variant_label,
		modifierIds: e.modifiers.map((e) => e.modifier_id).filter((e) => e != null),
		modifierNames: e.modifiers.map((e) => e.name),
		note: e.note,
		quantity: e.quantity,
		preview_unit_cents: e.preview_unit_price_cents,
		pending: !1
	})), r = new Map(n.map((e) => [e.uid, e]));
	for (let e of t) {
		let t = r.get(e.uid);
		if (t) {
			t.quantity += e.quantity, t.pending = !0, t.product_id ?? (t.product_id = e.product_id);
			continue;
		}
		let i = {
			key: `pend:${e.uid}`,
			id: null,
			uid: e.uid,
			product_id: e.product_id,
			variant_id: e.variant_id,
			product_name: e.product_name,
			variant_label: e.variant_label,
			modifierIds: e.modifiers,
			modifierNames: e.modifierNames,
			note: e.note,
			quantity: e.quantity,
			preview_unit_cents: e.preview_cents,
			pending: !0
		};
		n.push(i), r.set(i.uid, i);
	}
	return n;
}
function Ut(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? Wt(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function Wt(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function Gt(e) {
	let t = 0, n = 0, r = !0;
	for (let i of e) t += i.quantity, i.preview_unit_cents == null ? r = !1 : n += i.preview_unit_cents * i.quantity;
	return {
		lines: e.length,
		units: t,
		cents: n,
		exact: r
	};
}
//#endregion
//#region src/modules/tables/lib/precheck.ts
function Kt(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function qt(e, t = /* @__PURE__ */ new Date()) {
	let n = Mt(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: Nt(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: Kt(e.opened_at, t),
		printed_at: Kt(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0)
	};
}
//#endregion
//#region src/modules/tables/lib/useBill.ts
function Jt() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function Yt(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = G(null), [o, s] = G(!0), [c, l] = G(null), [u, d] = G(null), [f, p] = G(!1), [m, h] = G([]), [g, _] = G(0), [v, y] = G(!1), [b, x] = G(null), S = W(!0), C = W([]), w = W(!1), T = W(!1), E = W(0);
	H(() => (S.current = !0, () => {
		S.current = !1;
	}), []);
	let D = V(async () => {
		if (!n || r == null) return !1;
		let t = await te(r, e);
		return !t || !S.current ? !1 : (a(t.bill), y(!0), x(t.savedAt), s(!1), !0);
	}, [
		e,
		n,
		r
	]), k = V(async () => {
		if (!t) {
			let e = await D();
			S.current && !e && s(!1);
			return;
		}
		try {
			let t = await O(e);
			if (!S.current) return;
			a(t), l(null), y(!1), x(null), n && r != null && j(r, t);
		} catch (e) {
			if (!S.current) return;
			let t = await D();
			S.current && !t && l(R(e, "Не вдалося прочитати рахунок"));
		} finally {
			S.current && s(!1);
		}
	}, [
		e,
		t,
		D,
		n,
		r
	]);
	H(() => {
		k();
	}, [k]), wt(V(async () => {
		let i = () => w.current || C.current.length > 0;
		if (!t || i()) return;
		let o = E.current;
		try {
			let t = await O(e);
			if (!S.current || o !== E.current || i()) return;
			a((e) => e != null && JSON.stringify(e) === JSON.stringify(t) ? e : t), l(null), y(!1), x(null), n && r != null && j(r, t);
		} catch {}
	}, [
		e,
		t,
		n,
		r
	]), t);
	let A = V(async () => {
		if (w.current) return;
		w.current = !0;
		let e = !1;
		try {
			for (; C.current.length > 0;) {
				let t = C.current.shift();
				t.kind === "blocking" && (T.current = !0, p(!0));
				try {
					let e = await t.write();
					E.current += 1, S.current && (a(e), y(!1), x(null), t.kind === "blocking" && t.stock && _((e) => e + 1)), n && r != null && j(r, e), t.kind === "blocking" && t.resolve(!0);
				} catch (n) {
					e = !0, S.current && d(R(n, "Не вдалося зберегти")), t.kind === "blocking" && t.resolve(!1);
				} finally {
					t.kind === "add" && S.current && h((e) => e.filter((e) => e.token !== t.token)), t.kind === "blocking" && (T.current = !1, S.current && p(!1));
				}
			}
		} finally {
			w.current = !1;
		}
		e && S.current && k();
	}, [
		n,
		r,
		k
	]), M = V((n) => {
		if (!t) {
			d("Потрібна мережа");
			return;
		}
		d(null);
		let r = Jt(), i = Bt(n, r);
		h((e) => [...e, i]), C.current.push({
			kind: "add",
			token: r,
			write: () => F(e, {
				variant_id: i.variant_id,
				quantity: i.quantity,
				modifiers: i.modifiers,
				note: i.note
			})
		}), A();
	}, [
		e,
		t,
		A
	]);
	return {
		bill: i,
		loading: o,
		error: c,
		banner: u,
		busy: f,
		pending: m,
		epoch: g,
		stale: v,
		savedAt: b,
		clearBanner: V(() => d(null), []),
		notice: V((e) => d(e), []),
		reload: k,
		addLine: M,
		run: V((e, n = {}) => T.current ? Promise.resolve(!1) : t ? (d(null), new Promise((t) => {
			C.current.push({
				kind: "blocking",
				stock: n.stock === !0,
				write: e,
				resolve: t
			}), A();
		})) : (d("Потрібна мережа"), Promise.resolve(!1)), [t, A])
	};
}
//#endregion
//#region src/modules/tables/lib/useGuestOrders.ts
function Xt(e, t) {
	return JSON.stringify(e) === JSON.stringify(t) ? e : t;
}
function Zt({ online: e, tableId: t = null }) {
	let [n, r] = G([]), [i, a] = G([]), [o, s] = G([]), [c, l] = G(!1), u = W(!0);
	H(() => (u.current = !0, () => {
		u.current = !1;
	}), []);
	let d = V(async () => {
		if (e) try {
			let e = await I(t ?? void 0);
			if (!u.current) return;
			let n = Array.isArray(e?.orders) ? e.orders : [], i = Array.isArray(e?.sent) ? e.sent : [], o = Array.isArray(e?.calls) ? e.calls : [];
			r((e) => Xt(e, n)), a((e) => Xt(e, i)), s((e) => Xt(e, o)), l(!0);
		} catch {}
	}, [e, t]);
	return H(() => {
		if (!e) {
			r([]), a([]), s([]), l(!1);
			return;
		}
		d();
	}, [e, d]), wt(d, e), {
		orders: n,
		sent: i,
		calls: o,
		loaded: c,
		refresh: d
	};
}
//#endregion
//#region src/modules/tables/lib/useIsWide.ts
var Qt = "(min-width: 1024px)";
function $t() {
	let [e, t] = G(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(Qt).matches);
	return H(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(Qt), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
//#endregion
//#region src/modules/tables/lib/useNotifyChime.ts
var en = "tables:chime", tn = null;
function nn() {
	if (tn) return tn;
	let e = globalThis, t = e.AudioContext ?? e.webkitAudioContext;
	if (!t) return null;
	try {
		tn = new t();
	} catch {
		tn = null;
	}
	return tn;
}
function rn() {
	let e = () => {
		let e = nn();
		e && e.state === "suspended" && e.resume().catch(() => void 0);
	};
	return document.addEventListener("pointerdown", e, {
		once: !0,
		capture: !0
	}), () => document.removeEventListener("pointerdown", e, { capture: !0 });
}
function an() {
	let e = nn();
	if (e) try {
		e.state === "suspended" && e.resume().catch(() => void 0);
		let t = e.currentTime;
		[880, 1320].forEach((n, r) => {
			let i = e.createOscillator(), a = e.createGain(), o = t + r * .16;
			i.type = "sine", i.frequency.value = n, a.gain.setValueAtTime(1e-4, o), a.gain.exponentialRampToValueAtTime(.25, o + .02), a.gain.exponentialRampToValueAtTime(1e-4, o + .14), i.connect(a).connect(e.destination), i.start(o), i.stop(o + .15);
		});
	} catch {}
	try {
		navigator.vibrate?.([
			120,
			60,
			120
		]);
	} catch {}
}
function on() {
	try {
		return localStorage.getItem(en) !== "off";
	} catch {
		return !0;
	}
}
function sn() {
	let [e, t] = G(on);
	return [e, V((e) => {
		t(e);
		try {
			localStorage.setItem(en, e ? "on" : "off");
		} catch {}
	}, [])];
}
function cn(e, t, n) {
	let r = W(null);
	H(() => rn(), []), H(() => {
		if (!t) return;
		let i = r.current;
		if (r.current = new Set(e), i != null && n) {
			for (let t of e) if (!i.has(t)) {
				an();
				return;
			}
		}
	}, [
		e,
		t,
		n
	]);
}
//#endregion
//#region src/modules/tables/pages/BillPage.tsx
function ln() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function un() {
	let { billId: e } = Ce(), t = Number(e), n = he((e) => e.online), i = ge(), a = me((e) => e.auth?.store.id ?? null), { bill: o, loading: s, error: c, banner: l, busy: d, pending: f, epoch: p, stale: m, savedAt: h, clearBanner: g, notice: v, reload: y, addLine: b, run: x } = Yt(t, {
		online: n,
		mirrored: i !== "web",
		storeId: a
	}), S = $t(), C = ve().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [O, j] = G(!1), [N, ee] = G(!1), [P, F] = G(null), [I, L] = G(null), [te, z] = G(!1), ie = Se(), oe = xe(), { orders: V, sent: W, calls: K, loaded: ce, refresh: Y } = Zt({ online: n && o != null }), X = o?.table_id ?? null, Z = U(() => V.filter((e) => e.table_id === X), [V, X]), ue = U(() => W.filter((e) => e.table_id === X), [W, X]), de = U(() => K.filter((e) => e.table_id === X), [K, X]), pe = U(() => St({
		orders: V,
		sent: W,
		calls: K
	}, X), [
		V,
		W,
		K,
		X
	]), _e = U(() => yt({
		orders: V,
		sent: W,
		calls: K
	}), [
		V,
		W,
		K
	]), [ye] = sn();
	cn(_e, ce, ye);
	let be = oe.state?.notice;
	H(() => {
		typeof be == "string" && be && v(be);
	}, [be, v]);
	let Q = U(() => o ? Ht(o.draft, f) : [], [o, f]), we = U(() => Gt(Q), [Q]), Te = U(() => o ? Mt(o) : [], [o]), [Ee, $] = G([]), De = U(() => Ut(Q, Ee), [Q, Ee]);
	if (!n && !m && !s) return /* @__PURE__ */ q("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ J("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ q("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ q("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (s) return /* @__PURE__ */ q("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (c || !o) return /* @__PURE__ */ q("div", {
		className: "p-4",
		children: /* @__PURE__ */ J("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ q("p", {
				className: "text-sm",
				children: c ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ q("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void y(),
				children: "Повторити"
			})]
		})
	});
	let Oe = async (e) => {
		let t = {
			settled: !1,
			warning: null
		};
		await x(async () => {
			let n = await B(o.id, e);
			return t.settled = It(n.bill), t.warning = n.warning ?? null, n.bill;
		}, { stock: !0 }) && (ee(!1), t.settled ? t.warning ? ie("/tables", { state: {
			note: t.warning,
			warn: !0
		} }) : ie("/tables") : t.warning && v(t.warning));
	}, ke = async () => {
		if (L(null), await x(() => k(o.id)) && i === "cashier") try {
			let [e, t] = await Promise.all([le("receiptPrinterName"), le("receiptPaperWidthMm")]);
			if (!e) return;
			await fe(e, qt(o), t === 58 || t === 80 ? t : se), L("Передчек надіслано на друк");
		} catch (e) {
			L(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, Ae = () => {
		j(!1), x(() => D(o.id, ln()), { stock: !0 });
	}, je = (e) => {
		if (e.id == null) return;
		let t = e.id;
		x(() => e.quantity > 1 ? _(o.id, t, e.quantity - 1) : T(o.id, t));
	}, Me = (e) => {
		if (e.id == null) return;
		let t = e.id;
		x(() => _(o.id, t, e.quantity + 1));
	}, Ne = (e) => {
		if (e.id == null) return;
		let t = Ee.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		if (!t) {
			v("Страви вже немає в меню — зніміть рядок і додайте іншу");
			return;
		}
		F({
			row: e,
			variants: [...t[1]]
		});
	}, Pe = (e, t, n) => {
		let r = P?.row.id;
		F(null), r != null && x(() => re(o.id, r, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, Fe = async (e, t) => {
		let n = {
			warning: null,
			refused: null
		}, r = await x(async () => {
			try {
				let r = await w(e.id, t);
				return n.warning = r.warning, r.bill;
			} catch (e) {
				throw n.refused = pt(e), e;
			}
		}, { stock: !0 });
		return Y(), r && n.warning && v(n.warning), {
			ok: r,
			refusedLineId: n.refused
		};
	}, Ie = async (e) => {
		if (!n) return v("Потрібна мережа"), !1;
		try {
			return await ne(e.id), !0;
		} catch (e) {
			return v(R(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			Y();
		}
	}, Le = async (e) => {
		if (!n) return v("Потрібна мережа"), !1;
		try {
			return await A(e.id), e.bill_opened_by_guest && y(), !0;
		} catch (e) {
			return v(R(e, "Не вдалося позначити")), !1;
		} finally {
			Y();
		}
	}, Re = async (e, t) => {
		if (!n) return v("Потрібна мережа"), !1;
		z(!0), g();
		try {
			return await ae(e.id, t ?? void 0), Y(), !0;
		} catch (e) {
			return v(R(e, "Не вдалося відхилити запит")), Y(), !1;
		} finally {
			z(!1);
		}
	}, ze = /* @__PURE__ */ q(tt, {
		bill: o,
		draft: Q,
		summary: we,
		owedCents: o.fired_total_cents,
		busy: d,
		online: n,
		hasPending: f.length > 0,
		canPay: Te.length > 0,
		canPrecheck: Te.length > 0,
		printStatus: I,
		onLess: je,
		onMore: Me,
		onEdit: Ne,
		onCancelRound: (e) => void x(() => E(o.id, e), { stock: !0 }),
		onFire: Ae,
		onPay: () => {
			j(!1), ee(!0);
		},
		onPrecheck: () => void ke()
	});
	return /* @__PURE__ */ J("div", {
		className: "relative flex h-full min-h-0 flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ J("header", {
				className: "flex shrink-0 items-center gap-3.5 px-4 md:px-6 min-h-[68px] py-2 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ J("button", {
					type: "button",
					className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
					onClick: () => ie("/tables"),
					children: [/* @__PURE__ */ q(u, { size: 20 }), o.hall_name || "Зала"]
				}), /* @__PURE__ */ J("div", {
					className: `min-w-0 flex-1 ${S ? "" : "text-center pr-16"}`,
					children: [/* @__PURE__ */ J("p", {
						className: "truncate text-xl font-bold text-sq-heading",
						children: ["Стіл ", o.table_name]
					}), /* @__PURE__ */ J("p", {
						className: "truncate text-[13px] text-sq-muted",
						children: [
							r(o.guests),
							" · ",
							o.opened_by_name,
							" · ",
							M(o.opened_at, (/* @__PURE__ */ new Date()).toISOString()),
							" · рахунок ",
							o.bill_no
						]
					})]
				})]
			}),
			m && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					h == null ? "" : `, станом на ${String(new Date(h).getHours()).padStart(2, "0")}:${String(new Date(h).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			l && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					l,
					" ",
					/* @__PURE__ */ q("button", {
						type: "button",
						className: "sq-link",
						onClick: g,
						children: "Зрозуміло"
					})
				]
			}),
			pe.length > 0 && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 flex items-center gap-3 rounded-sq bg-sq-blue/[0.06] px-3 py-2 text-sm text-sq-text",
				"data-testid": "bill-elsewhere",
				children: [/* @__PURE__ */ J("span", {
					className: "min-w-0 flex-1 truncate",
					children: [
						"Інші столи:",
						" ",
						pe.slice(0, 3).map((e) => `Стіл ${e.table_name} — ${e.words}`).join(" · "),
						pe.length > 3 ? ` · і ще ${pe.length - 3}` : ""
					]
				}), /* @__PURE__ */ q("button", {
					type: "button",
					className: "sq-link shrink-0 font-semibold",
					onClick: () => ie("/tables"),
					children: "До залу"
				})]
			}),
			(Z.length > 0 || de.length > 0 || ue.length > 0) && /* @__PURE__ */ J("section", {
				className: "mx-4 md:mx-6 mt-2 max-h-[40vh] shrink-0 overflow-auto space-y-2.5",
				"data-testid": "bill-requests",
				children: [/* @__PURE__ */ q(Et, {
					calls: de,
					sent: ue,
					showTable: !1,
					busy: d || te,
					onAnswer: Ie,
					onSeen: Le
				}), /* @__PURE__ */ q(Dt, {
					orders: Z,
					showTable: !1,
					busy: d || te,
					onAccept: Fe,
					onReject: Re
				})]
			}),
			/* @__PURE__ */ J("div", {
				className: `min-h-0 flex-1 ${S ? "grid grid-cols-[minmax(0,1fr)_372px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ q(jt, {
					counts: De,
					online: n,
					active: n && !N && !O && !P,
					canScan: i === "cashier",
					epoch: p,
					onAdd: b,
					onRows: $
				}), S && /* @__PURE__ */ q("aside", {
					className: "flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]",
					children: ze
				})]
			}),
			!S && /* @__PURE__ */ q(et, {
				draft: Q,
				rounds: o.rounds,
				summary: we,
				owedCents: o.fired_total_cents,
				hasPending: f.length > 0,
				busy: d,
				online: n,
				onOpen: () => j(!0),
				onFire: Ae
			}),
			!S && O && /* @__PURE__ */ q(ot, {
				title: `Стіл ${o.table_name} · рахунок ${o.bill_no}`,
				onClose: () => j(!1),
				children: ze
			}),
			N && /* @__PURE__ */ q(Rt, {
				bill: o,
				busy: d,
				onClose: () => ee(!1),
				onPay: (e) => void Oe(e)
			}),
			P && /* @__PURE__ */ q("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ q(He, {
					productName: P.row.product_name,
					variants: P.variants,
					variantLabel: C,
					initialVariantId: P.row.variant_id,
					initialModifierIds: P.row.modifierIds,
					initialNote: P.row.note,
					submitLabel: "Зберегти",
					withQuantity: !1,
					onAdd: ({ item: e, modifiers: t, note: n }) => Pe(e, t, n),
					onClose: () => F(null)
				})
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/TableTile.tsx
var dn = {
	free: {
		tile: "bg-white ring-1 ring-[#E6E8EC]",
		dot: null
	},
	mine: {
		tile: "bg-sq-blue/[0.06] ring-2 ring-sq-blue",
		dot: "bg-sq-blue"
	},
	busy: {
		tile: "bg-white ring-2 ring-[#F8C00F]",
		dot: "bg-[#F8C00F]"
	},
	bill: {
		tile: "bg-white ring-2 ring-sq-danger",
		dot: "bg-sq-danger"
	}
}, fn = {
	free: "Вільний",
	mine: "Мій стіл",
	busy: "Зайнятий",
	bill: "Просять рахунок"
};
function pn({ seat: e, now: t, meId: n, onOpen: a, disabled: o, guestWaiting: s = 0, calling: l, sentUnseen: u = 0 }) {
	let f = l?.waiter === !0, p = l?.bill === !0, { table: h, bill: g } = e, _ = m(g, n), v = N(g), b = h.shape === "round";
	return /* @__PURE__ */ J("button", {
		type: "button",
		"data-testid": `table-tile-${h.id}`,
		"data-tone": _,
		"data-kitchen": v ?? void 0,
		"data-guest": s > 0 ? s : void 0,
		"data-call": f || p ? [f ? "waiter" : "", p ? "bill" : ""].filter(Boolean).join(" ") : void 0,
		"data-sent": u > 0 ? u : void 0,
		disabled: o,
		onClick: () => a(e),
		style: {
			gridColumn: `${h.pos_x + 1} / span ${h.width}`,
			gridRow: `${h.pos_y + 1} / span ${h.height}`
		},
		className: `relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${b ? "rounded-full" : "rounded-card"} ${dn[_].tile}`,
		children: [
			dn[_].dot && /* @__PURE__ */ q("span", {
				"aria-hidden": !0,
				className: `absolute top-3 w-2.5 h-2.5 rounded-full ${b ? "right-[18%]" : "right-3.5"} ${dn[_].dot}`
			}),
			(v || s > 0 || f || p || u > 0 || g && g.draft_count > 0) && /* @__PURE__ */ J("span", {
				className: `absolute top-2.5 flex flex-wrap items-center gap-1 ${b ? "left-[16%] right-[24%]" : "left-3 right-8"}`,
				children: [
					f && /* @__PURE__ */ J("span", {
						"data-testid": `table-call-waiter-${h.id}`,
						title: "Гість кличе офіціанта",
						className: "h-5 px-1 rounded-md bg-[#8A6CEF]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ q(z, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ q("span", {
							className: "sr-only",
							children: "Гість кличе офіціанта"
						})]
					}),
					p && /* @__PURE__ */ J("span", {
						"data-testid": `table-call-bill-${h.id}`,
						title: "Гість просить рахунок",
						className: "h-5 px-1 rounded-md bg-[#1B9DF0]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ q(C, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ q("span", {
							className: "sr-only",
							children: "Гість просить рахунок"
						})]
					}),
					u > 0 && /* @__PURE__ */ J("span", {
						"data-testid": `table-sent-${h.id}`,
						title: "Гість замовив сам — уже на кухні",
						className: "h-5 px-1 rounded-md bg-[#F4891F]/15 text-[#B35F0C] text-[11px] font-semibold inline-flex items-center gap-0.5 animate-pulse",
						children: [
							/* @__PURE__ */ q(y, {
								size: 14,
								"aria-hidden": !0
							}),
							u > 1 ? u : null,
							/* @__PURE__ */ q("span", {
								className: "sr-only",
								children: "Замовлення гостя вже на кухні"
							})
						]
					}),
					s > 0 && /* @__PURE__ */ J("span", {
						"data-testid": `table-guest-${h.id}`,
						title: "Гість надіслав запит із телефону",
						className: "h-5 px-1.5 rounded-md bg-sq-blue text-white text-[11px] font-semibold inline-flex items-center gap-1 animate-pulse",
						children: [
							/* @__PURE__ */ q(oe, {
								size: 13,
								"aria-hidden": !0
							}),
							s > 1 ? s : null,
							/* @__PURE__ */ q("span", {
								className: "sr-only",
								children: s > 1 ? `Запитів гостей: ${s}` : "Запит гостя"
							})
						]
					}),
					v && /* @__PURE__ */ q("span", {
						className: `h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${v === "ready" ? "bg-sq-success text-white" : "bg-sq-warning/15 text-[#B35F0C]"}`,
						children: v === "ready" ? "готово" : "готується"
					}),
					g && g.draft_count > 0 && /* @__PURE__ */ q("span", {
						"data-testid": `table-draft-${h.id}`,
						title: "Не відправлено на кухню",
						className: "text-sq-blue",
						children: /* @__PURE__ */ q(c, {
							size: 16,
							"aria-label": "Не відправлено на кухню"
						})
					})
				]
			}),
			/* @__PURE__ */ q("span", {
				className: "text-[30px] font-bold leading-none text-sq-heading tabular-nums",
				children: h.name
			}),
			g ? /* @__PURE__ */ J(K, { children: [
				_ === "bill" ? /* @__PURE__ */ q("span", {
					className: "text-[13px] font-semibold text-sq-danger",
					"data-testid": `table-precheck-${h.id}`,
					children: "Просять рахунок"
				}) : /* @__PURE__ */ J("span", {
					className: "text-[13px] font-semibold text-sq-text tabular-nums",
					children: [
						i(g.fired_total_cents),
						" · ",
						M(g.opened_at, t)
					]
				}),
				/* @__PURE__ */ J("span", {
					className: "text-xs text-sq-muted truncate max-w-full",
					children: [r(g.guests), g.opened_by_name ? ` · ${g.opened_by_name}` : ""]
				}),
				/* @__PURE__ */ q("span", {
					className: "sr-only",
					children: fn[_]
				})
			] }) : /* @__PURE__ */ q("span", {
				className: "text-[13px] text-sq-muted",
				children: d(h.seats)
			})
		]
	});
}
function mn({ guest: e = !1, callWaiter: t = !1, callBill: n = !1, sent: r = !1 }) {
	let i = {
		free: "bg-sq-divider",
		mine: "bg-sq-blue",
		busy: "bg-[#F8C00F]",
		bill: "bg-sq-danger"
	};
	return /* @__PURE__ */ J("div", {
		className: "flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary",
		"data-testid": "tables-legend",
		children: [
			Object.keys(i).map((e) => /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q("span", {
					"aria-hidden": !0,
					className: `w-2.5 h-2.5 rounded-full ${i[e]}`
				}), fn[e]]
			}, e)),
			e && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(oe, {
					size: 14,
					className: "text-sq-blue",
					"aria-hidden": !0
				}), "Запит гостя"]
			}),
			t && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(z, {
					size: 14,
					"aria-hidden": !0
				}), "Кличе офіціанта"]
			}),
			n && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(C, {
					size: 14,
					"aria-hidden": !0
				}), "Рахунок з телефону"]
			}),
			r && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(y, {
					size: 14,
					"aria-hidden": !0
				}), "Замовив сам — на кухні"]
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/HallMapPage.tsx
function hn(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function gn() {
	let e = he((e) => e.online), t = ge(), n = me((e) => e.auth?.store.id ?? null), r = me((e) => e.auth?.staff.id ?? null), { halls: i, bills: a, now: o, loading: c, error: l, stale: u, savedAt: d, refresh: m } = ee({
		online: e,
		mirrored: t !== "web",
		storeId: n
	}), { orders: h, sent: g, calls: _, loaded: v, refresh: y } = Zt({ online: e }), [b, x] = sn(), [S, C] = G(null), [T, E] = G(!1), [D, O] = G(null), [k, j] = G(null), M = (e, t = !1) => j(e == null ? null : {
		text: e,
		warn: t
	}), N = Se(), P = xe().state, F = typeof P?.note == "string" ? P.note : null, I = P?.warn === !0;
	H(() => {
		F && j({
			text: F,
			warn: I
		});
	}, [F, I]);
	let L = U(() => _t({
		orders: h,
		sent: g,
		calls: _
	}), [
		h,
		g,
		_
	]);
	cn(U(() => yt({
		orders: h,
		sent: g,
		calls: _
	}), [
		h,
		g,
		_
	]), v, b);
	let te = h.length + g.length + _.length > 0;
	H(() => {
		if (k == null || k.warn) return;
		let e = setTimeout(() => j(null), 8e3);
		return () => clearTimeout(e);
	}, [k]);
	let z = U(() => s(i, a), [i, a]), B = z.find((e) => e.id === S) ?? z[0] ?? null, re = U(() => B ? f(B, a) : [], [B, a]), V = U(() => p(re), [re]);
	async function W(t) {
		if (!T) {
			if (!e) {
				O("Потрібна мережа, щоб відкрити стіл");
				return;
			}
			E(!0), O(null);
			try {
				let e = await ie(t.table.id);
				N(`/tables/${e.bill.id}`);
			} catch (e) {
				O(R(e, "Не вдалося відкрити стіл")), m();
			} finally {
				E(!1);
			}
		}
	}
	async function K(t, n) {
		if (T) return { ok: !1 };
		if (!e) return O("Потрібна мережа, щоб прийняти запит"), { ok: !1 };
		E(!0), O(null), M(null);
		try {
			let e = await w(t.id, n);
			return y(), m(), e.warning ? N(`/tables/${e.bill.id}`, { state: { notice: e.warning } }) : M(e.already ? `Стіл ${t.table_name}: запит уже було прийнято` : `Стіл ${t.table_name}: прийнято — замовлення на кухні`), { ok: !0 };
		} catch (e) {
			return O(R(e, "Не вдалося прийняти запит")), y(), {
				ok: !1,
				refusedLineId: pt(e)
			};
		} finally {
			E(!1);
		}
	}
	async function se(t) {
		if (!e) return O("Потрібна мережа, щоб відповісти гостю"), !1;
		O(null);
		try {
			return await ne(t.id), M(`Стіл ${t.table_name}: гість бачить «Офіціант іде»`), !0;
		} catch (e) {
			return O(R(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			y();
		}
	}
	async function ce(t) {
		if (!e) return O("Потрібна мережа"), !1;
		O(null);
		try {
			return await A(t.id), M(t.bill_opened_by_guest ? `Стіл ${t.table_name} тепер ваш — замовлення вже на кухні` : `Стіл ${t.table_name}: замовлення вже на кухні`), t.bill_opened_by_guest && m(), !0;
		} catch (e) {
			return O(R(e, "Не вдалося позначити")), !1;
		} finally {
			y();
		}
	}
	async function Y(t, n) {
		if (T) return !1;
		if (!e) return O("Потрібна мережа, щоб відхилити запит"), !1;
		E(!0), O(null), M(null);
		try {
			return await ae(t.id, n ?? void 0), y(), M(`Стіл ${t.table_name}: запит відхилено`), !0;
		} catch (e) {
			return O(R(e, "Не вдалося відхилити запит")), y(), !1;
		} finally {
			E(!1);
		}
	}
	return !e && !u && !c ? /* @__PURE__ */ q("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ J("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ q("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ q("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ J("div", {
		className: "flex h-full min-h-0 flex-col bg-sq-bg",
		"data-testid": "hall-map",
		children: [
			/* @__PURE__ */ J("header", {
				className: "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0",
				children: [
					/* @__PURE__ */ q("h1", {
						className: "text-2xl font-bold text-sq-heading",
						children: "Столи"
					}),
					z.length > 1 && /* @__PURE__ */ q("div", {
						className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full",
						children: z.map((e) => {
							let t = B?.id === e.id, n = e.tables.reduce((e, t) => e + vt(L.get(t.id)), 0);
							return /* @__PURE__ */ J("button", {
								type: "button",
								"aria-pressed": t,
								"data-testid": `hall-tab-${e.id}`,
								onClick: () => C(e.id),
								className: `whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${t ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
								children: [e.name, n > 0 && /* @__PURE__ */ J("span", {
									"data-testid": `hall-tab-guest-${e.id}`,
									className: "ml-1.5 inline-flex items-center gap-0.5 text-sq-blue font-semibold",
									children: [/* @__PURE__ */ q(oe, {
										size: 14,
										"aria-hidden": !0
									}), n]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ q("div", { className: "flex-1" }),
					B && /* @__PURE__ */ q(mn, {
						guest: h.length > 0,
						callWaiter: _.some((e) => e.kind === "waiter"),
						callBill: _.some((e) => e.kind === "bill"),
						sent: g.length > 0
					}),
					/* @__PURE__ */ q("button", {
						type: "button",
						"aria-pressed": b,
						"data-testid": "tables-chime",
						className: "min-h-[34px] rounded-[9px] px-3 text-[13px] font-semibold text-sq-secondary ring-1 ring-sq-divider bg-white",
						title: "Звук і вібрація, коли гість кличе чи замовляє",
						onClick: () => x(!b),
						children: b ? "Звук увімкнено" : "Звук вимкнено"
					})
				]
			}),
			u && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", d == null ? "" : `, станом на ${hn(d)}`]
			}),
			D && /* @__PURE__ */ q("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "tables-banner",
				children: D
			}),
			k && /* @__PURE__ */ q("p", {
				className: `mx-4 md:mx-7 mb-3 rounded-sq px-3 py-2 text-sm ${k.warn ? "bg-amber-50 text-amber-900" : "bg-sq-success/10 text-sq-success-ink"}`,
				"data-testid": "tables-note",
				"data-tone": k.warn ? "warn" : "ok",
				children: k.text
			}),
			te && /* @__PURE__ */ J("section", {
				className: "mx-4 md:mx-7 mb-3 max-h-[45vh] overflow-auto space-y-2.5",
				"data-testid": "tables-requests",
				children: [
					/* @__PURE__ */ J("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: ["З телефонів гостей · ", xt({
							requests: h.length,
							sent: g.length,
							calls: _.length
						})]
					}),
					/* @__PURE__ */ q(Et, {
						calls: _,
						sent: g,
						showTable: !0,
						busy: T,
						onAnswer: se,
						onSeen: ce,
						onOpenBill: (e) => N(`/tables/${e}`)
					}),
					/* @__PURE__ */ q(Dt, {
						orders: h,
						showTable: !0,
						busy: T,
						onAccept: K,
						onReject: Y
					})
				]
			}),
			c && z.length === 0 && /* @__PURE__ */ q("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!c && l && /* @__PURE__ */ q("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ J("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ q("p", {
						className: "text-sm",
						children: l
					}), /* @__PURE__ */ q("button", {
						type: "button",
						className: "sq-btn-primary mt-3 px-4 py-2.5",
						onClick: () => void m(),
						children: "Повторити"
					})]
				})
			}),
			!c && !l && z.length === 0 && /* @__PURE__ */ q("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ J("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ q("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ q("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			B && /* @__PURE__ */ q("div", {
				className: "grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6",
				style: {
					gridTemplateColumns: `repeat(${V.cols}, minmax(2.5rem, 1fr))`,
					gridAutoRows: "minmax(3.75rem, auto)"
				},
				children: re.map((e) => /* @__PURE__ */ q(pn, {
					seat: e,
					now: o,
					meId: r,
					disabled: T,
					guestWaiting: L.get(e.table.id)?.requests ?? 0,
					calling: L.get(e.table.id),
					sentUnseen: L.get(e.table.id)?.sent ?? 0,
					onOpen: (e) => void W(e)
				}, e.table.id))
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/TablesRoutes.tsx
function _n() {
	return /* @__PURE__ */ J(be, { children: [/* @__PURE__ */ q(ye, {
		index: !0,
		element: /* @__PURE__ */ q(gn, {})
	}), /* @__PURE__ */ q(ye, {
		path: ":billId",
		element: /* @__PURE__ */ q(un, {})
	})] });
}
//#endregion
export { _n as TablesRoutes };
