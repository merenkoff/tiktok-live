import { $ as e, B as t, C as n, D as r, F as i, G as a, H as o, I as s, J as c, K as l, L as u, M as d, N as f, P as p, Q as m, R as h, S as g, T as _, U as v, V as y, W as b, X as x, Y as S, Z as C, _ as w, a as T, at as E, b as D, c as O, ct as k, d as A, et as j, f as M, g as ee, h as te, i as N, it as P, j as F, k as ne, n as re, nt as I, o as L, p as R, q as ie, r as z, rt as B, s as ae, st as V, t as H, tt as oe, w as se, x as ce, y as le, z as ue } from "./useHallMap-BGZ5vksW.js";
import { useCallback as U, useEffect as W, useMemo as G, useRef as K, useState as q } from "react";
import { Fragment as J, jsx as Y, jsxs as X } from "react/jsx-runtime";
import { DEFAULT_RECEIPT_PAPER_WIDTH as de, assetUrl as fe, cartLineUid as pe, defaultModifierIds as me, formatUah as Z, getMeta as he, groupsOf as Q, needsModifierSheet as ge, printPrecheck as _e, resolveLineModifiers as ve, useAuthStore as ye, useOfflineStatus as be, usePosShell as xe, useSalesCatalog as Se, useVertical as Ce } from "@pos/platform";
import { Route as we, Routes as Te, useLocation as Ee, useNavigate as De, useParams as Oe } from "react-router-dom";
// src/hooks/useDragScroll.ts
var ke = 6;
function Ae() {
	let e = K(null);
	return W(() => {
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
			!n.moved && Math.hypot(r, i) > ke && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
// src/lib/money.ts
var je = "\xA0";
function $(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, je);
}
function Me(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${$(n)},${r} ₴`;
}
function Ne(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${$(String(Math.abs(e) / 100))} ₴` : Me(e);
}
// src/components/cashier/ProductTile.tsx
function Pe({ name: e, subtitle: t, priceCents: n, compareAtCents: r, priceUnit: i, imageUrl: a, stock: o, onClick: s, disabled: c, count: l, onMore: u, badge: d, testId: f }) {
	let [p, h] = q(!1), g = p ? null : fe(a), _ = c || !!d || o != null && o <= 0, v = /* @__PURE__ */ X("button", {
		type: "button",
		disabled: c,
		onClick: s,
		"data-testid": f,
		className: `w-full ${u ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${l ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ X("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				g ? /* @__PURE__ */ Y("img", {
					src: g,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${_ ? "opacity-45" : ""}`,
					onError: () => h(!0)
				}) : /* @__PURE__ */ Y("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				l != null && l > 0 && /* @__PURE__ */ Y("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: l
				}),
				d ? /* @__PURE__ */ Y("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: d
				}) : o != null && o <= 0 && /* @__PURE__ */ Y("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ X("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ Y("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${_ ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ X("p", {
				className: "text-[14px] text-sq-secondary tabular-nums flex items-baseline gap-1.5",
				children: [r != null && r > n && /* @__PURE__ */ Y("s", {
					className: "text-[12px] text-sq-muted",
					"data-testid": "tile-old-price",
					children: Me(r)
				}), /* @__PURE__ */ X("span", { children: [Me(n), i ? `/${i}` : ""] })]
			})]
		})]
	});
	return u ? /* @__PURE__ */ X("div", {
		className: "relative",
		children: [v, !c && /* @__PURE__ */ Y("button", {
			type: "button",
			onClick: u,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": f ? `${f}-more` : "tile-more",
			children: /* @__PURE__ */ Y("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ Y(m, { size: 20 })
			})
		})]
	}) : v;
}
// src/lib/tagColors.ts
var Fe = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Ie = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, Le = "slate";
function Re(e) {
	return !!e && Fe.includes(e);
}
function ze(e) {
	return Re(e) ? Ie[e] : Ie[Le];
}
// src/components/cashier/TagFolderTile.tsx
function Be({ name: e, color: t, onClick: n }) {
	let r = ze(t);
	return /* @__PURE__ */ X("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ Y("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ Y(x, {
				size: 40,
				className: "text-white/95"
			})
		}), /* @__PURE__ */ X("span", {
			className: "px-3 pt-2 pb-2.5 text-[14px] font-semibold leading-tight line-clamp-2 text-sq-text",
			children: [e, /* @__PURE__ */ Y("span", {
				className: "block text-[14px] font-normal text-sq-secondary",
				children: "Папка"
			})]
		})]
	});
}
// src/components/cashier/CatalogTagBar.tsx
function Ve({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = Ae(), s = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ X("div", {
		ref: o,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ X("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ Y(ie, { size: 16 }), r]
			}),
			/* @__PURE__ */ Y("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ Y("button", {
				type: "button",
				onClick: () => i(e),
				className: s(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
var He = 2e3, Ue = {
	Minus: ["-", "_"],
	NumpadSubtract: ["-", "-"],
	Equal: ["=", "+"],
	NumpadAdd: ["+", "+"],
	Slash: ["/", "?"],
	NumpadDivide: ["/", "/"],
	Period: [".", ">"],
	NumpadDecimal: [".", "."],
	Comma: [",", "<"],
	Space: [" ", " "],
	Semicolon: [";", ":"],
	Quote: ["'", "\""],
	BracketLeft: ["[", "{"],
	BracketRight: ["]", "}"],
	Backslash: ["\\", "|"],
	Backquote: ["`", "~"],
	NumpadMultiply: ["*", "*"]
};
function We(e, t, n, r = !1) {
	if (/^[\x20-\x7e]$/.test(e)) return e;
	let i = /^Key([A-Z])$/.exec(t);
	if (i) return n === r ? i[1].toLowerCase() : i[1];
	let a = /^(?:Digit|Numpad)([0-9])$/.exec(t);
	if (a) return a[1];
	let o = Ue[t];
	return o ? n ? o[1] : o[0] : e;
}
function Ge(e) {
	let t = e?.value;
	return typeof t == "string" ? t : null;
}
function Ke() {
	let e = null;
	function t(t) {
		if (t.ctrlKey || t.altKey || t.metaKey || t.isComposing || t.key === "Process" || t.repeat) return e = null, { kind: "pass" };
		if (t.key === "Enter") {
			let n = e;
			if (e = null, !n || !n.chars.trim() || n.field !== t.field) return { kind: "pass" };
			let r = t.time - n.last;
			if (n.field === null) {
				if (r > 2e3) return { kind: "pass" };
			} else if (n.chars.length < 4 || r > 120) return { kind: "pass" };
			return {
				kind: "scan",
				code: n.chars.trim(),
				field: n.field,
				restore: n.before
			};
		}
		if (t.key === "Shift" || t.key === "CapsLock") return { kind: "pass" };
		if (t.key.length !== 1) return e = null, { kind: "pass" };
		let n = We(t.key, t.code, t.shiftKey, t.capsLock), r = e ? t.time - e.last : Infinity, i = t.field === null ? He : 60;
		return !e || e.field !== t.field || r > i ? e = {
			chars: n,
			last: t.time,
			field: t.field,
			before: Ge(t.field)
		} : (e.chars += n, e.last = t.time), { kind: "pass" };
	}
	return {
		feed: t,
		reset() {
			e = null;
		}
	};
}
// src/components/cashier/ScanWedge.tsx
function qe({ active: e, onScan: t }) {
	let n = xe(), r = K(null), i = K(t);
	W(() => {
		i.current = t;
	});
	let a = K(e);
	W(() => {
		a.current = e;
	});
	let o = n !== "tablet";
	return W(() => {
		if (!o) return;
		let e = Ke(), t = !0, n = (n) => {
			let o = a.current && !Xe(r.current);
			o !== t && e.reset(), t = o;
			let s = Qe(n.target), c = e.feed({
				key: n.key,
				code: n.code,
				shiftKey: n.shiftKey,
				capsLock: n.getModifierState?.("CapsLock") ?? !1,
				ctrlKey: n.ctrlKey,
				altKey: n.altKey,
				metaKey: n.metaKey,
				repeat: n.repeat,
				isComposing: n.isComposing,
				time: n.timeStamp || performance.now(),
				field: s ?? (o ? null : Ye)
			});
			c.kind === "scan" && (n.preventDefault(), n.stopPropagation(), c.field && c.field !== Ye && c.restore !== null && $e(c.field, c.restore), o && i.current(c.code));
		};
		return window.addEventListener("keydown", n, !0), () => window.removeEventListener("keydown", n, !0);
	}, [o]), n === "tablet" ? null : /* @__PURE__ */ Y("span", {
		ref: r,
		hidden: !0,
		"data-scan-wedge": ""
	});
}
var Je = "[role=\"dialog\"], [role=\"alertdialog\"], [aria-modal=\"true\"]", Ye = new EventTarget();
function Xe(e) {
	for (let t of document.querySelectorAll(Je)) if (!e || !t.contains(e)) return !0;
	return !1;
}
var Ze = /* @__PURE__ */ new Set([
	"button",
	"checkbox",
	"radio",
	"range",
	"color",
	"file",
	"submit",
	"reset",
	"image"
]);
function Qe(e) {
	return e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement ? e : e instanceof HTMLInputElement ? Ze.has(e.type) ? null : e : e instanceof HTMLElement && e.isContentEditable ? e : null;
}
function $e(e, t) {
	let n = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
	n && (Object.getOwnPropertyDescriptor(n, "value")?.set?.call(e, t), e.dispatchEvent(new Event("input", { bubbles: !0 })));
}
function et(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function tt(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function nt(e, t) {
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
	for (let e of tt(t)) {
		let t = n.get(e);
		t ? i.push(t) : r ?? (r = `Модифікатор ${e} недоступний для цього товару`);
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
function rt(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function it(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
// src/components/cashier/ModifierSheet.tsx
function at({ productName: t, variants: n, variantLabel: r = "Варіант", initialVariantId: i, initialModifierIds: o, initialNote: s, submitLabel: l = "Додати в чек", withQuantity: u = !0, notePlaceholder: d = "Коментар для кухні", onAdd: f, onClose: p }) {
	let [m, h] = q(() => i ?? (n.length === 1 ? n[0].variant_id : null)), [g, _] = q(() => o ?? []), [v, y] = q(s ?? ""), [b, x] = q(1), S = Ae(), w = n.find((e) => e.variant_id === m) ?? null, T = w?.modifier_groups?.length ? w.modifier_groups : it(n), E = nt(T, g), D = w ? w.price_cents + E.deltaCents : null, O = w == null ? `Оберіть «${r}»` : E.error ?? (D != null && D < 0 ? "Ціна не може бути відʼємною" : null), A = O == null && w != null;
	W(() => {
		let e = (e) => {
			e.key === "Escape" && p();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [p]);
	function M(e, t) {
		return t.filter((t) => e.modifiers.some((e) => e.id === t)).length;
	}
	function ee(e, t) {
		_((n) => n.includes(t.id) ? n.filter((e) => e !== t.id) : e.max_select === 1 ? [...n.filter((t) => !e.modifiers.some((e) => e.id === t)), t.id] : M(e, n) >= e.max_select ? n : [...n, t.id]);
	}
	function te() {
		A && w && f({
			item: w,
			modifiers: E.snapshot.map((e) => e.id),
			note: et(v),
			quantity: u ? b : 1
		});
	}
	let N = w ? rt(w.label, E.error ? [] : E.names) : "", P = fe((w ?? n[0])?.image_url ?? null), F = n.length ? Math.min(...n.map((e) => e.price_cents)) : null, ne = [...n].sort((e, t) => e.price_cents - t.price_cents);
	return /* @__PURE__ */ X("div", {
		className: "absolute inset-0 z-30",
		"data-testid": "modifier-sheet",
		children: [/* @__PURE__ */ Y("div", {
			"aria-hidden": !0,
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: p,
			"data-testid": "modifier-scrim"
		}), /* @__PURE__ */ X("div", {
			role: "dialog",
			"aria-label": t,
			className: "absolute inset-x-0 bottom-0 bg-white rounded-t-card shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up flex flex-col max-h-[88%]",
			children: [
				/* @__PURE__ */ Y("div", {
					"aria-hidden": !0,
					className: "w-10 h-[5px] rounded-full bg-sq-divider self-center mt-2 shrink-0"
				}),
				/* @__PURE__ */ X("div", {
					className: "px-6 pt-2.5 pb-3.5 flex items-center gap-3.5 shadow-[0_1px_0_#E6E8EC] shrink-0",
					children: [
						P ? /* @__PURE__ */ Y("img", {
							src: P,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ Y("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ Y(c, { size: 24 })
						}),
						/* @__PURE__ */ X("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ Y("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: t
							}), F != null && /* @__PURE__ */ Y("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: n.length > 1 ? `від ${Me(F)}` : Me(F)
							})]
						}),
						/* @__PURE__ */ Y("button", {
							type: "button",
							onClick: p,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ Y(k, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ X("div", {
					ref: S,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						n.length > 1 && /* @__PURE__ */ X("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ Y(ct, {
								name: r,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ Y("div", {
								className: "flex flex-wrap gap-2",
								children: ne.map((e) => {
									let t = e.variant_id === m, n = e.quantity <= 0;
									return /* @__PURE__ */ X("button", {
										type: "button",
										disabled: n,
										"aria-pressed": t,
										onClick: () => h(e.variant_id),
										className: ut(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ Y(a, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ Y("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : Ne(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						T.map((e) => {
							let t = M(e, g), n = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ X("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ Y(ct, {
									name: e.name,
									hint: lt(e, n),
									required: e.min_select >= 1
								}), /* @__PURE__ */ Y("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let r = g.includes(t.id), i = !r && n;
										return /* @__PURE__ */ X("button", {
											type: "button",
											"aria-pressed": r,
											"aria-disabled": i || void 0,
											onClick: () => ee(e, t),
											className: ut(r, i),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												r && /* @__PURE__ */ Y(a, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ Y("span", {
													className: r ? "font-medium" : "font-medium text-sq-secondary",
													children: dt(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ X("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ Y(e, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ Y("input", {
								className: "flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-sq-text placeholder:text-sq-muted",
								value: v,
								maxLength: 120,
								placeholder: d,
								"aria-label": d,
								enterKeyHint: "done",
								onChange: (e) => y(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && (e.preventDefault(), te());
								},
								"data-testid": "modifier-note"
							})]
						})
					]
				}),
				/* @__PURE__ */ X("div", {
					className: "shrink-0 px-6 pt-3 pb-[18px] flex flex-wrap items-center gap-x-4 gap-y-2 shadow-[0_-1px_0_#E6E8EC]",
					children: [
						u && /* @__PURE__ */ X("div", {
							className: "flex items-center gap-1.5",
							"data-testid": "modifier-qty",
							children: [
								/* @__PURE__ */ Y("button", {
									type: "button",
									"aria-label": "Менше",
									disabled: b <= 1,
									onClick: () => x((e) => Math.max(1, e - 1)),
									className: st,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ Y(C, { size: 20 })
								}),
								/* @__PURE__ */ Y("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: b
								}),
								/* @__PURE__ */ Y("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: b >= ot,
									onClick: () => x((e) => Math.min(ot, e + 1)),
									className: st,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ Y(j, { size: 20 })
								})
							]
						}),
						O ? /* @__PURE__ */ Y("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: O
						}) : /* @__PURE__ */ Y("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: N
						}),
						/* @__PURE__ */ Y("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !A,
							onClick: te,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ X("span", { children: [l, D != null && /* @__PURE__ */ X(J, { children: [" · ", /* @__PURE__ */ Y("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: Me(D * b)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var ot = 99, st = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function ct({ name: e, hint: t, required: n }) {
	return /* @__PURE__ */ X("div", {
		className: "flex items-baseline gap-2 mb-2.5",
		children: [/* @__PURE__ */ Y("span", {
			className: "text-base font-bold text-sq-heading",
			children: e
		}), t && /* @__PURE__ */ Y("span", {
			className: `text-[13px] ${n ? "text-red-600" : "text-sq-muted"}`,
			children: t
		})]
	});
}
function lt(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function ut(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function dt(e) {
	return e > 0 ? `+${Ne(e)}` : e < 0 ? `−${Ne(-e)}` : "";
}
// src/lib/excise.ts
var ft = {
	Й: "Q",
	Ц: "W",
	У: "E",
	К: "R",
	Е: "T",
	Н: "Y",
	Г: "U",
	Ш: "I",
	Щ: "O",
	З: "P",
	Ф: "A",
	І: "S",
	Ы: "S",
	В: "D",
	А: "F",
	П: "G",
	Р: "H",
	О: "J",
	Л: "K",
	Д: "L",
	Я: "Z",
	Ч: "X",
	С: "C",
	М: "V",
	И: "B",
	Т: "N",
	Ь: "M"
}, pt = /^[A-Z0-9 ]{8,40}$/;
function mt(e) {
	return e.replace(/\s+/g, " ").trim().toUpperCase().replace(/[\u0400-\u04FF]/g, (e) => ft[e] ?? e);
}
function ht(e) {
	let t = 0;
	for (let n = e.length - 2, r = 3; n >= 0; n--, r = 4 - r) t += Number(e[n]) * r;
	return (10 - t % 10) % 10 === Number(e[e.length - 1]);
}
function gt(e) {
	let t = e.replace(/\s+/g, "");
	return /^(\d{8}|\d{12,14})$/.test(t) && ht(t);
}
function _t(e) {
	let t = mt(e);
	return !pt.test(t) || !/\d/.test(t) || gt(t) ? null : t;
}
function vt(e) {
	return e.filter((e) => e.excise_per_unit && (e.excise_labels?.length ?? 0) !== e.quantity);
}
// src/components/cashier/ExciseStampSheet.tsx
function yt({ lines: e, error: t = null, onSetLabels: n, onDone: r, onClose: i, doneLabel: a = "До оплати", busy: o = !1 }) {
	let s = G(() => e.filter((e) => e.excise_per_unit), [e]), c = vt(s), l = c.find((e) => (e.excise_labels?.length ?? 0) < e.quantity) ?? null, [u, d] = q(""), [f, p] = q(null);
	function m(e) {
		p(null);
		let t = _t(e);
		t ? s.some((e) => e.excise_labels?.includes(t)) ? p(`Марку ${t} уже відскановано`) : l ? (n(l.uid, [...l.excise_labels ?? [], t]), d("")) : p("Марок уже вистачає") : p(gt(e) ? `${e.trim()} — штрихкод пляшки, а не марки. Скануйте акцизну марку` : `«${e.trim().slice(0, 40)}» не схоже на акцизну марку — скануйте ще раз`);
	}
	function h(e) {
		e.preventDefault(), u.trim() && m(u);
	}
	return /* @__PURE__ */ X("div", {
		role: "dialog",
		"aria-modal": "true",
		"aria-label": "Акцизні марки",
		className: "fixed inset-0 z-50 bg-sq-bg flex flex-col text-sq-text animate-fade-up",
		"data-testid": "excise-sheet",
		children: [
			/* @__PURE__ */ Y(qe, {
				active: !0,
				onScan: m
			}),
			/* @__PURE__ */ X("header", {
				className: "h-[68px] shrink-0 px-4 md:px-7 flex items-center gap-2",
				children: [/* @__PURE__ */ Y("h2", {
					className: "flex-1 text-xl font-bold text-sq-heading",
					children: "Акцизні марки"
				}), /* @__PURE__ */ Y("button", {
					type: "button",
					onClick: i,
					className: "w-11 h-11 -mr-2 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty",
					"aria-label": "Закрити",
					children: /* @__PURE__ */ Y(k, { size: 20 })
				})]
			}),
			/* @__PURE__ */ X("div", {
				className: "flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 max-w-xl w-full mx-auto space-y-4",
				children: [
					t && /* @__PURE__ */ Y("p", {
						role: "alert",
						className: "rounded-sq bg-red-50 text-red-700 px-4 py-3 text-[15px]",
						"data-testid": "excise-error",
						children: t
					}),
					l ? /* @__PURE__ */ X("div", {
						className: "rounded-card bg-white shadow-card px-5 py-4",
						"data-testid": "excise-current",
						children: [
							/* @__PURE__ */ Y("p", {
								className: "text-[15px] text-sq-secondary",
								children: l.product_name
							}),
							/* @__PURE__ */ X("p", {
								className: "text-[24px] font-bold text-sq-heading",
								children: [
									"Скануйте марку ",
									(l.excise_labels?.length ?? 0) + 1,
									" з ",
									l.quantity
								]
							}),
							/* @__PURE__ */ X("form", {
								onSubmit: h,
								className: "mt-3 flex gap-2",
								children: [/* @__PURE__ */ Y("input", {
									"aria-label": "Серія й номер марки",
									className: "sq-input flex-1",
									placeholder: "Або введіть: AATE 508932…",
									value: u,
									autoFocus: !0,
									onChange: (e) => d(e.target.value),
									"data-testid": "excise-input"
								}), /* @__PURE__ */ Y("button", {
									type: "submit",
									className: "sq-btn-quiet",
									disabled: !u.trim(),
									children: "Додати"
								})]
							})
						]
					}) : /* @__PURE__ */ Y("p", {
						className: "rounded-card bg-white shadow-card px-5 py-4 text-[17px] font-semibold text-sq-success-ink",
						children: "Усі марки відскановано"
					}),
					f && /* @__PURE__ */ Y("p", {
						role: "status",
						className: "text-[15px] text-amber-800",
						"data-testid": "excise-note",
						children: f
					}),
					/* @__PURE__ */ Y("ul", {
						className: "space-y-2",
						children: s.map((e) => {
							let t = e.excise_labels ?? [];
							return /* @__PURE__ */ X("li", {
								className: "rounded-[14px] bg-sq-sidebar px-4 py-3",
								"data-testid": `excise-line-${e.uid}`,
								children: [/* @__PURE__ */ X("p", {
									className: "flex justify-between gap-3 text-[15px]",
									children: [/* @__PURE__ */ Y("span", {
										className: "font-semibold",
										children: e.product_name
									}), /* @__PURE__ */ X("span", {
										className: t.length === e.quantity ? "text-sq-success-ink" : "text-amber-800",
										children: [
											"Марок ",
											t.length,
											" з ",
											e.quantity
										]
									})]
								}), t.map((r) => /* @__PURE__ */ X("p", {
									className: "mt-1 flex items-center justify-between gap-2 text-[13px] tabular-nums",
									children: [/* @__PURE__ */ Y("span", { children: r }), /* @__PURE__ */ Y("button", {
										type: "button",
										className: "min-h-9 px-2 text-sq-blue font-semibold",
										onClick: () => n(e.uid, t.filter((e) => e !== r)),
										"aria-label": `Прибрати марку ${r}`,
										children: "Прибрати"
									})]
								}, r))]
							}, e.uid);
						})
					}),
					/* @__PURE__ */ Y("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[56px] rounded-xl text-lg",
						disabled: c.length > 0 || o,
						onClick: r,
						"data-testid": "excise-done",
						children: c.length > 0 ? "Відскануйте всі марки" : a
					})
				]
			})
		]
	});
}
// src/modules/tables/lib/bill.ts
var bt = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function xt(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function St(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Ct(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
// src/modules/tables/components/BillBar.tsx
var wt = 2;
function Tt({ draft: t, rounds: n, summary: r, owedCents: a, hasPending: o, busy: s, online: c, onOpen: u, onFire: d }) {
	let f = r.lines > 0, p = [...n].reverse().find((e) => e.cancelled_at == null && e.prep_status !== "served");
	return /* @__PURE__ */ X("div", {
		className: "shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ X("button", {
			type: "button",
			className: "block w-full text-left",
			"data-testid": "bill-bar-open",
			onClick: u,
			children: [
				/* @__PURE__ */ Y("span", {
					"aria-hidden": !0,
					className: "block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5"
				}),
				/* @__PURE__ */ X("span", {
					className: "flex items-center gap-2.5 pb-1",
					children: [
						/* @__PURE__ */ Y(e, {
							size: 20,
							className: "text-sq-blue shrink-0"
						}),
						/* @__PURE__ */ X("span", {
							className: "flex-1 min-w-0 truncate text-base font-bold text-sq-heading",
							children: [f ? `Чернетка · ${i(r.lines)}` : "Рахунок", o ? " · зберігаємо…" : ""]
						}),
						p && /* @__PURE__ */ X("span", {
							className: "shrink-0 text-sm text-sq-muted",
							children: [
								"Раунд ",
								p.seq,
								" ",
								bt[p.prep_status]
							]
						})
					]
				}),
				t.slice(0, wt).map((e) => /* @__PURE__ */ X("span", {
					className: "flex items-start gap-2.5 py-1",
					children: [
						/* @__PURE__ */ X("span", {
							className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
							children: [e.quantity, "×"]
						}),
						/* @__PURE__ */ X("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ Y("span", {
								className: "block truncate text-[15px] text-sq-text",
								children: e.product_name
							}), e.modifierNames.length > 0 && /* @__PURE__ */ Y("span", {
								className: "block truncate text-[13px] text-sq-muted",
								children: e.modifierNames.join(" · ")
							})]
						}),
						/* @__PURE__ */ Y("span", {
							className: "shrink-0 text-[15px] text-sq-text tabular-nums",
							children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
						})
					]
				}, e.key)),
				t.length > wt && /* @__PURE__ */ X("span", {
					className: "block py-0.5 text-[13px] text-sq-blue font-semibold",
					children: [
						"ще ",
						t.length - wt,
						"…"
					]
				})
			]
		}), /* @__PURE__ */ X("div", {
			className: "flex items-center gap-3 pt-2.5 mt-1 shadow-[0_-1px_0_#E6E8EC]",
			children: [/* @__PURE__ */ X("div", {
				className: "flex-1 min-w-0",
				children: [/* @__PURE__ */ Y("p", {
					className: "text-[13px] text-sq-secondary",
					children: "До сплати"
				}), /* @__PURE__ */ Y("p", {
					className: "text-2xl font-bold text-sq-heading tabular-nums",
					children: Z(a)
				})]
			}), /* @__PURE__ */ X("button", {
				type: "button",
				className: "pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2",
				"data-testid": "bill-bar-fire",
				disabled: s || !c || o || !f,
				onClick: d,
				children: [
					/* @__PURE__ */ Y(l, { size: 24 }),
					"На кухню",
					f ? ` · ${r.lines}` : ""
				]
			})]
		})]
	});
}
// src/modules/tables/components/BillPane.tsx
function Et({ bill: t, draft: n, summary: r, owedCents: i, busy: a, online: o, hasPending: s, canPay: c, canPrecheck: u, printStatus: d, onLess: f, onMore: p, onEdit: m, onStamps: h, onCancelRound: g, onFire: _, onPay: v, onPrecheck: y }) {
	let b = (e) => /* @__PURE__ */ Y(At, {
		testId: `bill-line-${e.id}`,
		quantity: e.quantity,
		title: e.product_name,
		sub: [e.variant_label, e.note].filter(Boolean).join(" · "),
		price: Z(St(e)),
		waiting: e.sale_id == null && e.bottle_pending === !0 ? "Чекає марку з бару" : null
	}, e.id);
	return /* @__PURE__ */ X("div", {
		className: "flex h-full min-h-0 flex-col",
		"data-testid": "bill-pane",
		children: [/* @__PURE__ */ X("div", {
			className: "flex-1 overflow-auto px-3.5 pt-3.5 pb-2 space-y-2.5",
			children: [t.rounds.map((e) => {
				let t = e.cancelled_at != null;
				return /* @__PURE__ */ X("section", {
					className: `rounded-2xl bg-white shadow-card px-4 py-3 ${t ? "opacity-60" : ""}`,
					"data-testid": `bill-round-${e.id}`,
					"data-cancelled": t ? "yes" : "no",
					children: [
						/* @__PURE__ */ X("div", {
							className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ Y(l, { size: 24 }),
								/* @__PURE__ */ X("p", {
									className: "flex-1 text-[15px] font-bold text-sq-heading",
									children: [
										"Раунд ",
										e.seq,
										!t && /* @__PURE__ */ Y("span", {
											className: "ml-2 font-normal text-[13px] text-sq-muted tabular-nums",
											children: Z(e.total_cents)
										}),
										e.fired_by == null && e.fired_by_name && /* @__PURE__ */ Y("span", {
											className: "ml-2 rounded-md bg-[#F4891F]/15 px-1.5 py-0.5 text-[12px] font-semibold text-[#B35F0C]",
											"data-testid": `bill-round-guest-${e.id}`,
											children: e.fired_by_name
										})
									]
								}),
								/* @__PURE__ */ Y("span", {
									className: `text-[13px] font-semibold ${t ? "text-sq-muted" : Ot[e.prep_status]}`,
									children: t ? "скасовано" : e.prep_status === "new" ? `${bt.new} · ${kt(e.fired_at)} хв` : bt[e.prep_status]
								})
							]
						}),
						/* @__PURE__ */ Y("div", {
							className: "pt-1",
							children: e.items.map(b)
						}),
						xt(e) && /* @__PURE__ */ Y("button", {
							type: "button",
							className: "mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: a || !o || s,
							onClick: () => g(e.id),
							children: "Скасувати раунд"
						})
					]
				}, e.id);
			}), /* @__PURE__ */ X("section", {
				className: `rounded-2xl bg-white px-4 py-3 ${n.length > 0 ? "ring-2 ring-sq-blue" : "shadow-card"}`,
				"data-testid": "bill-draft",
				children: [/* @__PURE__ */ X("div", {
					className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
					children: [
						/* @__PURE__ */ Y(e, {
							size: 20,
							className: "text-sq-blue"
						}),
						/* @__PURE__ */ Y("p", {
							className: "flex-1 text-[15px] font-bold text-sq-heading",
							children: "Чернетка"
						}),
						/* @__PURE__ */ Y("span", {
							className: "text-[13px] text-sq-muted",
							children: "ще не на кухні"
						})
					]
				}), n.length === 0 ? /* @__PURE__ */ Y("p", {
					className: "py-2 text-sm text-sq-muted",
					children: "Нічого не набрано — тапніть страву в меню"
				}) : /* @__PURE__ */ Y("div", {
					className: "pt-1",
					children: n.map((e) => {
						let t = [
							e.variant_label,
							...e.modifierNames,
							e.note
						].filter(Boolean).join(" · "), n = e.id != null && !e.pending;
						return /* @__PURE__ */ X("div", {
							className: `flex items-start gap-2.5 py-1.5 ${e.pending ? "opacity-60" : ""}`,
							"data-testid": e.id == null ? "bill-line-pending" : `bill-line-${e.id}`,
							"data-pending": e.pending ? "yes" : "no",
							children: [
								/* @__PURE__ */ X("span", {
									className: "w-7 pt-0.5 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}),
								/* @__PURE__ */ X("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ X("button", {
										type: "button",
										className: "block w-full text-left",
										"data-testid": e.id == null ? void 0 : `bill-line-edit-${e.id}`,
										disabled: a || !o || !n,
										onClick: () => m(e),
										children: [/* @__PURE__ */ Y("span", {
											className: "block text-[15px] text-sq-text truncate",
											children: e.product_name
										}), t && /* @__PURE__ */ Y("span", {
											className: "block text-[13px] text-sq-muted truncate",
											children: t
										})]
									}), e.id != null && /* @__PURE__ */ X("div", {
										className: "mt-1.5 flex flex-wrap items-center gap-1.5",
										children: [
											/* @__PURE__ */ Y("button", {
												type: "button",
												"aria-label": "Менше",
												className: Dt,
												"data-testid": `bill-less-${e.id}`,
												disabled: a || !o || !n,
												onClick: () => f(e),
												children: /* @__PURE__ */ Y(C, { size: 16 })
											}),
											/* @__PURE__ */ Y("button", {
												type: "button",
												"aria-label": "Більше",
												className: Dt,
												"data-testid": `bill-more-${e.id}`,
												disabled: a || !o || !n,
												onClick: () => p(e),
												children: /* @__PURE__ */ Y(j, { size: 16 })
											}),
											e.excisePerUnit && /* @__PURE__ */ X("button", {
												type: "button",
												className: `h-8 px-2.5 rounded-lg text-[13px] font-semibold tabular-nums disabled:opacity-40 ${e.exciseLabels.length === e.quantity ? "bg-white ring-1 ring-sq-divider text-sq-success-ink" : "bg-amber-50 ring-1 ring-amber-300 text-amber-800"}`,
												"data-testid": `bill-stamps-${e.id}`,
												disabled: a || !o || !n,
												onClick: () => h(e),
												children: [
													"Марок ",
													e.exciseLabels.length,
													" з ",
													e.quantity
												]
											})
										]
									})]
								}),
								/* @__PURE__ */ Y("span", {
									className: "shrink-0 pt-0.5 text-[15px] text-sq-text tabular-nums",
									children: e.preview_unit_cents == null ? "—" : Z(e.preview_unit_cents * e.quantity)
								})
							]
						}, e.key);
					})
				})]
			})]
		}), /* @__PURE__ */ X("footer", {
			className: "shrink-0 px-4 pt-3.5 pb-4 space-y-2.5 shadow-[0_-1px_0_#E6E8EC]",
			children: [
				n.length > 0 && /* @__PURE__ */ X("div", {
					className: "flex items-baseline justify-between text-sm text-sq-secondary",
					children: [/* @__PURE__ */ Y("span", { children: "Чернетка, за сьогоднішніми цінами" }), /* @__PURE__ */ X("span", {
						className: "tabular-nums",
						"data-testid": "bill-draft-total",
						children: [r.exact ? "" : "≈ ", Z(r.cents)]
					})]
				}),
				/* @__PURE__ */ X("div", {
					className: "flex items-baseline justify-between",
					children: [/* @__PURE__ */ Y("span", {
						className: "text-lg font-bold text-sq-heading",
						children: "До сплати"
					}), /* @__PURE__ */ Y("span", {
						className: "text-[26px] font-bold text-sq-heading tabular-nums",
						"data-testid": "bill-owed",
						children: Z(i)
					})]
				}),
				/* @__PURE__ */ X("div", {
					className: "flex gap-2.5",
					children: [/* @__PURE__ */ X("button", {
						type: "button",
						className: "flex-1 min-h-[52px] rounded-xl bg-white ring-1 ring-sq-divider text-[16px] font-semibold text-sq-text inline-flex items-center justify-center gap-2 disabled:opacity-40",
						"data-testid": "bill-fire",
						disabled: a || !o || s || n.length === 0,
						onClick: _,
						children: [
							/* @__PURE__ */ Y(l, { size: 24 }),
							"На кухню",
							r.lines > 0 ? ` · ${r.lines}` : ""
						]
					}), /* @__PURE__ */ Y("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[52px] rounded-xl text-[17px]",
						"data-testid": "bill-pay",
						disabled: a || !o || s || !c || n.length > 0,
						onClick: v,
						children: "Оплатити"
					})]
				}),
				/* @__PURE__ */ X("button", {
					type: "button",
					className: "w-full min-h-9 text-[15px] font-semibold text-sq-blue inline-flex items-center justify-center gap-1.5 disabled:opacity-40",
					"data-testid": "bill-precheck",
					disabled: a || !o || s || !u,
					onClick: y,
					children: [/* @__PURE__ */ Y(oe, { size: 20 }), t.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"]
				}),
				d && /* @__PURE__ */ Y("p", {
					className: "text-xs text-sq-muted text-center",
					"data-testid": "bill-print-status",
					children: d
				})
			]
		})]
	});
}
var Dt = "w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40", Ot = {
	new: "text-[#D9730D]",
	ready: "text-sq-success",
	served: "text-sq-muted"
};
function kt(e) {
	return Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 6e4));
}
function At({ testId: e, quantity: t, title: n, sub: r, price: i, waiting: a = null }) {
	return /* @__PURE__ */ X("div", {
		className: "flex items-start gap-2.5 py-1.5",
		"data-testid": e,
		children: [
			/* @__PURE__ */ X("span", {
				className: "w-7 shrink-0 text-[15px] font-semibold text-sq-secondary tabular-nums",
				children: [t, "×"]
			}),
			/* @__PURE__ */ X("div", {
				className: "min-w-0 flex-1",
				children: [
					/* @__PURE__ */ Y("p", {
						className: "text-[15px] text-sq-text truncate",
						children: n
					}),
					r && /* @__PURE__ */ Y("p", {
						className: "text-[13px] text-sq-muted truncate",
						children: r
					}),
					a && /* @__PURE__ */ Y("span", {
						className: "mt-1 inline-block rounded-lg bg-amber-50 ring-1 ring-amber-300 px-2 py-0.5 text-[13px] font-semibold text-amber-800",
						"data-testid": `${e}-waiting`,
						children: a
					})
				]
			}),
			/* @__PURE__ */ Y("span", {
				className: "shrink-0 text-[15px] text-sq-text tabular-nums",
				children: i
			})
		]
	});
}
// src/modules/tables/components/BillSheet.tsx
function jt({ title: e, onClose: t, children: n }) {
	return /* @__PURE__ */ X("div", {
		className: "fixed inset-0 z-40",
		"data-testid": "bill-sheet",
		children: [/* @__PURE__ */ Y("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			"aria-label": "Закрити",
			onClick: t
		}), /* @__PURE__ */ X("div", {
			className: "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-sq-sidebar shadow-[0_-12px_40px_rgba(0,20,60,.18)] animate-fade-up overflow-hidden",
			children: [/* @__PURE__ */ X("div", {
				className: "flex items-center justify-between bg-white px-5 pt-2 pb-2.5 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ Y("p", {
					className: "font-bold text-[17px] text-sq-heading",
					children: e
				}), /* @__PURE__ */ Y("button", {
					type: "button",
					onClick: t,
					className: "grid min-h-11 min-w-11 place-items-center rounded-full text-sq-secondary hover:bg-sq-empty",
					"aria-label": "Закрити",
					"data-testid": "bill-sheet-close",
					children: /* @__PURE__ */ Y(k, { size: 20 })
				})]
			}), /* @__PURE__ */ Y("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
// src/modules/tables/lib/guestOrders.ts
function Mt(e, t = Date.now()) {
	let n = Math.floor((t - new Date(e).getTime()) / 6e4);
	return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function Nt(e, t = Date.now()) {
	let n = Mt(e, t);
	return n < 1 ? "щойно" : `${n} хв тому`;
}
function Pt(e, t, n, r) {
	let i = e % 100, a = e % 10;
	return i >= 11 && i <= 14 ? `${e} ${r}` : a === 1 ? `${e} ${t}` : a >= 2 && a <= 4 ? `${e} ${n}` : `${e} ${r}`;
}
function Ft(e) {
	return Pt(e, "запит", "запити", "запитів");
}
function It(e, t = /* @__PURE__ */ new Set()) {
	return e.lines.filter((e) => e.problem != null || t.has(e.id)).map((e) => e.id);
}
function Lt(e, t = /* @__PURE__ */ new Set()) {
	let n = It(e, t).length;
	return n === 0 ? "Прийняти" : n >= e.lines.length ? null : n === 1 ? "Прийняти без цієї" : "Прийняти без них";
}
function Rt(e) {
	let t = e?.response?.data, n = Number(t?.item_id);
	return Number.isInteger(n) && n > 0 ? n : null;
}
var zt = [
	"Цієї страви вже немає",
	"Кухня зараз не приймає — підійдіть до офіціанта",
	"Підійде офіціант і прийме замовлення"
];
function Bt(e) {
	return e === "bill" ? "Просить рахунок" : "Кличе офіціанта";
}
var Vt = {
	requests: 0,
	waiter: !1,
	bill: !1,
	sent: 0,
	low: null
};
function Ht(e) {
	let t = /* @__PURE__ */ new Map(), n = (e) => {
		let n = t.get(e);
		return n || (n = { ...Vt }, t.set(e, n)), n;
	};
	for (let t of e.orders) n(t.table_id).requests += 1;
	for (let t of e.sent) n(t.table_id).sent += 1;
	for (let t of e.calls) n(t.table_id)[t.kind] = !0;
	for (let t of e.feedback ?? []) {
		let e = n(t.table_id);
		e.low = e.low == null ? t.score : Math.min(e.low, t.score);
	}
	return t;
}
function Ut(e) {
	return e ? e.requests + e.sent + +!!e.waiter + +!!e.bill + (e.low == null ? 0 : 1) : 0;
}
function Wt(e) {
	return /* @__PURE__ */ new Set([
		...e.orders.map((e) => `order:${e.id}`),
		...e.sent.map((e) => `sent:${e.id}`),
		...e.calls.map((e) => `call:${e.id}`),
		...(e.feedback ?? []).map((e) => `feedback:${e.id}`)
	]);
}
function Gt(e) {
	return e.round_seq == null ? "Уже на кухні" : `Уже на кухні · замовлення ${e.round_seq}`;
}
function Kt(e) {
	let t = [];
	return e.calls > 0 && t.push(Pt(e.calls, "виклик", "виклики", "викликів")), (e.feedback ?? 0) > 0 && t.push(Pt(e.feedback, "низька оцінка", "низькі оцінки", "низьких оцінок")), e.sent > 0 && t.push(`${e.sent} на кухні без офіціанта`), e.requests > 0 && t.push(Ft(e.requests)), t.join(" · ");
}
function qt(e, t) {
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
// src/modules/tables/lib/usePolling.ts
var Jt = 1e4;
function Yt(e, t, n = Jt) {
	let r = K(e);
	r.current = e, W(() => {
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
// src/modules/tables/components/GuestAlertsPanel.tsx
var Xt = {
	waiter: "ring-[#8A6CEF]",
	bill: "ring-[#1B9DF0]"
};
function Zt({ calls: e, sent: t, feedback: n = [], showTable: r, busy: i, onAnswer: a, onSeen: o, onSeenFeedback: s, onOpenBill: c }) {
	let [u, d] = q(null), [f, p] = q(() => Date.now());
	if (Yt(() => p(Date.now()), e.length + t.length + n.length > 0, 15e3), e.length === 0 && t.length === 0 && n.length === 0) return null;
	async function m(e, t) {
		if (!u) {
			d(e);
			try {
				await t();
			} finally {
				d(null);
			}
		}
	}
	let h = (e, t) => `Стіл ${e}${t ? ` · ${t}` : ""}`;
	return /* @__PURE__ */ X("div", {
		className: "space-y-2.5",
		"data-testid": "guest-alerts-panel",
		children: [
			e.map((e) => {
				let t = `call:${e.id}`;
				return /* @__PURE__ */ Y("section", {
					className: `rounded-2xl bg-white ring-2 ${Xt[e.kind]} px-4 py-3`,
					"data-testid": `guest-call-${e.id}`,
					"data-kind": e.kind,
					"data-table": e.table_id,
					children: /* @__PURE__ */ X("div", {
						className: "flex items-center gap-2.5",
						children: [
							e.kind === "bill" ? /* @__PURE__ */ Y(I, { size: 26 }) : /* @__PURE__ */ Y(V, { size: 26 }),
							/* @__PURE__ */ X("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ X("p", {
									className: "break-words text-[16px] font-bold leading-snug text-sq-heading",
									children: [r ? `Стіл ${e.table_name} · ` : "", Bt(e.kind)]
								}), /* @__PURE__ */ Y("p", {
									className: "text-[13px] text-sq-muted tabular-nums",
									children: [
										r ? e.hall_name : "",
										Nt(e.created_at, f),
										e.kind === "bill" && !e.has_open_bill ? "рахунку ще немає" : ""
									].filter(Boolean).join(" · ")
								})]
							}),
							/* @__PURE__ */ Y("button", {
								type: "button",
								className: "pos-btn-primary min-h-[48px] shrink-0 rounded-xl px-5 text-[16px]",
								"data-testid": `guest-call-answer-${e.id}`,
								disabled: i || u != null,
								onClick: () => void m(t, () => a(e)),
								children: "Іду"
							})
						]
					})
				}, t);
			}),
			n.map((e) => {
				let t = `feedback:${e.id}`;
				return /* @__PURE__ */ Y("section", {
					className: "rounded-2xl bg-white ring-2 ring-sq-danger px-4 py-3",
					"data-testid": `guest-feedback-${e.id}`,
					"data-table": e.table_id,
					children: /* @__PURE__ */ X("div", {
						className: "flex items-start gap-2.5",
						children: [
							/* @__PURE__ */ Y(E, {
								size: 26,
								className: "shrink-0 text-sq-danger"
							}),
							/* @__PURE__ */ X("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ X("p", {
										className: "break-words text-[16px] font-bold leading-snug text-sq-heading",
										children: [
											r ? `Стіл ${e.table_name} · ` : "",
											"оцінив на ",
											e.score,
											" — підійдіть"
										]
									}),
									/* @__PURE__ */ Y("p", {
										className: "text-[13px] text-sq-muted tabular-nums",
										children: [
											r ? e.hall_name : "",
											e.score_word,
											Nt(e.created_at, f),
											...e.tag_labels
										].filter(Boolean).join(" · ")
									}),
									e.comment && /* @__PURE__ */ Y("p", {
										className: "mt-1 whitespace-pre-line text-[14px] text-sq-text",
										children: e.comment
									})
								]
							}),
							/* @__PURE__ */ Y("div", {
								className: "flex shrink-0 flex-col items-end gap-1.5",
								children: /* @__PURE__ */ Y("button", {
									type: "button",
									className: "pos-btn-primary min-h-[48px] rounded-xl px-5 text-[16px]",
									"data-testid": `guest-feedback-seen-${e.id}`,
									disabled: i || u != null || !s,
									onClick: () => s && void m(t, () => s(e)),
									children: "Бачу"
								})
							})
						]
					})
				}, t);
			}),
			t.map((e) => {
				let t = `sent:${e.id}`;
				return /* @__PURE__ */ X("section", {
					className: "rounded-2xl bg-white ring-2 ring-[#F4891F] px-4 py-3",
					"data-testid": `guest-sent-${e.id}`,
					"data-table": e.table_id,
					children: [
						/* @__PURE__ */ X("div", {
							className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ Y(l, { size: 24 }),
								/* @__PURE__ */ X("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ Y("p", {
										className: "truncate text-[15px] font-bold text-sq-heading",
										children: r ? h(e.table_name, e.hall_name) : "Гість замовив сам"
									}), /* @__PURE__ */ Y("p", {
										className: "text-[13px] font-semibold text-[#B35F0C]",
										children: Gt(e)
									})]
								}),
								/* @__PURE__ */ Y("span", {
									className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
									children: Nt(e.created_at, f)
								})
							]
						}),
						/* @__PURE__ */ Y("div", {
							className: "pt-1",
							children: e.lines.map((e, t) => {
								let n = [e.caption, e.note ? `«${e.note}»` : ""].filter(Boolean).join(" · ");
								return /* @__PURE__ */ X("div", {
									className: "flex items-start gap-2.5 py-1",
									children: [/* @__PURE__ */ X("span", {
										className: "w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums",
										children: [e.quantity, "×"]
									}), /* @__PURE__ */ X("div", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ Y("p", {
											className: "text-[15px] text-sq-text",
											children: e.name
										}), n && /* @__PURE__ */ Y("p", {
											className: "text-[13px] text-sq-muted",
											children: n
										})]
									})]
								}, t);
							})
						}),
						/* @__PURE__ */ X("p", {
							className: "pt-1 text-[13px] text-sq-muted",
							children: [
								e.bill_opened_by_guest ? "Рахунок відкрив гість, стіл ще нічий — «Бачу» закріпить його за вами." : "Гість замовив з телефону, кухня вже готує.",
								" ",
								/* @__PURE__ */ Y("span", {
									className: "font-semibold text-sq-text tabular-nums",
									children: Z(e.total_cents)
								})
							]
						}),
						/* @__PURE__ */ X("div", {
							className: "flex gap-2.5 pt-2.5",
							children: [c && /* @__PURE__ */ Y("button", {
								type: "button",
								className: "min-h-[48px] flex-1 rounded-xl bg-white ring-1 ring-sq-divider px-3 text-[15px] font-semibold text-sq-blue disabled:opacity-40",
								"data-testid": `guest-sent-open-${e.id}`,
								disabled: i || u != null,
								onClick: () => c(e.bill_id),
								children: "Відкрити рахунок"
							}), /* @__PURE__ */ Y("button", {
								type: "button",
								className: "pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]",
								"data-testid": `guest-sent-seen-${e.id}`,
								disabled: i || u != null,
								onClick: () => void m(t, () => o(e)),
								children: "Бачу"
							})]
						})
					]
				}, t);
			})
		]
	});
}
// src/modules/tables/components/GuestOrdersPanel.tsx
function Qt({ orders: e, showTable: t, busy: n, onAccept: r, onReject: i }) {
	let [a, o] = q({}), [s, c] = q(null), [l, u] = q(() => Date.now());
	Yt(() => u(Date.now()), e.length > 0, 15e3);
	let d = K(/* @__PURE__ */ new Map());
	if (W(() => {
		s != null && d.current.get(s)?.scrollIntoView?.({ block: "nearest" });
	}, [s]), e.length === 0) return null;
	async function f(e) {
		let t = a[e.id] ?? [], n = await r(e, It(e, new Set(t)));
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
	return /* @__PURE__ */ Y("div", {
		className: "space-y-2.5",
		"data-testid": "guest-orders-panel",
		children: e.map((e) => {
			let r = new Set(a[e.id] ?? []), i = Lt(e, r);
			return /* @__PURE__ */ X("section", {
				ref: (t) => {
					t ? d.current.set(e.id, t) : d.current.delete(e.id);
				},
				className: "rounded-2xl bg-white ring-2 ring-sq-blue px-4 py-3",
				"data-testid": `guest-order-${e.id}`,
				"data-table": e.table_id,
				children: [
					/* @__PURE__ */ X("div", {
						className: "flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]",
						children: [
							/* @__PURE__ */ Y(b, {
								size: 22,
								className: "text-sq-blue"
							}),
							/* @__PURE__ */ Y("p", {
								className: "min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading",
								children: t ? `Стіл ${e.table_name}${e.hall_name ? ` · ${e.hall_name}` : ""}` : "Гість просить"
							}),
							/* @__PURE__ */ Y("span", {
								className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
								children: Nt(e.created_at, l)
							})
						]
					}),
					/* @__PURE__ */ Y("div", {
						className: "pt-1",
						children: e.lines.map((e) => {
							let t = e.problem != null || r.has(e.id), n = [e.caption, e.note ? `«${e.note}»` : ""].filter(Boolean).join(" · ");
							return /* @__PURE__ */ X("div", {
								className: "flex items-start gap-2.5 py-1.5",
								"data-testid": `guest-line-${e.id}`,
								"data-blocked": t ? "yes" : "no",
								children: [/* @__PURE__ */ X("span", {
									className: "w-7 shrink-0 pt-0.5 text-[15px] font-semibold text-sq-secondary tabular-nums",
									children: [e.quantity, "×"]
								}), /* @__PURE__ */ X("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ Y("p", {
											className: `text-[15px] ${t ? "text-sq-muted line-through" : "text-sq-text"}`,
											children: e.name
										}),
										n && /* @__PURE__ */ Y("p", {
											className: "text-[13px] text-sq-muted",
											children: n
										}),
										t && /* @__PURE__ */ Y("p", {
											className: "text-[13px] font-semibold text-sq-danger",
											children: e.problem ?? "не вдалося додати — див. повідомлення вище"
										})
									]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ X("p", {
						className: "pt-1 text-[13px] text-sq-muted",
						children: [e.has_open_bill ? "Додасться до рахунку столу" : "Відкриється рахунок столу", " — на кухню піде після вашого «Прийняти»"]
					}),
					s === e.id ? /* @__PURE__ */ X("div", {
						className: "pt-2.5 space-y-1.5",
						"data-testid": `guest-order-reasons-${e.id}`,
						children: [
							/* @__PURE__ */ Y("p", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Що прочитає гість:"
							}),
							zt.map((t, r) => /* @__PURE__ */ Y("button", {
								type: "button",
								className: $t,
								"data-testid": `guest-order-reason-${e.id}-${r}`,
								disabled: n,
								onClick: () => void p(e, t),
								children: t
							}, t)),
							/* @__PURE__ */ X("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ Y("button", {
									type: "button",
									className: `${$t} flex-1`,
									"data-testid": `guest-order-reason-none-${e.id}`,
									disabled: n,
									onClick: () => void p(e, null),
									children: "Без причини"
								}), /* @__PURE__ */ Y("button", {
									type: "button",
									className: `${$t} flex-1 text-sq-blue`,
									onClick: () => c(null),
									children: "Назад"
								})]
							})
						]
					}) : /* @__PURE__ */ X("div", {
						className: "flex gap-2.5 pt-2.5",
						children: [/* @__PURE__ */ Y("button", {
							type: "button",
							className: "min-h-[48px] w-14 shrink-0 rounded-xl bg-white ring-1 ring-sq-divider text-sq-danger grid place-items-center disabled:opacity-40",
							"aria-label": "Відхилити",
							"data-testid": `guest-order-reject-${e.id}`,
							disabled: n,
							onClick: () => c(e.id),
							children: /* @__PURE__ */ Y(k, { size: 22 })
						}), i == null ? /* @__PURE__ */ Y("p", {
							className: "flex-1 self-center text-[13px] text-sq-muted",
							"data-testid": `guest-order-none-${e.id}`,
							children: "Жодну страву зараз не прийняти — відхиліть запит"
						}) : /* @__PURE__ */ Y("button", {
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
var $t = "w-full min-h-[44px] rounded-xl bg-white ring-1 ring-sq-divider px-3 text-left text-[15px] text-sq-text disabled:opacity-40";
// src/modules/tables/lib/menu.ts
function en(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function tn(e, t = en()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
// src/modules/tables/components/MenuCatalog.tsx
function nn({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = Se(), c = Ce(), l = Ae(), [u, d] = q(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	W(() => {
		i > 0 && s.refresh();
	}, [i]), W(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = Q(e);
		t || ge(e, n) ? d({
			variants: e,
			initialVariantId: e.length === 1 ? e[0].variant_id : null
		}) : a({
			item: e[0],
			modifiers: me(n),
			note: ""
		});
	}
	async function m(e) {
		let t = await s.lookupBarcode(e);
		t.length > 0 && p(t), s.setQuery("");
	}
	let h = !s.loading && s.folderTiles.length === 0 && s.grouped.length === 0;
	return /* @__PURE__ */ X("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ Y(qe, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ X("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ X("div", {
					className: "relative",
					children: [/* @__PURE__ */ Y(B, {
						size: 20,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ Y("input", {
						className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ Y(Ve, {
					tags: s.catalogBarTags,
					activeId: s.catalogBarActiveId,
					showBack: s.showBack,
					backLabel: s.backLabel,
					onSelect: s.selectCatalogBarTag,
					onBack: s.goBackOne
				})]
			}),
			/* @__PURE__ */ X("div", {
				ref: l,
				className: "flex-1 select-none overflow-auto bg-white p-3",
				children: [
					s.loading && s.grouped.length === 0 && /* @__PURE__ */ Y("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					/* @__PURE__ */ X("div", {
						className: "grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5",
						children: [s.folderTiles.map((e) => /* @__PURE__ */ Y("div", {
							"data-testid": `menu-folder-${e.id}`,
							children: /* @__PURE__ */ Y(Be, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = Q(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = tn(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ Y(Pe, {
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
					h && /* @__PURE__ */ Y("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ Y(at, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: me(Q(u.variants)),
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
// src/modules/tables/lib/pay.ts
function rn(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function an(e, t) {
	return e.filter(({ line: e }) => t.has(e.id) && e.bottle_pending === !0);
}
function on(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function sn(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + on(n) : e, 0);
}
function cn(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function ln(e) {
	return e.status !== "open" || rn(e).length === 0;
}
// src/modules/tables/components/PaySheet.tsx
function un(e) {
	let t = e.label?.trim();
	return t ? `Каса ${e.register_no} · ${t}` : `Каса ${e.register_no}`;
}
function dn(e) {
	return e % 100 == 0 ? String(e / 100) : (e / 100).toFixed(2).replace(".", ",");
}
function fn(e) {
	let t = Number(e.replace(/\s/g, "").replace(",", "."));
	return Number.isFinite(t) && t > 0 ? Math.round(t * 100) : 0;
}
var pn = [{
	id: "cash",
	label: "Готівка",
	glyph: v
}, {
	id: "card",
	label: "Картка",
	glyph: S
}];
function mn(e) {
	return `${e < 0 ? "−" : "+"}${Z(Math.abs(e))}`;
}
function hn({ bill: e, busy: t, cashRoundingStep: n, onClose: r, onPay: i, quote: s = null, error: c = null }) {
	let l = G(() => rn(e), [e]), [u, d] = q(() => new Set(l.map(({ line: e }) => e.id))), [f, p] = q(1), [m, h] = q("card"), g = s != null, _ = sn(l, u), v = u.size === l.length, y = m === "cash" ? ne(_, n) : {
		step: 0,
		deltaCents: 0
	}, [b, x] = q(null), [S, w] = q(null), [T, E] = q(0), D = [...u].sort((e, t) => e - t).join(",");
	W(() => {
		if (!s || (x(null), w(null), E(0), u.size === 0)) return;
		let e = !1;
		return s([{
			...v ? {} : { line_ids: [...u] },
			payments: [{
				method: m,
				amount_cents: 0
			}]
		}], m === "cash" ? Number(n ?? 0) : 0).then((t) => {
			e || x({
				list: t.receipts,
				due: t.due_cents
			});
		}).catch((t) => {
			let n = t?.response?.data;
			e || w(typeof n?.error == "string" ? n.error : "Не вдалося порахувати чеки");
		}), () => {
			e = !0;
		};
	}, [
		s,
		D,
		m,
		n
	]);
	let O = g ? b?.due ?? 0 : _ + y.deltaCents, k = g ? (b?.list ?? []).reduce((e, t) => e + t.rounding_cents, 0) : 0, A = cn(O, g ? 1 : f), M = m === "cash" && (g || f === 1), [ee, te] = q(""), [N, re] = q(!1);
	W(() => {
		N || te(O > 0 ? dn(O) : "");
	}, [O, N]);
	let I = fn(ee), L = M ? Math.max(0, O - I) : 0, R = M ? Math.max(0, I - O) : 0, ie = M && O > 0 ? F(O) : [];
	function z(e) {
		d((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	let B = an(l, u);
	function ae() {
		if (O <= 0 || L > 0 || B.length > 0) return;
		if (g && m === "card" && b && T + 1 < b.list.length) {
			E(T + 1);
			return;
		}
		let e = {
			...v ? {} : { line_ids: [...u] },
			payments: M ? [{
				method: m,
				amount_cents: I
			}] : A.map((e) => ({
				method: m,
				amount_cents: e
			}))
		}, t = g ? k === 0 ? 0 : Number(n ?? 0) : y.deltaCents === 0 ? 0 : y.step;
		i([e], t);
	}
	let V = g && m === "card" && b ? b.list[T] : null, H = g && m === "card" && b && T > 0 ? b.list.slice(0, T).map((e) => `${Z(e.due_cents)} на терміналі «${un(e)}»`).join(", ") : null, oe = l.filter(({ line: e }) => u.has(e.id)).length;
	return /* @__PURE__ */ X("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [/* @__PURE__ */ X("header", {
			className: "flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]",
			children: [/* @__PURE__ */ X("button", {
				type: "button",
				className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
				onClick: r,
				"data-testid": "pay-close",
				children: [
					/* @__PURE__ */ Y(o, { size: 20 }),
					"Стіл ",
					e.table_name
				]
			}), /* @__PURE__ */ X("p", {
				className: "flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24",
				children: ["Оплата · стіл ", e.table_name]
			})]
		}), /* @__PURE__ */ X("div", {
			className: "flex-1 min-h-0 overflow-auto md:overflow-hidden px-4 md:px-7 pb-4 md:pb-6 flex flex-col md:flex-row gap-4 md:gap-5",
			children: [/* @__PURE__ */ X("section", {
				className: "md:flex-1 min-w-0 rounded-card bg-white shadow-card px-5 py-4 flex flex-col md:min-h-0",
				children: [/* @__PURE__ */ X("div", {
					className: "flex items-center justify-between pb-2 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
					children: [/* @__PURE__ */ Y("p", {
						className: "text-[15px] font-bold text-sq-blue",
						children: "Що оплачуємо"
					}), /* @__PURE__ */ Y("button", {
						type: "button",
						className: "min-h-9 text-[15px] font-semibold text-sq-blue",
						"data-testid": "pay-select-all",
						onClick: () => d(v ? /* @__PURE__ */ new Set() : new Set(l.map(({ line: e }) => e.id))),
						children: v ? "Зняти все" : "Обрати все"
					})]
				}), /* @__PURE__ */ Y("div", {
					className: "md:flex-1 md:min-h-0 md:overflow-auto",
					children: l.map(({ line: e, round: n }) => {
						let r = u.has(e.id);
						return /* @__PURE__ */ X("button", {
							type: "button",
							"data-testid": `pay-line-${e.id}`,
							"aria-pressed": r,
							disabled: t,
							onClick: () => z(e.id),
							className: "flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ Y("span", {
									"aria-hidden": !0,
									className: `w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${r ? "bg-sq-blue text-white" : "ring-2 ring-inset ring-sq-divider"}`,
									children: r && /* @__PURE__ */ Y(a, { size: 16 })
								}),
								/* @__PURE__ */ X("span", {
									className: "min-w-0 flex-1 py-1.5",
									children: [/* @__PURE__ */ X("span", {
										className: `block truncate text-base ${r ? "text-sq-text" : "text-sq-secondary"}`,
										children: [e.quantity > 1 && /* @__PURE__ */ X("span", {
											className: "tabular-nums",
											children: [e.quantity, "× "]
										}), Ct(e, !0)]
									}), /* @__PURE__ */ X("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											"раунд ",
											n.seq,
											e.bottle_pending && /* @__PURE__ */ X("span", {
												className: "font-semibold text-amber-800",
												"data-testid": `pay-line-waiting-${e.id}`,
												children: [" ", "· чекає марку з бару"]
											})
										]
									})]
								}),
								/* @__PURE__ */ Y("span", {
									className: `shrink-0 text-base tabular-nums ${r ? "text-sq-text" : "text-sq-muted"}`,
									children: Z(on(e))
								})
							]
						}, e.id);
					})
				})]
			}), /* @__PURE__ */ X("section", {
				className: "md:w-[420px] md:shrink-0 flex flex-col gap-3.5",
				children: [
					/* @__PURE__ */ X("div", {
						className: "rounded-card bg-white shadow-card px-5 py-[18px] flex flex-col gap-2.5",
						children: [
							/* @__PURE__ */ X("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								children: [/* @__PURE__ */ X("span", { children: [
									"Вибрано ",
									oe,
									" з ",
									l.length
								] }), /* @__PURE__ */ Y("span", {
									className: "tabular-nums",
									children: Z(_)
								})]
							}),
							!g && /* @__PURE__ */ X("div", {
								className: "flex items-center justify-between py-2 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]",
								children: [/* @__PURE__ */ X("span", {
									className: "flex items-center gap-2.5 text-base text-sq-text",
									children: [/* @__PURE__ */ Y(P, { size: 24 }), "Порівну на"]
								}), /* @__PURE__ */ X("div", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ Y("button", {
											type: "button",
											"aria-label": "Менше",
											className: gn,
											"data-testid": "pay-ways-less",
											disabled: t || f <= 1,
											onClick: () => p((e) => Math.max(1, e - 1)),
											children: /* @__PURE__ */ Y(C, { size: 20 })
										}),
										/* @__PURE__ */ Y("span", {
											className: "w-11 text-center text-[17px] font-semibold tabular-nums",
											"data-testid": "pay-ways",
											children: f
										}),
										/* @__PURE__ */ Y("button", {
											type: "button",
											"aria-label": "Більше",
											className: gn,
											"data-testid": "pay-ways-more",
											disabled: t || f >= 10,
											onClick: () => p((e) => Math.min(10, e + 1)),
											children: /* @__PURE__ */ Y(j, { size: 20 })
										})
									]
								})]
							}),
							g && /* @__PURE__ */ X("div", {
								className: "py-2 space-y-1 shadow-[0_-1px_0_#E6E8EC,0_1px_0_#E6E8EC]",
								"data-testid": "pay-receipts",
								children: [
									/* @__PURE__ */ Y("p", {
										className: "text-[13px] text-sq-muted",
										children: "Два ФОП — кожен свій чек, один спосіб оплати"
									}),
									b?.list.map((e, t) => /* @__PURE__ */ X("div", {
										className: `flex justify-between text-[15px] tabular-nums ${V && t === T ? "font-semibold text-sq-text" : "text-sq-secondary"}`,
										"data-testid": `pay-receipt-${e.register_no}`,
										children: [/* @__PURE__ */ X("span", { children: [m === "card" && t < T ? "✓ " : "", un(e)] }), /* @__PURE__ */ Y("span", { children: Z(e.due_cents) })]
									}, e.register_no)),
									!b && !S && u.size > 0 && /* @__PURE__ */ Y("p", {
										className: "text-[15px] text-sq-muted",
										children: "Рахуємо чеки…"
									}),
									S && /* @__PURE__ */ Y("p", {
										role: "alert",
										className: "text-[15px] text-sq-danger",
										"data-testid": "pay-quote-error",
										children: S
									})
								]
							}),
							!g && f > 1 && /* @__PURE__ */ X("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								"data-testid": "pay-shares",
								children: [
									A.map((e) => Z(e)).join(" + "),
									" — один чек, ",
									f,
									" оплат"
								]
							}),
							(g ? k : y.deltaCents) !== 0 && /* @__PURE__ */ X("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								"data-testid": "pay-rounding",
								children: [/* @__PURE__ */ Y("span", { children: "Заокруглення готівки" }), /* @__PURE__ */ Y("span", {
									className: "tabular-nums",
									children: mn(g ? k : y.deltaCents)
								})]
							}),
							/* @__PURE__ */ X("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ Y("span", {
									className: "text-lg font-bold text-sq-heading",
									children: "До сплати"
								}), /* @__PURE__ */ Y("span", {
									className: "text-[30px] font-bold text-sq-heading tabular-nums",
									"data-testid": "pay-due",
									children: Z(O)
								})]
							})
						]
					}),
					/* @__PURE__ */ Y("div", {
						className: "flex gap-2.5",
						children: pn.map((e) => {
							let t = m === e.id, n = e.glyph;
							return /* @__PURE__ */ X("button", {
								type: "button",
								"data-testid": `pay-method-${e.id}`,
								"aria-pressed": t,
								onClick: () => {
									h(e.id), re(!1);
								},
								className: `flex-1 min-h-16 rounded-[14px] bg-white inline-flex items-center justify-center gap-2.5 text-base font-semibold text-sq-text ${t ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider"}`,
								children: [/* @__PURE__ */ Y(n, { size: 24 }), e.label]
							}, e.id);
						})
					}),
					M && O > 0 && /* @__PURE__ */ X("div", {
						className: "rounded-card bg-white shadow-card px-5 py-4 flex flex-col gap-3",
						"data-testid": "pay-cash",
						children: [/* @__PURE__ */ X("div", {
							className: "grid grid-cols-2 gap-3",
							children: [/* @__PURE__ */ X("label", {
								className: "rounded-[14px] ring-2 ring-sq-blue px-3.5 py-2.5 flex flex-col cursor-text",
								children: [/* @__PURE__ */ Y("span", {
									className: "text-[13px] text-sq-secondary",
									children: "Отримано"
								}), /* @__PURE__ */ X("span", {
									className: "flex items-baseline gap-1 text-[24px] font-bold text-sq-heading tabular-nums",
									children: [/* @__PURE__ */ Y("input", {
										"aria-label": "Отримано готівкою",
										className: "min-w-0 w-full bg-transparent outline-none border-0 p-0",
										inputMode: "decimal",
										value: ee,
										onFocus: (e) => e.currentTarget.select(),
										onChange: (e) => {
											te(e.target.value.replace(/[^\d,.]/g, "").replace(".", ",")), re(!0);
										},
										"data-testid": "pay-received"
									}), /* @__PURE__ */ Y("span", {
										className: "shrink-0",
										children: "₴"
									})]
								})]
							}), /* @__PURE__ */ X("div", {
								className: "rounded-[14px] bg-sq-sidebar px-3.5 py-2.5 flex flex-col",
								"data-testid": "pay-change",
								children: [/* @__PURE__ */ Y("span", {
									className: "text-[13px] text-sq-secondary",
									children: L > 0 ? "Не вистачає" : "Решта"
								}), /* @__PURE__ */ Y("span", {
									className: `text-[24px] font-bold tabular-nums truncate ${L > 0 ? "text-sq-danger" : "text-sq-success"}`,
									children: Z(L > 0 ? L : R)
								})]
							})]
						}), ie.length > 0 && /* @__PURE__ */ Y("div", {
							className: "flex gap-2",
							children: ie.map((e) => /* @__PURE__ */ Y("button", {
								type: "button",
								onClick: () => {
									te(dn(e)), re(!0);
								},
								className: "flex-1 min-w-0 h-11 rounded-sq bg-sq-empty hover:bg-sq-selected text-base font-semibold tabular-nums truncate px-1",
								"data-testid": `pay-quick-${e}`,
								children: Z(e)
							}, e))
						})]
					}),
					H && /* @__PURE__ */ X("p", {
						className: "text-[13px] text-amber-800",
						"data-testid": "pay-card-taken",
						children: [
							"Уже проведено ",
							H,
							". Якщо наступний термінал відмовить — поверніть їх на терміналі; оплату ще не записано."
						]
					}),
					B.length > 0 && /* @__PURE__ */ X("p", {
						className: "text-[15px] text-amber-800",
						"data-testid": "pay-waiting-bar",
						children: [
							"Бар ще не відсканував марку нової пляшки для",
							" ",
							B.map(({ line: e }) => `«${Ct(e, !0)}»`).join(", "),
							". Зніміть цю страву, щоб оплатити решту, або зачекайте на бар."
						]
					}),
					c && /* @__PURE__ */ Y("p", {
						role: "alert",
						className: "text-[15px] text-sq-danger",
						"data-testid": "pay-error",
						children: c
					}),
					/* @__PURE__ */ Y("div", { className: "flex-1" }),
					/* @__PURE__ */ Y("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[60px] rounded-xl text-lg",
						"data-testid": "pay-submit",
						disabled: t || O <= 0 || L > 0 || B.length > 0 || g && !b,
						onClick: ae,
						children: V ? `Пройшла на терміналі «${un(V)}» · ${Z(V.due_cents)}` : R > 0 ? `Прийняти ${Z(I)} · решта ${Z(R)}` : `Оплатити ${Z(O)}${v ? "" : " (частина)"}`
					})
				]
			})]
		})]
	});
}
var gn = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
// src/modules/tables/lib/draft.ts
function _n(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = ve(Q([n]), r);
	return {
		token: t,
		uid: pe(n.variant_id, r, i),
		variant_id: n.variant_id,
		product_id: n.product_id,
		product_name: n.product_name,
		variant_label: n.label,
		quantity: e.quantity ?? 1,
		modifiers: [...r],
		modifierNames: a.error ? [] : a.names,
		note: i,
		preview_cents: a.error ? null : n.price_cents + a.deltaCents,
		excise_per_unit: n.excise_per_unit === !0
	};
}
function vn(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return pe(e.variant_id, t, e.note);
}
function yn(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: vn(e),
		product_id: null,
		variant_id: e.variant_id,
		product_name: e.product_name,
		variant_label: e.variant_label,
		modifierIds: e.modifiers.map((e) => e.modifier_id).filter((e) => e != null),
		modifierNames: e.modifiers.map((e) => e.name),
		note: e.note,
		quantity: e.quantity,
		preview_unit_cents: e.preview_unit_price_cents,
		pending: !1,
		excisePerUnit: e.excise_per_unit === !0,
		exciseLabels: e.excise_labels ?? []
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
			pending: !0,
			excisePerUnit: e.excise_per_unit,
			exciseLabels: []
		};
		n.push(i), r.set(i.uid, i);
	}
	return n;
}
function bn(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? xn(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function xn(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function Sn(e) {
	return e.filter((e) => e.excisePerUnit && e.exciseLabels.length !== e.quantity);
}
function Cn(e) {
	let t = 0, n = 0, r = !0;
	for (let i of e) t += i.quantity, i.preview_unit_cents == null ? r = !1 : n += i.preview_unit_cents * i.quantity;
	return {
		lines: e.length,
		units: t,
		cents: n,
		exact: r
	};
}
// src/modules/tables/lib/precheck.ts
function wn(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function Tn(e, t = /* @__PURE__ */ new Date()) {
	let n = rn(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: on(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: wn(e.opened_at, t),
		printed_at: wn(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0),
		feedback_url: e.feedback_url ?? null
	};
}
// src/modules/tables/lib/useBill.ts
function En() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function Dn(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = q(null), [o, s] = q(!0), [c, l] = q(null), [u, d] = q(null), [f, p] = q(!1), [m, h] = q([]), [g, _] = q(0), [v, y] = q(!1), [b, x] = q(null), S = K(!0), C = K([]), w = K(!1), T = K(!1), E = K(0);
	W(() => (S.current = !0, () => {
		S.current = !1;
	}), []);
	let D = U(async () => {
		if (!n || r == null) return !1;
		let t = await z(r, e);
		return !t || !S.current ? !1 : (a(t.bill), y(!0), x(t.savedAt), s(!1), !0);
	}, [
		e,
		n,
		r
	]), O = U(async () => {
		if (t) try {
			let t = await M(e);
			if (!S.current) return;
			a(t), l(null), y(!1), x(null), n && r != null && N(r, t);
		} catch (e) {
			if (!S.current) return;
			let t = await D();
			S.current && !t && l(H(e, "Не вдалося прочитати рахунок"));
		} finally {
			S.current && s(!1);
		}
		else {
			let e = await D();
			S.current && !e && s(!1);
		}
	}, [
		e,
		t,
		D,
		n,
		r
	]);
	W(() => {
		O();
	}, [O]), Yt(U(async () => {
		let i = () => w.current || C.current.length > 0;
		if (!t || i()) return;
		let o = E.current;
		try {
			let t = await M(e);
			if (!S.current || o !== E.current || i()) return;
			a((e) => e != null && JSON.stringify(e) === JSON.stringify(t) ? e : t), l(null), y(!1), x(null), n && r != null && N(r, t);
		} catch {}
	}, [
		e,
		t,
		n,
		r
	]), t);
	let k = U(async () => {
		if (w.current) return;
		w.current = !0;
		let e = !1;
		try {
			for (; C.current.length > 0;) {
				let t = C.current.shift();
				t.kind === "blocking" && (T.current = !0, p(!0));
				try {
					let e = await t.write();
					E.current += 1, S.current && (a(e), y(!1), x(null), t.kind === "blocking" && t.stock && _((e) => e + 1)), n && r != null && N(r, e), t.kind === "blocking" && t.resolve(!0);
				} catch (n) {
					e = !0, S.current && d(H(n, "Не вдалося зберегти")), t.kind === "blocking" && t.resolve(!1);
				} finally {
					t.kind === "add" && S.current && h((e) => e.filter((e) => e.token !== t.token)), t.kind === "blocking" && (T.current = !1, S.current && p(!1));
				}
			}
		} finally {
			w.current = !1;
		}
		e && S.current && O();
	}, [
		n,
		r,
		O
	]), A = U((n) => {
		if (!t) {
			d("Потрібна мережа");
			return;
		}
		d(null);
		let r = En(), i = _n(n, r);
		h((e) => [...e, i]), C.current.push({
			kind: "add",
			token: r,
			write: () => L(e, {
				variant_id: i.variant_id,
				quantity: i.quantity,
				modifiers: i.modifiers,
				note: i.note
			})
		}), k();
	}, [
		e,
		t,
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
		clearBanner: U(() => d(null), []),
		notice: U((e) => d(e), []),
		reload: O,
		addLine: A,
		run: U((e, n = {}) => T.current ? Promise.resolve(!1) : t ? (d(null), new Promise((t) => {
			C.current.push({
				kind: "blocking",
				stock: n.stock === !0,
				write: e,
				resolve: t
			}), k();
		})) : (d("Потрібна мережа"), Promise.resolve(!1)), [t, k])
	};
}
// src/modules/tables/lib/useGuestOrders.ts
function On(e, t) {
	return JSON.stringify(e) === JSON.stringify(t) ? e : t;
}
function kn({ online: e, tableId: t = null }) {
	let [n, r] = q([]), [i, a] = q([]), [o, s] = q([]), [c, l] = q([]), [u, d] = q(!1), f = K(!0);
	W(() => (f.current = !0, () => {
		f.current = !1;
	}), []);
	let p = U(async () => {
		if (e) try {
			let e = await R(t ?? void 0);
			if (!f.current) return;
			let n = Array.isArray(e?.orders) ? e.orders : [], i = Array.isArray(e?.sent) ? e.sent : [], o = Array.isArray(e?.calls) ? e.calls : [], c = Array.isArray(e?.feedback) ? e.feedback : [];
			r((e) => On(e, n)), a((e) => On(e, i)), s((e) => On(e, o)), l((e) => On(e, c)), d(!0);
		} catch {}
	}, [e, t]);
	return W(() => {
		e ? p() : (r([]), a([]), s([]), d(!1));
	}, [e, p]), Yt(p, e), {
		orders: n,
		sent: i,
		calls: o,
		feedback: c,
		loaded: u,
		refresh: p
	};
}
// src/modules/tables/lib/useIsWide.ts
var An = "(min-width: 1024px)";
function jn() {
	let [e, t] = q(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(An).matches);
	return W(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(An), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
// src/modules/tables/lib/useNotifyChime.ts
var Mn = "tables:chime", Nn = null;
function Pn() {
	if (Nn) return Nn;
	let e = globalThis, t = e.AudioContext ?? e.webkitAudioContext;
	if (!t) return null;
	try {
		Nn = new t();
	} catch {
		Nn = null;
	}
	return Nn;
}
function Fn() {
	let e = () => {
		let e = Pn();
		e && e.state === "suspended" && e.resume().catch(() => void 0);
	};
	return document.addEventListener("pointerdown", e, {
		once: !0,
		capture: !0
	}), () => document.removeEventListener("pointerdown", e, { capture: !0 });
}
function In() {
	let e = Pn();
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
function Ln() {
	try {
		return localStorage.getItem(Mn) !== "off";
	} catch {
		return !0;
	}
}
function Rn() {
	let [e, t] = q(Ln);
	return [e, U((e) => {
		t(e);
		try {
			localStorage.setItem(Mn, e ? "on" : "off");
		} catch {}
	}, [])];
}
function zn(e, t, n) {
	let r = K(null);
	W(() => Fn(), []), W(() => {
		if (!t) return;
		let i = r.current;
		if (r.current = new Set(e), i != null && n) {
			for (let t of e) if (!i.has(t)) {
				In();
				return;
			}
		}
	}, [
		e,
		t,
		n
	]);
}
// src/modules/tables/pages/BillPage.tsx
function Bn() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function Vn() {
	let { billId: e } = Oe(), t = Number(e), n = be((e) => e.online), i = xe(), a = ye((e) => e.auth?.store.id ?? null), c = ye((e) => e.auth?.store.cash_rounding ?? 0), l = ye((e) => (e.auth?.store.fiscal?.registers?.length ?? 0) > 0), { bill: u, loading: f, error: p, banner: m, busy: h, pending: v, epoch: y, stale: b, savedAt: x, clearBanner: S, notice: C, reload: E, addLine: k, run: j } = Dn(t, {
		online: n,
		mirrored: i !== "web",
		storeId: a
	}), M = jn(), N = Ce().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [P, F] = q(!1), [ne, re] = q(!1), [I, L] = q(null), [R, ie] = q(null), [z, B] = q(null), [V, oe] = q(!1), ue = De(), U = Ee(), { orders: K, sent: J, calls: fe, feedback: pe, loaded: me, refresh: Z } = kn({ online: n && u != null }), Q = u?.table_id ?? null, ge = G(() => K.filter((e) => e.table_id === Q), [K, Q]), ve = G(() => J.filter((e) => e.table_id === Q), [J, Q]), Se = G(() => fe.filter((e) => e.table_id === Q), [fe, Q]), we = G(() => pe.filter((e) => e.table_id === Q), [pe, Q]), Te = G(() => qt({
		orders: K,
		sent: J,
		calls: fe
	}, Q), [
		K,
		J,
		fe,
		Q
	]), ke = G(() => Wt({
		orders: K,
		sent: J,
		calls: fe
	}), [
		K,
		J,
		fe
	]), [Ae] = Rn();
	zn(ke, me, Ae);
	let je = U.state?.notice;
	W(() => {
		typeof je == "string" && je && C(je);
	}, [je, C]);
	let $ = G(() => u ? yn(u.draft, v) : [], [u, v]), Me = G(() => Cn($), [$]), Ne = G(() => u ? rn(u) : [], [u]), [Pe, Fe] = q([]), Ie = G(() => bn($, Pe), [$, Pe]), Le = G(() => $.filter((e) => e.excisePerUnit && e.id != null).map((e) => ({
		uid: e.key,
		product_name: e.product_name,
		quantity: e.quantity,
		excise_per_unit: !0,
		excise_labels: e.exciseLabels
	})), [$]);
	if (!n && !b && !f) return /* @__PURE__ */ Y("div", {
		className: "p-4",
		"data-testid": "bill-offline",
		children: /* @__PURE__ */ X("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ Y("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ Y("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок живе на сервері — без звʼязку його не змінити."
			})]
		})
	});
	if (f) return /* @__PURE__ */ Y("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (p || !u) return /* @__PURE__ */ Y("div", {
		className: "p-4",
		children: /* @__PURE__ */ X("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ Y("p", {
				className: "text-sm",
				children: p ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ Y("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void E(),
				children: "Повторити"
			})]
		})
	});
	let Re = async (e, t = 0) => {
		let n = {
			settled: !1,
			warning: null
		};
		await j(async () => {
			let r = await le(u.id, e, t);
			return n.settled = ln(r.bill), n.warning = r.warning ?? null, r.bill;
		}, { stock: !0 }) && (re(!1), n.settled ? n.warning ? ue("/tables", { state: {
			note: n.warning,
			warn: !0
		} }) : ue("/tables") : n.warning && C(n.warning));
	}, ze = async () => {
		if (ie(null), await j(() => w(u.id)) && i === "cashier") try {
			let [e, t] = await Promise.all([he("receiptPrinterName"), he("receiptPaperWidthMm")]);
			if (!e) return;
			await _e(e, Tn(u), t === 58 || t === 80 ? t : de), ie("Передчек надіслано на друк");
		} catch (e) {
			ie(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, Be = () => {
		F(!1), Sn($).length > 0 ? B({ error: null }) : j(async () => {
			try {
				return await A(u.id, Bn());
			} catch (e) {
				let t = e?.response?.data?.code;
				throw typeof t == "string" && t.startsWith("excise_") && B({ error: H(e, "Скануйте акцизні марки") }), e;
			}
		}, { stock: !0 });
	}, Ve = (e, t) => {
		let n = $.find((t) => t.key === e);
		if (n?.id == null) return;
		let r = n.id;
		B({ error: null }), j(async () => {
			try {
				return await se(u.id, r, t);
			} catch (e) {
				throw B({ error: H(e, "Не вдалося зберегти марку") }), e;
			}
		});
	}, He = (e) => {
		if (e.id == null) return;
		let t = e.id;
		j(() => e.quantity > 1 ? _(u.id, t, e.quantity - 1) : g(u.id, t));
	}, Ue = (e) => {
		if (e.id == null) return;
		let t = e.id;
		j(() => _(u.id, t, e.quantity + 1));
	}, We = (e) => {
		if (e.id == null) return;
		let t = Pe.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		t ? L({
			row: e,
			variants: [...t[1]]
		}) : C("Страви вже немає в меню — зніміть рядок і додайте іншу");
	}, Ge = (e, t, n) => {
		let i = I?.row.id;
		L(null), i != null && j(() => r(u.id, i, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, Ke = async (e, t) => {
		let n = {
			warning: null,
			refused: null
		}, r = await j(async () => {
			try {
				let r = await T(e.id, t);
				return n.warning = r.warning, r.bill;
			} catch (e) {
				throw n.refused = Rt(e), e;
			}
		}, { stock: !0 });
		return Z(), r && n.warning && C(n.warning), {
			ok: r,
			refusedLineId: n.refused
		};
	}, qe = async (e) => {
		if (!n) return C("Потрібна мережа"), !1;
		try {
			return await ae(e.id), !0;
		} catch (e) {
			return C(H(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			Z();
		}
	}, Je = async (e) => {
		if (!n) return C("Потрібна мережа"), !1;
		try {
			return await te(e.id), !0;
		} catch (e) {
			return C(H(e, "Не вдалося позначити")), !1;
		} finally {
			Z();
		}
	}, Ye = async (e) => {
		if (!n) return C("Потрібна мережа"), !1;
		try {
			return await ee(e.id), e.bill_opened_by_guest && E(), !0;
		} catch (e) {
			return C(H(e, "Не вдалося позначити")), !1;
		} finally {
			Z();
		}
	}, Xe = async (e, t) => {
		if (!n) return C("Потрібна мережа"), !1;
		oe(!0), S();
		try {
			return await ce(e.id, t ?? void 0), Z(), !0;
		} catch (e) {
			return C(H(e, "Не вдалося відхилити запит")), Z(), !1;
		} finally {
			oe(!1);
		}
	}, Ze = /* @__PURE__ */ Y(Et, {
		bill: u,
		draft: $,
		summary: Me,
		owedCents: u.fired_total_cents,
		busy: h,
		online: n,
		hasPending: v.length > 0,
		canPay: Ne.length > 0,
		canPrecheck: Ne.length > 0,
		printStatus: R,
		onLess: He,
		onMore: Ue,
		onEdit: We,
		onStamps: () => {
			F(!1), B({ error: null });
		},
		onCancelRound: (e) => void j(() => O(u.id, e), { stock: !0 }),
		onFire: Be,
		onPay: () => {
			F(!1), S(), re(!0);
		},
		onPrecheck: () => void ze()
	});
	return /* @__PURE__ */ X("div", {
		className: "relative flex h-full min-h-0 flex-col",
		"data-testid": "bill-page",
		children: [
			/* @__PURE__ */ X("header", {
				className: "flex shrink-0 items-center gap-3.5 px-4 md:px-6 min-h-[68px] py-2 shadow-[0_1px_0_#E6E8EC]",
				children: [/* @__PURE__ */ X("button", {
					type: "button",
					className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
					onClick: () => ue("/tables"),
					children: [/* @__PURE__ */ Y(o, { size: 20 }), u.hall_name || "Зала"]
				}), /* @__PURE__ */ X("div", {
					className: `min-w-0 flex-1 ${M ? "" : "text-center pr-16"}`,
					children: [/* @__PURE__ */ X("p", {
						className: "truncate text-xl font-bold text-sq-heading",
						children: ["Стіл ", u.table_name]
					}), /* @__PURE__ */ X("p", {
						className: "truncate text-[13px] text-sq-muted",
						children: [
							d(u.guests),
							" · ",
							u.opened_by_name,
							" · ",
							s(u.opened_at, (/* @__PURE__ */ new Date()).toISOString()),
							" · рахунок ",
							u.bill_no
						]
					})]
				})]
			}),
			b && /* @__PURE__ */ X("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					x == null ? "" : `, станом на ${String(new Date(x).getHours()).padStart(2, "0")}:${String(new Date(x).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			m && /* @__PURE__ */ X("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					m,
					" ",
					/* @__PURE__ */ Y("button", {
						type: "button",
						className: "sq-link",
						onClick: S,
						children: "Зрозуміло"
					})
				]
			}),
			Te.length > 0 && /* @__PURE__ */ X("p", {
				className: "mx-4 md:mx-6 mt-2 flex items-center gap-3 rounded-sq bg-sq-blue/[0.06] px-3 py-2 text-sm text-sq-text",
				"data-testid": "bill-elsewhere",
				children: [/* @__PURE__ */ X("span", {
					className: "min-w-0 flex-1 truncate",
					children: [
						"Інші столи:",
						" ",
						Te.slice(0, 3).map((e) => `Стіл ${e.table_name} — ${e.words}`).join(" · "),
						Te.length > 3 ? ` · і ще ${Te.length - 3}` : ""
					]
				}), /* @__PURE__ */ Y("button", {
					type: "button",
					className: "sq-link shrink-0 font-semibold",
					onClick: () => ue("/tables"),
					children: "До залу"
				})]
			}),
			(ge.length > 0 || Se.length > 0 || ve.length > 0 || we.length > 0) && /* @__PURE__ */ X("section", {
				className: "mx-4 md:mx-6 mt-2 max-h-[40vh] shrink-0 overflow-auto space-y-2.5",
				"data-testid": "bill-requests",
				children: [/* @__PURE__ */ Y(Zt, {
					calls: Se,
					sent: ve,
					feedback: we,
					showTable: !1,
					busy: h || V,
					onAnswer: qe,
					onSeen: Ye,
					onSeenFeedback: Je
				}), /* @__PURE__ */ Y(Qt, {
					orders: ge,
					showTable: !1,
					busy: h || V,
					onAccept: Ke,
					onReject: Xe
				})]
			}),
			/* @__PURE__ */ X("div", {
				className: `min-h-0 flex-1 ${M ? "grid grid-cols-[minmax(0,1fr)_372px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ Y(nn, {
					counts: Ie,
					online: n,
					active: n && !ne && !P && !I,
					canScan: i === "cashier",
					epoch: y,
					onAdd: k,
					onRows: Fe
				}), M && /* @__PURE__ */ Y("aside", {
					className: "flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]",
					children: Ze
				})]
			}),
			!M && /* @__PURE__ */ Y(Tt, {
				draft: $,
				rounds: u.rounds,
				summary: Me,
				owedCents: u.fired_total_cents,
				hasPending: v.length > 0,
				busy: h,
				online: n,
				onOpen: () => F(!0),
				onFire: Be
			}),
			!M && P && /* @__PURE__ */ Y(jt, {
				title: `Стіл ${u.table_name} · рахунок ${u.bill_no}`,
				onClose: () => F(!1),
				children: Ze
			}),
			ne && /* @__PURE__ */ Y(hn, {
				bill: u,
				busy: h,
				cashRoundingStep: c,
				onClose: () => re(!1),
				onPay: (e, t) => void Re(e, t),
				quote: l ? (e, t) => D(u.id, e, t) : null,
				error: m
			}),
			z && /* @__PURE__ */ Y(yt, {
				lines: Le,
				error: z.error,
				busy: h,
				doneLabel: "На кухню",
				onSetLabels: Ve,
				onClose: () => B(null),
				onDone: () => {
					B(null), Be();
				}
			}),
			I && /* @__PURE__ */ Y("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ Y(at, {
					productName: I.row.product_name,
					variants: I.variants,
					variantLabel: N,
					initialVariantId: I.row.variant_id,
					initialModifierIds: I.row.modifierIds,
					initialNote: I.row.note,
					submitLabel: "Зберегти",
					withQuantity: !1,
					onAdd: ({ item: e, modifiers: t, note: n }) => Ge(e, t, n),
					onClose: () => L(null)
				})
			})
		]
	});
}
// src/modules/tables/components/TableTile.tsx
var Hn = {
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
}, Un = {
	free: "Вільний",
	mine: "Мій стіл",
	busy: "Зайнятий",
	bill: "Просять рахунок"
};
function Wn({ seat: n, now: r, meId: i, onOpen: a, disabled: o, guestWaiting: c = 0, calling: f, sentUnseen: m = 0, lowScore: h = null }) {
	let g = f?.waiter === !0, _ = f?.bill === !0, { table: v, bill: y } = n, x = ue(y, i), S = p(y), C = v.shape === "round";
	return /* @__PURE__ */ X("button", {
		type: "button",
		"data-testid": `table-tile-${v.id}`,
		"data-tone": x,
		"data-kitchen": S ?? void 0,
		"data-guest": c > 0 ? c : void 0,
		"data-call": g || _ ? [g ? "waiter" : "", _ ? "bill" : ""].filter(Boolean).join(" ") : void 0,
		"data-sent": m > 0 ? m : void 0,
		"data-low-score": h ?? void 0,
		disabled: o,
		onClick: () => a(n),
		style: {
			gridColumn: `${v.pos_x + 1} / span ${v.width}`,
			gridRow: `${v.pos_y + 1} / span ${v.height}`
		},
		className: `relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${C ? "rounded-full" : "rounded-card"} ${Hn[x].tile}`,
		children: [
			Hn[x].dot && /* @__PURE__ */ Y("span", {
				"aria-hidden": !0,
				className: `absolute top-3 w-2.5 h-2.5 rounded-full ${C ? "right-[18%]" : "right-3.5"} ${Hn[x].dot}`
			}),
			(S || c > 0 || g || _ || m > 0 || h != null || y && y.draft_count > 0) && /* @__PURE__ */ X("span", {
				className: `absolute top-2.5 flex flex-wrap items-center gap-1 ${C ? "left-[16%] right-[24%]" : "left-3 right-8"}`,
				children: [
					g && /* @__PURE__ */ X("span", {
						"data-testid": `table-call-waiter-${v.id}`,
						title: "Гість кличе офіціанта",
						className: "h-5 px-1 rounded-md bg-[#8A6CEF]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ Y(V, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ Y("span", {
							className: "sr-only",
							children: "Гість кличе офіціанта"
						})]
					}),
					_ && /* @__PURE__ */ X("span", {
						"data-testid": `table-call-bill-${v.id}`,
						title: "Гість просить рахунок",
						className: "h-5 px-1 rounded-md bg-[#1B9DF0]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ Y(I, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ Y("span", {
							className: "sr-only",
							children: "Гість просить рахунок"
						})]
					}),
					h != null && /* @__PURE__ */ X("span", {
						"data-testid": `table-low-${v.id}`,
						title: "Гість поставив низьку оцінку з телефону",
						className: "h-5 px-1 rounded-md bg-sq-danger/15 text-sq-danger text-[11px] font-semibold inline-flex items-center gap-0.5 animate-pulse",
						children: [
							/* @__PURE__ */ Y(E, {
								size: 14,
								"aria-hidden": !0
							}),
							h,
							/* @__PURE__ */ Y("span", {
								className: "sr-only",
								children: "Низька оцінка з телефону"
							})
						]
					}),
					m > 0 && /* @__PURE__ */ X("span", {
						"data-testid": `table-sent-${v.id}`,
						title: "Гість замовив сам — уже на кухні",
						className: "h-5 px-1 rounded-md bg-[#F4891F]/15 text-[#B35F0C] text-[11px] font-semibold inline-flex items-center gap-0.5 animate-pulse",
						children: [
							/* @__PURE__ */ Y(l, {
								size: 14,
								"aria-hidden": !0
							}),
							m > 1 ? m : null,
							/* @__PURE__ */ Y("span", {
								className: "sr-only",
								children: "Замовлення гостя вже на кухні"
							})
						]
					}),
					c > 0 && /* @__PURE__ */ X("span", {
						"data-testid": `table-guest-${v.id}`,
						title: "Гість надіслав запит із телефону",
						className: "h-5 px-1.5 rounded-md bg-sq-blue text-white text-[11px] font-semibold inline-flex items-center gap-1 animate-pulse",
						children: [
							/* @__PURE__ */ Y(b, {
								size: 13,
								"aria-hidden": !0
							}),
							c > 1 ? c : null,
							/* @__PURE__ */ Y("span", {
								className: "sr-only",
								children: c > 1 ? `Запитів гостей: ${c}` : "Запит гостя"
							})
						]
					}),
					S && /* @__PURE__ */ Y("span", {
						className: `h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${S === "ready" ? "bg-sq-success text-white" : "bg-sq-warning/15 text-[#B35F0C]"}`,
						children: S === "ready" ? "готово" : "готується"
					}),
					y && y.draft_count > 0 && /* @__PURE__ */ Y("span", {
						"data-testid": `table-draft-${v.id}`,
						title: "Не відправлено на кухню",
						className: "text-sq-blue",
						children: /* @__PURE__ */ Y(e, {
							size: 16,
							"aria-label": "Не відправлено на кухню"
						})
					})
				]
			}),
			/* @__PURE__ */ Y("span", {
				className: "text-[30px] font-bold leading-none text-sq-heading tabular-nums",
				children: v.name
			}),
			y ? /* @__PURE__ */ X(J, { children: [
				x === "bill" ? /* @__PURE__ */ Y("span", {
					className: "text-[13px] font-semibold text-sq-danger",
					"data-testid": `table-precheck-${v.id}`,
					children: "Просять рахунок"
				}) : /* @__PURE__ */ X("span", {
					className: "text-[13px] font-semibold text-sq-text tabular-nums",
					children: [
						t(y.fired_total_cents),
						" · ",
						s(y.opened_at, r)
					]
				}),
				/* @__PURE__ */ X("span", {
					className: "text-xs text-sq-muted truncate max-w-full",
					children: [d(y.guests), y.opened_by_name ? ` · ${y.opened_by_name}` : ""]
				}),
				/* @__PURE__ */ Y("span", {
					className: "sr-only",
					children: Un[x]
				})
			] }) : /* @__PURE__ */ Y("span", {
				className: "text-[13px] text-sq-muted",
				children: u(v.seats)
			})
		]
	});
}
function Gn({ guest: e = !1, callWaiter: t = !1, callBill: n = !1, sent: r = !1, low: i = !1 }) {
	let a = {
		free: "bg-sq-divider",
		mine: "bg-sq-blue",
		busy: "bg-[#F8C00F]",
		bill: "bg-sq-danger"
	};
	return /* @__PURE__ */ X("div", {
		className: "flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary",
		"data-testid": "tables-legend",
		children: [
			Object.keys(a).map((e) => /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y("span", {
					"aria-hidden": !0,
					className: `w-2.5 h-2.5 rounded-full ${a[e]}`
				}), Un[e]]
			}, e)),
			e && /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y(b, {
					size: 14,
					className: "text-sq-blue",
					"aria-hidden": !0
				}), "Запит гостя"]
			}),
			t && /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y(V, {
					size: 14,
					"aria-hidden": !0
				}), "Кличе офіціанта"]
			}),
			n && /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y(I, {
					size: 14,
					"aria-hidden": !0
				}), "Рахунок з телефону"]
			}),
			r && /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y(l, {
					size: 14,
					"aria-hidden": !0
				}), "Замовив сам — на кухні"]
			}),
			i && /* @__PURE__ */ X("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ Y(E, {
					size: 14,
					className: "text-sq-danger",
					"aria-hidden": !0
				}), "Низька оцінка з телефону"]
			})
		]
	});
}
// src/modules/tables/pages/HallMapPage.tsx
function Kn(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function qn() {
	let e = be((e) => e.online), t = xe(), r = ye((e) => e.auth?.store.id ?? null), i = ye((e) => e.auth?.staff.id ?? null), { halls: a, bills: o, now: s, loading: c, error: l, stale: u, savedAt: d, refresh: p } = re({
		online: e,
		mirrored: t !== "web",
		storeId: r
	}), { orders: m, sent: g, calls: _, feedback: v, loaded: x, refresh: S } = kn({ online: e }), [C, w] = Rn(), [E, D] = q(null), [O, k] = q(!1), [A, j] = q(null), [M, N] = q(null), P = (e, t = !1) => N(e == null ? null : {
		text: e,
		warn: t
	}), F = De(), ne = Ee().state, I = typeof ne?.note == "string" ? ne.note : null, L = ne?.warn === !0;
	W(() => {
		I && N({
			text: I,
			warn: L
		});
	}, [I, L]);
	let R = G(() => Ht({
		orders: m,
		sent: g,
		calls: _,
		feedback: v
	}), [
		m,
		g,
		_,
		v
	]);
	zn(G(() => Wt({
		orders: m,
		sent: g,
		calls: _,
		feedback: v
	}), [
		m,
		g,
		_,
		v
	]), x, C);
	let ie = m.length + g.length + _.length + v.length > 0;
	W(() => {
		if (M == null || M.warn) return;
		let e = setTimeout(() => N(null), 8e3);
		return () => clearTimeout(e);
	}, [M]);
	let z = G(() => y(a, o), [a, o]), B = z.find((e) => e.id === E) ?? z[0] ?? null, V = G(() => B ? h(B, o) : [], [B, o]), oe = G(() => f(V), [V]);
	async function se(t) {
		if (!O) {
			if (!e) j("Потрібна мережа, щоб відкрити стіл");
			else {
				k(!0), j(null);
				try {
					let e = await n(t.table.id);
					F(`/tables/${e.bill.id}`);
				} catch (e) {
					j(H(e, "Не вдалося відкрити стіл")), p();
				} finally {
					k(!1);
				}
			}
		}
	}
	async function le(t, n) {
		if (O) return { ok: !1 };
		if (!e) return j("Потрібна мережа, щоб прийняти запит"), { ok: !1 };
		k(!0), j(null), P(null);
		try {
			let e = await T(t.id, n);
			return S(), p(), e.warning ? F(`/tables/${e.bill.id}`, { state: { notice: e.warning } }) : P(e.already ? `Стіл ${t.table_name}: запит уже було прийнято` : `Стіл ${t.table_name}: прийнято — замовлення на кухні`), { ok: !0 };
		} catch (e) {
			return j(H(e, "Не вдалося прийняти запит")), S(), {
				ok: !1,
				refusedLineId: Rt(e)
			};
		} finally {
			k(!1);
		}
	}
	async function ue(t) {
		if (!e) return j("Потрібна мережа, щоб відповісти гостю"), !1;
		j(null);
		try {
			return await ae(t.id), P(`Стіл ${t.table_name}: гість бачить «Офіціант іде»`), !0;
		} catch (e) {
			return j(H(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			S();
		}
	}
	async function U(t) {
		if (!e) return j("Потрібна мережа"), !1;
		j(null);
		try {
			return await te(t.id), P(`Стіл ${t.table_name}: оцінку позначено як опрацьовану`), !0;
		} catch (e) {
			return j(H(e, "Не вдалося позначити")), !1;
		} finally {
			S();
		}
	}
	async function K(t) {
		if (!e) return j("Потрібна мережа"), !1;
		j(null);
		try {
			return await ee(t.id), P(t.bill_opened_by_guest ? `Стіл ${t.table_name} тепер ваш — замовлення вже на кухні` : `Стіл ${t.table_name}: замовлення вже на кухні`), t.bill_opened_by_guest && p(), !0;
		} catch (e) {
			return j(H(e, "Не вдалося позначити")), !1;
		} finally {
			S();
		}
	}
	async function J(t, n) {
		if (O) return !1;
		if (!e) return j("Потрібна мережа, щоб відхилити запит"), !1;
		k(!0), j(null), P(null);
		try {
			return await ce(t.id, n ?? void 0), S(), P(`Стіл ${t.table_name}: запит відхилено`), !0;
		} catch (e) {
			return j(H(e, "Не вдалося відхилити запит")), S(), !1;
		} finally {
			k(!1);
		}
	}
	return !e && !u && !c ? /* @__PURE__ */ Y("div", {
		className: "p-4",
		"data-testid": "tables-offline",
		children: /* @__PURE__ */ X("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ Y("p", {
				className: "text-lg font-semibold",
				children: "Потрібна мережа"
			}), /* @__PURE__ */ Y("p", {
				className: "mt-1 text-sm text-sq-muted",
				children: "Рахунок столу живе на сервері — без звʼязку його не відкрити."
			})]
		})
	}) : /* @__PURE__ */ X("div", {
		className: "flex h-full min-h-0 flex-col bg-sq-bg",
		"data-testid": "hall-map",
		children: [
			/* @__PURE__ */ X("header", {
				className: "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0",
				children: [
					/* @__PURE__ */ Y("h1", {
						className: "text-2xl font-bold text-sq-heading",
						children: "Столи"
					}),
					z.length > 1 && /* @__PURE__ */ Y("div", {
						className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full",
						children: z.map((e) => {
							let t = B?.id === e.id, n = e.tables.reduce((e, t) => e + Ut(R.get(t.id)), 0);
							return /* @__PURE__ */ X("button", {
								type: "button",
								"aria-pressed": t,
								"data-testid": `hall-tab-${e.id}`,
								onClick: () => D(e.id),
								className: `whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${t ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
								children: [e.name, n > 0 && /* @__PURE__ */ X("span", {
									"data-testid": `hall-tab-guest-${e.id}`,
									className: "ml-1.5 inline-flex items-center gap-0.5 text-sq-blue font-semibold",
									children: [/* @__PURE__ */ Y(b, {
										size: 14,
										"aria-hidden": !0
									}), n]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ Y("div", { className: "flex-1" }),
					B && /* @__PURE__ */ Y(Gn, {
						guest: m.length > 0,
						callWaiter: _.some((e) => e.kind === "waiter"),
						callBill: _.some((e) => e.kind === "bill"),
						sent: g.length > 0,
						low: v.length > 0
					}),
					/* @__PURE__ */ Y("button", {
						type: "button",
						"aria-pressed": C,
						"data-testid": "tables-chime",
						className: "min-h-[34px] rounded-[9px] px-3 text-[13px] font-semibold text-sq-secondary ring-1 ring-sq-divider bg-white",
						title: "Звук і вібрація, коли гість кличе чи замовляє",
						onClick: () => w(!C),
						children: C ? "Звук увімкнено" : "Звук вимкнено"
					})
				]
			}),
			u && /* @__PURE__ */ X("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", d == null ? "" : `, станом на ${Kn(d)}`]
			}),
			A && /* @__PURE__ */ Y("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "tables-banner",
				children: A
			}),
			M && /* @__PURE__ */ Y("p", {
				className: `mx-4 md:mx-7 mb-3 rounded-sq px-3 py-2 text-sm ${M.warn ? "bg-amber-50 text-amber-900" : "bg-sq-success/10 text-sq-success-ink"}`,
				"data-testid": "tables-note",
				"data-tone": M.warn ? "warn" : "ok",
				children: M.text
			}),
			ie && /* @__PURE__ */ X("section", {
				className: "mx-4 md:mx-7 mb-3 max-h-[45vh] overflow-auto space-y-2.5",
				"data-testid": "tables-requests",
				children: [
					/* @__PURE__ */ X("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: [
							"З телефонів гостей ·",
							" ",
							Kt({
								requests: m.length,
								sent: g.length,
								calls: _.length,
								feedback: v.length
							})
						]
					}),
					/* @__PURE__ */ Y(Zt, {
						calls: _,
						sent: g,
						feedback: v,
						showTable: !0,
						busy: O,
						onAnswer: ue,
						onSeen: K,
						onSeenFeedback: U,
						onOpenBill: (e) => F(`/tables/${e}`)
					}),
					/* @__PURE__ */ Y(Qt, {
						orders: m,
						showTable: !0,
						busy: O,
						onAccept: le,
						onReject: J
					})
				]
			}),
			c && z.length === 0 && /* @__PURE__ */ Y("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!c && l && /* @__PURE__ */ Y("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ X("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ Y("p", {
						className: "text-sm",
						children: l
					}), /* @__PURE__ */ Y("button", {
						type: "button",
						className: "sq-btn-primary mt-3 px-4 py-2.5",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!c && !l && z.length === 0 && /* @__PURE__ */ Y("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ X("div", {
					className: "sq-card p-6 text-center",
					"data-testid": "tables-empty",
					children: [/* @__PURE__ */ Y("p", {
						className: "text-lg font-semibold",
						children: "Зали ще не створені"
					}), /* @__PURE__ */ Y("p", {
						className: "mt-1 text-sm text-sq-muted",
						children: "Власник додає зали й столи в адмінці, і вони зʼявляться тут."
					})]
				})
			}),
			B && /* @__PURE__ */ Y("div", {
				className: "grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6",
				style: {
					gridTemplateColumns: `repeat(${oe.cols}, minmax(2.5rem, 1fr))`,
					gridAutoRows: "minmax(3.75rem, auto)"
				},
				children: V.map((e) => /* @__PURE__ */ Y(Wn, {
					seat: e,
					now: s,
					meId: i,
					disabled: O,
					guestWaiting: R.get(e.table.id)?.requests ?? 0,
					calling: R.get(e.table.id),
					sentUnseen: R.get(e.table.id)?.sent ?? 0,
					lowScore: R.get(e.table.id)?.low ?? null,
					onOpen: (e) => void se(e)
				}, e.table.id))
			})
		]
	});
}
// src/modules/tables/pages/TablesRoutes.tsx
function Jn() {
	return /* @__PURE__ */ X(Te, { children: [/* @__PURE__ */ Y(we, {
		index: !0,
		element: /* @__PURE__ */ Y(qn, {})
	}), /* @__PURE__ */ Y(we, {
		path: ":billId",
		element: /* @__PURE__ */ Y(Vn, {})
	})] });
}
export { Jn as TablesRoutes };
