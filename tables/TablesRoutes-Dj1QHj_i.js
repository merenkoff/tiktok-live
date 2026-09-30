import { A as e, B as t, D as n, E as r, F as i, G as a, H as o, I as s, J as c, K as l, L as u, M as d, N as f, O as p, P as m, Q as h, R as g, S as _, T as v, U as y, V as b, W as x, X as S, Y as C, _ as w, a as T, b as E, d as D, f as O, g as k, i as A, j, k as M, m as N, n as P, o as F, q as I, r as L, s as ee, t as R, u as te, v as ne, y as re, z } from "./useHallMap-CB4omUJZ.js";
import { useCallback as B, useEffect as V, useMemo as H, useRef as U, useState as W } from "react";
import { Fragment as G, jsx as K, jsxs as q } from "react/jsx-runtime";
import { DEFAULT_RECEIPT_PAPER_WIDTH as ie, assetUrl as J, cartLineUid as Y, defaultModifierIds as X, formatUah as Z, getMeta as ae, groupsOf as Q, needsModifierSheet as oe, printPrecheck as se, resolveLineModifiers as ce, useAuthStore as le, useOfflineStatus as ue, usePosShell as de, useSalesCatalog as fe, useVertical as pe } from "@pos/platform";
import { Route as me, Routes as he, useLocation as ge, useNavigate as _e, useParams as ve } from "react-router-dom";
//#region src/hooks/useDragScroll.ts
var ye = 6;
function be() {
	let e = U(null);
	return V(() => {
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
			!n.moved && Math.hypot(r, i) > ye && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var xe = "\xA0";
function Se(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, xe);
}
function $(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${Se(n)},${r} ₴`;
}
function Ce(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${Se(String(Math.abs(e) / 100))} ₴` : $(e);
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function we({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: o, disabled: s, count: c, onMore: l, badge: u, testId: d }) {
	let [f, p] = W(!1), m = f ? null : J(r), h = s || !!u || i != null && i <= 0, g = /* @__PURE__ */ q("button", {
		type: "button",
		disabled: s,
		onClick: o,
		"data-testid": d,
		className: `w-full ${l ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ q("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				m ? /* @__PURE__ */ K("img", {
					src: m,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${h ? "opacity-45" : ""}`,
					onError: () => p(!0)
				}) : /* @__PURE__ */ K("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				c != null && c > 0 && /* @__PURE__ */ K("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: c
				}),
				u ? /* @__PURE__ */ K("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: u
				}) : i != null && i <= 0 && /* @__PURE__ */ K("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ q("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ K("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${h ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ K("p", {
				className: "text-[14px] text-sq-secondary tabular-nums",
				children: $(n)
			})]
		})]
	});
	return l ? /* @__PURE__ */ q("div", {
		className: "relative",
		children: [g, !s && /* @__PURE__ */ K("button", {
			type: "button",
			onClick: l,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": d ? `${d}-more` : "tile-more",
			children: /* @__PURE__ */ K("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ K(a, { size: 20 })
			})
		})]
	}) : g;
}
//#endregion
//#region src/lib/tagColors.ts
var Te = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Ee = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, De = "slate";
function Oe(e) {
	return !!e && Te.includes(e);
}
function ke(e) {
	return Oe(e) ? Ee[e] : Ee[De];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function Ae({ name: e, color: t, onClick: n }) {
	let r = ke(t);
	return /* @__PURE__ */ q("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ K("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ K(y, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ q("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ K("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function je({ tags: e, activeId: n, showBack: r, backLabel: i, onSelect: a, onBack: o }) {
	let s = be(), c = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ q("div", {
		ref: s,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			r && /* @__PURE__ */ q("button", {
				type: "button",
				onClick: o,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ K(t, { size: 16 }), i]
			}),
			/* @__PURE__ */ K("button", {
				type: "button",
				onClick: () => a(null),
				className: c(n === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ K("button", {
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
function Me({ active: e, onScan: t }) {
	let n = de(), r = U(null);
	return V(() => {
		e ? r.current?.focus() : r.current?.blur();
	}, [e]), n === "tablet" ? null : /* @__PURE__ */ K("input", {
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
function Ne(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function Pe(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function Fe(e, t) {
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
	for (let e of Pe(t)) {
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
function Ie(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function Le(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function Re({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: a, submitLabel: o = "Додати в чек", withQuantity: s = !0, notePlaceholder: c = "Коментар для кухні", onAdd: u, onClose: d }) {
	let [f, p] = W(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [m, _] = W(() => i ?? []), [v, y] = W(a ?? ""), [S, C] = W(1), w = be(), T = t.find((e) => e.variant_id === f) ?? null, E = Le(t), D = Fe(E, m), O = T ? T.price_cents + D.deltaCents : null, k = T == null ? `Оберіть «${n}»` : D.error ?? (O != null && O < 0 ? "Ціна не може бути відʼємною" : null), A = k == null && T != null;
	V(() => {
		let e = (e) => {
			e.key === "Escape" && d();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [d]);
	function j(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function M(e, t) {
		_((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : j(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function N() {
		A && T && u({
			item: T,
			modifiers: D.snapshot.map((e) => e.id),
			note: Ne(v),
			quantity: s ? S : 1
		});
	}
	let P = T ? Ie(T.label, D.error ? [] : D.names) : "", F = J((T ?? t[0])?.image_url ?? null), L = t.length ? Math.min(...t.map((e) => e.price_cents)) : null, ee = [...t].sort((e, t) => e.price_cents - t.price_cents);
	return /* @__PURE__ */ q("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ K("div", {
			"aria-hidden": !0,
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: d,
			"data-testid": "modifier-scrim"
		}), /* @__PURE__ */ q("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]",
			children: [
				/* @__PURE__ */ K("div", {
					"aria-hidden": !0,
					className: "w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0"
				}),
				/* @__PURE__ */ q("div", {
					className: "px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0",
					children: [
						F ? /* @__PURE__ */ K("img", {
							src: F,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ K("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ K(b, { size: 24 })
						}),
						/* @__PURE__ */ q("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ K("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: e
							}), L != null && /* @__PURE__ */ K("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: t.length > 1 ? `від ${$(L)}` : $(L)
							})]
						}),
						/* @__PURE__ */ K("button", {
							type: "button",
							onClick: d,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ K(h, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ q("div", {
					ref: w,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						t.length > 1 && /* @__PURE__ */ q("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ K(Ve, {
								name: n,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ K("div", {
								className: "flex flex-wrap gap-2",
								children: ee.map((e) => {
									let t = e.variant_id === f, n = e.quantity <= 0;
									return /* @__PURE__ */ q("button", {
										type: "button",
										disabled: n,
										"aria-pressed": t,
										onClick: () => p(e.variant_id),
										className: Ue(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ K(g, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ K("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : Ce(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						E.map((e) => {
							let t = j(e, m), n = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ q("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ K(Ve, {
									name: e.name,
									hint: He(e, n),
									required: e.min_select >= 1
								}), /* @__PURE__ */ K("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let r = m.includes(t.id), i = !r && n;
										return /* @__PURE__ */ q("button", {
											type: "button",
											"aria-pressed": r,
											"aria-disabled": i || void 0,
											onClick: () => M(e, t),
											className: Ue(r, i),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												r && /* @__PURE__ */ K(g, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ K("span", {
													className: r ? "font-medium" : "font-medium text-sq-secondary",
													children: We(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ q("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ K(l, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ K("input", {
								className: "flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted",
								value: v,
								maxLength: 120,
								placeholder: c,
								"aria-label": c,
								enterKeyHint: "done",
								onChange: (e) => y(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && (e.preventDefault(), N());
								},
								"data-testid": "modifier-note"
							})]
						})
					]
				}),
				/* @__PURE__ */ q("div", {
					className: "shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]",
					children: [
						s && /* @__PURE__ */ q("div", {
							className: "flex items-center gap-1.5",
							"data-testid": "modifier-qty",
							children: [
								/* @__PURE__ */ K("button", {
									type: "button",
									"aria-label": "Менше",
									disabled: S <= 1,
									onClick: () => C((e) => Math.max(1, e - 1)),
									className: Be,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ K(x, { size: 20 })
								}),
								/* @__PURE__ */ K("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: S
								}),
								/* @__PURE__ */ K("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: S >= ze,
									onClick: () => C((e) => Math.min(ze, e + 1)),
									className: Be,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ K(I, { size: 20 })
								})
							]
						}),
						k ? /* @__PURE__ */ K("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: k
						}) : /* @__PURE__ */ K("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: P
						}),
						/* @__PURE__ */ K("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !A,
							onClick: N,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ q("span", { children: [o, O != null && /* @__PURE__ */ q(G, { children: [" · ", /* @__PURE__ */ K("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: $(O * S)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var ze = 99, Be = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function Ve({ name: e, hint: t, required: n }) {
	return /* @__PURE__ */ q("div", {
		className: "flex items-baseline gap-2 mb-2.5",
		children: [/* @__PURE__ */ K("span", {
			className: "text-base font-bold text-sq-heading",
			children: e
		}), t && /* @__PURE__ */ K("span", {
			className: `text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
			children: t
		})]
	});
}
function He(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function Ue(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function We(e) {
	return e > 0 ? `+${Ce(e)}` : e < 0 ? `−${Ce(-e)}` : "";
}
//#endregion
//#region src/modules/tables/lib/bill.ts
var Ge = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function Ke(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function qe(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Je(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
//#endregion
//#region src/modules/tables/components/BillBar.tsx
var Ye = 2;
function Xe({ draft: e, rounds: t, summary: n, owedCents: r, hasPending: i, busy: a, online: o, onOpen: s, onFire: c }) {
	let u = n.lines > 0, d = [...t].reverse().find((e) => e.cancelled_at == null && e.prep_status !== "served");
	return /* @__PURE__ */ q("div", {
		className: "shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ q("button", {
			type: "button",
			className: "block w-full text-left",
			"data-testid": "bill-bar-open",
			onClick: s,
			children: [
				/* @__PURE__ */ K("span", {
					"aria-hidden": !0,
					className: "block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5"
				}),
				/* @__PURE__ */ q("span", {
					className: "flex items-center gap-2.5 pb-1",
					children: [
						/* @__PURE__ */ K(l, {
							size: 20,
							className: "text-sq-blue shrink-0"
						}),
						/* @__PURE__ */ q("span", {
							className: "flex-1 min-w-0 truncate text-base font-bold text-sq-heading",
							children: [u ? `Чернетка · ${p(n.lines)}` : "Рахунок", i ? " · зберігаємо…" : ""]
						}),
						d && /* @__PURE__ */ q("span", {
							className: "shrink-0 text-sm text-sq-muted",
							children: [
								"Раунд ",
								d.seq,
								" ",
								Ge[d.prep_status]
							]
						})
					]
				}),
				e.slice(0, Ye).map((e) => /* @__PURE__ */ q("span", {
					className: "flex items-start gap-2.5 py-1",
					children: [
						/* @__PURE__ */ q("span", {
							className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
							children: [e.quantity, "×"]
						}),
						/* @__PURE__ */ q("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ K("span", {
								className: "block truncate text-[15px] text-sq-text",
								children: e.product_name
							}), e.modifierNames.length > 0 && /* @__PURE__ */ K("span", {
								className: "block truncate text-[13px] text-sq-muted",
								children: e.modifierNames.join(" · ")
							})]
						}),
						/* @__PURE__ */ K("span", {
							className: "shrink-0 text-[15px] text-sq-text tabular-nums",
							children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
						})
					]
				}, e.key)),
				e.length > Ye && /* @__PURE__ */ q("span", {
					className: "block py-0.5 text-[13px] text-sq-blue font-semibold",
					children: [
						"ще ",
						e.length - Ye,
						"…"
					]
				})
			]
		}), /* @__PURE__ */ q("div", {
			className: "flex items-center gap-3 pt-2.5 mt-1 shadow-[0_-1px_0_#E6E8EC]",
			children: [/* @__PURE__ */ q("div", {
				className: "flex-1 min-w-0",
				children: [/* @__PURE__ */ K("p", {
					className: "text-[13px] text-sq-secondary",
					children: "До сплати"
				}), /* @__PURE__ */ K("p", {
					className: "text-2xl font-bold text-sq-heading tabular-nums",
					children: Z(r)
				})]
			}), /* @__PURE__ */ q("button", {
				type: "button",
				className: "pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2",
				"data-testid": "bill-bar-fire",
				disabled: a || !o || i || !u,
				onClick: c,
				children: [
					/* @__PURE__ */ K(z, { size: 24 }),
					"На кухню",
					u ? ` · ${n.lines}` : ""
				]
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/components/BillPane.tsx
function Ze({ bill: e, draft: t, summary: n, owedCents: r, busy: i, online: a, hasPending: o, canPay: s, canPrecheck: u, printStatus: d, onLess: f, onMore: p, onEdit: m, onCancelRound: h, onFire: g, onPay: _, onPrecheck: v }) {
	let y = (e) => /* @__PURE__ */ K(tt, {
		testId: `bill-line-${e.id}`,
		quantity: e.quantity,
		title: e.product_name,
		sub: [e.variant_label, e.note].filter(Boolean).join(" · "),
		price: Z(qe(e))
	}, e.id);
	return /* @__PURE__ */ q("div", {
		className: "flex h-full min-h-0 flex-col",
		"data-testid": "bill-pane",
		children: [/* @__PURE__ */ q("div", {
			className: "flex-1 overflow-auto px-3.5 pt-3.5 pb-2 space-y-2.5",
			children: [e.rounds.map((e) => {
				let t = e.cancelled_at != null;
				return /* @__PURE__ */ q("section", {
					className: `rounded-2xl bg-white shadow-card px-4 py-3 ${t ? "opacity-60" : ""}`,
					"data-testid": `bill-round-${e.id}`,
					"data-cancelled": t ? "yes" : "no",
					children: [
						/* @__PURE__ */ q("div", {
							className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ K(z, { size: 24 }),
								/* @__PURE__ */ q("p", {
									className: "flex-1 text-[15px] font-bold text-sq-heading",
									children: [
										"Раунд ",
										e.seq,
										!t && /* @__PURE__ */ K("span", {
											className: "ml-2 font-normal text-[13px] text-sq-muted tabular-nums",
											children: Z(e.total_cents)
										})
									]
								}),
								/* @__PURE__ */ K("span", {
									className: `text-[13px] font-semibold ${t ? "text-sq-muted" : $e[e.prep_status]}`,
									children: t ? "скасовано" : e.prep_status === "new" ? `${Ge.new} · ${et(e.fired_at)} хв` : Ge[e.prep_status]
								})
							]
						}),
						/* @__PURE__ */ K("div", {
							className: "pt-1",
							children: e.items.map(y)
						}),
						Ke(e) && /* @__PURE__ */ K("button", {
							type: "button",
							className: "mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: i || !a || o,
							onClick: () => h(e.id),
							children: "Скасувати раунд"
						})
					]
				}, e.id);
			}), /* @__PURE__ */ q("section", {
				className: `rounded-2xl bg-white px-4 py-3 ${t.length > 0 ? "ring-2 ring-sq-blue" : "shadow-card"}`,
				"data-testid": "bill-draft",
				children: [/* @__PURE__ */ q("div", {
					className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
					children: [
						/* @__PURE__ */ K(l, {
							size: 20,
							className: "text-sq-blue"
						}),
						/* @__PURE__ */ K("p", {
							className: "flex-1 text-[15px] font-bold text-sq-heading",
							children: "Чернетка"
						}),
						/* @__PURE__ */ K("span", {
							className: "text-[13px] text-sq-muted",
							children: "ще не на кухні"
						})
					]
				}), t.length === 0 ? /* @__PURE__ */ K("p", {
					className: "py-2 text-sm text-sq-muted",
					children: "Нічого не набрано — тапніть страву в меню"
				}) : /* @__PURE__ */ K("div", {
					className: "pt-1",
					children: t.map((e) => {
						let t = [
							e.variant_label,
							...e.modifierNames,
							e.note
						].filter(Boolean).join(" · "), n = e.id != null && !e.pending;
						return /* @__PURE__ */ q("div", {
							className: `flex items-start gap-2.5 py-1.5 ${e.pending ? "opacity-60" : ""}`,
							"data-testid": e.id == null ? "bill-line-pending" : `bill-line-${e.id}`,
							"data-pending": e.pending ? "yes" : "no",
							children: [
								/* @__PURE__ */ q("span", {
									className: "w-7 pt-0.5 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}),
								/* @__PURE__ */ q("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ q("button", {
										type: "button",
										className: "block w-full text-left",
										"data-testid": e.id == null ? void 0 : `bill-line-edit-${e.id}`,
										disabled: i || !a || !n,
										onClick: () => m(e),
										children: [/* @__PURE__ */ K("span", {
											className: "block text-[15px] text-sq-text truncate",
											children: e.product_name
										}), t && /* @__PURE__ */ K("span", {
											className: "block text-[13px] text-sq-muted truncate",
											children: t
										})]
									}), e.id != null && /* @__PURE__ */ q("div", {
										className: "mt-1.5 flex items-center gap-1.5",
										children: [/* @__PURE__ */ K("button", {
											type: "button",
											"aria-label": "Менше",
											className: Qe,
											"data-testid": `bill-less-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => f(e),
											children: /* @__PURE__ */ K(x, { size: 16 })
										}), /* @__PURE__ */ K("button", {
											type: "button",
											"aria-label": "Більше",
											className: Qe,
											"data-testid": `bill-more-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => p(e),
											children: /* @__PURE__ */ K(I, { size: 16 })
										})]
									})]
								}),
								/* @__PURE__ */ K("span", {
									className: "shrink-0 pt-0.5 text-[15px] text-sq-text tabular-nums",
									children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
								})
							]
						}, e.key);
					})
				})]
			})]
		}), /* @__PURE__ */ q("footer", {
			className: "shrink-0 px-4 pt-3.5 pb-4 space-y-2.5 shadow-[0_-1px_0_#E6E8EC]",
			children: [
				t.length > 0 && /* @__PURE__ */ q("div", {
					className: "flex items-baseline justify-between text-sm text-sq-secondary",
					children: [/* @__PURE__ */ K("span", { children: "Чернетка, за сьогоднішніми цінами" }), /* @__PURE__ */ q("span", {
						className: "tabular-nums",
						"data-testid": "bill-draft-total",
						children: [n.exact ? "" : "≈ ", Z(n.cents)]
					})]
				}),
				/* @__PURE__ */ q("div", {
					className: "flex items-baseline justify-between",
					children: [/* @__PURE__ */ K("span", {
						className: "text-lg font-bold text-sq-heading",
						children: "До сплати"
					}), /* @__PURE__ */ K("span", {
						className: "text-[26px] font-bold text-sq-heading tabular-nums",
						"data-testid": "bill-owed",
						children: Z(r)
					})]
				}),
				/* @__PURE__ */ q("div", {
					className: "flex gap-2.5",
					children: [/* @__PURE__ */ q("button", {
						type: "button",
						className: "flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-40",
						"data-testid": "bill-fire",
						disabled: i || !a || o || t.length === 0,
						onClick: g,
						children: [
							/* @__PURE__ */ K(z, { size: 24 }),
							"На кухню",
							n.lines > 0 ? ` · ${n.lines}` : ""
						]
					}), /* @__PURE__ */ K("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[52px] rounded-xl text-[17px]",
						"data-testid": "bill-pay",
						disabled: i || !a || o || !s || t.length > 0,
						onClick: _,
						children: "Оплатити"
					})]
				}),
				/* @__PURE__ */ q("button", {
					type: "button",
					className: "w-full min-h-9 text-[15px] font-semibold text-sq-blue inline-flex items-center justify-center gap-1.5 disabled:opacity-40",
					"data-testid": "bill-precheck",
					disabled: i || !a || o || !u,
					onClick: v,
					children: [/* @__PURE__ */ K(c, { size: 20 }), e.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"]
				}),
				d && /* @__PURE__ */ K("p", {
					className: "text-xs text-sq-muted text-center",
					"data-testid": "bill-print-status",
					children: d
				})
			]
		})]
	});
}
var Qe = "w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40", $e = {
	new: "text-[#D9730D]",
	ready: "text-sq-success",
	served: "text-sq-muted"
};
function et(e) {
	return Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 6e4));
}
function tt({ testId: e, quantity: t, title: n, sub: r, price: i }) {
	return /* @__PURE__ */ q("div", {
		className: "flex items-start gap-2.5 py-1.5",
		"data-testid": e,
		children: [
			/* @__PURE__ */ q("span", {
				className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
				children: [t, "×"]
			}),
			/* @__PURE__ */ q("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ K("p", {
					className: "text-[15px] text-sq-text truncate",
					children: n
				}), r && /* @__PURE__ */ K("p", {
					className: "text-[13px] text-sq-muted truncate",
					children: r
				})]
			}),
			/* @__PURE__ */ K("span", {
				className: "shrink-0 text-[15px] text-sq-text tabular-nums",
				children: i
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/BillSheet.tsx
function nt({ title: e, onClose: t, children: n }) {
	return /* @__PURE__ */ q("div", {
		className: "fixed inset-0 z-40",
		"data-testid": "bill-sheet",
		children: [/* @__PURE__ */ K("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			"aria-label": "Закрити",
			onClick: t
		}), /* @__PURE__ */ q("div", {
			className: "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-sq-sidebar shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up overflow-hidden",
			children: [/* @__PURE__ */ q("div", {
				className: "flex items-center justify-between bg-white px-5 pt-2 pb-2.5 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ K("p", {
					className: "font-bold text-[17px] text-sq-heading",
					children: e
				}), /* @__PURE__ */ K("button", {
					type: "button",
					onClick: t,
					className: "grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty",
					"aria-label": "Закрити",
					"data-testid": "bill-sheet-close",
					children: /* @__PURE__ */ K(h, { size: 20 })
				})]
			}), /* @__PURE__ */ K("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/lib/guestOrders.ts
function rt(e, t = Date.now()) {
	let n = Math.floor((t - new Date(e).getTime()) / 6e4);
	return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function it(e, t = Date.now()) {
	let n = rt(e, t);
	return n < 1 ? "щойно" : `${n} хв тому`;
}
function at(e) {
	let t = e % 100, n = e % 10;
	return t >= 11 && t <= 14 ? `${e} запитів` : n === 1 ? `${e} запит` : n >= 2 && n <= 4 ? `${e} запити` : `${e} запитів`;
}
function ot(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.table_id, (t.get(n.table_id) ?? 0) + 1);
	return t;
}
function st(e, t = /* @__PURE__ */ new Set()) {
	return e.lines.filter((e) => e.problem != null || t.has(e.id)).map((e) => e.id);
}
function ct(e, t = /* @__PURE__ */ new Set()) {
	let n = st(e, t).length;
	return n === 0 ? "Прийняти" : n >= e.lines.length ? null : n === 1 ? "Прийняти без цієї" : "Прийняти без них";
}
function lt(e) {
	let t = e?.response?.data, n = Number(t?.item_id);
	return Number.isInteger(n) && n > 0 ? n : null;
}
var ut = [
	"Цієї страви вже немає",
	"Кухня зараз не приймає — підійдіть до офіціанта",
	"Підійде офіціант і прийме замовлення"
], dt = 1e4;
function ft(e, t, n = dt) {
	let r = U(e);
	r.current = e, V(() => {
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
//#region src/modules/tables/components/GuestOrdersPanel.tsx
function pt({ orders: e, showTable: t, busy: n, onAccept: r, onReject: i }) {
	let [a, o] = W({}), [s, c] = W(null), [l, d] = W(() => Date.now());
	ft(() => d(Date.now()), e.length > 0, 15e3);
	let f = U(/* @__PURE__ */ new Map());
	if (V(() => {
		s != null && f.current.get(s)?.scrollIntoView?.({ block: "nearest" });
	}, [s]), e.length === 0) return null;
	async function p(e) {
		let t = a[e.id] ?? [], n = await r(e, st(e, new Set(t)));
		if (!n.ok && n.refusedLineId != null) {
			let t = n.refusedLineId;
			o((n) => ({
				...n,
				[e.id]: [...n[e.id] ?? [], t]
			}));
		}
	}
	async function m(e, t) {
		await i(e, t) && c(null);
	}
	return /* @__PURE__ */ K("div", {
		className: "space-y-2.5",
		"data-testid": "guest-orders-panel",
		children: e.map((e) => {
			let r = new Set(a[e.id] ?? []), i = ct(e, r);
			return /* @__PURE__ */ q("section", {
				ref: (t) => {
					t ? f.current.set(e.id, t) : f.current.delete(e.id);
				},
				className: "rounded-2xl bg-white ring-2 ring-sq-blue px-4 py-3",
				"data-testid": `guest-order-${e.id}`,
				"data-table": e.table_id,
				children: [
					/* @__PURE__ */ q("div", {
						className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
						children: [
							/* @__PURE__ */ K(u, {
								size: 22,
								className: "text-sq-blue"
							}),
							/* @__PURE__ */ K("p", {
								className: "min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading",
								children: t ? `Стіл ${e.table_name}${e.hall_name ? ` · ${e.hall_name}` : ""}` : "Гість просить"
							}),
							/* @__PURE__ */ K("span", {
								className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
								children: it(e.created_at, l)
							})
						]
					}),
					/* @__PURE__ */ K("div", {
						className: "pt-1",
						children: e.lines.map((e) => {
							let t = e.problem != null || r.has(e.id), n = [e.caption, e.note ? `«${e.note}»` : ""].filter(Boolean).join(" · ");
							return /* @__PURE__ */ q("div", {
								className: "flex items-start gap-2.5 py-1.5",
								"data-testid": `guest-line-${e.id}`,
								"data-blocked": t ? "yes" : "no",
								children: [/* @__PURE__ */ q("span", {
									className: "w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}), /* @__PURE__ */ q("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ K("p", {
											className: `text-[15px] ${t ? "text-sq-muted line-through" : "text-sq-text"}`,
											children: e.name
										}),
										n && /* @__PURE__ */ K("p", {
											className: "text-[13px] text-sq-muted",
											children: n
										}),
										t && /* @__PURE__ */ K("p", {
											className: "text-[13px] font-semibold text-sq-danger",
											children: e.problem ?? "не вдалося додати — див. повідомлення вище"
										})
									]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ q("p", {
						className: "pt-1 text-[13px] text-sq-muted",
						children: [e.has_open_bill ? "Додасться до рахунку столу" : "Відкриється рахунок столу", " — на кухню піде після вашого «Прийняти»"]
					}),
					s === e.id ? /* @__PURE__ */ q("div", {
						className: "pt-2.5 space-y-1.5",
						"data-testid": `guest-order-reasons-${e.id}`,
						children: [
							/* @__PURE__ */ K("p", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Що прочитає гість:"
							}),
							ut.map((t, r) => /* @__PURE__ */ K("button", {
								type: "button",
								className: mt,
								"data-testid": `guest-order-reason-${e.id}-${r}`,
								disabled: n,
								onClick: () => void m(e, t),
								children: t
							}, t)),
							/* @__PURE__ */ q("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ K("button", {
									type: "button",
									className: `${mt} flex-1`,
									"data-testid": `guest-order-reason-none-${e.id}`,
									disabled: n,
									onClick: () => void m(e, null),
									children: "Без причини"
								}), /* @__PURE__ */ K("button", {
									type: "button",
									className: `${mt} flex-1 text-sq-blue`,
									onClick: () => c(null),
									children: "Назад"
								})]
							})
						]
					}) : /* @__PURE__ */ q("div", {
						className: "flex gap-2.5 pt-2.5",
						children: [/* @__PURE__ */ K("button", {
							type: "button",
							className: "min-h-[48px] w-14 shrink-0 rounded-xl bg-white ring-1 ring-sq-divider text-sq-danger grid place-items-center disabled:opacity-40",
							"aria-label": "Відхилити",
							"data-testid": `guest-order-reject-${e.id}`,
							disabled: n,
							onClick: () => c(e.id),
							children: /* @__PURE__ */ K(h, { size: 22 })
						}), i == null ? /* @__PURE__ */ K("p", {
							className: "flex-1 self-center text-[13px] text-sq-muted",
							"data-testid": `guest-order-none-${e.id}`,
							children: "Жодну страву зараз не прийняти — відхиліть запит"
						}) : /* @__PURE__ */ K("button", {
							type: "button",
							className: "pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]",
							"data-testid": `guest-order-accept-${e.id}`,
							disabled: n,
							onClick: () => void p(e),
							children: i
						})]
					})
				]
			}, e.id);
		})
	});
}
var mt = "w-full min-h-[44px] rounded-xl bg-white ring-1 ring-sq-divider px-3 text-left text-[15px] text-sq-text disabled:opacity-40";
//#endregion
//#region src/modules/tables/lib/menu.ts
function ht(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function gt(e, t = ht()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/tables/components/MenuCatalog.tsx
function _t({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = fe(), c = pe(), l = be(), [u, d] = W(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	V(() => {
		i > 0 && s.refresh();
	}, [i]), V(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = Q(e);
		if (t || oe(e, n)) {
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
	let h = !s.loading && s.folderTiles.length === 0 && s.grouped.length === 0;
	return /* @__PURE__ */ q("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ K(Me, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ q("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ q("div", {
					className: "relative",
					children: [/* @__PURE__ */ K(C, {
						size: 20,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ K("input", {
						className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ K(je, {
					tags: s.catalogBarTags,
					activeId: s.catalogBarActiveId,
					showBack: s.showBack,
					backLabel: s.backLabel,
					onSelect: s.selectCatalogBarTag,
					onBack: s.goBackOne
				})]
			}),
			/* @__PURE__ */ q("div", {
				ref: l,
				className: "flex-1 select-none overflow-auto bg-white p-3",
				children: [
					s.loading && s.grouped.length === 0 && /* @__PURE__ */ K("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ q("div", {
						className: "grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5",
						children: [s.folderTiles.map((e) => /* @__PURE__ */ K("div", {
							"data-testid": `menu-folder-${e.id}`,
							children: /* @__PURE__ */ K(Ae, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = Q(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = gt(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ K(we, {
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
					h && /* @__PURE__ */ K("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ K(Re, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: X(Q(u.variants)),
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
function vt(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function yt(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function bt(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + yt(n) : e, 0);
}
function xt(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function St(e) {
	return e.status !== "open" || vt(e).length === 0;
}
//#endregion
//#region src/modules/tables/components/PaySheet.tsx
var Ct = [{
	id: "cash",
	label: "Готівка",
	glyph: s
}, {
	id: "card",
	label: "Картка",
	glyph: o
}];
function wt({ bill: e, busy: t, onClose: n, onPay: r }) {
	let a = H(() => vt(e), [e]), [o, s] = W(() => new Set(a.map(({ line: e }) => e.id))), [c, l] = W(1), [u, d] = W("card"), f = bt(a, o), p = o.size === a.length, m = xt(f, c);
	function h(e) {
		s((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	function _() {
		f <= 0 || r([{
			...p ? {} : { line_ids: [...o] },
			payments: m.map((e) => ({
				method: u,
				amount_cents: e
			}))
		}]);
	}
	let v = a.filter(({ line: e }) => o.has(e.id)).length;
	return /* @__PURE__ */ q("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [/* @__PURE__ */ q("header", {
			className: "flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]",
			children: [/* @__PURE__ */ q("button", {
				type: "button",
				className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
				onClick: n,
				"data-testid": "pay-close",
				children: [
					/* @__PURE__ */ K(i, { size: 20 }),
					"Стіл ",
					e.table_name
				]
			}), /* @__PURE__ */ q("p", {
				className: "flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24",
				children: ["Оплата · стіл ", e.table_name]
			})]
		}), /* @__PURE__ */ q("div", {
			className: "flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-6 flex flex-col md:flex-row gap-4 md:gap-5",
			children: [/* @__PURE__ */ q("section", {
				className: "md:flex-1 min-w-0 rounded-card bg-white shadow-card px-5 py-4 flex flex-col md:min-h-0",
				children: [/* @__PURE__ */ q("div", {
					className: "flex items-center justify-between pb-2 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
					children: [/* @__PURE__ */ K("p", {
						className: "text-[15px] font-bold text-sq-blue",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ K("button", {
						type: "button",
						className: "min-h-9 text-[15px] font-semibold text-sq-blue",
						"data-testid": "pay-select-all",
						onClick: () => s(p ? /* @__PURE__ */ new Set() : new Set(a.map(({ line: e }) => e.id))),
						children: p ? "Зняти все" : "Обрати все"
					})]
				}), /* @__PURE__ */ K("div", {
					className: "md:flex-1 md:min-h-0 md:overflow-auto",
					children: a.map(({ line: e, round: n }) => {
						let r = o.has(e.id);
						return /* @__PURE__ */ q("button", {
							type: "button",
							"data-testid": `pay-line-${e.id}`,
							"aria-pressed": r,
							disabled: t,
							onClick: () => h(e.id),
							className: "flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ K("span", {
									"aria-hidden": !0,
									className: `w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${r ? "bg-sq-blue text-white" : "ring-2 ring-inset ring-sq-divider"}`,
									children: r && /* @__PURE__ */ K(g, { size: 16 })
								}),
								/* @__PURE__ */ q("span", {
									className: "min-w-0 flex-1 py-1.5",
									children: [/* @__PURE__ */ q("span", {
										className: `block truncate text-base ${r ? "text-sq-text" : "text-sq-secondary"}`,
										children: [e.quantity > 1 && /* @__PURE__ */ q("span", {
											className: "tabular-nums",
											children: [e.quantity, "× "]
										}), Je(e, !0)]
									}), /* @__PURE__ */ q("span", {
										className: "block text-[13px] text-sq-muted",
										children: ["раунд ", n.seq]
									})]
								}),
								/* @__PURE__ */ K("span", {
									className: `shrink-0 text-base tabular-nums ${r ? "text-sq-text" : "text-sq-muted"}`,
									children: Z(yt(e))
								})
							]
						}, e.id);
					})
				})]
			}), /* @__PURE__ */ q("section", {
				className: "md:w-[420px] md:shrink-0 flex flex-col gap-3.5",
				children: [
					/* @__PURE__ */ q("div", {
						className: "rounded-card bg-white shadow-card px-5 py-[18px] flex flex-col gap-2.5",
						children: [
							/* @__PURE__ */ q("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								children: [/* @__PURE__ */ q("span", { children: [
									"Вибрано ",
									v,
									" з ",
									a.length
								] }), /* @__PURE__ */ K("span", {
									className: "tabular-nums",
									children: Z(f)
								})]
							}),
							/* @__PURE__ */ q("div", {
								className: "flex items-center justify-between py-2 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]",
								children: [/* @__PURE__ */ q("span", {
									className: "flex items-center gap-2.5 text-base text-sq-text",
									children: [/* @__PURE__ */ K(S, { size: 24 }), "Порівну на"]
								}), /* @__PURE__ */ q("div", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ K("button", {
											type: "button",
											"aria-label": "Менше",
											className: Tt,
											"data-testid": "pay-ways-less",
											disabled: t || c <= 1,
											onClick: () => l((e) => Math.max(1, e - 1)),
											children: /* @__PURE__ */ K(x, { size: 20 })
										}),
										/* @__PURE__ */ K("span", {
											className: "w-11 text-center text-[17px] font-semibold tabular-nums",
											"data-testid": "pay-ways",
											children: c
										}),
										/* @__PURE__ */ K("button", {
											type: "button",
											"aria-label": "Більше",
											className: Tt,
											"data-testid": "pay-ways-more",
											disabled: t || c >= 10,
											onClick: () => l((e) => Math.min(10, e + 1)),
											children: /* @__PURE__ */ K(I, { size: 20 })
										})
									]
								})]
							}),
							c > 1 && /* @__PURE__ */ q("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								"data-testid": "pay-shares",
								children: [
									m.map((e) => Z(e)).join(" + "),
									" — один чек, ",
									c,
									" оплат"
								]
							}),
							/* @__PURE__ */ q("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ K("span", {
									className: "text-lg font-bold text-sq-heading",
									children: "До сплати"
								}), /* @__PURE__ */ K("span", {
									className: "text-[30px] font-bold text-sq-heading tabular-nums",
									children: Z(f)
								})]
							})
						]
					}),
					/* @__PURE__ */ K("div", {
						className: "flex gap-2.5",
						children: Ct.map((e) => {
							let t = u === e.id, n = e.glyph;
							return /* @__PURE__ */ q("button", {
								type: "button",
								"data-testid": `pay-method-${e.id}`,
								"aria-pressed": t,
								onClick: () => d(e.id),
								className: `flex-1 min-h-16 rounded-[14px] bg-white inline-flex items-center justify-center gap-2.5 text-base font-semibold text-sq-text ${t ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider"}`,
								children: [/* @__PURE__ */ K(n, { size: 24 }), e.label]
							}, e.id);
						})
					}),
					/* @__PURE__ */ K("div", { className: "flex-1" }),
					/* @__PURE__ */ q("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[60px] rounded-xl text-lg",
						"data-testid": "pay-submit",
						disabled: t || f <= 0,
						onClick: _,
						children: [
							"Оплатити ",
							Z(f),
							p ? "" : " (частина)"
						]
					})
				]
			})]
		})]
	});
}
var Tt = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
//#endregion
//#region src/modules/tables/lib/draft.ts
function Et(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = ce(Q([n]), r);
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
function Dt(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return Y(e.variant_id, t, e.note);
}
function Ot(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: Dt(e),
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
function kt(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? At(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function At(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function jt(e) {
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
function Mt(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function Nt(e, t = /* @__PURE__ */ new Date()) {
	let n = vt(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: yt(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: Mt(e.opened_at, t),
		printed_at: Mt(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0)
	};
}
//#endregion
//#region src/modules/tables/lib/useBill.ts
function Pt() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function Ft(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = W(null), [o, s] = W(!0), [c, l] = W(null), [u, d] = W(null), [f, p] = W(!1), [m, h] = W([]), [g, _] = W(0), [v, y] = W(!1), [b, x] = W(null), S = U(!0), C = U([]), w = U(!1), T = U(!1), E = U(0);
	V(() => (S.current = !0, () => {
		S.current = !1;
	}), []);
	let O = B(async () => {
		if (!n || r == null) return !1;
		let t = await L(r, e);
		return !t || !S.current ? !1 : (a(t.bill), y(!0), x(t.savedAt), s(!1), !0);
	}, [
		e,
		n,
		r
	]), k = B(async () => {
		if (!t) {
			let e = await O();
			S.current && !e && s(!1);
			return;
		}
		try {
			let t = await D(e);
			if (!S.current) return;
			a(t), l(null), y(!1), x(null), n && r != null && A(r, t);
		} catch (e) {
			if (!S.current) return;
			let t = await O();
			S.current && !t && l(R(e, "Не вдалося прочитати рахунок"));
		} finally {
			S.current && s(!1);
		}
	}, [
		e,
		t,
		O,
		n,
		r
	]);
	V(() => {
		k();
	}, [k]), ft(B(async () => {
		let i = () => w.current || C.current.length > 0;
		if (!t || i()) return;
		let o = E.current;
		try {
			let t = await D(e);
			if (!S.current || o !== E.current || i()) return;
			a((e) => e != null && JSON.stringify(e) === JSON.stringify(t) ? e : t), l(null), y(!1), x(null), n && r != null && A(r, t);
		} catch {}
	}, [
		e,
		t,
		n,
		r
	]), t);
	let j = B(async () => {
		if (w.current) return;
		w.current = !0;
		let e = !1;
		try {
			for (; C.current.length > 0;) {
				let t = C.current.shift();
				t.kind === "blocking" && (T.current = !0, p(!0));
				try {
					let e = await t.write();
					E.current += 1, S.current && (a(e), y(!1), x(null), t.kind === "blocking" && t.stock && _((e) => e + 1)), n && r != null && A(r, e), t.kind === "blocking" && t.resolve(!0);
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
	]), M = B((n) => {
		if (!t) {
			d("Потрібна мережа");
			return;
		}
		d(null);
		let r = Pt(), i = Et(n, r);
		h((e) => [...e, i]), C.current.push({
			kind: "add",
			token: r,
			write: () => F(e, {
				variant_id: i.variant_id,
				quantity: i.quantity,
				modifiers: i.modifiers,
				note: i.note
			})
		}), j();
	}, [
		e,
		t,
		j
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
		clearBanner: B(() => d(null), []),
		notice: B((e) => d(e), []),
		reload: k,
		addLine: M,
		run: B((e, n = {}) => T.current ? Promise.resolve(!1) : t ? (d(null), new Promise((t) => {
			C.current.push({
				kind: "blocking",
				stock: n.stock === !0,
				write: e,
				resolve: t
			}), j();
		})) : (d("Потрібна мережа"), Promise.resolve(!1)), [t, j])
	};
}
//#endregion
//#region src/modules/tables/lib/useGuestOrders.ts
function It({ online: e, tableId: t = null }) {
	let [n, r] = W([]), i = U(!0);
	V(() => (i.current = !0, () => {
		i.current = !1;
	}), []);
	let a = B(async () => {
		if (e) try {
			let e = await O(t ?? void 0);
			if (!i.current) return;
			let n = Array.isArray(e?.orders) ? e.orders : [];
			r((e) => JSON.stringify(e) === JSON.stringify(n) ? e : n);
		} catch {}
	}, [e, t]);
	return V(() => {
		if (!e) {
			r([]);
			return;
		}
		a();
	}, [e, a]), ft(a, e), {
		orders: n,
		refresh: a
	};
}
//#endregion
//#region src/modules/tables/lib/useIsWide.ts
var Lt = "(min-width: 1024px)";
function Rt() {
	let [e, t] = W(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(Lt).matches);
	return V(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(Lt), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
//#endregion
//#region src/modules/tables/pages/BillPage.tsx
function zt() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function Bt() {
	let { billId: e } = ve(), t = Number(e), n = ue((e) => e.online), r = de(), a = le((e) => e.auth?.store.id ?? null), { bill: o, loading: s, error: c, banner: l, busy: u, pending: d, epoch: f, stale: p, savedAt: m, clearBanner: h, notice: g, reload: y, addLine: b, run: x } = Ft(t, {
		online: n,
		mirrored: r !== "web",
		storeId: a
	}), S = Rt(), C = pe().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [D, O] = W(!1), [A, j] = W(!1), [P, F] = W(null), [I, L] = W(null), [re, z] = W(!1), B = _e(), U = ge(), { orders: G, refresh: J } = It({
		online: n && o != null,
		tableId: o?.table_id ?? null
	}), Y = U.state?.notice;
	V(() => {
		typeof Y == "string" && Y && g(Y);
	}, [Y, g]);
	let X = H(() => o ? Ot(o.draft, d) : [], [o, d]), Z = H(() => jt(X), [X]), Q = H(() => o ? vt(o) : [], [o]), [oe, ce] = W([]), fe = H(() => kt(X, oe), [X, oe]);
	if (!n && !p && !s) return /* @__PURE__ */ K("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ q("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ K("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ K("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (s) return /* @__PURE__ */ K("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (c || !o) return /* @__PURE__ */ K("div", {
		className: "p-4",
		children: /* @__PURE__ */ q("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ K("p", {
				className: "text-sm",
				children: c ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ K("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void y(),
				children: "Повторити"
			})]
		})
	});
	let me = async (e) => {
		let t = !1;
		await x(async () => {
			let n = await k(o.id, e);
			return t = St(n.bill), n.bill;
		}, { stock: !0 }) && (j(!1), t && B("/tables"));
	}, he = async () => {
		if (L(null), await x(() => N(o.id)) && r === "cashier") try {
			let [e, t] = await Promise.all([ae("receiptPrinterName"), ae("receiptPaperWidthMm")]);
			if (!e) return;
			await se(e, Nt(o), t === 58 || t === 80 ? t : ie), L("Передчек надіслано на друк");
		} catch (e) {
			L(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, ye = () => {
		O(!1), x(() => te(o.id, zt()), { stock: !0 });
	}, be = (e) => {
		if (e.id == null) return;
		let t = e.id;
		x(() => e.quantity > 1 ? E(o.id, t, e.quantity - 1) : ne(o.id, t));
	}, xe = (e) => {
		if (e.id == null) return;
		let t = e.id;
		x(() => E(o.id, t, e.quantity + 1));
	}, Se = (e) => {
		if (e.id == null) return;
		let t = oe.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		if (!t) {
			g("Страви вже немає в меню — зніміть рядок і додайте іншу");
			return;
		}
		F({
			row: e,
			variants: [...t[1]]
		});
	}, $ = (e, t, n) => {
		let r = P?.row.id;
		F(null), r != null && x(() => _(o.id, r, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, Ce = async (e, t) => {
		let n = {
			warning: null,
			refused: null
		}, r = await x(async () => {
			try {
				let r = await T(e.id, t);
				return n.warning = r.warning, r.bill;
			} catch (e) {
				throw n.refused = lt(e), e;
			}
		}, { stock: !0 });
		return J(), r && n.warning && g(n.warning), {
			ok: r,
			refusedLineId: n.refused
		};
	}, we = async (e, t) => {
		if (!n) return g("Потрібна мережа"), !1;
		z(!0), h();
		try {
			return await w(e.id, t ?? void 0), J(), !0;
		} catch (e) {
			return g(R(e, "Не вдалося відхилити запит")), J(), !1;
		} finally {
			z(!1);
		}
	}, Te = /* @__PURE__ */ K(Ze, {
		bill: o,
		draft: X,
		summary: Z,
		owedCents: o.fired_total_cents,
		busy: u,
		online: n,
		hasPending: d.length > 0,
		canPay: Q.length > 0,
		canPrecheck: Q.length > 0,
		printStatus: I,
		onLess: be,
		onMore: xe,
		onEdit: Se,
		onCancelRound: (e) => void x(() => ee(o.id, e), { stock: !0 }),
		onFire: ye,
		onPay: () => {
			O(!1), j(!0);
		},
		onPrecheck: () => void he()
	});
	return /* @__PURE__ */ q("div", {
		className: "relative flex h-full min-h-0 flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ q("header", {
				className: "flex shrink-0 items-center gap-3.5 px-4 md:px-6 min-h-[68px] py-2 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ q("button", {
					type: "button",
					className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
					onClick: () => B("/tables"),
					children: [/* @__PURE__ */ K(i, { size: 20 }), o.hall_name || "Зала"]
				}), /* @__PURE__ */ q("div", {
					className: `min-w-0 flex-1 ${S ? "" : "text-center pr-16"}`,
					children: [/* @__PURE__ */ q("p", {
						className: "truncate text-xl font-bold text-sq-heading",
						children: ["Стіл ", o.table_name]
					}), /* @__PURE__ */ q("p", {
						className: "truncate text-[13px] text-sq-muted",
						children: [
							v(o.guests),
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
			p && /* @__PURE__ */ q("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					m == null ? "" : `, станом на ${String(new Date(m).getHours()).padStart(2, "0")}:${String(new Date(m).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			l && /* @__PURE__ */ q("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					l,
					" ",
					/* @__PURE__ */ K("button", {
						type: "button",
						className: "sq-link",
						onClick: h,
						children: "Зрозуміло"
					})
				]
			}),
			G.length > 0 && /* @__PURE__ */ K("section", {
				className: "mx-4 md:mx-6 mt-2 max-h-[40vh] shrink-0 overflow-auto",
				"data-testid": "bill-requests",
				children: /* @__PURE__ */ K(pt, {
					orders: G,
					showTable: !1,
					busy: u || re,
					onAccept: Ce,
					onReject: we
				})
			}),
			/* @__PURE__ */ q("div", {
				className: `min-h-0 flex-1 ${S ? "grid grid-cols-[minmax(0,1fr)_372px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ K(_t, {
					counts: fe,
					online: n,
					active: n && !A && !D && !P,
					canScan: r === "cashier",
					epoch: f,
					onAdd: b,
					onRows: ce
				}), S && /* @__PURE__ */ K("aside", {
					className: "flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]",
					children: Te
				})]
			}),
			!S && /* @__PURE__ */ K(Xe, {
				draft: X,
				rounds: o.rounds,
				summary: Z,
				owedCents: o.fired_total_cents,
				hasPending: d.length > 0,
				busy: u,
				online: n,
				onOpen: () => O(!0),
				onFire: ye
			}),
			!S && D && /* @__PURE__ */ K(nt, {
				title: `Стіл ${o.table_name} · рахунок ${o.bill_no}`,
				onClose: () => O(!1),
				children: Te
			}),
			A && /* @__PURE__ */ K(wt, {
				bill: o,
				busy: u,
				onClose: () => j(!1),
				onPay: (e) => void me(e)
			}),
			P && /* @__PURE__ */ K("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ K(Re, {
					productName: P.row.product_name,
					variants: P.variants,
					variantLabel: C,
					initialVariantId: P.row.variant_id,
					initialModifierIds: P.row.modifierIds,
					initialNote: P.row.note,
					submitLabel: "Зберегти",
					withQuantity: !1,
					onAdd: ({ item: e, modifiers: t, note: n }) => $(e, t, n),
					onClose: () => F(null)
				})
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/TableTile.tsx
var Vt = {
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
}, Ht = {
	free: "Вільний",
	mine: "Мій стіл",
	busy: "Зайнятий",
	bill: "Просять рахунок"
};
function Ut({ seat: t, now: r, meId: i, onOpen: a, disabled: o, guestWaiting: s = 0 }) {
	let { table: c, bill: p } = t, m = d(p, i), h = n(p), g = c.shape === "round";
	return /* @__PURE__ */ q("button", {
		type: "button",
		"data-testid": `table-tile-${c.id}`,
		"data-tone": m,
		"data-kitchen": h ?? void 0,
		"data-guest": s > 0 ? s : void 0,
		disabled: o,
		onClick: () => a(t),
		style: {
			gridColumn: `${c.pos_x + 1} / span ${c.width}`,
			gridRow: `${c.pos_y + 1} / span ${c.height}`
		},
		className: `relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${g ? "rounded-full" : "rounded-card"} ${Vt[m].tile}`,
		children: [
			Vt[m].dot && /* @__PURE__ */ K("span", {
				"aria-hidden": !0,
				className: `absolute top-3 w-2.5 h-2.5 rounded-full ${g ? "right-[18%]" : "right-3.5"} ${Vt[m].dot}`
			}),
			(h || s > 0 || p && p.draft_count > 0) && /* @__PURE__ */ q("span", {
				className: `absolute top-2.5 flex items-center gap-1 ${g ? "left-[16%]" : "left-3"}`,
				children: [
					s > 0 && /* @__PURE__ */ q("span", {
						"data-testid": `table-guest-${c.id}`,
						title: "Гість надіслав запит із телефону",
						className: "h-5 px-1.5 rounded-md bg-sq-blue text-white text-[11px] font-semibold inline-flex items-center gap-1 animate-pulse",
						children: [
							/* @__PURE__ */ K(u, {
								size: 13,
								"aria-hidden": !0
							}),
							s > 1 ? s : null,
							/* @__PURE__ */ K("span", {
								className: "sr-only",
								children: s > 1 ? `Запитів гостей: ${s}` : "Запит гостя"
							})
						]
					}),
					h && /* @__PURE__ */ K("span", {
						className: `h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${h === "ready" ? "bg-sq-success text-white" : "bg-sq-warning/15 text-[#B35F0C]"}`,
						children: h === "ready" ? "готово" : "готується"
					}),
					p && p.draft_count > 0 && /* @__PURE__ */ K("span", {
						"data-testid": `table-draft-${c.id}`,
						title: "Не відправлено на кухню",
						className: "text-sq-blue",
						children: /* @__PURE__ */ K(l, {
							size: 16,
							"aria-label": "Не відправлено на кухню"
						})
					})
				]
			}),
			/* @__PURE__ */ K("span", {
				className: "text-[30px] font-bold leading-none text-sq-heading tabular-nums",
				children: c.name
			}),
			p ? /* @__PURE__ */ q(G, { children: [
				m === "bill" ? /* @__PURE__ */ K("span", {
					className: "text-[13px] font-semibold text-sq-danger",
					"data-testid": `table-precheck-${c.id}`,
					children: "Просять рахунок"
				}) : /* @__PURE__ */ q("span", {
					className: "text-[13px] font-semibold text-sq-text tabular-nums",
					children: [
						f(p.fired_total_cents),
						" · ",
						M(p.opened_at, r)
					]
				}),
				/* @__PURE__ */ q("span", {
					className: "text-xs text-sq-muted truncate max-w-full",
					children: [v(p.guests), p.opened_by_name ? ` · ${p.opened_by_name}` : ""]
				}),
				/* @__PURE__ */ K("span", {
					className: "sr-only",
					children: Ht[m]
				})
			] }) : /* @__PURE__ */ K("span", {
				className: "text-[13px] text-sq-muted",
				children: e(c.seats)
			})
		]
	});
}
function Wt({ guest: e = !1 }) {
	let t = {
		free: "bg-sq-divider",
		mine: "bg-sq-blue",
		busy: "bg-[#F8C00F]",
		bill: "bg-sq-danger"
	};
	return /* @__PURE__ */ q("div", {
		className: "flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary",
		"data-testid": "tables-legend",
		children: [Object.keys(t).map((e) => /* @__PURE__ */ q("span", {
			className: "flex items-center gap-1.5",
			children: [/* @__PURE__ */ K("span", {
				"aria-hidden": !0,
				className: `w-2.5 h-2.5 rounded-full ${t[e]}`
			}), Ht[e]]
		}, e)), e && /* @__PURE__ */ q("span", {
			className: "flex items-center gap-1.5",
			children: [/* @__PURE__ */ K(u, {
				size: 14,
				className: "text-sq-blue",
				"aria-hidden": !0
			}), "Запит гостя"]
		})]
	});
}
//#endregion
//#region src/modules/tables/pages/HallMapPage.tsx
function Gt(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function Kt() {
	let e = ue((e) => e.online), t = de(), n = le((e) => e.auth?.store.id ?? null), i = le((e) => e.auth?.staff.id ?? null), { halls: a, bills: o, now: s, loading: c, error: l, stale: d, savedAt: f, refresh: p } = P({
		online: e,
		mirrored: t !== "web",
		storeId: n
	}), { orders: h, refresh: g } = It({ online: e }), [_, v] = W(null), [y, b] = W(!1), [x, S] = W(null), [C, E] = W(null), D = _e(), O = H(() => ot(h), [h]);
	V(() => {
		if (C == null) return;
		let e = setTimeout(() => E(null), 8e3);
		return () => clearTimeout(e);
	}, [C]);
	let k = H(() => m(a, o), [a, o]), A = k.find((e) => e.id === _) ?? k[0] ?? null, M = H(() => A ? j(A, o) : [], [A, o]), N = H(() => r(M), [M]);
	async function F(t) {
		if (!y) {
			if (!e) {
				S("Потрібна мережа, щоб відкрити стіл");
				return;
			}
			b(!0), S(null);
			try {
				let e = await re(t.table.id);
				D(`/tables/${e.bill.id}`);
			} catch (e) {
				S(R(e, "Не вдалося відкрити стіл")), p();
			} finally {
				b(!1);
			}
		}
	}
	async function I(t, n) {
		if (y) return { ok: !1 };
		if (!e) return S("Потрібна мережа, щоб прийняти запит"), { ok: !1 };
		b(!0), S(null), E(null);
		try {
			let e = await T(t.id, n);
			return g(), p(), e.warning ? D(`/tables/${e.bill.id}`, { state: { notice: e.warning } }) : E(e.already ? `Стіл ${t.table_name}: запит уже було прийнято` : `Стіл ${t.table_name}: прийнято — замовлення на кухні`), { ok: !0 };
		} catch (e) {
			return S(R(e, "Не вдалося прийняти запит")), g(), {
				ok: !1,
				refusedLineId: lt(e)
			};
		} finally {
			b(!1);
		}
	}
	async function L(t, n) {
		if (y) return !1;
		if (!e) return S("Потрібна мережа, щоб відхилити запит"), !1;
		b(!0), S(null), E(null);
		try {
			return await w(t.id, n ?? void 0), g(), E(`Стіл ${t.table_name}: запит відхилено`), !0;
		} catch (e) {
			return S(R(e, "Не вдалося відхилити запит")), g(), !1;
		} finally {
			b(!1);
		}
	}
	return !e && !d && !c ? /* @__PURE__ */ K("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ q("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ K("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ K("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ q("div", {
		className: "flex h-full min-h-0 flex-col bg-sq-bg",
		"data-testid": "hall-map",
		children: [
			/* @__PURE__ */ q("header", {
				className: "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0",
				children: [
					/* @__PURE__ */ K("h1", {
						className: "text-2xl font-bold text-sq-heading",
						children: "Столи"
					}),
					k.length > 1 && /* @__PURE__ */ K("div", {
						className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full",
						children: k.map((e) => {
							let t = A?.id === e.id, n = e.tables.reduce((e, t) => e + (O.get(t.id) ?? 0), 0);
							return /* @__PURE__ */ q("button", {
								type: "button",
								"aria-pressed": t,
								"data-testid": `hall-tab-${e.id}`,
								onClick: () => v(e.id),
								className: `whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${t ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
								children: [e.name, n > 0 && /* @__PURE__ */ q("span", {
									"data-testid": `hall-tab-guest-${e.id}`,
									className: "ml-1.5 inline-flex items-center gap-0.5 text-sq-blue font-semibold",
									children: [/* @__PURE__ */ K(u, {
										size: 14,
										"aria-hidden": !0
									}), n]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ K("div", { className: "flex-1" }),
					A && /* @__PURE__ */ K(Wt, { guest: h.length > 0 })
				]
			}),
			d && /* @__PURE__ */ q("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", f == null ? "" : `, станом на ${Gt(f)}`]
			}),
			x && /* @__PURE__ */ K("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "tables-banner",
				children: x
			}),
			C && /* @__PURE__ */ K("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-sq-success/10 text-sq-success-ink px-3 py-2 text-sm",
				"data-testid": "tables-note",
				children: C
			}),
			h.length > 0 && /* @__PURE__ */ q("section", {
				className: "mx-4 md:mx-7 mb-3 max-h-[45vh] overflow-auto",
				"data-testid": "tables-requests",
				children: [/* @__PURE__ */ q("p", {
					className: "pb-1.5 text-[13px] font-semibold text-sq-secondary",
					children: ["З телефонів гостей · ", at(h.length)]
				}), /* @__PURE__ */ K(pt, {
					orders: h,
					showTable: !0,
					busy: y,
					onAccept: I,
					onReject: L
				})]
			}),
			c && k.length === 0 && /* @__PURE__ */ K("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!c && l && /* @__PURE__ */ K("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ q("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ K("p", {
						className: "text-sm",
						children: l
					}), /* @__PURE__ */ K("button", {
						type: "button",
						className: "sq-btn-primary mt-3 px-4 py-2.5",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!c && !l && k.length === 0 && /* @__PURE__ */ K("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ q("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ K("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ K("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			A && /* @__PURE__ */ K("div", {
				className: "grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6",
				style: {
					gridTemplateColumns: `repeat(${N.cols}, minmax(2.5rem, 1fr))`,
					gridAutoRows: "minmax(3.75rem, auto)"
				},
				children: M.map((e) => /* @__PURE__ */ K(Ut, {
					seat: e,
					now: s,
					meId: i,
					disabled: y,
					guestWaiting: O.get(e.table.id) ?? 0,
					onOpen: (e) => void F(e)
				}, e.table.id))
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/TablesRoutes.tsx
function qt() {
	return /* @__PURE__ */ q(he, { children: [/* @__PURE__ */ K(me, {
		index: !0,
		element: /* @__PURE__ */ K(Kt, {})
	}), /* @__PURE__ */ K(me, {
		path: ":billId",
		element: /* @__PURE__ */ K(Bt, {})
	})] });
}
//#endregion
export { qt as TablesRoutes };
