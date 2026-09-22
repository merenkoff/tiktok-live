import { _ as e, a as t, b as n, f as r, g as i, h as a, i as o, l as s, m as c, n as l, o as u, r as d, t as f, u as p } from "./useHallMap-fXqupFz3.js";
import { useCallback as m, useEffect as h, useMemo as g, useRef as _, useState as v } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as y, defaultModifierIds as b, formatUah as x, getMeta as S, groupsOf as C, needsModifierSheet as w, printPrecheck as T, useAuthStore as E, useOfflineStatus as D, usePosShell as O } from "@pos/platform";
import { Fragment as k, jsx as A, jsxs as j } from "react/jsx-runtime";
import { Route as M, Routes as N, useNavigate as P, useParams as ee } from "react-router-dom";
//#region src/hooks/useDragScroll.ts
var F = 6;
function I() {
	let e = _(null);
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
function L(e) {
	return `${(e / 100).toFixed(2).replace(".", ",")} ₴`;
}
function R(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function z(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function B(e, t) {
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
	for (let e of z(t)) {
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
function V(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function H({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: a, onAdd: o, onClose: s }) {
	let [c, l] = v(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [u, d] = v(() => i ?? []), [f, p] = v(a ?? ""), m = I(), g = t.find((e) => e.variant_id === c) ?? null, _ = V(t), y = B(_, u), b = g ? g.price_cents + y.deltaCents : null, x = g == null ? `Оберіть «${n}»` : y.error ?? (b != null && b < 0 ? "Ціна не може бути відʼємною" : null), S = x == null && g != null;
	h(() => {
		let e = (e) => {
			e.key === "Escape" && s();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [s]);
	function C(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function w(e, t) {
		d((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : C(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function T() {
		S && g && o({
			item: g,
			modifiers: y.snapshot.map((e) => e.id),
			note: R(f)
		});
	}
	return /* @__PURE__ */ j("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ A("button", {
			type: "button",
			"aria-label": "Закрити",
			className: "absolute inset-0 bg-black/30",
			onClick: s
		}), /* @__PURE__ */ j("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-sq shadow-lg animate-fade-up flex flex-col max-h-[85%]",
			children: [
				/* @__PURE__ */ j("div", {
					className: "px-4 py-3 border-b border-sq-divider flex justify-between items-center gap-3 shrink-0",
					children: [/* @__PURE__ */ j("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ A("h3", {
							className: "font-semibold text-sq-text truncate",
							children: e
						}), g && /* @__PURE__ */ A("p", {
							className: "text-xs text-sq-secondary truncate",
							children: [g.label, L(g.price_cents)].filter(Boolean).join(" · ")
						})]
					}), /* @__PURE__ */ A("button", {
						type: "button",
						onClick: s,
						className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
						"data-testid": "modifier-close",
						children: "Закрити"
					})]
				}),
				/* @__PURE__ */ j("div", {
					ref: m,
					className: "flex-1 overflow-auto select-none px-4 py-3 space-y-4",
					children: [t.length > 1 && /* @__PURE__ */ j("div", {
						"data-testid": "modifier-variants",
						children: [/* @__PURE__ */ A(U, {
							name: n,
							hint: "обовʼязково"
						}), /* @__PURE__ */ A("div", {
							className: "flex flex-wrap gap-2",
							children: t.map((e) => {
								let t = e.variant_id === c, n = e.quantity <= 0;
								return /* @__PURE__ */ j("button", {
									type: "button",
									disabled: n,
									"aria-pressed": t,
									onClick: () => l(e.variant_id),
									className: W(t, n),
									"data-testid": `modifier-variant-${e.variant_id}`,
									children: [e.label || "Стандарт", n ? " · немає" : ""]
								}, e.variant_id);
							})
						})]
					}), _.map((e) => {
						let t = C(e, u), n = e.max_select > 1 && t >= e.max_select, r = e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select > 1 ? n ? `не більше ${e.max_select}` : `до ${e.max_select}` : null;
						return /* @__PURE__ */ j("div", {
							"data-testid": `modifier-group-${e.id}`,
							children: [/* @__PURE__ */ A(U, {
								name: e.name,
								hint: r
							}), /* @__PURE__ */ A("div", {
								className: "flex flex-wrap gap-2",
								children: e.modifiers.map((t) => {
									let r = u.includes(t.id), i = !r && n;
									return /* @__PURE__ */ j("button", {
										type: "button",
										"aria-pressed": r,
										"aria-disabled": i || void 0,
										onClick: () => w(e, t),
										className: W(r, i),
										"data-testid": `modifier-chip-${t.id}`,
										children: [t.name, G(t.price_delta_cents)]
									}, t.id);
								})
							})]
						}, e.id);
					})]
				}),
				/* @__PURE__ */ j("div", {
					className: "shrink-0 border-t border-sq-divider px-4 py-3 space-y-2",
					children: [
						/* @__PURE__ */ A("input", {
							className: "pos-field w-full",
							value: f,
							maxLength: 120,
							placeholder: "Коментар для кухні",
							enterKeyHint: "done",
							onChange: (e) => p(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && (e.preventDefault(), T());
							},
							"data-testid": "modifier-note"
						}),
						x && /* @__PURE__ */ A("p", {
							className: "text-xs text-red-600",
							"data-testid": "modifier-error",
							children: x
						}),
						/* @__PURE__ */ j("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-12",
							disabled: !S,
							onClick: T,
							"data-testid": "modifier-add",
							children: ["Додати в чек", b != null && /* @__PURE__ */ j(k, { children: [" · ", /* @__PURE__ */ A("span", {
								"data-testid": "modifier-price",
								children: L(b)
							})] })]
						})
					]
				})
			]
		})]
	});
}
function U({ name: e, hint: t }) {
	return /* @__PURE__ */ j("p", {
		className: "text-xs font-semibold text-sq-secondary mb-2",
		children: [e, t && /* @__PURE__ */ j("span", {
			className: "font-normal",
			children: [" · ", t]
		})]
	});
}
function W(e, t) {
	return [
		"min-h-11 px-3 rounded-full border text-sm font-medium transition-colors",
		e ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-white text-sq-text",
		t ? "opacity-40" : ""
	].join(" ");
}
function G(e) {
	return e > 0 ? ` +${L(e)}` : e < 0 ? ` −${L(-e)}` : "";
}
//#endregion
//#region src/modules/tables/lib/menu.ts
function K(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function q(e, t = K()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
function te(e, t = K()) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = n.get(r.product_id);
		if (e) {
			e.variants.push(r), e.from_cents = Math.min(e.from_cents, r.price_cents), e.stock += r.quantity;
			continue;
		}
		n.set(r.product_id, {
			product_id: r.product_id,
			name: r.product_name,
			variants: [r],
			from_cents: r.price_cents,
			stock: r.quantity,
			stopped: q(r, t)
		});
	}
	return [...n.values()];
}
function ne(e) {
	let t = [];
	return e.variants.length > 1 ? t.push(`${e.variants.length} розміри`) : e.variants[0]?.label && t.push(e.variants[0].label), e.stopped ? t.push("сьогодні не робимо") : e.stock <= 0 && t.push("немає"), t.join(" · ");
}
//#endregion
//#region src/modules/tables/components/DishPicker.tsx
function re({ onPick: e, onClose: t, busy: r, variantLabel: i = "Розмір", draftCount: a = 0 }) {
	let [o, s] = v(""), [c, l] = v([]), [u, d] = v(null), [p, m] = v(!0), [_, y] = v(null);
	h(() => {
		let e = !0, t = setTimeout(() => {
			m(!0), n(o).then((t) => {
				e && (l(t), d(null));
			}).catch((t) => {
				e && d(f(t, "Не вдалося прочитати меню"));
			}).finally(() => {
				e && m(!1);
			});
		}, 200);
		return () => {
			e = !1, clearTimeout(t);
		};
	}, [o]);
	let S = g(() => te(c).slice(0, 60), [c]);
	function T(t) {
		let n = C(t.variants);
		if (w(t.variants, n)) {
			y(t);
			return;
		}
		e({
			item: t.variants[0],
			modifiers: b(n),
			note: ""
		});
	}
	return /* @__PURE__ */ j("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "dish-picker",
		children: [
			/* @__PURE__ */ j("div", {
				className: "flex items-center gap-2 border-b border-sq-divider p-3",
				children: [/* @__PURE__ */ A("input", {
					className: "sq-field flex-1",
					"data-testid": "dish-search",
					placeholder: "Що додати?",
					value: o,
					autoFocus: !0,
					onChange: (e) => s(e.target.value)
				}), /* @__PURE__ */ j("button", {
					type: "button",
					className: "sq-btn-primary",
					onClick: t,
					"data-testid": "dish-close",
					children: ["Готово", a > 0 ? ` · ${a}` : ""]
				})]
			}),
			u && /* @__PURE__ */ A("p", {
				className: "p-3 text-sm",
				children: u
			}),
			!u && p && S.length === 0 && /* @__PURE__ */ A("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Шукаємо…"
			}),
			!u && !p && S.length === 0 && /* @__PURE__ */ A("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Нічого не знайшли"
			}),
			/* @__PURE__ */ A("div", {
				className: "flex-1 overflow-auto",
				children: S.map((e) => {
					let t = ne(e);
					return /* @__PURE__ */ j("button", {
						type: "button",
						"data-testid": `dish-${e.product_id}`,
						disabled: r || e.stopped,
						onClick: () => T(e),
						className: "flex w-full items-center justify-between gap-3 border-b border-sq-divider p-3 text-left disabled:opacity-50",
						children: [/* @__PURE__ */ j("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ A("span", {
								className: "block truncate",
								children: e.name
							}), t && /* @__PURE__ */ A("span", {
								className: "block text-xs text-sq-muted",
								children: t
							})]
						}), /* @__PURE__ */ j("span", {
							className: "shrink-0 tabular-nums",
							children: [e.variants.length > 1 ? "від " : "", x(e.from_cents)]
						})]
					}, e.product_id);
				})
			}),
			_ && /* @__PURE__ */ A(H, {
				productName: _.name,
				variants: _.variants,
				variantLabel: i,
				initialVariantId: _.variants.length === 1 ? _.variants[0].variant_id : null,
				initialModifierIds: b(C(_.variants)),
				onAdd: ({ item: t, modifiers: n, note: r }) => {
					e({
						item: t,
						modifiers: n,
						note: r
					}), y(null);
				},
				onClose: () => y(null)
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/pay.ts
function J(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function Y(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function ie(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + Y(n) : e, 0);
}
function ae(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function oe(e) {
	return e.status !== "open" || J(e).length === 0;
}
//#endregion
//#region src/modules/tables/lib/bill.ts
var se = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function ce(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function le(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function ue(e) {
	return {
		owed: e.fired_total_cents,
		draft: e.draft_preview_cents,
		draftExact: e.draft.every((e) => e.preview_unit_price_cents != null)
	};
}
function X(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
//#endregion
//#region src/modules/tables/components/PaySheet.tsx
var de = [{
	id: "cash",
	label: "Готівка"
}, {
	id: "card",
	label: "Картка"
}];
function fe({ bill: e, busy: t, onClose: n, onPay: r }) {
	let i = g(() => J(e), [e]), [a, o] = v(() => new Set(i.map(({ line: e }) => e.id))), [s, c] = v(1), [l, u] = v("card"), d = ie(i, a), f = a.size === i.length, p = ae(d, s);
	function m(e) {
		o((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	function h() {
		d <= 0 || r([{
			...f ? {} : { line_ids: [...a] },
			payments: p.map((e) => ({
				method: l,
				amount_cents: e
			}))
		}]);
	}
	return /* @__PURE__ */ j("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [
			/* @__PURE__ */ j("div", {
				className: "flex items-center justify-between gap-2 border-b border-sq-divider p-3",
				children: [/* @__PURE__ */ j("p", {
					className: "text-lg font-semibold",
					children: ["Оплата · стіл ", e.table_name]
				}), /* @__PURE__ */ A("button", {
					type: "button",
					className: "sq-link",
					onClick: n,
					"data-testid": "pay-close",
					children: "Назад"
				})]
			}),
			/* @__PURE__ */ j("div", {
				className: "flex-1 overflow-auto p-3",
				children: [/* @__PURE__ */ j("div", {
					className: "mb-2 flex items-center justify-between",
					children: [/* @__PURE__ */ A("p", {
						className: "sq-section-label",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-link",
						"data-testid": "pay-select-all",
						onClick: () => o(f ? /* @__PURE__ */ new Set() : new Set(i.map(({ line: e }) => e.id))),
						children: f ? "Зняти все" : "Обрати все"
					})]
				}), i.map(({ line: e, round: n }) => {
					let r = a.has(e.id);
					return /* @__PURE__ */ j("button", {
						type: "button",
						"data-testid": `pay-line-${e.id}`,
						"aria-pressed": r,
						disabled: t,
						onClick: () => m(e.id),
						className: `mb-1 flex w-full items-center justify-between gap-3 rounded-lg border p-2 text-left ${r ? "border-sq-blue bg-sq-blue/10" : "border-sq-divider"}`,
						children: [/* @__PURE__ */ j("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ j("span", {
								className: "block truncate",
								children: [
									/* @__PURE__ */ j("span", {
										className: "tabular-nums",
										children: [e.quantity, "×"]
									}),
									" ",
									X(e, !0)
								]
							}), /* @__PURE__ */ j("span", {
								className: "block text-xs text-sq-muted",
								children: ["раунд ", n.seq]
							})]
						}), /* @__PURE__ */ A("span", {
							className: "shrink-0 tabular-nums",
							children: x(Y(e))
						})]
					}, e.id);
				})]
			}),
			/* @__PURE__ */ j("div", {
				className: "border-t border-sq-divider p-3",
				children: [
					/* @__PURE__ */ j("div", {
						className: "mb-2 flex items-center justify-between gap-2",
						children: [/* @__PURE__ */ A("span", {
							className: "text-sm text-sq-muted",
							children: "Порівну на"
						}), /* @__PURE__ */ j("div", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ A("button", {
									type: "button",
									className: "sq-btn-tile",
									"data-testid": "pay-ways-less",
									disabled: t || s <= 1,
									onClick: () => c((e) => Math.max(1, e - 1)),
									children: "−"
								}),
								/* @__PURE__ */ A("span", {
									className: "min-w-8 text-center tabular-nums",
									"data-testid": "pay-ways",
									children: s
								}),
								/* @__PURE__ */ A("button", {
									type: "button",
									className: "sq-btn-tile",
									"data-testid": "pay-ways-more",
									disabled: t || s >= 10,
									onClick: () => c((e) => Math.min(10, e + 1)),
									children: "+"
								})
							]
						})]
					}),
					s > 1 && /* @__PURE__ */ j("p", {
						className: "mb-2 text-xs text-sq-muted",
						"data-testid": "pay-shares",
						children: [
							p.map((e) => x(e)).join(" + "),
							" — один чек, ",
							s,
							" оплат"
						]
					}),
					/* @__PURE__ */ A("div", {
						className: "mb-2 flex gap-2",
						children: de.map((e) => /* @__PURE__ */ A("button", {
							type: "button",
							"data-testid": `pay-method-${e.id}`,
							"aria-pressed": l === e.id,
							onClick: () => u(e.id),
							className: `flex-1 rounded-lg border p-2 ${l === e.id ? "border-sq-blue bg-sq-blue/10" : "border-sq-divider"}`,
							children: e.label
						}, e.id))
					}),
					/* @__PURE__ */ j("button", {
						type: "button",
						className: "sq-btn-primary w-full",
						"data-testid": "pay-submit",
						disabled: t || d <= 0,
						onClick: h,
						children: [
							"Оплатити ",
							x(d),
							f ? "" : " (частина)"
						]
					})
				]
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/precheck.ts
function Z(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function pe(e, t = /* @__PURE__ */ new Date()) {
	let n = J(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: Y(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: Z(e.opened_at, t),
		printed_at: Z(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0)
	};
}
//#endregion
//#region src/modules/tables/lib/useBill.ts
function me(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = v(null), [s, c] = v(!0), [l, u] = v(null), [g, y] = v(null), [b, x] = v(!1), [S, C] = v(!1), [w, T] = v(null), E = _(!0);
	h(() => (E.current = !0, () => {
		E.current = !1;
	}), []);
	let D = m(async () => {
		if (!n || r == null) return !1;
		let t = await d(r, e);
		return !t || !E.current ? !1 : (a(t.bill), C(!0), T(t.savedAt), c(!1), !0);
	}, [
		e,
		n,
		r
	]), O = m(async () => {
		if (!t) {
			let e = await D();
			E.current && !e && c(!1);
			return;
		}
		try {
			let t = await p(e);
			if (!E.current) return;
			a(t), u(null), C(!1), T(null), n && r != null && o(r, t);
		} catch (e) {
			if (!E.current) return;
			let t = await D();
			E.current && !t && u(f(e, "Не вдалося прочитати рахунок"));
		} finally {
			E.current && c(!1);
		}
	}, [
		e,
		t,
		D,
		n,
		r
	]);
	return h(() => {
		O();
	}, [O]), {
		bill: i,
		loading: s,
		error: l,
		banner: g,
		busy: b,
		stale: S,
		savedAt: w,
		clearBanner: () => y(null),
		reload: O,
		run: m(async (e) => {
			if (b) return !1;
			if (!t) return y("Потрібна мережа"), !1;
			x(!0), y(null);
			try {
				let t = await e();
				return E.current && (a(t), C(!1), T(null)), n && r != null && o(r, t), !0;
			} catch (e) {
				return E.current && (y(f(e, "Не вдалося зберегти")), O()), !1;
			} finally {
				E.current && x(!1);
			}
		}, [
			b,
			t,
			O,
			n,
			r
		])
	};
}
//#endregion
//#region src/modules/tables/pages/BillPage.tsx
function he() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function ge() {
	let { billId: n } = ee(), i = Number(n), o = D((e) => e.online), l = O(), d = E((e) => e.auth?.store.id ?? null), { bill: f, loading: p, error: m, banner: h, busy: _, stale: b, savedAt: C, clearBanner: w, reload: k, run: M } = me(i, {
		online: o,
		mirrored: l === "cashier",
		storeId: d
	}), [N, F] = v(!1), [I, L] = v(!1), [R, z] = v(null), B = P(), V = g(() => f ? ue(f) : null, [f]), H = g(() => f ? J(f) : [], [f]);
	if (!o && !b && !p) return /* @__PURE__ */ A("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ j("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ A("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ A("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (p) return /* @__PURE__ */ A("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (m || !f) return /* @__PURE__ */ A("div", {
		className: "p-4",
		children: /* @__PURE__ */ j("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ A("p", {
				className: "text-sm",
				children: m ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ A("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void k(),
				children: "Повторити"
			})]
		})
	});
	let U = async (e) => {
		let t = !1;
		await M(async () => {
			let n = await c(f.id, e);
			return t = oe(n.bill), n.bill;
		}) && (L(!1), t && B("/tables"));
	}, W = async () => {
		if (z(null), await M(() => r(f.id)) && l === "cashier") try {
			let [e, t] = await Promise.all([S("receiptPrinterName"), S("receiptPaperWidthMm")]);
			if (!e) return;
			await T(e, pe(f), t === 58 || t === 80 ? t : y), z("Передчек надіслано на друк");
		} catch (e) {
			z(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, G = (t, n) => /* @__PURE__ */ j("div", {
		className: "flex items-start justify-between gap-3 py-2",
		"data-testid": `bill-line-${t.id}`,
		children: [/* @__PURE__ */ j("div", {
			className: "min-w-0",
			children: [
				/* @__PURE__ */ j("p", {
					className: "truncate",
					children: [
						/* @__PURE__ */ j("span", {
							className: "tabular-nums",
							children: [t.quantity, "×"]
						}),
						" ",
						X(t, n)
					]
				}),
				t.note && /* @__PURE__ */ j("p", {
					className: "text-xs italic text-sq-muted",
					children: ["✎ ", t.note]
				}),
				!n && /* @__PURE__ */ j("div", {
					className: "mt-1 flex items-center gap-2",
					children: [/* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-btn-tile",
						"data-testid": `bill-less-${t.id}`,
						disabled: _ || !o,
						onClick: () => void M(() => t.quantity > 1 ? e(f.id, t.id, t.quantity - 1) : a(f.id, t.id)),
						children: "−"
					}), /* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-btn-tile",
						"data-testid": `bill-more-${t.id}`,
						disabled: _ || !o,
						onClick: () => void M(() => e(f.id, t.id, t.quantity + 1)),
						children: "+"
					})]
				})
			]
		}), /* @__PURE__ */ A("span", {
			className: "shrink-0 tabular-nums",
			children: n ? x(le(t)) : t.preview_unit_price_cents == null ? "—" : `≈ ${x(t.preview_unit_price_cents * t.quantity)}`
		})]
	}, t.id);
	return /* @__PURE__ */ j("div", {
		className: "relative flex h-full flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ j("header", {
				className: "flex items-baseline justify-between gap-2 border-b border-sq-divider p-3",
				children: [/* @__PURE__ */ j("div", { children: [/* @__PURE__ */ j("p", {
					className: "text-xl font-bold",
					children: ["Стіл ", f.table_name]
				}), /* @__PURE__ */ j("p", {
					className: "text-xs text-sq-muted",
					children: [
						f.hall_name,
						" · рахунок ",
						f.bill_no,
						" · ",
						f.guests,
						" гост. ·",
						" ",
						f.opened_by_name
					]
				})] }), /* @__PURE__ */ A("button", {
					type: "button",
					className: "sq-link",
					onClick: () => B("/tables"),
					children: "До зали"
				})]
			}),
			b && /* @__PURE__ */ j("p", {
				className: "m-3 rounded-lg bg-amber-500/15 p-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					C == null ? "" : `, станом на ${String(new Date(C).getHours()).padStart(2, "0")}:${String(new Date(C).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			h && /* @__PURE__ */ j("p", {
				className: "m-3 rounded-lg bg-rose-500/15 p-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					h,
					" ",
					/* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-link",
						onClick: w,
						children: "Зрозуміло"
					})
				]
			}),
			/* @__PURE__ */ j("div", {
				className: "flex-1 overflow-auto p-3",
				children: [f.rounds.map((e) => /* @__PURE__ */ j("section", {
					className: "sq-card mb-3 p-3",
					"data-testid": `bill-round-${e.id}`,
					"data-cancelled": e.cancelled_at ? "yes" : "no",
					children: [
						/* @__PURE__ */ j("div", {
							className: "flex items-baseline justify-between gap-2",
							children: [/* @__PURE__ */ j("p", {
								className: "sq-section-label",
								children: [
									"Раунд ",
									e.seq,
									" ·",
									" ",
									e.cancelled_at ? "скасовано" : se[e.prep_status]
								]
							}), /* @__PURE__ */ A("span", {
								className: "tabular-nums",
								children: e.cancelled_at ? "—" : x(e.total_cents)
							})]
						}),
						e.items.map((e) => G(e, !0)),
						ce(e) && /* @__PURE__ */ A("button", {
							type: "button",
							className: "sq-link mt-1",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: _,
							onClick: () => void M(() => u(f.id, e.id)),
							children: "Скасувати раунд"
						})
					]
				}, e.id)), /* @__PURE__ */ j("section", {
					className: "sq-card p-3",
					"data-testid": "bill-draft",
					children: [/* @__PURE__ */ j("div", {
						className: "flex items-baseline justify-between gap-2",
						children: [/* @__PURE__ */ A("p", {
							className: "sq-section-label",
							children: "Чернетка"
						}), /* @__PURE__ */ A("button", {
							type: "button",
							className: "sq-link",
							"data-testid": "bill-add",
							disabled: _ || !o,
							onClick: () => F(!0),
							children: "+ Додати"
						})]
					}), f.draft.length === 0 ? /* @__PURE__ */ A("p", {
						className: "py-2 text-sm text-sq-muted",
						children: "Нічого не набрано"
					}) : f.draft.map((e) => G(e, !1))]
				})]
			}),
			/* @__PURE__ */ j("footer", {
				className: "border-t border-sq-divider p-3",
				children: [
					/* @__PURE__ */ j("div", {
						className: "flex items-baseline justify-between",
						children: [/* @__PURE__ */ A("span", {
							className: "text-sm text-sq-muted",
							children: "До сплати"
						}), /* @__PURE__ */ A("span", {
							className: "text-2xl font-bold tabular-nums",
							"data-testid": "bill-owed",
							children: x(V.owed)
						})]
					}),
					f.draft.length > 0 && /* @__PURE__ */ j("div", {
						className: "flex items-baseline justify-between text-sm text-sq-muted",
						children: [/* @__PURE__ */ A("span", { children: "Чернетка (ще не відправлено)" }), /* @__PURE__ */ j("span", {
							className: "tabular-nums",
							"data-testid": "bill-draft-total",
							children: [V.draftExact ? "" : "≈ ", x(V.draft)]
						})]
					}),
					/* @__PURE__ */ j("div", {
						className: "mt-2 flex gap-2",
						children: [/* @__PURE__ */ A("button", {
							type: "button",
							className: "sq-btn-primary flex-1",
							"data-testid": "bill-fire",
							disabled: _ || !o || f.draft.length === 0,
							onClick: () => void M(() => s(f.id, he())),
							children: "На кухню"
						}), /* @__PURE__ */ A("button", {
							type: "button",
							className: "sq-btn-primary flex-1",
							"data-testid": "bill-pay",
							disabled: _ || !o || H.length === 0 || f.draft.length > 0,
							onClick: () => L(!0),
							children: "Оплатити"
						})]
					}),
					/* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-link mt-2",
						"data-testid": "bill-precheck",
						disabled: _ || !o || H.length === 0,
						onClick: () => void W(),
						children: f.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"
					}),
					R && /* @__PURE__ */ A("p", {
						className: "mt-1 text-xs text-sq-muted",
						"data-testid": "bill-print-status",
						children: R
					})
				]
			}),
			I && /* @__PURE__ */ A(fe, {
				bill: f,
				busy: _,
				onClose: () => L(!1),
				onPay: (e) => void U(e)
			}),
			N && /* @__PURE__ */ A(re, {
				busy: _,
				draftCount: f.draft.length,
				onClose: () => F(!1),
				onPick: ({ item: e, modifiers: n, note: r }) => {
					M(() => t(f.id, {
						variant_id: e.variant_id,
						quantity: 1,
						modifiers: n,
						note: r
					}));
				}
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/hallMap.ts
function Q(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t) n.set(e.table_id, e);
	return e.tables.map((e) => ({
		table: e,
		bill: n.get(e.id) ?? null
	})).filter((e) => e.table.is_active || e.bill != null);
}
function _e(e) {
	return e ? e.prep_status === "ready" ? "ready" : e.prep_status === "new" ? "waiting" : "seated" : "free";
}
function ve(e, t) {
	let n = Math.max(0, Math.floor((new Date(t).getTime() - new Date(e).getTime()) / 6e4));
	return Number.isFinite(n) ? n < 60 ? `${n} хв` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "";
}
function ye(e, t) {
	return e.filter((e) => e.is_active || Q(e, t).some((e) => e.bill));
}
function $(e) {
	let t = 1, n = 1;
	for (let { table: r } of e) t = Math.max(t, r.pos_x + r.width), n = Math.max(n, r.pos_y + r.height);
	return {
		cols: t,
		rows: n
	};
}
//#endregion
//#region src/modules/tables/components/TableTile.tsx
var be = {
	free: "border-sq-divider bg-sq-surface text-sq-text",
	seated: "border-sq-blue/40 bg-sq-blue/10 text-sq-text",
	waiting: "border-amber-400/60 bg-amber-400/15 text-sq-text",
	ready: "border-emerald-500/60 bg-emerald-500/20 text-sq-text"
}, xe = {
	free: "вільний",
	seated: "зайнятий",
	waiting: "готується",
	ready: "готово"
};
function Se({ seat: e, now: t, onOpen: n, disabled: r }) {
	let { table: i, bill: a } = e, o = _e(a);
	return /* @__PURE__ */ j("button", {
		type: "button",
		"data-testid": `table-tile-${i.id}`,
		"data-tone": o,
		disabled: r,
		onClick: () => n(e),
		style: {
			gridColumn: `${i.pos_x + 1} / span ${i.width}`,
			gridRow: `${i.pos_y + 1} / span ${i.height}`
		},
		className: `flex min-h-20 flex-col items-center justify-center gap-0.5 border p-2 text-center transition disabled:opacity-60 ${i.shape === "round" ? "rounded-full" : "rounded-xl"} ${be[o]}`,
		children: [/* @__PURE__ */ A("span", {
			className: "text-2xl font-bold leading-none tabular-nums",
			children: i.name
		}), a ? /* @__PURE__ */ j(k, { children: [
			/* @__PURE__ */ A("span", {
				className: "text-xs tabular-nums",
				children: x(a.fired_total_cents)
			}),
			/* @__PURE__ */ j("span", {
				className: "text-[11px] text-sq-muted",
				children: [
					ve(a.opened_at, t),
					" · ",
					a.guests,
					" гост."
				]
			}),
			/* @__PURE__ */ A("span", {
				className: "sr-only",
				children: xe[o]
			}),
			(a.draft_count > 0 || a.precheck_printed_at) && /* @__PURE__ */ j("span", {
				className: "flex items-center gap-1 text-[11px]",
				children: [a.draft_count > 0 && /* @__PURE__ */ A("span", {
					"data-testid": `table-draft-${i.id}`,
					title: "Не відправлено на кухню",
					children: "•"
				}), a.precheck_printed_at && /* @__PURE__ */ A("span", {
					"data-testid": `table-precheck-${i.id}`,
					title: "Передчек надруковано",
					children: "₴?"
				})]
			})
		] }) : /* @__PURE__ */ j("span", {
			className: "text-[11px] text-sq-muted",
			children: [i.seats, " місць"]
		})]
	});
}
//#endregion
//#region src/modules/tables/pages/HallMapPage.tsx
function Ce(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function we() {
	let e = D((e) => e.online), t = O(), n = E((e) => e.auth?.store.id ?? null), { halls: r, bills: a, now: o, loading: s, error: c, stale: u, savedAt: d, refresh: p } = l({
		online: e,
		mirrored: t === "cashier",
		storeId: n
	}), [m, h] = v(null), [_, y] = v(!1), [b, x] = v(null), S = P(), C = g(() => ye(r, a), [r, a]), w = C.find((e) => e.id === m) ?? C[0] ?? null, T = g(() => w ? Q(w, a) : [], [w, a]), k = g(() => $(T), [T]);
	async function M(t) {
		if (!_) {
			if (!e) {
				x("Потрібна мережа, щоб відкрити стіл");
				return;
			}
			y(!0), x(null);
			try {
				let e = await i(t.table.id);
				S(`/tables/${e.bill.id}`);
			} catch (e) {
				x(f(e, "Не вдалося відкрити стіл")), p();
			} finally {
				y(!1);
			}
		}
	}
	return !e && !u && !s ? /* @__PURE__ */ A("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ j("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ A("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ A("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ j("div", {
		className: "flex h-full flex-col",
		"data-testid": "hall-map",
		children: [
			C.length > 1 && /* @__PURE__ */ A("div", {
				className: "flex gap-2 overflow-x-auto p-3",
				children: C.map((e) => /* @__PURE__ */ A("button", {
					type: "button",
					"data-testid": `hall-tab-${e.id}`,
					onClick: () => h(e.id),
					className: `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${w?.id === e.id ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-sq-surface text-sq-text"}`,
					children: e.name
				}, e.id))
			}),
			u && /* @__PURE__ */ j("p", {
				className: "mx-3 mb-2 rounded-lg bg-amber-500/15 p-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", d == null ? "" : `, станом на ${Ce(d)}`]
			}),
			b && /* @__PURE__ */ A("p", {
				className: "mx-3 mb-2 rounded-lg bg-rose-500/15 p-2 text-sm",
				"data-testid": "tables-banner",
				children: b
			}),
			s && C.length === 0 && /* @__PURE__ */ A("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!s && c && /* @__PURE__ */ A("div", {
				className: "p-4",
				children: /* @__PURE__ */ j("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ A("p", {
						className: "text-sm",
						children: c
					}), /* @__PURE__ */ A("button", {
						type: "button",
						className: "sq-btn-primary mt-3",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!s && !c && C.length === 0 && /* @__PURE__ */ A("div", {
				className: "p-4",
				children: /* @__PURE__ */ j("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ A("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ A("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			w && /* @__PURE__ */ A("div", {
				className: "grid flex-1 content-start gap-2 overflow-auto p-3",
				style: {
					gridTemplateColumns: `repeat(${k.cols}, minmax(4.5rem, 1fr))`,
					gridAutoRows: "minmax(4.5rem, auto)"
				},
				children: T.map((e) => /* @__PURE__ */ A(Se, {
					seat: e,
					now: o,
					disabled: _,
					onOpen: (e) => void M(e)
				}, e.table.id))
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/TablesRoutes.tsx
function Te() {
	return /* @__PURE__ */ j(N, { children: [/* @__PURE__ */ A(M, {
		index: !0,
		element: /* @__PURE__ */ A(we, {})
	}), /* @__PURE__ */ A(M, {
		path: ":billId",
		element: /* @__PURE__ */ A(ge, {})
	})] });
}
//#endregion
export { Te as TablesRoutes };
