import { _ as e, a as t, f as n, g as r, h as i, i as a, l as o, m as s, n as c, o as l, r as u, t as d, u as f, y as p } from "./useHallMap-DwoGctYl.js";
import { createElement as m, forwardRef as h, useCallback as g, useEffect as _, useMemo as v, useRef as y, useState as b } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as x, assetUrl as S, cartLineUid as C, defaultModifierIds as w, formatUah as T, getMeta as E, groupsOf as D, needsModifierSheet as O, printPrecheck as ee, resolveLineModifiers as k, useAuthStore as A, useOfflineStatus as j, usePosShell as M, useSalesCatalog as N, useVertical as P } from "@pos/platform";
import { Fragment as F, jsx as I, jsxs as L } from "react/jsx-runtime";
import { Route as R, Routes as z, useNavigate as te, useParams as ne } from "react-router-dom";
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var B = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), V = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), H = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, U = h(({ color: e = "currentColor", size: t = 24, strokeWidth: n = 2, absoluteStrokeWidth: r, className: i = "", children: a, iconNode: o, ...s }, c) => m("svg", {
	ref: c,
	...H,
	width: t,
	height: t,
	stroke: e,
	strokeWidth: r ? Number(n) * 24 / Number(t) : n,
	className: V("lucide", i),
	...s
}, [...o.map(([e, t]) => m(e, t)), ...Array.isArray(a) ? a : [a]])), W = (e, t) => {
	let n = h(({ className: n, ...r }, i) => m(U, {
		ref: i,
		iconNode: t,
		className: V(`lucide-${B(e)}`, n),
		...r
	}));
	return n.displayName = `${e}`, n;
}, G = W("Folder", [["path", {
	d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
	key: "1kt360"
}]]), K = W("Search", [["circle", {
	cx: "11",
	cy: "11",
	r: "8",
	key: "4ej97u"
}], ["path", {
	d: "m21 21-4.3-4.3",
	key: "1qie3q"
}]]), q = 6;
function J() {
	let e = y(null);
	return _(() => {
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
			!n.moved && Math.hypot(r, i) > q && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
function Y(e) {
	return `${(e / 100).toFixed(2).replace(".", ",")} ₴`;
}
//#endregion
//#region src/components/cashier/ProductTile.tsx
function X({ name: e, subtitle: t, priceCents: n, imageUrl: r, stock: i, onClick: a, disabled: o, count: s, onMore: c, badge: l, testId: u }) {
	let [d, f] = b(!1), p = d ? null : S(r), m = /* @__PURE__ */ L("button", {
		type: "button",
		disabled: o,
		onClick: a,
		"data-testid": u,
		className: `${c ? "w-full h-full" : "aspect-square"} rounded-sq overflow-hidden relative text-left bg-sq-empty hover:brightness-[0.97] transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed ${s ? "ring-2 ring-sq-blue" : ""}`,
		children: [
			p ? /* @__PURE__ */ I("img", {
				src: p,
				alt: "",
				className: "absolute inset-0 w-full h-full object-cover pointer-events-none",
				onError: () => f(!0)
			}) : /* @__PURE__ */ I("div", {
				className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
				children: t || " "
			}),
			/* @__PURE__ */ I("div", { className: "absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" }),
			/* @__PURE__ */ L("div", {
				className: "absolute bottom-2 left-2 right-2 text-white pointer-events-none",
				children: [/* @__PURE__ */ I("p", {
					className: "text-[12px] leading-tight font-medium line-clamp-2 drop-shadow-sm",
					children: e
				}), n != null && /* @__PURE__ */ I("p", {
					className: "text-[12px] mt-0.5 opacity-95 drop-shadow-sm",
					children: Y(n)
				})]
			}),
			s != null && s > 0 && /* @__PURE__ */ I("span", {
				className: "absolute top-2 left-2 min-w-7 h-7 px-1.5 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-semibold tabular-nums shadow-sm pointer-events-none",
				"data-testid": "tile-count",
				children: s
			}),
			l ? /* @__PURE__ */ I("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				"data-testid": "tile-badge",
				children: l
			}) : i != null && i <= 0 && /* @__PURE__ */ I("span", {
				className: "absolute top-2 right-2 text-[10px] font-semibold bg-black/55 text-white px-1.5 py-0.5 rounded-sq pointer-events-none",
				children: "немає"
			})
		]
	});
	return c ? /* @__PURE__ */ L("div", {
		className: "relative aspect-square",
		children: [m, !o && /* @__PURE__ */ I("button", {
			type: "button",
			onClick: c,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-1 right-1 w-11 h-11 grid place-items-center rounded-full bg-black/45 text-white text-xl leading-none shadow-sm hover:bg-black/60",
			"data-testid": u ? `${u}-more` : "tile-more",
			children: "⋯"
		})]
	}) : m;
}
//#endregion
//#region src/lib/tagColors.ts
var re = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Z = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, ie = "slate";
function ae(e) {
	return !!e && re.includes(e);
}
function Q(e) {
	return ae(e) ? Z[e] : Z[ie];
}
//#endregion
//#region src/components/cashier/TagFolderTile.tsx
function oe({ name: e, color: t, onClick: n }) {
	let r = Q(t);
	return /* @__PURE__ */ L("button", {
		type: "button",
		onClick: n,
		className: "aspect-square rounded-sq overflow-hidden relative text-left p-2.5 hover:brightness-110 transition-[filter]",
		style: { backgroundColor: r },
		children: [/* @__PURE__ */ I(G, {
			size: 22,
			strokeWidth: 1.75,
			className: "text-white/95 absolute top-2.5 left-2.5"
		}), /* @__PURE__ */ I("span", {
			className: "absolute bottom-2.5 left-2.5 right-2 text-[13px] font-medium leading-tight line-clamp-2 text-white",
			children: e
		})]
	});
}
//#endregion
//#region src/components/cashier/CatalogTagBar.tsx
function se({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = J(), s = (e) => `shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${e ? "font-semibold text-sq-text border-sq-text" : "font-medium text-sq-secondary border-transparent"}`;
	return /* @__PURE__ */ L("div", {
		ref: o,
		className: "flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none",
		children: [
			n && /* @__PURE__ */ L("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap",
				children: ["‹ ", r]
			}),
			/* @__PURE__ */ I("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ I("button", {
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
function ce({ active: e, onScan: t }) {
	let n = y(null);
	return _(() => {
		e ? n.current?.focus() : n.current?.blur();
	}, [e]), /* @__PURE__ */ I("input", {
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
function le(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function ue(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function de(e, t) {
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
	for (let e of ue(t)) {
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
function fe(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
//#endregion
//#region src/components/cashier/ModifierSheet.tsx
function pe({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: a, submitLabel: o = "Додати в чек", onAdd: s, onClose: c }) {
	let [l, u] = b(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [d, f] = b(() => i ?? []), [p, m] = b(a ?? ""), h = J(), g = t.find((e) => e.variant_id === l) ?? null, v = fe(t), y = de(v, d), x = g ? g.price_cents + y.deltaCents : null, S = g == null ? `Оберіть «${n}»` : y.error ?? (x != null && x < 0 ? "Ціна не може бути відʼємною" : null), C = S == null && g != null;
	_(() => {
		let e = (e) => {
			e.key === "Escape" && c();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [c]);
	function w(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function T(e, t) {
		f((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : w(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function E() {
		C && g && s({
			item: g,
			modifiers: y.snapshot.map((e) => e.id),
			note: le(p)
		});
	}
	return /* @__PURE__ */ L("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ I("button", {
			type: "button",
			"aria-label": "Закрити",
			className: "absolute inset-0 bg-black/30",
			onClick: c
		}), /* @__PURE__ */ L("div", {
			role: "dialog",
			"aria-label": e,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-sq shadow-lg animate-fade-up flex flex-col max-h-[85%]",
			children: [
				/* @__PURE__ */ L("div", {
					className: "px-4 py-3 border-b border-sq-divider flex justify-between items-center gap-3 shrink-0",
					children: [/* @__PURE__ */ L("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ I("h3", {
							className: "font-semibold text-sq-text truncate",
							children: e
						}), g && /* @__PURE__ */ I("p", {
							className: "text-xs text-sq-secondary truncate",
							children: [g.label, Y(g.price_cents)].filter(Boolean).join(" · ")
						})]
					}), /* @__PURE__ */ I("button", {
						type: "button",
						onClick: c,
						className: "min-h-11 min-w-11 text-sm text-sq-secondary hover:text-sq-text shrink-0",
						"data-testid": "modifier-close",
						children: "Закрити"
					})]
				}),
				/* @__PURE__ */ L("div", {
					ref: h,
					className: "flex-1 overflow-auto select-none px-4 py-3 space-y-4",
					children: [t.length > 1 && /* @__PURE__ */ L("div", {
						"data-testid": "modifier-variants",
						children: [/* @__PURE__ */ I(me, {
							name: n,
							hint: "обовʼязково"
						}), /* @__PURE__ */ I("div", {
							className: "flex flex-wrap gap-2",
							children: t.map((e) => {
								let t = e.variant_id === l, n = e.quantity <= 0;
								return /* @__PURE__ */ L("button", {
									type: "button",
									disabled: n,
									"aria-pressed": t,
									onClick: () => u(e.variant_id),
									className: he(t, n),
									"data-testid": `modifier-variant-${e.variant_id}`,
									children: [e.label || "Стандарт", n ? " · немає" : ""]
								}, e.variant_id);
							})
						})]
					}), v.map((e) => {
						let t = w(e, d), n = e.max_select > 1 && t >= e.max_select, r = e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select > 1 ? n ? `не більше ${e.max_select}` : `до ${e.max_select}` : null;
						return /* @__PURE__ */ L("div", {
							"data-testid": `modifier-group-${e.id}`,
							children: [/* @__PURE__ */ I(me, {
								name: e.name,
								hint: r
							}), /* @__PURE__ */ I("div", {
								className: "flex flex-wrap gap-2",
								children: e.modifiers.map((t) => {
									let r = d.includes(t.id), i = !r && n;
									return /* @__PURE__ */ L("button", {
										type: "button",
										"aria-pressed": r,
										"aria-disabled": i || void 0,
										onClick: () => T(e, t),
										className: he(r, i),
										"data-testid": `modifier-chip-${t.id}`,
										children: [t.name, ge(t.price_delta_cents)]
									}, t.id);
								})
							})]
						}, e.id);
					})]
				}),
				/* @__PURE__ */ L("div", {
					className: "shrink-0 border-t border-sq-divider px-4 py-3 space-y-2",
					children: [
						/* @__PURE__ */ I("input", {
							className: "pos-field w-full",
							value: p,
							maxLength: 120,
							placeholder: "Коментар для кухні",
							enterKeyHint: "done",
							onChange: (e) => m(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && (e.preventDefault(), E());
							},
							"data-testid": "modifier-note"
						}),
						S && /* @__PURE__ */ I("p", {
							className: "text-xs text-red-600",
							"data-testid": "modifier-error",
							children: S
						}),
						/* @__PURE__ */ L("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-12",
							disabled: !C,
							onClick: E,
							"data-testid": "modifier-add",
							children: [o, x != null && /* @__PURE__ */ L(F, { children: [" · ", /* @__PURE__ */ I("span", {
								"data-testid": "modifier-price",
								children: Y(x)
							})] })]
						})
					]
				})
			]
		})]
	});
}
function me({ name: e, hint: t }) {
	return /* @__PURE__ */ L("p", {
		className: "text-xs font-semibold text-sq-secondary mb-2",
		children: [e, t && /* @__PURE__ */ L("span", {
			className: "font-normal",
			children: [" · ", t]
		})]
	});
}
function he(e, t) {
	return [
		"min-h-11 px-3 rounded-full border text-sm font-medium transition-colors",
		e ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-white text-sq-text",
		t ? "opacity-40" : ""
	].join(" ");
}
function ge(e) {
	return e > 0 ? ` +${Y(e)}` : e < 0 ? ` −${Y(-e)}` : "";
}
//#endregion
//#region src/modules/tables/components/BillBar.tsx
function _e({ summary: e, owedCents: t, hasPending: n, busy: r, online: i, onOpen: a, onFire: o }) {
	let s = e.lines > 0;
	return /* @__PURE__ */ L("div", {
		className: "flex shrink-0 items-stretch gap-2 border-t border-sq-divider bg-sq-surface p-2",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ I("button", {
			type: "button",
			className: "flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-sq px-2 text-left",
			"data-testid": "bill-bar-open",
			onClick: a,
			children: s ? /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ L("span", {
				className: "truncate text-sm font-semibold",
				children: [
					"Чернетка · ",
					e.lines,
					" поз.",
					n ? " · зберігаємо…" : ""
				]
			}), /* @__PURE__ */ L("span", {
				className: "text-xs text-sq-muted tabular-nums",
				children: [
					e.exact ? "" : "≈ ",
					T(e.cents),
					" · до сплати ",
					T(t)
				]
			})] }) : /* @__PURE__ */ L(F, { children: [/* @__PURE__ */ L("span", {
				className: "truncate text-sm font-semibold",
				children: ["До сплати ", T(t)]
			}), /* @__PURE__ */ I("span", {
				className: "text-xs text-sq-muted",
				children: "Рахунок"
			})] })
		}), /* @__PURE__ */ L("button", {
			type: "button",
			className: "sq-btn-primary min-h-12 px-4",
			"data-testid": "bill-bar-fire",
			disabled: r || !i || n || !s,
			onClick: o,
			children: ["На кухню", s ? ` · ${e.lines}` : ""]
		})]
	});
}
//#endregion
//#region src/modules/tables/lib/bill.ts
var ve = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function ye(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function be(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function xe(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
//#endregion
//#region src/modules/tables/components/BillPane.tsx
function Se({ bill: e, draft: t, summary: n, owedCents: r, busy: i, online: a, hasPending: o, canPay: s, canPrecheck: c, printStatus: l, onLess: u, onMore: d, onEdit: f, onCancelRound: p, onFire: m, onPay: h, onPrecheck: g }) {
	let _ = (e) => /* @__PURE__ */ L("div", {
		className: "flex items-start justify-between gap-3 py-2",
		"data-testid": `bill-line-${e.id}`,
		children: [/* @__PURE__ */ L("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ L("p", {
				className: "truncate",
				children: [
					/* @__PURE__ */ L("span", {
						className: "tabular-nums",
						children: [e.quantity, "×"]
					}),
					" ",
					xe(e, !0)
				]
			}), e.note && /* @__PURE__ */ L("p", {
				className: "text-xs italic text-sq-muted",
				children: ["✎ ", e.note]
			})]
		}), /* @__PURE__ */ I("span", {
			className: "shrink-0 tabular-nums",
			children: T(be(e))
		})]
	}, e.id);
	return /* @__PURE__ */ L("div", {
		className: "flex h-full min-h-0 flex-col",
		"data-testid": "bill-pane",
		children: [/* @__PURE__ */ L("div", {
			className: "flex-1 overflow-auto p-3",
			children: [e.rounds.map((e) => /* @__PURE__ */ L("section", {
				className: "sq-card mb-3 p-3",
				"data-testid": `bill-round-${e.id}`,
				"data-cancelled": e.cancelled_at ? "yes" : "no",
				children: [
					/* @__PURE__ */ L("div", {
						className: "flex items-baseline justify-between gap-2",
						children: [/* @__PURE__ */ L("p", {
							className: "sq-section-label",
							children: [
								"Раунд ",
								e.seq,
								" · ",
								e.cancelled_at ? "скасовано" : ve[e.prep_status]
							]
						}), /* @__PURE__ */ I("span", {
							className: "tabular-nums",
							children: e.cancelled_at ? "—" : T(e.total_cents)
						})]
					}),
					e.items.map(_),
					ye(e) && /* @__PURE__ */ I("button", {
						type: "button",
						className: "sq-link mt-1",
						"data-testid": `bill-cancel-round-${e.id}`,
						disabled: i || !a || o,
						onClick: () => p(e.id),
						children: "Скасувати раунд"
					})
				]
			}, e.id)), /* @__PURE__ */ L("section", {
				className: "sq-card p-3",
				"data-testid": "bill-draft",
				children: [/* @__PURE__ */ I("p", {
					className: "sq-section-label",
					children: "Чернетка"
				}), t.length === 0 ? /* @__PURE__ */ I("p", {
					className: "py-2 text-sm text-sq-muted",
					children: "Нічого не набрано — тапніть страву в меню"
				}) : t.map((e) => {
					let t = e.modifierNames.length ? `${e.product_name}${e.variant_label ? ` · ${e.variant_label}` : ""} · ${e.modifierNames.join(" · ")}` : `${e.product_name}${e.variant_label ? ` · ${e.variant_label}` : ""}`, n = e.id != null && !e.pending;
					return /* @__PURE__ */ L("div", {
						className: `flex items-start justify-between gap-3 py-2 ${e.pending ? "opacity-60" : ""}`,
						"data-testid": e.id == null ? "bill-line-pending" : `bill-line-${e.id}`,
						"data-pending": e.pending ? "yes" : "no",
						children: [/* @__PURE__ */ L("div", {
							className: "min-w-0",
							children: [
								/* @__PURE__ */ L("button", {
									type: "button",
									className: "block w-full truncate text-left",
									"data-testid": e.id == null ? void 0 : `bill-line-edit-${e.id}`,
									disabled: i || !a || !n,
									onClick: () => f(e),
									children: [
										/* @__PURE__ */ L("span", {
											className: "tabular-nums",
											children: [e.quantity, "×"]
										}),
										" ",
										t
									]
								}),
								e.note && /* @__PURE__ */ L("p", {
									className: "text-xs italic text-sq-muted",
									children: ["✎ ", e.note]
								}),
								e.id != null && /* @__PURE__ */ L("div", {
									className: "mt-1 flex items-center gap-2",
									children: [/* @__PURE__ */ I("button", {
										type: "button",
										className: "sq-btn-tile",
										"data-testid": `bill-less-${e.id}`,
										disabled: i || !a || !n,
										onClick: () => u(e),
										children: "−"
									}), /* @__PURE__ */ I("button", {
										type: "button",
										className: "sq-btn-tile",
										"data-testid": `bill-more-${e.id}`,
										disabled: i || !a || !n,
										onClick: () => d(e),
										children: "+"
									})]
								})
							]
						}), /* @__PURE__ */ I("span", {
							className: "shrink-0 tabular-nums",
							children: e.preview_unit_cents == null ? "—" : `≈ ${T(e.preview_unit_cents * e.quantity)}`
						})]
					}, e.key);
				})]
			})]
		}), /* @__PURE__ */ L("footer", {
			className: "shrink-0 border-t border-sq-divider p-3",
			children: [
				/* @__PURE__ */ L("div", {
					className: "flex items-baseline justify-between",
					children: [/* @__PURE__ */ I("span", {
						className: "text-sm text-sq-muted",
						children: "До сплати"
					}), /* @__PURE__ */ I("span", {
						className: "text-2xl font-bold tabular-nums",
						"data-testid": "bill-owed",
						children: T(r)
					})]
				}),
				t.length > 0 && /* @__PURE__ */ L("div", {
					className: "flex items-baseline justify-between text-sm text-sq-muted",
					children: [/* @__PURE__ */ I("span", { children: "Чернетка (ще не відправлено)" }), /* @__PURE__ */ L("span", {
						className: "tabular-nums",
						"data-testid": "bill-draft-total",
						children: [n.exact ? "" : "≈ ", T(n.cents)]
					})]
				}),
				/* @__PURE__ */ L("div", {
					className: "mt-2 flex gap-2",
					children: [/* @__PURE__ */ L("button", {
						type: "button",
						className: "sq-btn-primary flex-1",
						"data-testid": "bill-fire",
						disabled: i || !a || o || t.length === 0,
						onClick: m,
						children: ["На кухню", n.lines > 0 ? ` · ${n.lines}` : ""]
					}), /* @__PURE__ */ I("button", {
						type: "button",
						className: "sq-btn-primary flex-1",
						"data-testid": "bill-pay",
						disabled: i || !a || o || !s || t.length > 0,
						onClick: h,
						children: "Оплатити"
					})]
				}),
				/* @__PURE__ */ I("button", {
					type: "button",
					className: "sq-link mt-2",
					"data-testid": "bill-precheck",
					disabled: i || !a || o || !c,
					onClick: g,
					children: e.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"
				}),
				l && /* @__PURE__ */ I("p", {
					className: "mt-1 text-xs text-sq-muted",
					"data-testid": "bill-print-status",
					children: l
				})
			]
		})]
	});
}
//#endregion
//#region src/modules/tables/components/BillSheet.tsx
function Ce({ title: e, onClose: t, children: n }) {
	return /* @__PURE__ */ L("div", {
		className: "fixed inset-0 z-40",
		"data-testid": "bill-sheet",
		children: [/* @__PURE__ */ I("button", {
			type: "button",
			className: "absolute inset-0 bg-black/40",
			"aria-label": "Закрити",
			onClick: t
		}), /* @__PURE__ */ L("div", {
			className: "absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-sq bg-sq-sidebar animate-fade-up",
			children: [/* @__PURE__ */ L("div", {
				className: "flex items-center justify-between border-b border-sq-divider bg-white px-4 py-3",
				children: [/* @__PURE__ */ I("p", {
					className: "font-semibold text-sq-text",
					children: e
				}), /* @__PURE__ */ I("button", {
					type: "button",
					onClick: t,
					className: "grid min-h-11 min-w-11 place-items-center text-sq-secondary",
					"aria-label": "Закрити",
					"data-testid": "bill-sheet-close",
					children: "✕"
				})]
			}), /* @__PURE__ */ I("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
//#endregion
//#region src/modules/tables/lib/menu.ts
function we(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function Te(e, t = we()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
//#endregion
//#region src/modules/tables/components/MenuCatalog.tsx
function Ee({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = N(), c = P(), l = J(), [u, d] = b(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	_(() => {
		i > 0 && s.refresh();
	}, [i]), _(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = D(e);
		if (t || O(e, n)) {
			d({
				variants: e,
				initialVariantId: e.length === 1 ? e[0].variant_id : null
			});
			return;
		}
		a({
			item: e[0],
			modifiers: w(n),
			note: ""
		});
	}
	async function m(e) {
		let t = await s.lookupBarcode(e);
		t.length > 0 && p(t), s.setQuery("");
	}
	let h = !s.loading && s.folderTiles.length === 0 && s.grouped.length === 0;
	return /* @__PURE__ */ L("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ I(ce, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ L("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ L("div", {
					className: "relative",
					children: [/* @__PURE__ */ I(K, {
						size: 18,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ I("input", {
						className: "pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ I(se, {
					tags: s.catalogBarTags,
					activeId: s.catalogBarActiveId,
					showBack: s.showBack,
					backLabel: s.backLabel,
					onSelect: s.selectCatalogBarTag,
					onBack: s.goBackOne
				})]
			}),
			/* @__PURE__ */ L("div", {
				ref: l,
				className: "flex-1 select-none overflow-auto bg-white p-3",
				children: [
					s.loading && s.grouped.length === 0 && /* @__PURE__ */ I("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ L("div", {
						className: "grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5",
						children: [s.folderTiles.map((e) => /* @__PURE__ */ I("div", {
							"data-testid": `menu-folder-${e.id}`,
							children: /* @__PURE__ */ I(oe, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = D(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = Te(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ I(X, {
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
					h && /* @__PURE__ */ I("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ I(pe, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: w(D(u.variants)),
				onAdd: ({ item: e, modifiers: t, note: n }) => {
					a({
						item: e,
						modifiers: t,
						note: n
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
function De(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Oe(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + De(n) : e, 0);
}
function ke(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function Ae(e) {
	return e.status !== "open" || $(e).length === 0;
}
//#endregion
//#region src/modules/tables/components/PaySheet.tsx
var je = [{
	id: "cash",
	label: "Готівка"
}, {
	id: "card",
	label: "Картка"
}];
function Me({ bill: e, busy: t, onClose: n, onPay: r }) {
	let i = v(() => $(e), [e]), [a, o] = b(() => new Set(i.map(({ line: e }) => e.id))), [s, c] = b(1), [l, u] = b("card"), d = Oe(i, a), f = a.size === i.length, p = ke(d, s);
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
	return /* @__PURE__ */ L("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [
			/* @__PURE__ */ L("div", {
				className: "flex items-center justify-between gap-2 border-b border-sq-divider p-3",
				children: [/* @__PURE__ */ L("p", {
					className: "text-lg font-semibold",
					children: ["Оплата · стіл ", e.table_name]
				}), /* @__PURE__ */ I("button", {
					type: "button",
					className: "sq-link",
					onClick: n,
					"data-testid": "pay-close",
					children: "Назад"
				})]
			}),
			/* @__PURE__ */ L("div", {
				className: "flex-1 overflow-auto p-3",
				children: [/* @__PURE__ */ L("div", {
					className: "mb-2 flex items-center justify-between",
					children: [/* @__PURE__ */ I("p", {
						className: "sq-section-label",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ I("button", {
						type: "button",
						className: "sq-link",
						"data-testid": "pay-select-all",
						onClick: () => o(f ? /* @__PURE__ */ new Set() : new Set(i.map(({ line: e }) => e.id))),
						children: f ? "Зняти все" : "Обрати все"
					})]
				}), i.map(({ line: e, round: n }) => {
					let r = a.has(e.id);
					return /* @__PURE__ */ L("button", {
						type: "button",
						"data-testid": `pay-line-${e.id}`,
						"aria-pressed": r,
						disabled: t,
						onClick: () => m(e.id),
						className: `mb-1 flex w-full items-center justify-between gap-3 rounded-lg border p-2 text-left ${r ? "border-sq-blue bg-sq-blue/10" : "border-sq-divider"}`,
						children: [/* @__PURE__ */ L("span", {
							className: "min-w-0",
							children: [/* @__PURE__ */ L("span", {
								className: "block truncate",
								children: [
									/* @__PURE__ */ L("span", {
										className: "tabular-nums",
										children: [e.quantity, "×"]
									}),
									" ",
									xe(e, !0)
								]
							}), /* @__PURE__ */ L("span", {
								className: "block text-xs text-sq-muted",
								children: ["раунд ", n.seq]
							})]
						}), /* @__PURE__ */ I("span", {
							className: "shrink-0 tabular-nums",
							children: T(De(e))
						})]
					}, e.id);
				})]
			}),
			/* @__PURE__ */ L("div", {
				className: "border-t border-sq-divider p-3",
				children: [
					/* @__PURE__ */ L("div", {
						className: "mb-2 flex items-center justify-between gap-2",
						children: [/* @__PURE__ */ I("span", {
							className: "text-sm text-sq-muted",
							children: "Порівну на"
						}), /* @__PURE__ */ L("div", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ I("button", {
									type: "button",
									className: "sq-btn-tile",
									"data-testid": "pay-ways-less",
									disabled: t || s <= 1,
									onClick: () => c((e) => Math.max(1, e - 1)),
									children: "−"
								}),
								/* @__PURE__ */ I("span", {
									className: "min-w-8 text-center tabular-nums",
									"data-testid": "pay-ways",
									children: s
								}),
								/* @__PURE__ */ I("button", {
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
					s > 1 && /* @__PURE__ */ L("p", {
						className: "mb-2 text-xs text-sq-muted",
						"data-testid": "pay-shares",
						children: [
							p.map((e) => T(e)).join(" + "),
							" — один чек, ",
							s,
							" оплат"
						]
					}),
					/* @__PURE__ */ I("div", {
						className: "mb-2 flex gap-2",
						children: je.map((e) => /* @__PURE__ */ I("button", {
							type: "button",
							"data-testid": `pay-method-${e.id}`,
							"aria-pressed": l === e.id,
							onClick: () => u(e.id),
							className: `flex-1 rounded-lg border p-2 ${l === e.id ? "border-sq-blue bg-sq-blue/10" : "border-sq-divider"}`,
							children: e.label
						}, e.id))
					}),
					/* @__PURE__ */ L("button", {
						type: "button",
						className: "sq-btn-primary w-full",
						"data-testid": "pay-submit",
						disabled: t || d <= 0,
						onClick: h,
						children: [
							"Оплатити ",
							T(d),
							f ? "" : " (частина)"
						]
					})
				]
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/draft.ts
function Ne(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = k(D([n]), r);
	return {
		token: t,
		uid: C(n.variant_id, r, i),
		variant_id: n.variant_id,
		product_id: n.product_id,
		product_name: n.product_name,
		variant_label: n.label,
		quantity: 1,
		modifiers: [...r],
		modifierNames: a.error ? [] : a.names,
		note: i,
		preview_cents: a.error ? null : n.price_cents + a.deltaCents
	};
}
function Pe(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return C(e.variant_id, t, e.note);
}
function Fe(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: Pe(e),
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
function Ie(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? Le(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function Le(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function Re(e) {
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
function ze(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function Be(e, t = /* @__PURE__ */ new Date()) {
	let n = $(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: De(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: ze(e.opened_at, t),
		printed_at: ze(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0)
	};
}
//#endregion
//#region src/modules/tables/lib/useBill.ts
function Ve() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function He(e, { online: n, mirrored: r = !1, storeId: i = null } = { online: !0 }) {
	let [o, s] = b(null), [c, l] = b(!0), [p, m] = b(null), [h, v] = b(null), [x, S] = b(!1), [C, w] = b([]), [T, E] = b(0), [D, O] = b(!1), [ee, k] = b(null), A = y(!0), j = y([]), M = y(!1), N = y(!1);
	_(() => (A.current = !0, () => {
		A.current = !1;
	}), []);
	let P = g(async () => {
		if (!r || i == null) return !1;
		let t = await u(i, e);
		return !t || !A.current ? !1 : (s(t.bill), O(!0), k(t.savedAt), l(!1), !0);
	}, [
		e,
		r,
		i
	]), F = g(async () => {
		if (!n) {
			let e = await P();
			A.current && !e && l(!1);
			return;
		}
		try {
			let t = await f(e);
			if (!A.current) return;
			s(t), m(null), O(!1), k(null), r && i != null && a(i, t);
		} catch (e) {
			if (!A.current) return;
			let t = await P();
			A.current && !t && m(d(e, "Не вдалося прочитати рахунок"));
		} finally {
			A.current && l(!1);
		}
	}, [
		e,
		n,
		P,
		r,
		i
	]);
	_(() => {
		F();
	}, [F]);
	let I = g(async () => {
		if (M.current) return;
		M.current = !0;
		let e = !1;
		try {
			for (; j.current.length > 0;) {
				let t = j.current.shift();
				t.kind === "blocking" && (N.current = !0, S(!0));
				try {
					let e = await t.write();
					A.current && (s(e), O(!1), k(null), t.kind === "blocking" && t.stock && E((e) => e + 1)), r && i != null && a(i, e), t.kind === "blocking" && t.resolve(!0);
				} catch (n) {
					e = !0, A.current && v(d(n, "Не вдалося зберегти")), t.kind === "blocking" && t.resolve(!1);
				} finally {
					t.kind === "add" && A.current && w((e) => e.filter((e) => e.token !== t.token)), t.kind === "blocking" && (N.current = !1, A.current && S(!1));
				}
			}
		} finally {
			M.current = !1;
		}
		e && A.current && F();
	}, [
		r,
		i,
		F
	]);
	return {
		bill: o,
		loading: c,
		error: p,
		banner: h,
		busy: x,
		pending: C,
		epoch: T,
		stale: D,
		savedAt: ee,
		clearBanner: () => v(null),
		notice: (e) => v(e),
		reload: F,
		addLine: g((r) => {
			if (!n) {
				v("Потрібна мережа");
				return;
			}
			v(null);
			let i = Ve(), a = Ne(r, i);
			w((e) => [...e, a]), j.current.push({
				kind: "add",
				token: i,
				write: () => t(e, {
					variant_id: a.variant_id,
					quantity: 1,
					modifiers: a.modifiers,
					note: a.note
				})
			}), I();
		}, [
			e,
			n,
			I
		]),
		run: g((e, t = {}) => N.current ? Promise.resolve(!1) : n ? (v(null), new Promise((n) => {
			j.current.push({
				kind: "blocking",
				stock: t.stock === !0,
				write: e,
				resolve: n
			}), I();
		})) : (v("Потрібна мережа"), Promise.resolve(!1)), [n, I])
	};
}
//#endregion
//#region src/modules/tables/lib/useIsWide.ts
var Ue = "(min-width: 1024px)";
function We() {
	let [e, t] = b(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(Ue).matches);
	return _(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(Ue), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
//#endregion
//#region src/modules/tables/pages/BillPage.tsx
function Ge() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function Ke() {
	let { billId: t } = ne(), r = Number(t), a = j((e) => e.online), c = M(), u = A((e) => e.auth?.store.id ?? null), { bill: d, loading: f, error: m, banner: h, busy: g, pending: _, epoch: y, stale: S, savedAt: C, clearBanner: w, notice: T, reload: D, addLine: O, run: k } = He(r, {
		online: a,
		mirrored: c !== "web",
		storeId: u
	}), N = We(), F = P().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [R, z] = b(!1), [B, V] = b(!1), [H, U] = b(null), [W, G] = b(null), K = te(), q = v(() => d ? Fe(d.draft, _) : [], [d, _]), J = v(() => Re(q), [q]), Y = v(() => d ? $(d) : [], [d]), [X, re] = b([]), Z = v(() => Ie(q, X), [q, X]);
	if (!a && !S && !f) return /* @__PURE__ */ I("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ L("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ I("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ I("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (f) return /* @__PURE__ */ I("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (m || !d) return /* @__PURE__ */ I("div", {
		className: "p-4",
		children: /* @__PURE__ */ L("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ I("p", {
				className: "text-sm",
				children: m ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ I("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void D(),
				children: "Повторити"
			})]
		})
	});
	let ie = async (e) => {
		let t = !1;
		await k(async () => {
			let n = await s(d.id, e);
			return t = Ae(n.bill), n.bill;
		}, { stock: !0 }) && (V(!1), t && K("/tables"));
	}, ae = async () => {
		if (G(null), await k(() => n(d.id)) && c === "cashier") try {
			let [e, t] = await Promise.all([E("receiptPrinterName"), E("receiptPaperWidthMm")]);
			if (!e) return;
			await ee(e, Be(d), t === 58 || t === 80 ? t : x), G("Передчек надіслано на друк");
		} catch (e) {
			G(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, Q = () => {
		z(!1), k(() => o(d.id, Ge()), { stock: !0 });
	}, oe = (t) => {
		if (t.id == null) return;
		let n = t.id;
		k(() => t.quantity > 1 ? e(d.id, n, t.quantity - 1) : i(d.id, n));
	}, se = (t) => {
		if (t.id == null) return;
		let n = t.id;
		k(() => e(d.id, n, t.quantity + 1));
	}, ce = (e) => {
		if (e.id == null) return;
		let t = X.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		if (!t) {
			T("Страви вже немає в меню — зніміть рядок і додайте іншу");
			return;
		}
		U({
			row: e,
			variants: [...t[1]]
		});
	}, le = (e, t, n) => {
		let r = H?.row.id;
		U(null), r != null && k(() => p(d.id, r, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, ue = /* @__PURE__ */ I(Se, {
		bill: d,
		draft: q,
		summary: J,
		owedCents: d.fired_total_cents,
		busy: g,
		online: a,
		hasPending: _.length > 0,
		canPay: Y.length > 0,
		canPrecheck: Y.length > 0,
		printStatus: W,
		onLess: oe,
		onMore: se,
		onEdit: ce,
		onCancelRound: (e) => void k(() => l(d.id, e), { stock: !0 }),
		onFire: Q,
		onPay: () => {
			z(!1), V(!0);
		},
		onPrecheck: () => void ae()
	});
	return /* @__PURE__ */ L("div", {
		className: "relative flex h-full flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ L("header", {
				className: "flex shrink-0 items-baseline justify-between gap-2 border-b border-sq-divider px-3 py-2",
				children: [/* @__PURE__ */ L("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ L("p", {
						className: "truncate text-lg font-bold",
						children: ["Стіл ", d.table_name]
					}), /* @__PURE__ */ L("p", {
						className: "truncate text-xs text-sq-muted",
						children: [
							d.hall_name,
							" · рахунок ",
							d.bill_no,
							" · ",
							d.guests,
							" гост. · ",
							d.opened_by_name
						]
					})]
				}), /* @__PURE__ */ I("button", {
					type: "button",
					className: "sq-link shrink-0",
					onClick: () => K("/tables"),
					children: "До зали"
				})]
			}),
			S && /* @__PURE__ */ L("p", {
				className: "mx-3 mt-2 rounded-lg bg-amber-500/15 p-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					C == null ? "" : `, станом на ${String(new Date(C).getHours()).padStart(2, "0")}:${String(new Date(C).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			h && /* @__PURE__ */ L("p", {
				className: "mx-3 mt-2 rounded-lg bg-rose-500/15 p-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					h,
					" ",
					/* @__PURE__ */ I("button", {
						type: "button",
						className: "sq-link",
						onClick: w,
						children: "Зрозуміло"
					})
				]
			}),
			/* @__PURE__ */ L("div", {
				className: `min-h-0 flex-1 ${N ? "grid grid-cols-[1fr_360px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ I(Ee, {
					counts: Z,
					online: a,
					active: a && !B && !R && !H,
					canScan: c === "cashier",
					epoch: y,
					onAdd: O,
					onRows: re
				}), N && /* @__PURE__ */ I("aside", {
					className: "flex min-h-0 flex-col border-l border-sq-divider bg-sq-bg",
					children: ue
				})]
			}),
			!N && /* @__PURE__ */ I(_e, {
				summary: J,
				owedCents: d.fired_total_cents,
				hasPending: _.length > 0,
				busy: g,
				online: a,
				onOpen: () => z(!0),
				onFire: Q
			}),
			!N && R && /* @__PURE__ */ I(Ce, {
				title: `Стіл ${d.table_name} · рахунок ${d.bill_no}`,
				onClose: () => z(!1),
				children: ue
			}),
			B && /* @__PURE__ */ I(Me, {
				bill: d,
				busy: g,
				onClose: () => V(!1),
				onPay: (e) => void ie(e)
			}),
			H && /* @__PURE__ */ I("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ I(pe, {
					productName: H.row.product_name,
					variants: H.variants,
					variantLabel: F,
					initialVariantId: H.row.variant_id,
					initialModifierIds: H.row.modifierIds,
					initialNote: H.row.note,
					submitLabel: "Зберегти",
					onAdd: ({ item: e, modifiers: t, note: n }) => le(e, t, n),
					onClose: () => U(null)
				})
			})
		]
	});
}
//#endregion
//#region src/modules/tables/lib/hallMap.ts
function qe(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t) n.set(e.table_id, e);
	return e.tables.map((e) => ({
		table: e,
		bill: n.get(e.id) ?? null
	})).filter((e) => e.table.is_active || e.bill != null);
}
function Je(e) {
	return e ? e.prep_status === "ready" ? "ready" : e.prep_status === "new" ? "waiting" : "seated" : "free";
}
function Ye(e, t) {
	let n = Math.max(0, Math.floor((new Date(t).getTime() - new Date(e).getTime()) / 6e4));
	return Number.isFinite(n) ? n < 60 ? `${n} хв` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "";
}
function Xe(e, t) {
	return e.filter((e) => e.is_active || qe(e, t).some((e) => e.bill));
}
function Ze(e) {
	let t = 1, n = 1;
	for (let { table: r } of e) t = Math.max(t, r.pos_x + r.width), n = Math.max(n, r.pos_y + r.height);
	return {
		cols: t,
		rows: n
	};
}
//#endregion
//#region src/modules/tables/components/TableTile.tsx
var Qe = {
	free: "border-sq-divider bg-sq-surface text-sq-text",
	seated: "border-sq-blue/40 bg-sq-blue/10 text-sq-text",
	waiting: "border-amber-400/60 bg-amber-400/15 text-sq-text",
	ready: "border-emerald-500/60 bg-emerald-500/20 text-sq-text"
}, $e = {
	free: "вільний",
	seated: "зайнятий",
	waiting: "готується",
	ready: "готово"
};
function et({ seat: e, now: t, onOpen: n, disabled: r }) {
	let { table: i, bill: a } = e, o = Je(a);
	return /* @__PURE__ */ L("button", {
		type: "button",
		"data-testid": `table-tile-${i.id}`,
		"data-tone": o,
		disabled: r,
		onClick: () => n(e),
		style: {
			gridColumn: `${i.pos_x + 1} / span ${i.width}`,
			gridRow: `${i.pos_y + 1} / span ${i.height}`
		},
		className: `flex min-h-20 flex-col items-center justify-center gap-0.5 border p-2 text-center transition disabled:opacity-60 ${i.shape === "round" ? "rounded-full" : "rounded-xl"} ${Qe[o]}`,
		children: [/* @__PURE__ */ I("span", {
			className: "text-2xl font-bold leading-none tabular-nums",
			children: i.name
		}), a ? /* @__PURE__ */ L(F, { children: [
			/* @__PURE__ */ I("span", {
				className: "text-xs tabular-nums",
				children: T(a.fired_total_cents)
			}),
			/* @__PURE__ */ L("span", {
				className: "text-[11px] text-sq-muted",
				children: [
					Ye(a.opened_at, t),
					" · ",
					a.guests,
					" гост."
				]
			}),
			/* @__PURE__ */ I("span", {
				className: "sr-only",
				children: $e[o]
			}),
			(a.draft_count > 0 || a.precheck_printed_at) && /* @__PURE__ */ L("span", {
				className: "flex items-center gap-1 text-[11px]",
				children: [a.draft_count > 0 && /* @__PURE__ */ I("span", {
					"data-testid": `table-draft-${i.id}`,
					title: "Не відправлено на кухню",
					children: "•"
				}), a.precheck_printed_at && /* @__PURE__ */ I("span", {
					"data-testid": `table-precheck-${i.id}`,
					title: "Передчек надруковано",
					children: "₴?"
				})]
			})
		] }) : /* @__PURE__ */ L("span", {
			className: "text-[11px] text-sq-muted",
			children: [i.seats, " місць"]
		})]
	});
}
//#endregion
//#region src/modules/tables/pages/HallMapPage.tsx
function tt(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function nt() {
	let e = j((e) => e.online), t = M(), n = A((e) => e.auth?.store.id ?? null), { halls: i, bills: a, now: o, loading: s, error: l, stale: u, savedAt: f, refresh: p } = c({
		online: e,
		mirrored: t !== "web",
		storeId: n
	}), [m, h] = b(null), [g, _] = b(!1), [y, x] = b(null), S = te(), C = v(() => Xe(i, a), [i, a]), w = C.find((e) => e.id === m) ?? C[0] ?? null, T = v(() => w ? qe(w, a) : [], [w, a]), E = v(() => Ze(T), [T]);
	async function D(t) {
		if (!g) {
			if (!e) {
				x("Потрібна мережа, щоб відкрити стіл");
				return;
			}
			_(!0), x(null);
			try {
				let e = await r(t.table.id);
				S(`/tables/${e.bill.id}`);
			} catch (e) {
				x(d(e, "Не вдалося відкрити стіл")), p();
			} finally {
				_(!1);
			}
		}
	}
	return !e && !u && !s ? /* @__PURE__ */ I("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ L("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ I("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ I("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ L("div", {
		className: "flex h-full flex-col",
		"data-testid": "hall-map",
		children: [
			C.length > 1 && /* @__PURE__ */ I("div", {
				className: "flex gap-2 overflow-x-auto p-3",
				children: C.map((e) => /* @__PURE__ */ I("button", {
					type: "button",
					"data-testid": `hall-tab-${e.id}`,
					onClick: () => h(e.id),
					className: `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${w?.id === e.id ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-sq-surface text-sq-text"}`,
					children: e.name
				}, e.id))
			}),
			u && /* @__PURE__ */ L("p", {
				className: "mx-3 mb-2 rounded-lg bg-amber-500/15 p-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", f == null ? "" : `, станом на ${tt(f)}`]
			}),
			y && /* @__PURE__ */ I("p", {
				className: "mx-3 mb-2 rounded-lg bg-rose-500/15 p-2 text-sm",
				"data-testid": "tables-banner",
				children: y
			}),
			s && C.length === 0 && /* @__PURE__ */ I("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!s && l && /* @__PURE__ */ I("div", {
				className: "p-4",
				children: /* @__PURE__ */ L("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ I("p", {
						className: "text-sm",
						children: l
					}), /* @__PURE__ */ I("button", {
						type: "button",
						className: "sq-btn-primary mt-3",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!s && !l && C.length === 0 && /* @__PURE__ */ I("div", {
				className: "p-4",
				children: /* @__PURE__ */ L("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ I("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ I("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			w && /* @__PURE__ */ I("div", {
				className: "grid flex-1 content-start gap-2 overflow-auto p-3",
				style: {
					gridTemplateColumns: `repeat(${E.cols}, minmax(4.5rem, 1fr))`,
					gridAutoRows: "minmax(4.5rem, auto)"
				},
				children: T.map((e) => /* @__PURE__ */ I(et, {
					seat: e,
					now: o,
					disabled: g,
					onOpen: (e) => void D(e)
				}, e.table.id))
			})
		]
	});
}
//#endregion
//#region src/modules/tables/pages/TablesRoutes.tsx
function rt() {
	return /* @__PURE__ */ L(z, { children: [/* @__PURE__ */ I(R, {
		index: !0,
		element: /* @__PURE__ */ I(nt, {})
	}), /* @__PURE__ */ I(R, {
		path: ":billId",
		element: /* @__PURE__ */ I(Ke, {})
	})] });
}
//#endregion
export { rt as TablesRoutes };
