import { A as e, B as t, C as n, D as r, E as i, F as a, G as o, H as s, I as c, L as l, M as u, N as d, O as f, P as p, R as m, S as h, T as g, U as _, V as v, W as y, _ as b, a as x, f as S, g as C, h as w, i as T, j as E, k as D, l as O, m as k, n as A, o as ee, q as j, r as M, t as N, u as P, w as F, x as te, y as ne, z as I } from "./useHallMap-CRa5TiH2.js";
import { useCallback as L, useEffect as R, useMemo as z, useRef as B, useState as V } from "react";
import { Fragment as H, jsx as U, jsxs as W } from "react/jsx-runtime";
import { DEFAULT_RECEIPT_PAPER_WIDTH as re, assetUrl as G, cartLineUid as K, defaultModifierIds as ie, formatUah as q, getMeta as ae, groupsOf as J, needsModifierSheet as oe, printPrecheck as se, resolveLineModifiers as ce, useAuthStore as Y, useOfflineStatus as le, usePosShell as ue, useSalesCatalog as de, useVertical as fe } from "@pos/platform";
import { Route as X, Routes as Z, useNavigate as pe, useParams as me } from "react-router-dom";
//#region src/hooks/useDragScroll.ts
var he = 6;
function ge() {
	let e = B(null);
	return R(() => {
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
			!n.moved && Math.hypot(r, i) > he && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var _e = "\xA0";
function ve(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, _e);
}
function Q(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${ve(n)},${r} ₴`;
}
function ye(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${ve(String(Math.abs(e) / 100))} ₴` : Q(e);
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function be({ name: e, subtitle: n, priceCents: r, imageUrl: i, stock: a, onClick: o, disabled: s, count: c, onMore: l, badge: u, testId: d }) {
	let [f, p] = V(!1), m = f ? null : G(i), h = s || !!u || a != null && a <= 0, g = /* @__PURE__ */ W("button", {
		type: "button",
		disabled: s,
		onClick: o,
		"data-testid": d,
		className: `w-full ${l ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${c ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ W("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				m ? /* @__PURE__ */ U("img", {
					src: m,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${h ? "opacity-45" : ""}`,
					onError: () => p(!0)
				}) : /* @__PURE__ */ U("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: n || " "
				}),
				c != null && c > 0 && /* @__PURE__ */ U("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: c
				}),
				u ? /* @__PURE__ */ U("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: u
				}) : a != null && a <= 0 && /* @__PURE__ */ U("span", {
					className: `absolute ${c ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ W("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ U("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${h ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), r != null && /* @__PURE__ */ U("p", {
				className: "text-[14px] text-sq-secondary tabular-nums",
				children: Q(r)
			})]
		})]
	});
	return l ? /* @__PURE__ */ W("div", {
		className: "relative",
		children: [g, !s && /* @__PURE__ */ U("button", {
			type: "button",
			onClick: l,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": d ? `${d}-more` : "tile-more",
			children: /* @__PURE__ */ U("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ U(t, { size: 20 })
			})
		})]
	}) : g;
}
//#endregion
//#region src/lib/tagColors.ts
var xe = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Se = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, Ce = "slate";
function we(e) {
	return !!e && xe.includes(e);
}
function Te(e) {
	return we(e) ? Se[e] : Se[Ce];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function Ee({ name: e, color: t, onClick: n }) {
	let r = Te(t);
	return /* @__PURE__ */ W("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ U("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ U(m, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ W("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ U("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function De({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: o }) {
	let s = ge(), c = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ W("div", {
		ref: s,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ W("button", {
				type: "button",
				onClick: o,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ U(a, { size: 16 }), r]
			}),
			/* @__PURE__ */ U("button", {
				type: "button",
				onClick: () => i(null),
				className: c(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ U("button", {
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
function Oe({ active: e, onScan: t }) {
	let n = B(null);
	return R(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ U("input", {
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
function ke(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function Ae(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function je(e, t) {
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
	for (let e of Ae(t)) {
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
function Me(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function Ne(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function Pe({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: a, submitLabel: o = "Додати в чек", withQuantity: l = !0, notePlaceholder: u = "Коментар для кухні", onAdd: f, onClose: p }) {
	let [m, h] = V(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [g, _] = V(() => i ?? []), [y, b] = V(a ?? ""), [x, S] = V(1), C = ge(), w = t.find((e) => e.variant_id === m) ?? null, T = Ne(t), E = je(T, g), D = w ? w.price_cents + E.deltaCents : null, O = w == null ? `Оберіть «${n}»` : E.error ?? (D != null && D < 0 ? "Ціна не може бути відʼємною" : null), k = O == null && w != null;
	R(() => {
		let e = (e) => {
			e.key === "Escape" && p();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [p]);
	function A(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function ee(e, t) {
		_((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : A(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function M() {
		k && w && f({
			item: w,
			modifiers: E.snapshot.map((e) => e.id),
			note: ke(y),
			quantity: l ? x : 1
		});
	}
	let N = w ? Me(w.label, E.error ? [] : E.names) : "", P = G((w ?? t[0])?.image_url ?? null), F = t.length ? Math.min(...t.map((e) => e.price_cents)) : null, te = [...t].sort((e, t) => e.price_cents - t.price_cents);
	return /* @__PURE__ */ W("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ U("div", {
			"aria-hidden": !0,
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: p,
			"data-testid": "modifier-scrim"
		}), /* @__PURE__ */ W("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]",
			children: [
				/* @__PURE__ */ U("div", {
					"aria-hidden": !0,
					className: "w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0"
				}),
				/* @__PURE__ */ W("div", {
					className: "px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0",
					children: [
						P ? /* @__PURE__ */ U("img", {
							src: P,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ U("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ U(c, { size: 24 })
						}),
						/* @__PURE__ */ W("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ U("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: e
							}), F != null && /* @__PURE__ */ U("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: t.length > 1 ? `від ${Q(F)}` : Q(F)
							})]
						}),
						/* @__PURE__ */ U("button", {
							type: "button",
							onClick: p,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ U(j, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ W("div", {
					ref: C,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						t.length > 1 && /* @__PURE__ */ W("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ U(Le, {
								name: n,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ U("div", {
								className: "flex flex-wrap gap-2",
								children: te.map((e) => {
									let t = e.variant_id === m, n = e.quantity <= 0;
									return /* @__PURE__ */ W("button", {
										type: "button",
										disabled: n,
										"aria-pressed": t,
										onClick: () => h(e.variant_id),
										className: ze(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ U(d, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ U("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : ye(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						T.map((e) => {
							let t = A(e, g), n = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ W("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ U(Le, {
									name: e.name,
									hint: Re(e, n),
									required: e.min_select >= 1
								}), /* @__PURE__ */ U("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let r = g.includes(t.id), i = !r && n;
										return /* @__PURE__ */ W("button", {
											type: "button",
											"aria-pressed": r,
											"aria-disabled": i || void 0,
											onClick: () => ee(e, t),
											className: ze(r, i),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												r && /* @__PURE__ */ U(d, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ U("span", {
													className: r ? "font-medium" : "font-medium text-sq-secondary",
													children: Be(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ W("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ U(v, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ U("input", {
								className: "flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted",
								value: y,
								maxLength: 120,
								placeholder: u,
								"aria-label": u,
								enterKeyHint: "done",
								onChange: (e) => b(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && (e.preventDefault(), M());
								},
								"data-testid": "modifier-note"
							})]
						})
					]
				}),
				/* @__PURE__ */ W("div", {
					className: "shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]",
					children: [
						l && /* @__PURE__ */ W("div", {
							className: "flex items-center gap-1.5",
							"data-testid": "modifier-qty",
							children: [
								/* @__PURE__ */ U("button", {
									type: "button",
									"aria-label": "Менше",
									disabled: x <= 1,
									onClick: () => S((e) => Math.max(1, e - 1)),
									className: Ie,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ U(I, { size: 20 })
								}),
								/* @__PURE__ */ U("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: x
								}),
								/* @__PURE__ */ U("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: x >= Fe,
									onClick: () => S((e) => Math.min(Fe, e + 1)),
									className: Ie,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ U(s, { size: 20 })
								})
							]
						}),
						O ? /* @__PURE__ */ U("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: O
						}) : /* @__PURE__ */ U("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: N
						}),
						/* @__PURE__ */ U("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !k,
							onClick: M,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ W("span", { children: [o, D != null && /* @__PURE__ */ W(H, { children: [" · ", /* @__PURE__ */ U("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: Q(D * x)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var Fe = 99, Ie = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function Le({ name: e, hint: t, required: n }) {
	return /* @__PURE__ */ W("div", {
		className: "flex items-baseline gap-2 mb-2.5",
		children: [/* @__PURE__ */ U("span", {
			className: "text-base font-bold text-sq-heading",
			children: e
		}), t && /* @__PURE__ */ U("span", {
			className: `text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
			children: t
		})]
	});
}
function Re(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function ze(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function Be(e) {
	return e > 0 ? `+${ye(e)}` : e < 0 ? `−${ye(-e)}` : "";
}
//#endregion
//#region src/modules/tables/lib/bill.ts
var Ve = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function He(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function Ue(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function We(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
//#endregion
//#region src/modules/tables/components/BillBar.tsx
var Ge = 2;
function Ke({ draft: e, rounds: t, summary: n, owedCents: r, hasPending: i, busy: a, online: o, onOpen: s, onFire: c }) {
	let l = n.lines > 0, u = [...t].reverse().find((e) => e.cancelled_at == null && e.prep_status !== "served");
	return /* @__PURE__ */ W("div", {
		className: "shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ W("button", {
			type: "button",
			className: "block w-full text-left",
			"data-testid": "bill-bar-open",
			onClick: s,
			children: [
				/* @__PURE__ */ U("span", {
					"aria-hidden": !0,
					className: "block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5"
				}),
				/* @__PURE__ */ W("span", {
					className: "flex items-center gap-2.5 pb-1",
					children: [
						/* @__PURE__ */ U(v, {
							size: 20,
							className: "text-sq-blue shrink-0"
						}),
						/* @__PURE__ */ W("span", {
							className: "flex-1 min-w-0 truncate text-base font-bold text-sq-heading",
							children: [l ? `Чернетка · ${F(n.lines)}` : "Рахунок", i ? " · зберігаємо…" : ""]
						}),
						u && /* @__PURE__ */ W("span", {
							className: "shrink-0 text-sm text-sq-muted",
							children: [
								"Раунд ",
								u.seq,
								" ",
								Ve[u.prep_status]
							]
						})
					]
				}),
				e.slice(0, Ge).map((e) => /* @__PURE__ */ W("span", {
					className: "flex items-start gap-2.5 py-1",
					children: [
						/* @__PURE__ */ W("span", {
							className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
							children: [e.quantity, "×"]
						}),
						/* @__PURE__ */ W("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ U("span", {
								className: "block truncate text-[15px] text-sq-text",
								children: e.product_name
							}), e.modifierNames.length > 0 && /* @__PURE__ */ U("span", {
								className: "block truncate text-[13px] text-sq-muted",
								children: e.modifierNames.join(" · ")
							})]
						}),
						/* @__PURE__ */ U("span", {
							className: "shrink-0 text-[15px] text-sq-text tabular-nums",
							children: e.preview_unit_cents == null ? "—" : q(e.preview_unit_cents * e.quantity)
						})
					]
				}, e.key)),
				e.length > Ge && /* @__PURE__ */ W("span", {
					className: "block py-0.5 text-[13px] text-sq-blue font-semibold",
					children: [
						"ще ",
						e.length - Ge,
						"…"
					]
				})
			]
		}), /* @__PURE__ */ W("div", {
			className: "flex items-center gap-3 pt-2.5 mt-1 shadow-[0_-1px_0_#E6E8EC]",
			children: [/* @__PURE__ */ W("div", {
				className: "flex-1 min-w-0",
				children: [/* @__PURE__ */ U("p", {
					className: "text-[13px] text-sq-secondary",
					children: "До сплати"
				}), /* @__PURE__ */ U("p", {
					className: "text-2xl font-bold text-sq-heading tabular-nums",
					children: q(r)
				})]
			}), /* @__PURE__ */ W("button", {
				type: "button",
				className: "pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2",
				"data-testid": "bill-bar-fire",
				disabled: a || !o || i || !l,
				onClick: c,
				children: [
					/* @__PURE__ */ U(p, { size: 24 }),
					"На кухню",
					l ? ` · ${n.lines}` : ""
				]
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/components/BillPane.tsx
function qe({ bill: e, draft: t, summary: n, owedCents: r, busy: i, online: a, hasPending: o, canPay: c, canPrecheck: l, printStatus: u, onLess: d, onMore: f, onEdit: m, onCancelRound: h, onFire: g, onPay: y, onPrecheck: b }) {
	let x = (e) => /* @__PURE__ */ U(Ze, {
		testId: `bill-line-${e.id}`,
		quantity: e.quantity,
		title: e.product_name,
		sub: [e.variant_label, e.note].filter(Boolean).join(" · "),
		price: q(Ue(e))
	}, e.id);
	return /* @__PURE__ */ W("div", {
		className: "flex h-full min-h-0 flex-col",
		"data-testid": "bill-pane",
		children: [/* @__PURE__ */ W("div", {
			className: "flex-1 overflow-auto px-3.5 pt-3.5 pb-2 space-y-2.5",
			children: [e.rounds.map((e) => {
				let t = e.cancelled_at != null;
				return /* @__PURE__ */ W("section", {
					className: `rounded-2xl bg-white shadow-card px-4 py-3 ${t ? "opacity-60" : ""}`,
					"data-testid": `bill-round-${e.id}`,
					"data-cancelled": t ? "yes" : "no",
					children: [
						/* @__PURE__ */ W("div", {
							className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ U(p, { size: 24 }),
								/* @__PURE__ */ W("p", {
									className: "flex-1 text-[15px] font-bold text-sq-heading",
									children: [
										"Раунд ",
										e.seq,
										!t && /* @__PURE__ */ U("span", {
											className: "ml-2 font-normal text-[13px] text-sq-muted tabular-nums",
											children: q(e.total_cents)
										})
									]
								}),
								/* @__PURE__ */ U("span", {
									className: `text-[13px] font-semibold ${t ? "text-sq-muted" : Ye[e.prep_status]}`,
									children: t ? "скасовано" : e.prep_status === "new" ? `${Ve.new} · ${Xe(e.fired_at)} хв` : Ve[e.prep_status]
								})
							]
						}),
						/* @__PURE__ */ U("div", {
							className: "pt-1",
							children: e.items.map(x)
						}),
						He(e) && /* @__PURE__ */ U("button", {
							type: "button",
							className: "mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: i || !a || o,
							onClick: () => h(e.id),
							children: "Скасувати раунд"
						})
					]
				}, e.id);
			}), /* @__PURE__ */ W("section", {
				className: `rounded-2xl bg-white px-4 py-3 ${t.length > 0 ? "ring-2 ring-sq-blue" : "shadow-card"}`,
				"data-testid": "bill-draft",
				children: [/* @__PURE__ */ W("div", {
					className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
					children: [
						/* @__PURE__ */ U(v, {
							size: 20,
							className: "text-sq-blue"
						}),
						/* @__PURE__ */ U("p", {
							className: "flex-1 text-[15px] font-bold text-sq-heading",
							children: "Чернетка"
						}),
						/* @__PURE__ */ U("span", {
							className: "text-[13px] text-sq-muted",
							children: "ще не на кухні"
						})
					]
				}), t.length === 0 ? /* @__PURE__ */ U("p", {
					className: "py-2 text-sm text-sq-muted",
					children: "Нічого не набрано — тапніть страву в меню"
				}) : /* @__PURE__ */ U("div", {
					className: "pt-1",
					children: t.map((e) => {
						let t = [
							e.variant_label,
							...e.modifierNames,
							e.note
						].filter(Boolean).join(" · "), n = e.id != null && !e.pending;
						return /* @__PURE__ */ W("div", {
							className: `flex items-start gap-2.5 py-1.5 ${e.pending ? "opacity-60" : ""}`,
							"data-testid": e.id == null ? "bill-line-pending" : `bill-line-${e.id}`,
							"data-pending": e.pending ? "yes" : "no",
							children: [
								/* @__PURE__ */ W("span", {
									className: "w-7 pt-0.5 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}),
								/* @__PURE__ */ W("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ W("button", {
										type: "button",
										className: "block w-full text-left",
										"data-testid": e.id == null ? void 0 : `bill-line-edit-${e.id}`,
										disabled: i || !a || !n,
										onClick: () => m(e),
										children: [/* @__PURE__ */ U("span", {
											className: "block text-[15px] text-sq-text truncate",
											children: e.product_name
										}), t && /* @__PURE__ */ U("span", {
											className: "block text-[13px] text-sq-muted truncate",
											children: t
										})]
									}), e.id != null && /* @__PURE__ */ W("div", {
										className: "mt-1.5 flex items-center gap-1.5",
										children: [/* @__PURE__ */ U("button", {
											type: "button",
											"aria-label": "Менше",
											className: Je,
											"data-testid": `bill-less-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => d(e),
											children: /* @__PURE__ */ U(I, { size: 16 })
										}), /* @__PURE__ */ U("button", {
											type: "button",
											"aria-label": "Більше",
											className: Je,
											"data-testid": `bill-more-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => f(e),
											children: /* @__PURE__ */ U(s, { size: 16 })
										})]
									})]
								}),
								/* @__PURE__ */ U("span", {
									className: "shrink-0 pt-0.5 text-[15px] text-sq-text tabular-nums",
									children: e.preview_unit_cents == null ? "—" : q(e.preview_unit_cents * e.quantity)
								})
							]
						}, e.key);
					})
				})]
			})]
		}), /* @__PURE__ */ W("footer", {
			className: "shrink-0 px-4 pt-3.5 pb-4 space-y-2.5 shadow-[0_-1px_0_#E6E8EC]",
			children: [
				t.length > 0 && /* @__PURE__ */ W("div", {
					className: "flex items-baseline justify-between text-sm text-sq-secondary",
					children: [/* @__PURE__ */ U("span", { children: "Чернетка, за сьогоднішніми цінами" }), /* @__PURE__ */ W("span", {
						className: "tabular-nums",
						"data-testid": "bill-draft-total",
						children: [n.exact ? "" : "≈ ", q(n.cents)]
					})]
				}),
				/* @__PURE__ */ W("div", {
					className: "flex items-baseline justify-between",
					children: [/* @__PURE__ */ U("span", {
						className: "text-lg font-bold text-sq-heading",
						children: "До сплати"
					}), /* @__PURE__ */ U("span", {
						className: "text-[26px] font-bold text-sq-heading tabular-nums",
						"data-testid": "bill-owed",
						children: q(r)
					})]
				}),
				/* @__PURE__ */ W("div", {
					className: "flex gap-2.5",
					children: [/* @__PURE__ */ W("button", {
						type: "button",
						className: "flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-40",
						"data-testid": "bill-fire",
						disabled: i || !a || o || t.length === 0,
						onClick: g,
						children: [
							/* @__PURE__ */ U(p, { size: 24 }),
							"На кухню",
							n.lines > 0 ? ` · ${n.lines}` : ""
						]
					}), /* @__PURE__ */ U("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[52px] rounded-xl text-[17px]",
						"data-testid": "bill-pay",
						disabled: i || !a || o || !c || t.length > 0,
						onClick: y,
						children: "Оплатити"
					})]
				}),
				/* @__PURE__ */ W("button", {
					type: "button",
					className: "w-full min-h-9 text-[15px] font-semibold text-sq-blue inline-flex items-center justify-center gap-1.5 disabled:opacity-40",
					"data-testid": "bill-precheck",
					disabled: i || !a || o || !l,
					onClick: b,
					children: [/* @__PURE__ */ U(_, { size: 20 }), e.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"]
				}),
				u && /* @__PURE__ */ U("p", {
					className: "text-xs text-sq-muted text-center",
					"data-testid": "bill-print-status",
					children: u
				})
			]
		})]
	});
}
var Je = "w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40", Ye = {
	new: "text-[#D9730D]",
	ready: "text-sq-success",
	served: "text-sq-muted"
};
function Xe(e) {
	return Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 6e4));
}
function Ze({ testId: e, quantity: t, title: n, sub: r, price: i }) {
	return /* @__PURE__ */ W("div", {
		className: "flex items-start gap-2.5 py-1.5",
		"data-testid": e,
		children: [
			/* @__PURE__ */ W("span", {
				className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
				children: [t, "×"]
			}),
			/* @__PURE__ */ W("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ U("p", {
					className: "text-[15px] text-sq-text truncate",
					children: n
				}), r && /* @__PURE__ */ U("p", {
					className: "text-[13px] text-sq-muted truncate",
					children: r
				})]
			}),
			/* @__PURE__ */ U("span", {
				className: "shrink-0 text-[15px] text-sq-text tabular-nums",
				children: i
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/BillSheet.tsx
function Qe({ title: e, onClose: t, children: n }) {
	return /* @__PURE__ */ W("div", {
		className: "fixed inset-0 z-40",
		"data-testid": "bill-sheet",
		children: [/* @__PURE__ */ U("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			"aria-label": "Закрити",
			onClick: t
		}), /* @__PURE__ */ W("div", {
			className: "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-sq-sidebar shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up overflow-hidden",
			children: [/* @__PURE__ */ W("div", {
				className: "flex items-center justify-between bg-white px-5 pt-2 pb-2.5 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ U("p", {
					className: "font-bold text-[17px] text-sq-heading",
					children: e
				}), /* @__PURE__ */ U("button", {
					type: "button",
					onClick: t,
					className: "grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty",
					"aria-label": "Закрити",
					"data-testid": "bill-sheet-close",
					children: /* @__PURE__ */ U(j, { size: 20 })
				})]
			}), /* @__PURE__ */ U("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/lib/menu.ts
function $e(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function et(e, t = $e()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/tables/components/MenuCatalog.tsx
function tt({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = de(), c = fe(), l = ge(), [u, d] = V(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	R(() => {
		i > 0 && s.refresh();
	}, [i]), R(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = J(e);
		if (t || oe(e, n)) {
			d({
				variants: e,
				initialVariantId: e.length === 1 ? e[0].variant_id : null
			});
			return;
		}
		a({
			item: e[0],
			modifiers: ie(n),
			note: ""
		});
	}
	async function m(e) {
		let t = await s.lookupBarcode(e);
		t.length > 0 && p(t), s.setQuery("");
	}
	let h = !s.loading && s.folderTiles.length === 0 && s.grouped.length === 0;
	return /* @__PURE__ */ W("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ U(Oe, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ W("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ W("div", {
					className: "relative",
					children: [/* @__PURE__ */ U(y, {
						size: 20,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ U("input", {
						className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ U(De, {
					tags: s.catalogBarTags,
					activeId: s.catalogBarActiveId,
					showBack: s.showBack,
					backLabel: s.backLabel,
					onSelect: s.selectCatalogBarTag,
					onBack: s.goBackOne
				})]
			}),
			/* @__PURE__ */ W("div", {
				ref: l,
				className: "flex-1 select-none overflow-auto bg-white p-3",
				children: [
					s.loading && s.grouped.length === 0 && /* @__PURE__ */ U("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ W("div", {
						className: "grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5",
						children: [s.folderTiles.map((e) => /* @__PURE__ */ U("div", {
							"data-testid": `menu-folder-${e.id}`,
							children: /* @__PURE__ */ U(Ee, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = J(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = et(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ U(be, {
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
					h && /* @__PURE__ */ U("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ U(Pe, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: ie(J(u.variants)),
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
function $(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function nt(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function rt(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + nt(n) : e, 0);
}
function it(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function at(e) {
	return e.status !== "open" || $(e).length === 0;
}
//#endregion
//#region src/modules/tables/components/PaySheet.tsx
var ot = [{
	id: "cash",
	label: "Готівка",
	glyph: u
}, {
	id: "card",
	label: "Картка",
	glyph: l
}];
function st({ bill: e, busy: t, onClose: n, onPay: r }) {
	let i = z(() => $(e), [e]), [a, c] = V(() => new Set(i.map(({ line: e }) => e.id))), [l, u] = V(1), [f, p] = V("card"), m = rt(i, a), h = a.size === i.length, g = it(m, l);
	function _(e) {
		c((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	function v() {
		m <= 0 || r([{
			...h ? {} : { line_ids: [...a] },
			payments: g.map((e) => ({
				method: f,
				amount_cents: e
			}))
		}]);
	}
	let y = i.filter(({ line: e }) => a.has(e.id)).length;
	return /* @__PURE__ */ W("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [/* @__PURE__ */ W("header", {
			className: "flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]",
			children: [/* @__PURE__ */ W("button", {
				type: "button",
				className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
				onClick: n,
				"data-testid": "pay-close",
				children: [
					/* @__PURE__ */ U(E, { size: 20 }),
					"Стіл ",
					e.table_name
				]
			}), /* @__PURE__ */ W("p", {
				className: "flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24",
				children: ["Оплата · стіл ", e.table_name]
			})]
		}), /* @__PURE__ */ W("div", {
			className: "flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-6 flex flex-col md:flex-row gap-4 md:gap-5",
			children: [/* @__PURE__ */ W("section", {
				className: "md:flex-1 min-w-0 rounded-card bg-white shadow-card px-5 py-4 flex flex-col md:min-h-0",
				children: [/* @__PURE__ */ W("div", {
					className: "flex items-center justify-between pb-2 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
					children: [/* @__PURE__ */ U("p", {
						className: "text-[15px] font-bold text-sq-blue",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ U("button", {
						type: "button",
						className: "min-h-9 text-[15px] font-semibold text-sq-blue",
						"data-testid": "pay-select-all",
						onClick: () => c(h ? /* @__PURE__ */ new Set() : new Set(i.map(({ line: e }) => e.id))),
						children: h ? "Зняти все" : "Обрати все"
					})]
				}), /* @__PURE__ */ U("div", {
					className: "md:flex-1 md:min-h-0 md:overflow-auto",
					children: i.map(({ line: e, round: n }) => {
						let r = a.has(e.id);
						return /* @__PURE__ */ W("button", {
							type: "button",
							"data-testid": `pay-line-${e.id}`,
							"aria-pressed": r,
							disabled: t,
							onClick: () => _(e.id),
							className: "flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ U("span", {
									"aria-hidden": !0,
									className: `w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${r ? "bg-sq-blue text-white" : "ring-2 ring-inset ring-sq-divider"}`,
									children: r && /* @__PURE__ */ U(d, { size: 16 })
								}),
								/* @__PURE__ */ W("span", {
									className: "min-w-0 flex-1 py-1.5",
									children: [/* @__PURE__ */ W("span", {
										className: `block truncate text-base ${r ? "text-sq-text" : "text-sq-secondary"}`,
										children: [e.quantity > 1 && /* @__PURE__ */ W("span", {
											className: "tabular-nums",
											children: [e.quantity, "× "]
										}), We(e, !0)]
									}), /* @__PURE__ */ W("span", {
										className: "block text-[13px] text-sq-muted",
										children: ["раунд ", n.seq]
									})]
								}),
								/* @__PURE__ */ U("span", {
									className: `shrink-0 text-base tabular-nums ${r ? "text-sq-text" : "text-sq-muted"}`,
									children: q(nt(e))
								})
							]
						}, e.id);
					})
				})]
			}), /* @__PURE__ */ W("section", {
				className: "md:w-[420px] md:shrink-0 flex flex-col gap-3.5",
				children: [
					/* @__PURE__ */ W("div", {
						className: "rounded-card bg-white shadow-card px-5 py-[18px] flex flex-col gap-2.5",
						children: [
							/* @__PURE__ */ W("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								children: [/* @__PURE__ */ W("span", { children: [
									"Вибрано ",
									y,
									" з ",
									i.length
								] }), /* @__PURE__ */ U("span", {
									className: "tabular-nums",
									children: q(m)
								})]
							}),
							/* @__PURE__ */ W("div", {
								className: "flex items-center justify-between py-2 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]",
								children: [/* @__PURE__ */ W("span", {
									className: "flex items-center gap-2.5 text-base text-sq-text",
									children: [/* @__PURE__ */ U(o, { size: 24 }), "Порівну на"]
								}), /* @__PURE__ */ W("div", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ U("button", {
											type: "button",
											"aria-label": "Менше",
											className: ct,
											"data-testid": "pay-ways-less",
											disabled: t || l <= 1,
											onClick: () => u((e) => Math.max(1, e - 1)),
											children: /* @__PURE__ */ U(I, { size: 20 })
										}),
										/* @__PURE__ */ U("span", {
											className: "w-11 text-center text-[17px] font-semibold tabular-nums",
											"data-testid": "pay-ways",
											children: l
										}),
										/* @__PURE__ */ U("button", {
											type: "button",
											"aria-label": "Більше",
											className: ct,
											"data-testid": "pay-ways-more",
											disabled: t || l >= 10,
											onClick: () => u((e) => Math.min(10, e + 1)),
											children: /* @__PURE__ */ U(s, { size: 20 })
										})
									]
								})]
							}),
							l > 1 && /* @__PURE__ */ W("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								"data-testid": "pay-shares",
								children: [
									g.map((e) => q(e)).join(" + "),
									" — один чек, ",
									l,
									" оплат"
								]
							}),
							/* @__PURE__ */ W("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ U("span", {
									className: "text-lg font-bold text-sq-heading",
									children: "До сплати"
								}), /* @__PURE__ */ U("span", {
									className: "text-[30px] font-bold text-sq-heading tabular-nums",
									children: q(m)
								})]
							})
						]
					}),
					/* @__PURE__ */ U("div", {
						className: "flex gap-2.5",
						children: ot.map((e) => {
							let t = f === e.id, n = e.glyph;
							return /* @__PURE__ */ W("button", {
								type: "button",
								"data-testid": `pay-method-${e.id}`,
								"aria-pressed": t,
								onClick: () => p(e.id),
								className: `flex-1 min-h-16 rounded-[14px] bg-white inline-flex items-center justify-center gap-2.5 text-base font-semibold text-sq-text ${t ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider"}`,
								children: [/* @__PURE__ */ U(n, { size: 24 }), e.label]
							}, e.id);
						})
					}),
					/* @__PURE__ */ U("div", { className: "flex-1" }),
					/* @__PURE__ */ W("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[60px] rounded-xl text-lg",
						"data-testid": "pay-submit",
						disabled: t || m <= 0,
						onClick: v,
						children: [
							"Оплатити ",
							q(m),
							h ? "" : " (частина)"
						]
					})
				]
			})]
		})]
	});
}
var ct = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
//#endregion
//#region src/modules/tables/lib/draft.ts
function lt(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = ce(J([n]), r);
	return {
		token: t,
		uid: K(n.variant_id, r, i),
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
function ut(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return K(e.variant_id, t, e.note);
}
function dt(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: ut(e),
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
function ft(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? pt(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function pt(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function mt(e) {
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
function ht(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function gt(e, t = /* @__PURE__ */ new Date()) {
	let n = $(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: nt(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: ht(e.opened_at, t),
		printed_at: ht(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0)
	};
}
//#endregion
//#region src/modules/tables/lib/useBill.ts
function _t() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function vt(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = V(null), [o, s] = V(!0), [c, l] = V(null), [u, d] = V(null), [f, p] = V(!1), [m, h] = V([]), [g, _] = V(0), [v, y] = V(!1), [b, S] = V(null), C = B(!0), w = B([]), E = B(!1), D = B(!1);
	R(() => (C.current = !0, () => {
		C.current = !1;
	}), []);
	let O = L(async () => {
		if (!n || r == null) return !1;
		let t = await M(r, e);
		return !t || !C.current ? !1 : (a(t.bill), y(!0), S(t.savedAt), s(!1), !0);
	}, [
		e,
		n,
		r
	]), k = L(async () => {
		if (!t) {
			let e = await O();
			C.current && !e && s(!1);
			return;
		}
		try {
			let t = await P(e);
			if (!C.current) return;
			a(t), l(null), y(!1), S(null), n && r != null && T(r, t);
		} catch (e) {
			if (!C.current) return;
			let t = await O();
			C.current && !t && l(N(e, "Не вдалося прочитати рахунок"));
		} finally {
			C.current && s(!1);
		}
	}, [
		e,
		t,
		O,
		n,
		r
	]);
	R(() => {
		k();
	}, [k]);
	let A = L(async () => {
		if (E.current) return;
		E.current = !0;
		let e = !1;
		try {
			for (; w.current.length > 0;) {
				let t = w.current.shift();
				t.kind === "blocking" && (D.current = !0, p(!0));
				try {
					let e = await t.write();
					C.current && (a(e), y(!1), S(null), t.kind === "blocking" && t.stock && _((e) => e + 1)), n && r != null && T(r, e), t.kind === "blocking" && t.resolve(!0);
				} catch (n) {
					e = !0, C.current && d(N(n, "Не вдалося зберегти")), t.kind === "blocking" && t.resolve(!1);
				} finally {
					t.kind === "add" && C.current && h((e) => e.filter((e) => e.token !== t.token)), t.kind === "blocking" && (D.current = !1, C.current && p(!1));
				}
			}
		} finally {
			E.current = !1;
		}
		e && C.current && k();
	}, [
		n,
		r,
		k
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
		clearBanner: () => d(null),
		notice: (e) => d(e),
		reload: k,
		addLine: L((n) => {
			if (!t) {
				d("Потрібна мережа");
				return;
			}
			d(null);
			let r = _t(), i = lt(n, r);
			h((e) => [...e, i]), w.current.push({
				kind: "add",
				token: r,
				write: () => x(e, {
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
		]),
		run: L((e, n = {}) => D.current ? Promise.resolve(!1) : t ? (d(null), new Promise((t) => {
			w.current.push({
				kind: "blocking",
				stock: n.stock === !0,
				write: e,
				resolve: t
			}), A();
		})) : (d("Потрібна мережа"), Promise.resolve(!1)), [t, A])
	};
}
//#endregion
//#region src/modules/tables/lib/useIsWide.ts
var yt = "(min-width: 1024px)";
function bt() {
	let [e, t] = V(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(yt).matches);
	return R(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(yt), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
//#endregion
//#region src/modules/tables/pages/BillPage.tsx
function xt() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function St() {
	let { billId: e } = me(), t = Number(e), n = le((e) => e.online), r = ue(), i = Y((e) => e.auth?.store.id ?? null), { bill: a, loading: o, error: s, banner: c, busy: l, pending: u, epoch: d, stale: f, savedAt: p, clearBanner: m, notice: h, reload: _, addLine: v, run: y } = vt(t, {
		online: n,
		mirrored: r !== "web",
		storeId: i
	}), x = bt(), C = fe().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [T, D] = V(!1), [A, j] = V(!1), [M, N] = V(null), [P, F] = V(null), I = pe(), L = z(() => a ? dt(a.draft, u) : [], [a, u]), R = z(() => mt(L), [L]), B = z(() => a ? $(a) : [], [a]), [H, G] = V([]), K = z(() => ft(L, H), [L, H]);
	if (!n && !f && !o) return /* @__PURE__ */ U("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ W("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ U("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ U("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (o) return /* @__PURE__ */ U("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (s || !a) return /* @__PURE__ */ U("div", {
		className: "p-4",
		children: /* @__PURE__ */ W("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ U("p", {
				className: "text-sm",
				children: s ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ U("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void _(),
				children: "Повторити"
			})]
		})
	});
	let ie = async (e) => {
		let t = !1;
		await y(async () => {
			let n = await k(a.id, e);
			return t = at(n.bill), n.bill;
		}, { stock: !0 }) && (j(!1), t && I("/tables"));
	}, q = async () => {
		if (F(null), await y(() => S(a.id)) && r === "cashier") try {
			let [e, t] = await Promise.all([ae("receiptPrinterName"), ae("receiptPaperWidthMm")]);
			if (!e) return;
			await se(e, gt(a), t === 58 || t === 80 ? t : re), F("Передчек надіслано на друк");
		} catch (e) {
			F(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, J = () => {
		D(!1), y(() => O(a.id, xt()), { stock: !0 });
	}, oe = (e) => {
		if (e.id == null) return;
		let t = e.id;
		y(() => e.quantity > 1 ? b(a.id, t, e.quantity - 1) : w(a.id, t));
	}, ce = (e) => {
		if (e.id == null) return;
		let t = e.id;
		y(() => b(a.id, t, e.quantity + 1));
	}, de = (e) => {
		if (e.id == null) return;
		let t = H.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		if (!t) {
			h("Страви вже немає в меню — зніміть рядок і додайте іншу");
			return;
		}
		N({
			row: e,
			variants: [...t[1]]
		});
	}, X = (e, t, n) => {
		let r = M?.row.id;
		N(null), r != null && y(() => ne(a.id, r, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, Z = /* @__PURE__ */ U(qe, {
		bill: a,
		draft: L,
		summary: R,
		owedCents: a.fired_total_cents,
		busy: l,
		online: n,
		hasPending: u.length > 0,
		canPay: B.length > 0,
		canPrecheck: B.length > 0,
		printStatus: P,
		onLess: oe,
		onMore: ce,
		onEdit: de,
		onCancelRound: (e) => void y(() => ee(a.id, e), { stock: !0 }),
		onFire: J,
		onPay: () => {
			D(!1), j(!0);
		},
		onPrecheck: () => void q()
	});
	return /* @__PURE__ */ W("div", {
		className: "relative flex h-full min-h-0 flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ W("header", {
				className: "flex shrink-0 items-center gap-3.5 px-4 md:px-6 min-h-[68px] py-2 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ W("button", {
					type: "button",
					className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
					onClick: () => I("/tables"),
					children: [/* @__PURE__ */ U(E, { size: 20 }), a.hall_name || "Зала"]
				}), /* @__PURE__ */ W("div", {
					className: `min-w-0 flex-1 ${x ? "" : "text-center pr-16"}`,
					children: [/* @__PURE__ */ W("p", {
						className: "truncate text-xl font-bold text-sq-heading",
						children: ["Стіл ", a.table_name]
					}), /* @__PURE__ */ W("p", {
						className: "truncate text-[13px] text-sq-muted",
						children: [
							te(a.guests),
							" · ",
							a.opened_by_name,
							" · ",
							g(a.opened_at, (/* @__PURE__ */ new Date()).toISOString()),
							" · рахунок ",
							a.bill_no
						]
					})]
				})]
			}),
			f && /* @__PURE__ */ W("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					p == null ? "" : `, станом на ${String(new Date(p).getHours()).padStart(2, "0")}:${String(new Date(p).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			c && /* @__PURE__ */ W("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					c,
					" ",
					/* @__PURE__ */ U("button", {
						type: "button",
						className: "sq-link",
						onClick: m,
						children: "Зрозуміло"
					})
				]
			}),
			/* @__PURE__ */ W("div", {
				className: `min-h-0 flex-1 ${x ? "grid grid-cols-[minmax(0,1fr)_372px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ U(tt, {
					counts: K,
					online: n,
					active: n && !A && !T && !M,
					canScan: r === "cashier",
					epoch: d,
					onAdd: v,
					onRows: G
				}), x && /* @__PURE__ */ U("aside", {
					className: "flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]",
					children: Z
				})]
			}),
			!x && /* @__PURE__ */ U(Ke, {
				draft: L,
				rounds: a.rounds,
				summary: R,
				owedCents: a.fired_total_cents,
				hasPending: u.length > 0,
				busy: l,
				online: n,
				onOpen: () => D(!0),
				onFire: J
			}),
			!x && T && /* @__PURE__ */ U(Qe, {
				title: `Стіл ${a.table_name} · рахунок ${a.bill_no}`,
				onClose: () => D(!1),
				children: Z
			}),
			A && /* @__PURE__ */ U(st, {
				bill: a,
				busy: l,
				onClose: () => j(!1),
				onPay: (e) => void ie(e)
			}),
			M && /* @__PURE__ */ U("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ U(Pe, {
					productName: M.row.product_name,
					variants: M.variants,
					variantLabel: C,
					initialVariantId: M.row.variant_id,
					initialModifierIds: M.row.modifierIds,
					initialNote: M.row.note,
					submitLabel: "Зберегти",
					withQuantity: !1,
					onAdd: ({ item: e, modifiers: t, note: n }) => X(e, t, n),
					onClose: () => N(null)
				})
			})
		]
	});
}
//#endregion
//#region src/modules/tables/components/TableTile.tsx
var Ct = {
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
}, wt = {
	free: "Вільний",
	mine: "Мій стіл",
	busy: "Зайнятий",
	bill: "Просять рахунок"
};
function Tt({ seat: e, now: t, meId: r, onOpen: a, disabled: o }) {
	let { table: s, bill: c } = e, l = f(c, r), u = n(c), d = s.shape === "round";
	return /* @__PURE__ */ W("button", {
		type: "button",
		"data-testid": `table-tile-${s.id}`,
		"data-tone": l,
		"data-kitchen": u ?? void 0,
		disabled: o,
		onClick: () => a(e),
		style: {
			gridColumn: `${s.pos_x + 1} / span ${s.width}`,
			gridRow: `${s.pos_y + 1} / span ${s.height}`
		},
		className: `relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${d ? "rounded-full" : "rounded-card"} ${Ct[l].tile}`,
		children: [
			Ct[l].dot && /* @__PURE__ */ U("span", {
				"aria-hidden": !0,
				className: `absolute top-3 w-2.5 h-2.5 rounded-full ${d ? "right-[18%]" : "right-3.5"} ${Ct[l].dot}`
			}),
			(u || c && c.draft_count > 0) && /* @__PURE__ */ W("span", {
				className: `absolute top-2.5 flex items-center gap-1 ${d ? "left-[16%]" : "left-3"}`,
				children: [u && /* @__PURE__ */ U("span", {
					className: `h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${u === "ready" ? "bg-sq-success text-white" : "bg-sq-warning/15 text-[#B35F0C]"}`,
					children: u === "ready" ? "готово" : "готується"
				}), c && c.draft_count > 0 && /* @__PURE__ */ U("span", {
					"data-testid": `table-draft-${s.id}`,
					title: "Не відправлено на кухню",
					className: "text-sq-blue",
					children: /* @__PURE__ */ U(v, {
						size: 16,
						"aria-label": "Не відправлено на кухню"
					})
				})]
			}),
			/* @__PURE__ */ U("span", {
				className: "text-[30px] font-bold leading-none text-sq-heading tabular-nums",
				children: s.name
			}),
			c ? /* @__PURE__ */ W(H, { children: [
				l === "bill" ? /* @__PURE__ */ U("span", {
					className: "text-[13px] font-semibold text-sq-danger",
					"data-testid": `table-precheck-${s.id}`,
					children: "Просять рахунок"
				}) : /* @__PURE__ */ W("span", {
					className: "text-[13px] font-semibold text-sq-text tabular-nums",
					children: [
						D(c.fired_total_cents),
						" · ",
						g(c.opened_at, t)
					]
				}),
				/* @__PURE__ */ W("span", {
					className: "text-xs text-sq-muted truncate max-w-full",
					children: [te(c.guests), c.opened_by_name ? ` · ${c.opened_by_name}` : ""]
				}),
				/* @__PURE__ */ U("span", {
					className: "sr-only",
					children: wt[l]
				})
			] }) : /* @__PURE__ */ U("span", {
				className: "text-[13px] text-sq-muted",
				children: i(s.seats)
			})
		]
	});
}
function Et() {
	let e = {
		free: "bg-sq-divider",
		mine: "bg-sq-blue",
		busy: "bg-[#F8C00F]",
		bill: "bg-sq-danger"
	};
	return /* @__PURE__ */ U("div", {
		className: "flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary",
		"data-testid": "tables-legend",
		children: Object.keys(e).map((t) => /* @__PURE__ */ W("span", {
			className: "flex items-center gap-1.5",
			children: [/* @__PURE__ */ U("span", {
				"aria-hidden": !0,
				className: `w-2.5 h-2.5 rounded-full ${e[t]}`
			}), wt[t]]
		}, t))
	});
}
//#endregion
//#region src/modules/tables/pages/HallMapPage.tsx
function Dt(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function Ot() {
	let t = le((e) => e.online), n = ue(), i = Y((e) => e.auth?.store.id ?? null), a = Y((e) => e.auth?.staff.id ?? null), { halls: o, bills: s, now: c, loading: l, error: u, stale: d, savedAt: f, refresh: p } = A({
		online: t,
		mirrored: n !== "web",
		storeId: i
	}), [m, g] = V(null), [_, v] = V(!1), [y, b] = V(null), x = pe(), S = z(() => e(o, s), [o, s]), w = S.find((e) => e.id === m) ?? S[0] ?? null, T = z(() => w ? r(w, s) : [], [w, s]), E = z(() => h(T), [T]);
	async function D(e) {
		if (!_) {
			if (!t) {
				b("Потрібна мережа, щоб відкрити стіл");
				return;
			}
			v(!0), b(null);
			try {
				let t = await C(e.table.id);
				x(`/tables/${t.bill.id}`);
			} catch (e) {
				b(N(e, "Не вдалося відкрити стіл")), p();
			} finally {
				v(!1);
			}
		}
	}
	return !t && !d && !l ? /* @__PURE__ */ U("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ W("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ U("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ U("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ W("div", {
		className: "flex h-full min-h-0 flex-col bg-sq-bg",
		"data-testid": "hall-map",
		children: [
			/* @__PURE__ */ W("header", {
				className: "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0",
				children: [
					/* @__PURE__ */ U("h1", {
						className: "text-2xl font-bold text-sq-heading",
						children: "Столи"
					}),
					S.length > 1 && /* @__PURE__ */ U("div", {
						className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full",
						children: S.map((e) => {
							let t = w?.id === e.id;
							return /* @__PURE__ */ U("button", {
								type: "button",
								"aria-pressed": t,
								"data-testid": `hall-tab-${e.id}`,
								onClick: () => g(e.id),
								className: `whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${t ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
								children: e.name
							}, e.id);
						})
					}),
					/* @__PURE__ */ U("div", { className: "flex-1" }),
					w && /* @__PURE__ */ U(Et, {})
				]
			}),
			d && /* @__PURE__ */ W("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", f == null ? "" : `, станом на ${Dt(f)}`]
			}),
			y && /* @__PURE__ */ U("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "tables-banner",
				children: y
			}),
			l && S.length === 0 && /* @__PURE__ */ U("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!l && u && /* @__PURE__ */ U("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ W("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ U("p", {
						className: "text-sm",
						children: u
					}), /* @__PURE__ */ U("button", {
						type: "button",
						className: "sq-btn-primary mt-3 px-4 py-2.5",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!l && !u && S.length === 0 && /* @__PURE__ */ U("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ W("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ U("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ U("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			w && /* @__PURE__ */ U("div", {
				className: "grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6",
				style: {
					gridTemplateColumns: `repeat(${E.cols}, minmax(2.5rem, 1fr))`,
					gridAutoRows: "minmax(3.75rem, auto)"
				},
				children: T.map((e) => /* @__PURE__ */ U(Tt, {
					seat: e,
					now: c,
					meId: a,
					disabled: _,
					onOpen: (e) => void D(e)
				}, e.table.id))
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/TablesRoutes.tsx
function kt() {
	return /* @__PURE__ */ W(Z, { children: [/* @__PURE__ */ U(X, {
		index: !0,
		element: /* @__PURE__ */ U(Ot, {})
	}), /* @__PURE__ */ U(X, {
		path: ":billId",
		element: /* @__PURE__ */ U(St, {})
	})] });
}
//#endregion
export { kt as TablesRoutes };
