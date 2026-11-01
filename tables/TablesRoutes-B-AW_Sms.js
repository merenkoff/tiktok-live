import { $ as e, A as t, B as n, C as r, D as i, F as a, G as o, H as s, I as c, J as l, K as u, L as d, M as f, N as p, P as m, Q as h, R as g, S as _, T as v, U as y, V as b, W as x, X as S, Y as C, Z as w, _ as T, a as E, at as D, b as O, c as k, d as A, et as j, f as M, g as ee, h as te, i as N, it as P, j as F, k as ne, n as re, nt as I, o as L, p as ie, q as R, r as ae, s as oe, t as z, tt as B, x as V, y as se, z as ce } from "./useHallMap-D3r3NK5N.js";
import { useCallback as H, useEffect as U, useMemo as W, useRef as G, useState as K } from "react";
import { Fragment as le, jsx as q, jsxs as J } from "react/jsx-runtime";
import { DEFAULT_RECEIPT_PAPER_WIDTH as ue, assetUrl as de, cartLineUid as Y, defaultModifierIds as X, formatUah as Z, getMeta as fe, groupsOf as pe, needsModifierSheet as me, printPrecheck as he, resolveLineModifiers as ge, useAuthStore as _e, useOfflineStatus as ve, usePosShell as ye, useSalesCatalog as be, useVertical as xe } from "@pos/platform";
import { Route as Se, Routes as Ce, useLocation as we, useNavigate as Te, useParams as Ee } from "react-router-dom";
// src/hooks/useDragScroll.ts
var De = 6;
function Q() {
	let e = G(null);
	return U(() => {
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
			!n.moved && Math.hypot(r, i) > De && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
var Oe = "\xA0";
function ke(e) {
	return e.replace(/\B(?=(\d{3})+(?!\d))/g, Oe);
}
function $(e) {
	let t = e < 0 ? "-" : "", [n, r] = (Math.abs(e) / 100).toFixed(2).split(".");
	return `${t}${ke(n)},${r} ₴`;
}
function Ae(e) {
	return e % 100 == 0 ? `${e < 0 ? "-" : ""}${ke(String(Math.abs(e) / 100))} ₴` : $(e);
}
// src/components/cashier/ProductTile.tsx
function je({ name: e, subtitle: t, priceCents: n, compareAtCents: r, priceUnit: i, imageUrl: a, stock: o, onClick: s, disabled: c, count: l, onMore: u, badge: d, testId: f }) {
	let [p, m] = K(!1), h = p ? null : de(a), g = c || !!d || o != null && o <= 0, _ = /* @__PURE__ */ J("button", {
		type: "button",
		disabled: c,
		onClick: s,
		"data-testid": f,
		className: `w-full ${u ? "h-full" : ""} flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface transition-shadow disabled:opacity-50 disabled:cursor-not-allowed ${l ? "ring-2 ring-sq-blue" : "ring-1 ring-sq-divider hover:ring-sq-muted/50"}`,
		children: [/* @__PURE__ */ J("div", {
			className: "relative w-full aspect-[4/3] bg-sq-empty shrink-0",
			children: [
				h ? /* @__PURE__ */ q("img", {
					src: h,
					alt: "",
					className: `absolute inset-0 w-full h-full object-cover pointer-events-none ${g ? "opacity-45" : ""}`,
					onError: () => m(!0)
				}) : /* @__PURE__ */ q("div", {
					className: "absolute inset-0 grid place-items-center text-sq-secondary text-xs px-2 font-medium pointer-events-none",
					children: t || " "
				}),
				l != null && l > 0 && /* @__PURE__ */ q("span", {
					className: "absolute top-2 left-2 min-w-7 h-7 px-2 grid place-items-center rounded-full bg-sq-blue text-white text-[13px] font-bold tabular-nums pointer-events-none",
					"data-testid": "tile-count",
					children: l
				}),
				d ? /* @__PURE__ */ q("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-[#F4386A] text-white px-2 py-0.5 rounded-md pointer-events-none`,
					"data-testid": "tile-badge",
					children: d
				}) : o != null && o <= 0 && /* @__PURE__ */ q("span", {
					className: `absolute ${l ? "top-10" : "top-2"} left-2 text-[12px] font-semibold bg-sq-secondary text-white px-2 py-0.5 rounded-md pointer-events-none`,
					children: "немає"
				})
			]
		}), /* @__PURE__ */ J("div", {
			className: "px-3 pt-2 pb-2.5 flex flex-col gap-0.5 min-w-0 pointer-events-none",
			children: [/* @__PURE__ */ q("p", {
				className: `text-[14px] leading-tight font-semibold line-clamp-2 ${g ? "text-sq-muted" : "text-sq-text"}`,
				children: e
			}), n != null && /* @__PURE__ */ J("p", {
				className: "text-[14px] text-sq-secondary tabular-nums flex items-baseline gap-1.5",
				children: [r != null && r > n && /* @__PURE__ */ q("s", {
					className: "text-[12px] text-sq-muted",
					"data-testid": "tile-old-price",
					children: $(r)
				}), /* @__PURE__ */ J("span", { children: [$(n), i ? `/${i}` : ""] })]
			})]
		})]
	});
	return u ? /* @__PURE__ */ J("div", {
		className: "relative",
		children: [_, !c && /* @__PURE__ */ q("button", {
			type: "button",
			onClick: u,
			"aria-label": `Змінити: ${e}`,
			className: "absolute top-0.5 right-0.5 w-11 h-11 grid place-items-center",
			"data-testid": f ? `${f}-more` : "tile-more",
			children: /* @__PURE__ */ q("span", {
				className: "w-8 h-8 grid place-items-center rounded-full bg-white/95 text-sq-text shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
				children: /* @__PURE__ */ q(C, { size: 20 })
			})
		})]
	}) : _;
}
// src/lib/tagColors.ts
var Me = [
	"green",
	"rose",
	"blue",
	"orange",
	"teal",
	"purple",
	"slate",
	"amber"
], Ne = {
	green: "#2E7D4F",
	rose: "#C45B6B",
	blue: "#3B7DD8",
	orange: "#E07A3D",
	teal: "#2A9B8F",
	purple: "#6B5B95",
	slate: "#5A6A7A",
	amber: "#C9922A"
}, Pe = "slate";
function Fe(e) {
	return !!e && Me.includes(e);
}
function Ie(e) {
	return Fe(e) ? Ne[e] : Ne[Pe];
}
// src/components/cashier/TagFolderTile.tsx
function Le({ name: e, color: t, onClick: n }) {
	let r = Ie(t);
	return /* @__PURE__ */ J("button", {
		type: "button",
		onClick: n,
		className: "w-full flex flex-col rounded-[14px] overflow-hidden text-left bg-sq-surface ring-1 ring-sq-divider hover:ring-sq-muted/50 transition-shadow",
		children: [/* @__PURE__ */ q("span", {
			className: "relative w-full aspect-[4/3] grid place-items-center",
			style: { backgroundColor: r },
			children: /* @__PURE__ */ q(R, {
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
// src/components/cashier/CatalogTagBar.tsx
function Re({ tags: e, activeId: t, showBack: n, backLabel: r, onSelect: i, onBack: a }) {
	let o = Q(), s = (e) => `shrink-0 min-h-9 px-3.5 rounded-[10px] text-[15px] whitespace-nowrap transition-colors ${e ? "bg-sq-selected font-semibold text-sq-text" : "font-medium text-sq-secondary hover:bg-sq-selected/50"}`;
	return /* @__PURE__ */ J("div", {
		ref: o,
		className: "flex items-center gap-1 overflow-x-auto -mx-1 px-1 py-1 select-none",
		children: [
			n && /* @__PURE__ */ J("button", {
				type: "button",
				onClick: a,
				className: "shrink-0 min-h-9 px-2.5 rounded-[10px] text-[15px] font-semibold text-sq-blue whitespace-nowrap inline-flex items-center gap-0.5 hover:bg-sq-selected/50",
				children: [/* @__PURE__ */ q(x, { size: 16 }), r]
			}),
			/* @__PURE__ */ q("button", {
				type: "button",
				onClick: () => i(null),
				className: s(t === "all"),
				children: "Усі товари"
			}),
			e.map((e) => /* @__PURE__ */ q("button", {
				type: "button",
				onClick: () => i(e),
				className: s(t === e.id),
				children: e.name
			}, e.id))
		]
	});
}
var ze = 2e3, Be = {
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
function Ve(e, t, n, r = !1) {
	if (/^[\x20-\x7e]$/.test(e)) return e;
	let i = /^Key([A-Z])$/.exec(t);
	if (i) return n === r ? i[1].toLowerCase() : i[1];
	let a = /^(?:Digit|Numpad)([0-9])$/.exec(t);
	if (a) return a[1];
	let o = Be[t];
	return o ? n ? o[1] : o[0] : e;
}
function He(e) {
	let t = e?.value;
	return typeof t == "string" ? t : null;
}
function Ue() {
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
		let n = Ve(t.key, t.code, t.shiftKey, t.capsLock), r = e ? t.time - e.last : Infinity, i = t.field === null ? ze : 60;
		return !e || e.field !== t.field || r > i ? e = {
			chars: n,
			last: t.time,
			field: t.field,
			before: He(t.field)
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
function We({ active: e, onScan: t }) {
	let n = ye(), r = G(null), i = G(t);
	U(() => {
		i.current = t;
	});
	let a = G(e);
	U(() => {
		a.current = e;
	});
	let o = n !== "tablet";
	return U(() => {
		if (!o) return;
		let e = Ue(), t = !0, n = (n) => {
			let o = a.current && !qe(r.current);
			o !== t && e.reset(), t = o;
			let s = Ye(n.target), c = e.feed({
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
				field: s ?? (o ? null : Ke)
			});
			c.kind === "scan" && (n.preventDefault(), n.stopPropagation(), c.field && c.field !== Ke && c.restore !== null && Xe(c.field, c.restore), o && i.current(c.code));
		};
		return window.addEventListener("keydown", n, !0), () => window.removeEventListener("keydown", n, !0);
	}, [o]), n === "tablet" ? null : /* @__PURE__ */ q("span", {
		ref: r,
		hidden: !0,
		"data-scan-wedge": ""
	});
}
var Ge = "[role=\"dialog\"], [role=\"alertdialog\"], [aria-modal=\"true\"]", Ke = new EventTarget();
function qe(e) {
	for (let t of document.querySelectorAll(Ge)) if (!e || !t.contains(e)) return !0;
	return !1;
}
var Je = /* @__PURE__ */ new Set([
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
function Ye(e) {
	return e instanceof HTMLTextAreaElement || e instanceof HTMLSelectElement ? e : e instanceof HTMLInputElement ? Je.has(e.type) ? null : e : e instanceof HTMLElement && e.isContentEditable ? e : null;
}
function Xe(e, t) {
	let n = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : e instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
	n && (Object.getOwnPropertyDescriptor(n, "value")?.set?.call(e, t), e.dispatchEvent(new Event("input", { bubbles: !0 })));
}
function Ze(e) {
	return e == null ? "" : e.trim().slice(0, 120);
}
function Qe(e) {
	return [...new Set(e ?? [])].filter((e) => Number.isInteger(e) && e > 0).sort((e, t) => e - t);
}
function $e(e, t) {
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
	for (let e of Qe(t)) {
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
function et(e, t) {
	return [e.trim(), ...t].filter(Boolean).join(" · ").slice(0, 255);
}
function tt(e) {
	return e.find((e) => e.modifier_groups?.length)?.modifier_groups ?? [];
}
// src/components/cashier/ModifierSheet.tsx
function nt({ productName: e, variants: t, variantLabel: n = "Варіант", initialVariantId: r, initialModifierIds: i, initialNote: a, submitLabel: c = "Додати в чек", withQuantity: u = !0, notePlaceholder: d = "Коментар для кухні", onAdd: f, onClose: p }) {
	let [m, h] = K(() => r ?? (t.length === 1 ? t[0].variant_id : null)), [g, _] = K(() => i ?? []), [v, y] = K(a ?? ""), [b, x] = K(1), C = Q(), T = t.find((e) => e.variant_id === m) ?? null, E = T?.modifier_groups?.length ? T.modifier_groups : tt(t), O = $e(E, g), k = T ? T.price_cents + O.deltaCents : null, A = T == null ? `Оберіть «${n}»` : O.error ?? (k != null && k < 0 ? "Ціна не може бути відʼємною" : null), j = A == null && T != null;
	U(() => {
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
		j && T && f({
			item: T,
			modifiers: O.snapshot.map((e) => e.id),
			note: Ze(v),
			quantity: u ? b : 1
		});
	}
	let N = T ? et(T.label, O.error ? [] : O.names) : "", P = de((T ?? t[0])?.image_url ?? null), F = t.length ? Math.min(...t.map((e) => e.price_cents)) : null, ne = [...t].sort((e, t) => e.price_cents - t.price_cents);
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
						P ? /* @__PURE__ */ q("img", {
							src: P,
							alt: "",
							className: "w-14 h-14 rounded-xl object-cover shrink-0"
						}) : /* @__PURE__ */ q("div", {
							"aria-hidden": !0,
							className: "w-14 h-14 rounded-xl bg-sq-sidebar grid place-items-center shrink-0",
							children: /* @__PURE__ */ q(o, { size: 24 })
						}),
						/* @__PURE__ */ J("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ q("h3", {
								className: "text-[21px] leading-tight font-bold text-sq-heading truncate",
								children: e
							}), F != null && /* @__PURE__ */ q("p", {
								className: "text-sm text-sq-secondary truncate tabular-nums",
								children: t.length > 1 ? `від ${$(F)}` : $(F)
							})]
						}),
						/* @__PURE__ */ q("button", {
							type: "button",
							onClick: p,
							"aria-label": "Закрити",
							className: "w-11 h-11 rounded-full grid place-items-center text-sq-secondary hover:bg-sq-empty shrink-0",
							"data-testid": "modifier-close",
							children: /* @__PURE__ */ q(D, { size: 20 })
						})
					]
				}),
				/* @__PURE__ */ J("div", {
					ref: C,
					className: "flex-1 overflow-auto select-none px-6 py-[18px] space-y-[18px]",
					children: [
						t.length > 1 && /* @__PURE__ */ J("section", {
							"data-testid": "modifier-variants",
							children: [/* @__PURE__ */ q(at, {
								name: n,
								hint: "обовʼязково",
								required: !0
							}), /* @__PURE__ */ q("div", {
								className: "flex flex-wrap gap-2",
								children: ne.map((e) => {
									let t = e.variant_id === m, n = e.quantity <= 0;
									return /* @__PURE__ */ J("button", {
										type: "button",
										disabled: n,
										"aria-pressed": t,
										onClick: () => h(e.variant_id),
										className: st(t, n),
										"data-testid": `modifier-variant-${e.variant_id}`,
										children: [
											t && /* @__PURE__ */ q(s, {
												size: 20,
												"aria-hidden": !0
											}),
											e.label || "Стандарт",
											/* @__PURE__ */ q("span", {
												className: t ? "font-medium" : "font-medium text-sq-secondary",
												children: n ? "немає" : Ae(e.price_cents)
											})
										]
									}, e.variant_id);
								})
							})]
						}),
						E.map((e) => {
							let t = M(e, g), n = e.max_select > 1 && t >= e.max_select;
							return /* @__PURE__ */ J("section", {
								"data-testid": `modifier-group-${e.id}`,
								children: [/* @__PURE__ */ q(at, {
									name: e.name,
									hint: ot(e, n),
									required: e.min_select >= 1
								}), /* @__PURE__ */ q("div", {
									className: "flex flex-wrap gap-2",
									children: e.modifiers.map((t) => {
										let r = g.includes(t.id), i = !r && n;
										return /* @__PURE__ */ J("button", {
											type: "button",
											"aria-pressed": r,
											"aria-disabled": i || void 0,
											onClick: () => ee(e, t),
											className: st(r, i),
											"data-testid": `modifier-chip-${t.id}`,
											children: [
												r && /* @__PURE__ */ q(s, {
													size: 20,
													"aria-hidden": !0
												}),
												t.name,
												t.price_delta_cents !== 0 && /* @__PURE__ */ q("span", {
													className: r ? "font-medium" : "font-medium text-sq-secondary",
													children: ct(t.price_delta_cents)
												})
											]
										}, t.id);
									})
								})]
							}, e.id);
						}),
						/* @__PURE__ */ J("label", {
							className: "h-12 rounded-xl bg-sq-empty flex items-center gap-2.5 px-3.5",
							children: [/* @__PURE__ */ q(S, {
								size: 20,
								"aria-hidden": !0,
								className: "text-sq-muted shrink-0"
							}), /* @__PURE__ */ q("input", {
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
									disabled: b <= 1,
									onClick: () => x((e) => Math.max(1, e - 1)),
									className: it,
									"data-testid": "modifier-qty-minus",
									children: /* @__PURE__ */ q(l, { size: 20 })
								}),
								/* @__PURE__ */ q("span", {
									className: "w-11 h-10 grid place-items-center text-[17px] font-semibold text-sq-text tabular-nums",
									"data-testid": "modifier-qty-value",
									children: b
								}),
								/* @__PURE__ */ q("button", {
									type: "button",
									"aria-label": "Більше",
									disabled: b >= rt,
									onClick: () => x((e) => Math.min(rt, e + 1)),
									className: it,
									"data-testid": "modifier-qty-plus",
									children: /* @__PURE__ */ q(w, { size: 20 })
								})
							]
						}),
						A ? /* @__PURE__ */ q("p", {
							className: "flex-1 min-w-[10rem] text-sm text-red-600",
							"data-testid": "modifier-error",
							children: A
						}) : /* @__PURE__ */ q("p", {
							className: "flex-1 min-w-[10rem] text-sm text-sq-secondary truncate",
							"data-testid": "modifier-caption",
							children: N
						}),
						/* @__PURE__ */ q("button", {
							type: "button",
							className: "pos-btn-primary min-h-[52px] rounded-xl px-[22px] text-[17px] sm:min-w-[300px] max-sm:w-full",
							disabled: !j,
							onClick: te,
							"data-testid": "modifier-add",
							children: /* @__PURE__ */ J("span", { children: [c, k != null && /* @__PURE__ */ J(le, { children: [" · ", /* @__PURE__ */ q("span", {
								className: "tabular-nums",
								"data-testid": "modifier-price",
								children: $(k * b)
							})] })] })
						})
					]
				})
			]
		})]
	});
}
var rt = 99, it = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
function at({ name: e, hint: t, required: n }) {
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
function ot(e, t) {
	return e.min_select >= 1 ? e.max_select > 1 ? `обовʼязково · до ${e.max_select}` : "обовʼязково" : e.max_select <= 1 ? "можна одне" : t ? `не більше ${e.max_select}` : e.max_select >= e.modifiers.length ? "скільки завгодно" : `до ${e.max_select}`;
}
function st(e, t) {
	return [
		"min-h-12 px-4 rounded-xl text-base inline-flex items-center gap-2 transition-colors",
		e ? "bg-sq-blue/[0.08] ring-2 ring-sq-blue text-sq-blue font-semibold" : "bg-white ring-1 ring-sq-divider text-sq-text font-medium",
		t ? "opacity-40" : ""
	].join(" ");
}
function ct(e) {
	return e > 0 ? `+${Ae(e)}` : e < 0 ? `−${Ae(-e)}` : "";
}
// src/modules/tables/lib/bill.ts
var lt = {
	new: "готується",
	ready: "готово",
	served: "видано"
};
function ut(e) {
	return e.cancelled_at == null && e.prep_status !== "served";
}
function dt(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function ft(e, t = !1) {
	let n = e.variant_label ? `${e.product_name} · ${e.variant_label}` : e.product_name;
	return t || e.modifiers.length === 0 ? n : `${n} · ${e.modifiers.map((e) => e.name).join(" · ")}`;
}
// src/modules/tables/components/BillBar.tsx
var pt = 2;
function mt({ draft: e, rounds: t, summary: n, owedCents: r, hasPending: i, busy: a, online: o, onOpen: s, onFire: c }) {
	let l = n.lines > 0, u = [...t].reverse().find((e) => e.cancelled_at == null && e.prep_status !== "served");
	return /* @__PURE__ */ J("div", {
		className: "shrink-0 mx-3 mb-2.5 rounded-card bg-white shadow-[0_-2px_24px_rgba(0,20,60,.14),0_0_0_1px_#E6E8EC] px-[18px] pt-2.5 pb-4",
		"data-testid": "bill-bar",
		children: [/* @__PURE__ */ J("button", {
			type: "button",
			className: "block w-full text-left",
			"data-testid": "bill-bar-open",
			onClick: s,
			children: [
				/* @__PURE__ */ q("span", {
					"aria-hidden": !0,
					className: "block w-10 h-[5px] rounded-full bg-sq-divider mx-auto mb-2.5"
				}),
				/* @__PURE__ */ J("span", {
					className: "flex items-center gap-2.5 pb-1",
					children: [
						/* @__PURE__ */ q(S, {
							size: 20,
							className: "text-sq-blue shrink-0"
						}),
						/* @__PURE__ */ J("span", {
							className: "flex-1 min-w-0 truncate text-base font-bold text-sq-heading",
							children: [l ? `Чернетка · ${f(n.lines)}` : "Рахунок", i ? " · зберігаємо…" : ""]
						}),
						u && /* @__PURE__ */ J("span", {
							className: "shrink-0 text-sm text-sq-muted",
							children: [
								"Раунд ",
								u.seq,
								" ",
								lt[u.prep_status]
							]
						})
					]
				}),
				e.slice(0, pt).map((e) => /* @__PURE__ */ J("span", {
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
				e.length > pt && /* @__PURE__ */ J("span", {
					className: "block py-0.5 text-[13px] text-sq-blue font-semibold",
					children: [
						"ще ",
						e.length - pt,
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
					children: Z(r)
				})]
			}), /* @__PURE__ */ J("button", {
				type: "button",
				className: "pos-btn-primary min-h-14 rounded-xl px-5 sm:min-w-[240px] text-[17px] gap-2",
				"data-testid": "bill-bar-fire",
				disabled: a || !o || i || !l,
				onClick: c,
				children: [
					/* @__PURE__ */ q(y, { size: 24 }),
					"На кухню",
					l ? ` · ${n.lines}` : ""
				]
			})]
		})]
	});
}
// src/modules/tables/components/BillPane.tsx
function ht({ bill: e, draft: t, summary: n, owedCents: r, busy: i, online: a, hasPending: o, canPay: s, canPrecheck: c, printStatus: u, onLess: d, onMore: f, onEdit: p, onCancelRound: m, onFire: g, onPay: _, onPrecheck: v }) {
	let b = (e) => /* @__PURE__ */ q(yt, {
		testId: `bill-line-${e.id}`,
		quantity: e.quantity,
		title: e.product_name,
		sub: [e.variant_label, e.note].filter(Boolean).join(" · "),
		price: Z(dt(e))
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
									className: `text-[13px] font-semibold ${t ? "text-sq-muted" : _t[e.prep_status]}`,
									children: t ? "скасовано" : e.prep_status === "new" ? `${lt.new} · ${vt(e.fired_at)} хв` : lt[e.prep_status]
								})
							]
						}),
						/* @__PURE__ */ q("div", {
							className: "pt-1",
							children: e.items.map(b)
						}),
						ut(e) && /* @__PURE__ */ q("button", {
							type: "button",
							className: "mt-1 min-h-9 text-[14px] font-semibold text-red-600 disabled:opacity-40",
							"data-testid": `bill-cancel-round-${e.id}`,
							disabled: i || !a || o,
							onClick: () => m(e.id),
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
						/* @__PURE__ */ q(S, {
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
										onClick: () => p(e),
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
											className: gt,
											"data-testid": `bill-less-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => d(e),
											children: /* @__PURE__ */ q(l, { size: 16 })
										}), /* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Більше",
											className: gt,
											"data-testid": `bill-more-${e.id}`,
											disabled: i || !a || !n,
											onClick: () => f(e),
											children: /* @__PURE__ */ q(w, { size: 16 })
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
					disabled: i || !a || o || !c,
					onClick: v,
					children: [/* @__PURE__ */ q(h, { size: 20 }), e.precheck_printed_at ? "Передчек надруковано · ще раз" : "Передчек"]
				}),
				u && /* @__PURE__ */ q("p", {
					className: "text-xs text-sq-muted text-center",
					"data-testid": "bill-print-status",
					children: u
				})
			]
		})]
	});
}
var gt = "w-8 h-8 rounded-lg bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40", _t = {
	new: "text-[#D9730D]",
	ready: "text-sq-success",
	served: "text-sq-muted"
};
function vt(e) {
	return Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 6e4));
}
function yt({ testId: e, quantity: t, title: n, sub: r, price: i }) {
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
// src/modules/tables/components/BillSheet.tsx
function bt({ title: e, onClose: t, children: n }) {
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
					children: /* @__PURE__ */ q(D, { size: 20 })
				})]
			}), /* @__PURE__ */ q("div", {
				className: "min-h-0 flex-1 overflow-hidden",
				children: n
			})]
		})]
	});
}
// src/modules/tables/lib/guestOrders.ts
function xt(e, t = Date.now()) {
	let n = Math.floor((t - new Date(e).getTime()) / 6e4);
	return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function St(e, t = Date.now()) {
	let n = xt(e, t);
	return n < 1 ? "щойно" : `${n} хв тому`;
}
function Ct(e, t, n, r) {
	let i = e % 100, a = e % 10;
	return i >= 11 && i <= 14 ? `${e} ${r}` : a === 1 ? `${e} ${t}` : a >= 2 && a <= 4 ? `${e} ${n}` : `${e} ${r}`;
}
function wt(e) {
	return Ct(e, "запит", "запити", "запитів");
}
function Tt(e, t = /* @__PURE__ */ new Set()) {
	return e.lines.filter((e) => e.problem != null || t.has(e.id)).map((e) => e.id);
}
function Et(e, t = /* @__PURE__ */ new Set()) {
	let n = Tt(e, t).length;
	return n === 0 ? "Прийняти" : n >= e.lines.length ? null : n === 1 ? "Прийняти без цієї" : "Прийняти без них";
}
function Dt(e) {
	let t = e?.response?.data, n = Number(t?.item_id);
	return Number.isInteger(n) && n > 0 ? n : null;
}
var Ot = [
	"Цієї страви вже немає",
	"Кухня зараз не приймає — підійдіть до офіціанта",
	"Підійде офіціант і прийме замовлення"
];
function kt(e) {
	return e === "bill" ? "Просить рахунок" : "Кличе офіціанта";
}
var At = {
	requests: 0,
	waiter: !1,
	bill: !1,
	sent: 0,
	low: null
};
function jt(e) {
	let t = /* @__PURE__ */ new Map(), n = (e) => {
		let n = t.get(e);
		return n || (n = { ...At }, t.set(e, n)), n;
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
function Mt(e) {
	return e ? e.requests + e.sent + +!!e.waiter + +!!e.bill + (e.low == null ? 0 : 1) : 0;
}
function Nt(e) {
	return /* @__PURE__ */ new Set([
		...e.orders.map((e) => `order:${e.id}`),
		...e.sent.map((e) => `sent:${e.id}`),
		...e.calls.map((e) => `call:${e.id}`),
		...(e.feedback ?? []).map((e) => `feedback:${e.id}`)
	]);
}
function Pt(e) {
	return e.round_seq == null ? "Уже на кухні" : `Уже на кухні · замовлення ${e.round_seq}`;
}
function Ft(e) {
	let t = [];
	return e.calls > 0 && t.push(Ct(e.calls, "виклик", "виклики", "викликів")), (e.feedback ?? 0) > 0 && t.push(Ct(e.feedback, "низька оцінка", "низькі оцінки", "низьких оцінок")), e.sent > 0 && t.push(`${e.sent} на кухні без офіціанта`), e.requests > 0 && t.push(wt(e.requests)), t.join(" · ");
}
function It(e, t) {
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
var Lt = 1e4;
function Rt(e, t, n = Lt) {
	let r = G(e);
	r.current = e, U(() => {
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
var zt = {
	waiter: "ring-[#8A6CEF]",
	bill: "ring-[#1B9DF0]"
};
function Bt({ calls: t, sent: n, feedback: r = [], showTable: i, busy: a, onAnswer: o, onSeen: s, onSeenFeedback: c, onOpenBill: l }) {
	let [u, d] = K(null), [f, p] = K(() => Date.now());
	if (Rt(() => p(Date.now()), t.length + n.length + r.length > 0, 15e3), t.length === 0 && n.length === 0 && r.length === 0) return null;
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
	return /* @__PURE__ */ J("div", {
		className: "space-y-2.5",
		"data-testid": "guest-alerts-panel",
		children: [
			t.map((t) => {
				let n = `call:${t.id}`;
				return /* @__PURE__ */ q("section", {
					className: `rounded-2xl bg-white ring-2 ${zt[t.kind]} px-4 py-3`,
					"data-testid": `guest-call-${t.id}`,
					"data-kind": t.kind,
					"data-table": t.table_id,
					children: /* @__PURE__ */ J("div", {
						className: "flex items-center gap-2.5",
						children: [
							t.kind === "bill" ? /* @__PURE__ */ q(e, { size: 26 }) : /* @__PURE__ */ q(P, { size: 26 }),
							/* @__PURE__ */ J("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ J("p", {
									className: "break-words text-[16px] font-bold leading-snug text-sq-heading",
									children: [i ? `Стіл ${t.table_name} · ` : "", kt(t.kind)]
								}), /* @__PURE__ */ q("p", {
									className: "text-[13px] text-sq-muted tabular-nums",
									children: [
										i ? t.hall_name : "",
										St(t.created_at, f),
										t.kind === "bill" && !t.has_open_bill ? "рахунку ще немає" : ""
									].filter(Boolean).join(" · ")
								})]
							}),
							/* @__PURE__ */ q("button", {
								type: "button",
								className: "pos-btn-primary min-h-[48px] shrink-0 rounded-xl px-5 text-[16px]",
								"data-testid": `guest-call-answer-${t.id}`,
								disabled: a || u != null,
								onClick: () => void m(n, () => o(t)),
								children: "Іду"
							})
						]
					})
				}, n);
			}),
			r.map((e) => {
				let t = `feedback:${e.id}`;
				return /* @__PURE__ */ q("section", {
					className: "rounded-2xl bg-white ring-2 ring-sq-danger px-4 py-3",
					"data-testid": `guest-feedback-${e.id}`,
					"data-table": e.table_id,
					children: /* @__PURE__ */ J("div", {
						className: "flex items-start gap-2.5",
						children: [
							/* @__PURE__ */ q(I, {
								size: 26,
								className: "shrink-0 text-sq-danger"
							}),
							/* @__PURE__ */ J("div", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ J("p", {
										className: "break-words text-[16px] font-bold leading-snug text-sq-heading",
										children: [
											i ? `Стіл ${e.table_name} · ` : "",
											"оцінив на ",
											e.score,
											" — підійдіть"
										]
									}),
									/* @__PURE__ */ q("p", {
										className: "text-[13px] text-sq-muted tabular-nums",
										children: [
											i ? e.hall_name : "",
											e.score_word,
											St(e.created_at, f),
											...e.tag_labels
										].filter(Boolean).join(" · ")
									}),
									e.comment && /* @__PURE__ */ q("p", {
										className: "mt-1 whitespace-pre-line text-[14px] text-sq-text",
										children: e.comment
									})
								]
							}),
							/* @__PURE__ */ q("div", {
								className: "flex shrink-0 flex-col items-end gap-1.5",
								children: /* @__PURE__ */ q("button", {
									type: "button",
									className: "pos-btn-primary min-h-[48px] rounded-xl px-5 text-[16px]",
									"data-testid": `guest-feedback-seen-${e.id}`,
									disabled: a || u != null || !c,
									onClick: () => c && void m(t, () => c(e)),
									children: "Бачу"
								})
							})
						]
					})
				}, t);
			}),
			n.map((e) => {
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
										children: i ? h(e.table_name, e.hall_name) : "Гість замовив сам"
									}), /* @__PURE__ */ q("p", {
										className: "text-[13px] font-semibold text-[#B35F0C]",
										children: Pt(e)
									})]
								}),
								/* @__PURE__ */ q("span", {
									className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
									children: St(e.created_at, f)
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
							children: [l && /* @__PURE__ */ q("button", {
								type: "button",
								className: "min-h-[48px] flex-1 rounded-xl bg-white ring-1 ring-sq-divider px-3 text-[15px] font-semibold text-sq-blue disabled:opacity-40",
								"data-testid": `guest-sent-open-${e.id}`,
								disabled: a || u != null,
								onClick: () => l(e.bill_id),
								children: "Відкрити рахунок"
							}), /* @__PURE__ */ q("button", {
								type: "button",
								className: "pos-btn-primary min-h-[48px] flex-1 rounded-xl text-[16px]",
								"data-testid": `guest-sent-seen-${e.id}`,
								disabled: a || u != null,
								onClick: () => void m(t, () => s(e)),
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
function Vt({ orders: e, showTable: t, busy: n, onAccept: r, onReject: i }) {
	let [a, o] = K({}), [s, c] = K(null), [l, u] = K(() => Date.now());
	Rt(() => u(Date.now()), e.length > 0, 15e3);
	let d = G(/* @__PURE__ */ new Map());
	if (U(() => {
		s != null && d.current.get(s)?.scrollIntoView?.({ block: "nearest" });
	}, [s]), e.length === 0) return null;
	async function f(e) {
		let t = a[e.id] ?? [], n = await r(e, Tt(e, new Set(t)));
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
			let r = new Set(a[e.id] ?? []), i = Et(e, r);
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
							/* @__PURE__ */ q(b, {
								size: 22,
								className: "text-sq-blue"
							}),
							/* @__PURE__ */ q("p", {
								className: "min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading",
								children: t ? `Стіл ${e.table_name}${e.hall_name ? ` · ${e.hall_name}` : ""}` : "Гість просить"
							}),
							/* @__PURE__ */ q("span", {
								className: "shrink-0 text-[13px] text-sq-muted tabular-nums",
								children: St(e.created_at, l)
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
							Ot.map((t, r) => /* @__PURE__ */ q("button", {
								type: "button",
								className: Ht,
								"data-testid": `guest-order-reason-${e.id}-${r}`,
								disabled: n,
								onClick: () => void p(e, t),
								children: t
							}, t)),
							/* @__PURE__ */ J("div", {
								className: "flex gap-2",
								children: [/* @__PURE__ */ q("button", {
									type: "button",
									className: `${Ht} flex-1`,
									"data-testid": `guest-order-reason-none-${e.id}`,
									disabled: n,
									onClick: () => void p(e, null),
									children: "Без причини"
								}), /* @__PURE__ */ q("button", {
									type: "button",
									className: `${Ht} flex-1 text-sq-blue`,
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
							children: /* @__PURE__ */ q(D, { size: 22 })
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
var Ht = "w-full min-h-[44px] rounded-xl bg-white ring-1 ring-sq-divider px-3 text-left text-[15px] text-sq-text disabled:opacity-40";
// src/modules/tables/lib/menu.ts
function Ut(e = /* @__PURE__ */ new Date()) {
	return new Intl.DateTimeFormat("en-CA").format(e);
}
function Wt(e, t = Ut()) {
	return e.stop_listed_on == null ? e.stop_listed === !0 : e.stop_listed_on === t;
}
// src/modules/tables/components/MenuCatalog.tsx
function Gt({ counts: e, online: t, active: n, canScan: r, epoch: i, onAdd: a, onRows: o }) {
	let s = be(), c = xe(), l = Q(), [u, d] = K(null), f = c.attributes.find((e) => e.key === "size")?.label ?? "Розмір";
	U(() => {
		i > 0 && s.refresh();
	}, [i]), U(() => {
		o?.(s.grouped);
	}, [s.grouped]);
	function p(e, { ask: t = !1 } = {}) {
		let n = pe(e);
		t || me(e, n) ? d({
			variants: e,
			initialVariantId: e.length === 1 ? e[0].variant_id : null
		}) : a({
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
	return /* @__PURE__ */ J("section", {
		className: "relative flex h-full min-h-0 flex-col bg-white",
		"data-testid": "menu-catalog",
		children: [
			r && /* @__PURE__ */ q(We, {
				active: n && !u,
				onScan: (e) => void m(e)
			}),
			/* @__PURE__ */ J("div", {
				className: "shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3",
				children: [/* @__PURE__ */ J("div", {
					className: "relative",
					children: [/* @__PURE__ */ q(j, {
						size: 20,
						className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
					}), /* @__PURE__ */ q("input", {
						className: "pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl",
						placeholder: "Що додати?",
						"data-testid": "menu-search",
						value: s.query,
						onChange: (e) => s.setQuery(e.target.value)
					})]
				}), !s.query.trim() && /* @__PURE__ */ q(Re, {
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
							children: /* @__PURE__ */ q(Le, {
								name: e.name,
								color: e.color,
								onClick: () => s.enterTag(e)
							})
						}, e.id)), s.grouped.map(([n, r]) => {
							let i = r[0], a = pe(r), o = Math.min(...r.map((e) => e.price_cents)), s = r.reduce((e, t) => e + t.quantity, 0), c = Wt(i), l = r.length > 1 ? r.map((e) => e.label).filter(Boolean).join(" / ") : i.label;
							return /* @__PURE__ */ q(je, {
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
					h && /* @__PURE__ */ q("div", {
						className: "mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted",
						children: s.query.trim() ? "Нічого не знайшли" : "Меню порожнє"
					})
				]
			}),
			u && /* @__PURE__ */ q(nt, {
				productName: u.variants[0]?.product_name ?? "",
				variants: u.variants,
				variantLabel: f,
				initialVariantId: u.initialVariantId,
				initialModifierIds: X(pe(u.variants)),
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
function Kt(e) {
	let t = [];
	for (let n of e.rounds) if (n.cancelled_at == null) for (let e of n.items) e.sale_id ?? t.push({
		line: e,
		round: n
	});
	return t;
}
function qt(e) {
	return (e.unit_price_cents ?? 0) * e.quantity;
}
function Jt(e, t) {
	return e.reduce((e, { line: n }) => t.has(n.id) ? e + qt(n) : e, 0);
}
function Yt(e, t) {
	let n = Math.max(1, Math.floor(t));
	if (e <= 0) return Array.from({ length: n }, () => 0);
	let r = Math.floor(e / n), i = Array.from({ length: n }, () => r);
	return i[0] += e - r * n, i;
}
function Xt(e) {
	return e.status !== "open" || Kt(e).length === 0;
}
// src/modules/tables/components/PaySheet.tsx
var Zt = [{
	id: "cash",
	label: "Готівка",
	glyph: n
}, {
	id: "card",
	label: "Картка",
	glyph: u
}];
function Qt(e) {
	return `${e < 0 ? "−" : "+"}${Z(Math.abs(e))}`;
}
function $t({ bill: e, busy: t, cashRoundingStep: n, onClose: r, onPay: a }) {
	let o = W(() => Kt(e), [e]), [c, u] = K(() => new Set(o.map(({ line: e }) => e.id))), [d, f] = K(1), [p, m] = K("card"), h = Jt(o, c), g = c.size === o.length, _ = p === "cash" ? i(h, n) : {
		step: 0,
		deltaCents: 0
	}, v = h + _.deltaCents, y = Yt(v, d);
	function b(e) {
		u((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	function x() {
		v <= 0 || a([{
			...g ? {} : { line_ids: [...c] },
			payments: y.map((e) => ({
				method: p,
				amount_cents: e
			}))
		}], _.deltaCents === 0 ? 0 : _.step);
	}
	let S = o.filter(({ line: e }) => c.has(e.id)).length;
	return /* @__PURE__ */ J("div", {
		className: "absolute inset-0 z-30 flex flex-col bg-sq-bg",
		"data-testid": "pay-sheet",
		children: [/* @__PURE__ */ J("header", {
			className: "flex shrink-0 items-center gap-3.5 px-4 md:px-7 min-h-[68px]",
			children: [/* @__PURE__ */ J("button", {
				type: "button",
				className: "shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
				onClick: r,
				"data-testid": "pay-close",
				children: [
					/* @__PURE__ */ q(ce, { size: 20 }),
					"Стіл ",
					e.table_name
				]
			}), /* @__PURE__ */ J("p", {
				className: "flex-1 min-w-0 truncate text-center text-xl font-bold text-sq-heading md:pr-24",
				children: ["Оплата · стіл ", e.table_name]
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
						onClick: () => u(g ? /* @__PURE__ */ new Set() : new Set(o.map(({ line: e }) => e.id))),
						children: g ? "Зняти все" : "Обрати все"
					})]
				}), /* @__PURE__ */ q("div", {
					className: "md:flex-1 md:min-h-0 md:overflow-auto",
					children: o.map(({ line: e, round: n }) => {
						let r = c.has(e.id);
						return /* @__PURE__ */ J("button", {
							type: "button",
							"data-testid": `pay-line-${e.id}`,
							"aria-pressed": r,
							disabled: t,
							onClick: () => b(e.id),
							className: "flex w-full min-h-[54px] items-center gap-3.5 text-left shadow-[0_1px_0_#E6E8EC]",
							children: [
								/* @__PURE__ */ q("span", {
									"aria-hidden": !0,
									className: `w-[22px] h-[22px] rounded-md shrink-0 grid place-items-center ${r ? "bg-sq-blue text-white" : "ring-2 ring-inset ring-sq-divider"}`,
									children: r && /* @__PURE__ */ q(s, { size: 16 })
								}),
								/* @__PURE__ */ J("span", {
									className: "min-w-0 flex-1 py-1.5",
									children: [/* @__PURE__ */ J("span", {
										className: `block truncate text-base ${r ? "text-sq-text" : "text-sq-secondary"}`,
										children: [e.quantity > 1 && /* @__PURE__ */ J("span", {
											className: "tabular-nums",
											children: [e.quantity, "× "]
										}), ft(e, !0)]
									}), /* @__PURE__ */ J("span", {
										className: "block text-[13px] text-sq-muted",
										children: ["раунд ", n.seq]
									})]
								}),
								/* @__PURE__ */ q("span", {
									className: `shrink-0 text-base tabular-nums ${r ? "text-sq-text" : "text-sq-muted"}`,
									children: Z(qt(e))
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
									S,
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
									children: [/* @__PURE__ */ q(B, { size: 24 }), "Порівну на"]
								}), /* @__PURE__ */ J("div", {
									className: "flex items-center gap-1.5",
									children: [
										/* @__PURE__ */ q("button", {
											type: "button",
											"aria-label": "Менше",
											className: en,
											"data-testid": "pay-ways-less",
											disabled: t || d <= 1,
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
											className: en,
											"data-testid": "pay-ways-more",
											disabled: t || d >= 10,
											onClick: () => f((e) => Math.min(10, e + 1)),
											children: /* @__PURE__ */ q(w, { size: 20 })
										})
									]
								})]
							}),
							d > 1 && /* @__PURE__ */ J("p", {
								className: "text-[13px] text-sq-muted tabular-nums",
								"data-testid": "pay-shares",
								children: [
									y.map((e) => Z(e)).join(" + "),
									" — один чек, ",
									d,
									" оплат"
								]
							}),
							_.deltaCents !== 0 && /* @__PURE__ */ J("div", {
								className: "flex justify-between text-[15px] text-sq-secondary",
								"data-testid": "pay-rounding",
								children: [/* @__PURE__ */ q("span", { children: "Заокруглення готівки" }), /* @__PURE__ */ q("span", {
									className: "tabular-nums",
									children: Qt(_.deltaCents)
								})]
							}),
							/* @__PURE__ */ J("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ q("span", {
									className: "text-lg font-bold text-sq-heading",
									children: "До сплати"
								}), /* @__PURE__ */ q("span", {
									className: "text-[30px] font-bold text-sq-heading tabular-nums",
									"data-testid": "pay-due",
									children: Z(v)
								})]
							})
						]
					}),
					/* @__PURE__ */ q("div", {
						className: "flex gap-2.5",
						children: Zt.map((e) => {
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
						disabled: t || v <= 0,
						onClick: x,
						children: [
							"Оплатити ",
							Z(v),
							g ? "" : " (частина)"
						]
					})
				]
			})]
		})]
	});
}
var en = "w-10 h-10 rounded-sq bg-white ring-1 ring-sq-divider grid place-items-center text-sq-text disabled:opacity-40";
// src/modules/tables/lib/draft.ts
function tn(e, t) {
	let { item: n, modifiers: r, note: i } = e, a = ge(pe([n]), r);
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
function nn(e) {
	let t = e.modifiers.map((e) => e.modifier_id).filter((e) => e != null);
	return Y(e.variant_id, t, e.note);
}
function rn(e, t) {
	let n = e.map((e) => ({
		key: `srv:${e.id}`,
		id: e.id,
		uid: nn(e),
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
function an(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [e, r] of t) for (let t of r) n.set(t.variant_id, e);
	let r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.product_id ?? on(t.uid, n);
		e != null && r.set(e, (r.get(e) ?? 0) + t.quantity);
	}
	return r;
}
function on(e, t) {
	let n = Number(e.split("|")[0]);
	return Number.isFinite(n) ? t.get(n) ?? null : null;
}
function sn(e) {
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
function cn(e, t = /* @__PURE__ */ new Date()) {
	let n = e == null ? t : new Date(e);
	return Number.isNaN(n.getTime()) ? "" : `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function ln(e, t = /* @__PURE__ */ new Date()) {
	let n = Kt(e).map(({ line: e }) => ({
		name: e.product_name,
		variant_label: e.variant_label,
		quantity: e.quantity,
		unit_price_cents: e.unit_price_cents ?? 0,
		line_total_cents: qt(e)
	}));
	return {
		table_name: e.table_name,
		hall_name: e.hall_name,
		bill_no: e.bill_no,
		guests: e.guests,
		opened_at: cn(e.opened_at, t),
		printed_at: cn(null, t),
		waiter_name: e.opened_by_name,
		items: n,
		total_cents: n.reduce((e, t) => e + t.line_total_cents, 0),
		feedback_url: e.feedback_url ?? null
	};
}
// src/modules/tables/lib/useBill.ts
function un() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : `${Date.now()}-${Math.random()}`;
}
function dn(e, { online: t, mirrored: n = !1, storeId: r = null } = { online: !0 }) {
	let [i, a] = K(null), [o, s] = K(!0), [c, l] = K(null), [u, d] = K(null), [f, p] = K(!1), [m, h] = K([]), [g, _] = K(0), [v, y] = K(!1), [b, x] = K(null), S = G(!0), C = G([]), w = G(!1), T = G(!1), E = G(0);
	U(() => (S.current = !0, () => {
		S.current = !1;
	}), []);
	let D = H(async () => {
		if (!n || r == null) return !1;
		let t = await ae(r, e);
		return !t || !S.current ? !1 : (a(t.bill), y(!0), x(t.savedAt), s(!1), !0);
	}, [
		e,
		n,
		r
	]), O = H(async () => {
		if (t) try {
			let t = await M(e);
			if (!S.current) return;
			a(t), l(null), y(!1), x(null), n && r != null && N(r, t);
		} catch (e) {
			if (!S.current) return;
			let t = await D();
			S.current && !t && l(z(e, "Не вдалося прочитати рахунок"));
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
	U(() => {
		O();
	}, [O]), Rt(H(async () => {
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
	let k = H(async () => {
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
					e = !0, S.current && d(z(n, "Не вдалося зберегти")), t.kind === "blocking" && t.resolve(!1);
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
	]), A = H((n) => {
		if (!t) {
			d("Потрібна мережа");
			return;
		}
		d(null);
		let r = un(), i = tn(n, r);
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
		clearBanner: H(() => d(null), []),
		notice: H((e) => d(e), []),
		reload: O,
		addLine: A,
		run: H((e, n = {}) => T.current ? Promise.resolve(!1) : t ? (d(null), new Promise((t) => {
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
function fn(e, t) {
	return JSON.stringify(e) === JSON.stringify(t) ? e : t;
}
function pn({ online: e, tableId: t = null }) {
	let [n, r] = K([]), [i, a] = K([]), [o, s] = K([]), [c, l] = K([]), [u, d] = K(!1), f = G(!0);
	U(() => (f.current = !0, () => {
		f.current = !1;
	}), []);
	let p = H(async () => {
		if (e) try {
			let e = await ie(t ?? void 0);
			if (!f.current) return;
			let n = Array.isArray(e?.orders) ? e.orders : [], i = Array.isArray(e?.sent) ? e.sent : [], o = Array.isArray(e?.calls) ? e.calls : [], c = Array.isArray(e?.feedback) ? e.feedback : [];
			r((e) => fn(e, n)), a((e) => fn(e, i)), s((e) => fn(e, o)), l((e) => fn(e, c)), d(!0);
		} catch {}
	}, [e, t]);
	return U(() => {
		e ? p() : (r([]), a([]), s([]), d(!1));
	}, [e, p]), Rt(p, e), {
		orders: n,
		sent: i,
		calls: o,
		feedback: c,
		loaded: u,
		refresh: p
	};
}
// src/modules/tables/lib/useIsWide.ts
var mn = "(min-width: 1024px)";
function hn() {
	let [e, t] = K(() => typeof window > "u" || typeof window.matchMedia != "function" || window.matchMedia(mn).matches);
	return U(() => {
		if (typeof window > "u" || typeof window.matchMedia != "function") return;
		let e = window.matchMedia(mn), n = () => t(e.matches);
		return n(), e.addEventListener("change", n), () => e.removeEventListener("change", n);
	}, []), e;
}
// src/modules/tables/lib/useNotifyChime.ts
var gn = "tables:chime", _n = null;
function vn() {
	if (_n) return _n;
	let e = globalThis, t = e.AudioContext ?? e.webkitAudioContext;
	if (!t) return null;
	try {
		_n = new t();
	} catch {
		_n = null;
	}
	return _n;
}
function yn() {
	let e = () => {
		let e = vn();
		e && e.state === "suspended" && e.resume().catch(() => void 0);
	};
	return document.addEventListener("pointerdown", e, {
		once: !0,
		capture: !0
	}), () => document.removeEventListener("pointerdown", e, { capture: !0 });
}
function bn() {
	let e = vn();
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
function xn() {
	try {
		return localStorage.getItem(gn) !== "off";
	} catch {
		return !0;
	}
}
function Sn() {
	let [e, t] = K(xn);
	return [e, H((e) => {
		t(e);
		try {
			localStorage.setItem(gn, e ? "on" : "off");
		} catch {}
	}, [])];
}
function Cn(e, t, n) {
	let r = G(null);
	U(() => yn(), []), U(() => {
		if (!t) return;
		let i = r.current;
		if (r.current = new Set(e), i != null && n) {
			for (let t of e) if (!i.has(t)) {
				bn();
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
function wn() {
	let e = globalThis.crypto;
	return e?.randomUUID ? e.randomUUID() : "00000000-0000-4000-8000-" + String(Date.now()).padStart(12, "0").slice(-12);
}
function Tn() {
	let { billId: e } = Ee(), t = Number(e), n = ve((e) => e.online), i = ye(), a = _e((e) => e.auth?.store.id ?? null), o = _e((e) => e.auth?.store.cash_rounding ?? 0), { bill: s, loading: c, error: l, banner: u, busy: d, pending: f, epoch: m, stale: h, savedAt: g, clearBanner: _, notice: y, reload: b, addLine: x, run: S } = dn(t, {
		online: n,
		mirrored: i !== "web",
		storeId: a
	}), C = hn(), w = xe().attributes.find((e) => e.key === "size")?.label ?? "Розмір", [D, j] = K(!1), [M, N] = K(!1), [P, F] = K(null), [re, I] = K(null), [L, ie] = K(!1), R = Te(), ae = we(), { orders: B, sent: H, calls: G, feedback: le, loaded: de, refresh: Y } = pn({ online: n && s != null }), X = s?.table_id ?? null, Z = W(() => B.filter((e) => e.table_id === X), [B, X]), pe = W(() => H.filter((e) => e.table_id === X), [H, X]), me = W(() => G.filter((e) => e.table_id === X), [G, X]), ge = W(() => le.filter((e) => e.table_id === X), [le, X]), be = W(() => It({
		orders: B,
		sent: H,
		calls: G
	}, X), [
		B,
		H,
		G,
		X
	]), Se = W(() => Nt({
		orders: B,
		sent: H,
		calls: G
	}), [
		B,
		H,
		G
	]), [Ce] = Sn();
	Cn(Se, de, Ce);
	let De = ae.state?.notice;
	U(() => {
		typeof De == "string" && De && y(De);
	}, [De, y]);
	let Q = W(() => s ? rn(s.draft, f) : [], [s, f]), Oe = W(() => sn(Q), [Q]), ke = W(() => s ? Kt(s) : [], [s]), [$, Ae] = K([]), je = W(() => an(Q, $), [Q, $]);
	if (!n && !h && !c) return /* @__PURE__ */ q("div", {
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
	if (c) return /* @__PURE__ */ q("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	});
	if (l || !s) return /* @__PURE__ */ q("div", {
		className: "p-4",
		children: /* @__PURE__ */ J("div", {
			className: "sq-card p-6 text-center",
			children: [/* @__PURE__ */ q("p", {
				className: "text-sm",
				children: l ?? "Рахунок не знайдено"
			}), /* @__PURE__ */ q("button", {
				type: "button",
				className: "sq-btn-primary mt-3",
				onClick: () => void b(),
				children: "Повторити"
			})]
		})
	});
	let Me = async (e, t = 0) => {
		let n = {
			settled: !1,
			warning: null
		};
		await S(async () => {
			let r = await se(s.id, e, t);
			return n.settled = Xt(r.bill), n.warning = r.warning ?? null, r.bill;
		}, { stock: !0 }) && (N(!1), n.settled ? n.warning ? R("/tables", { state: {
			note: n.warning,
			warn: !0
		} }) : R("/tables") : n.warning && y(n.warning));
	}, Ne = async () => {
		if (I(null), await S(() => T(s.id)) && i === "cashier") try {
			let [e, t] = await Promise.all([fe("receiptPrinterName"), fe("receiptPaperWidthMm")]);
			if (!e) return;
			await he(e, ln(s), t === 58 || t === 80 ? t : ue), I("Передчек надіслано на друк");
		} catch (e) {
			I(e instanceof Error ? e.message : "Не вдалося надрукувати");
		}
	}, Pe = () => {
		j(!1), S(() => A(s.id, wn()), { stock: !0 });
	}, Fe = (e) => {
		if (e.id == null) return;
		let t = e.id;
		S(() => e.quantity > 1 ? r(s.id, t, e.quantity - 1) : V(s.id, t));
	}, Ie = (e) => {
		if (e.id == null) return;
		let t = e.id;
		S(() => r(s.id, t, e.quantity + 1));
	}, Le = (e) => {
		if (e.id == null) return;
		let t = $.find(([, t]) => t.some((t) => t.variant_id === e.variant_id));
		t ? F({
			row: e,
			variants: [...t[1]]
		}) : y("Страви вже немає в меню — зніміть рядок і додайте іншу");
	}, Re = (e, t, n) => {
		let r = P?.row.id;
		F(null), r != null && S(() => v(s.id, r, {
			variant_id: e.variant_id,
			modifiers: t,
			note: n
		}));
	}, ze = async (e, t) => {
		let n = {
			warning: null,
			refused: null
		}, r = await S(async () => {
			try {
				let r = await E(e.id, t);
				return n.warning = r.warning, r.bill;
			} catch (e) {
				throw n.refused = Dt(e), e;
			}
		}, { stock: !0 });
		return Y(), r && n.warning && y(n.warning), {
			ok: r,
			refusedLineId: n.refused
		};
	}, Be = async (e) => {
		if (!n) return y("Потрібна мережа"), !1;
		try {
			return await oe(e.id), !0;
		} catch (e) {
			return y(z(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			Y();
		}
	}, Ve = async (e) => {
		if (!n) return y("Потрібна мережа"), !1;
		try {
			return await te(e.id), !0;
		} catch (e) {
			return y(z(e, "Не вдалося позначити")), !1;
		} finally {
			Y();
		}
	}, He = async (e) => {
		if (!n) return y("Потрібна мережа"), !1;
		try {
			return await ee(e.id), e.bill_opened_by_guest && b(), !0;
		} catch (e) {
			return y(z(e, "Не вдалося позначити")), !1;
		} finally {
			Y();
		}
	}, Ue = async (e, t) => {
		if (!n) return y("Потрібна мережа"), !1;
		ie(!0), _();
		try {
			return await O(e.id, t ?? void 0), Y(), !0;
		} catch (e) {
			return y(z(e, "Не вдалося відхилити запит")), Y(), !1;
		} finally {
			ie(!1);
		}
	}, We = /* @__PURE__ */ q(ht, {
		bill: s,
		draft: Q,
		summary: Oe,
		owedCents: s.fired_total_cents,
		busy: d,
		online: n,
		hasPending: f.length > 0,
		canPay: ke.length > 0,
		canPrecheck: ke.length > 0,
		printStatus: re,
		onLess: Fe,
		onMore: Ie,
		onEdit: Le,
		onCancelRound: (e) => void S(() => k(s.id, e), { stock: !0 }),
		onFire: Pe,
		onPay: () => {
			j(!1), N(!0);
		},
		onPrecheck: () => void Ne()
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
					onClick: () => R("/tables"),
					children: [/* @__PURE__ */ q(ce, { size: 20 }), s.hall_name || "Зала"]
				}), /* @__PURE__ */ J("div", {
					className: `min-w-0 flex-1 ${C ? "" : "text-center pr-16"}`,
					children: [/* @__PURE__ */ J("p", {
						className: "truncate text-xl font-bold text-sq-heading",
						children: ["Стіл ", s.table_name]
					}), /* @__PURE__ */ J("p", {
						className: "truncate text-[13px] text-sq-muted",
						children: [
							ne(s.guests),
							" · ",
							s.opened_by_name,
							" · ",
							p(s.opened_at, (/* @__PURE__ */ new Date()).toISOString()),
							" · рахунок ",
							s.bill_no
						]
					})]
				})]
			}),
			h && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "bill-stale",
				children: [
					"Немає звʼязку — рахунок з памʼяті каси",
					g == null ? "" : `, станом на ${String(new Date(g).getHours()).padStart(2, "0")}:${String(new Date(g).getMinutes()).padStart(2, "0")}`,
					". Змінити його можна лише онлайн."
				]
			}),
			u && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "bill-banner",
				children: [
					u,
					" ",
					/* @__PURE__ */ q("button", {
						type: "button",
						className: "sq-link",
						onClick: _,
						children: "Зрозуміло"
					})
				]
			}),
			be.length > 0 && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-6 mt-2 flex items-center gap-3 rounded-sq bg-sq-blue/[0.06] px-3 py-2 text-sm text-sq-text",
				"data-testid": "bill-elsewhere",
				children: [/* @__PURE__ */ J("span", {
					className: "min-w-0 flex-1 truncate",
					children: [
						"Інші столи:",
						" ",
						be.slice(0, 3).map((e) => `Стіл ${e.table_name} — ${e.words}`).join(" · "),
						be.length > 3 ? ` · і ще ${be.length - 3}` : ""
					]
				}), /* @__PURE__ */ q("button", {
					type: "button",
					className: "sq-link shrink-0 font-semibold",
					onClick: () => R("/tables"),
					children: "До залу"
				})]
			}),
			(Z.length > 0 || me.length > 0 || pe.length > 0 || ge.length > 0) && /* @__PURE__ */ J("section", {
				className: "mx-4 md:mx-6 mt-2 max-h-[40vh] shrink-0 overflow-auto space-y-2.5",
				"data-testid": "bill-requests",
				children: [/* @__PURE__ */ q(Bt, {
					calls: me,
					sent: pe,
					feedback: ge,
					showTable: !1,
					busy: d || L,
					onAnswer: Be,
					onSeen: He,
					onSeenFeedback: Ve
				}), /* @__PURE__ */ q(Vt, {
					orders: Z,
					showTable: !1,
					busy: d || L,
					onAccept: ze,
					onReject: Ue
				})]
			}),
			/* @__PURE__ */ J("div", {
				className: `min-h-0 flex-1 ${C ? "grid grid-cols-[minmax(0,1fr)_372px]" : "flex flex-col"}`,
				children: [/* @__PURE__ */ q(Gt, {
					counts: je,
					online: n,
					active: n && !M && !D && !P,
					canScan: i === "cashier",
					epoch: m,
					onAdd: x,
					onRows: Ae
				}), C && /* @__PURE__ */ q("aside", {
					className: "flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]",
					children: We
				})]
			}),
			!C && /* @__PURE__ */ q(mt, {
				draft: Q,
				rounds: s.rounds,
				summary: Oe,
				owedCents: s.fired_total_cents,
				hasPending: f.length > 0,
				busy: d,
				online: n,
				onOpen: () => j(!0),
				onFire: Pe
			}),
			!C && D && /* @__PURE__ */ q(bt, {
				title: `Стіл ${s.table_name} · рахунок ${s.bill_no}`,
				onClose: () => j(!1),
				children: We
			}),
			M && /* @__PURE__ */ q($t, {
				bill: s,
				busy: d,
				cashRoundingStep: o,
				onClose: () => N(!1),
				onPay: (e, t) => void Me(e, t)
			}),
			P && /* @__PURE__ */ q("div", {
				className: "fixed inset-0 z-50",
				children: /* @__PURE__ */ q(nt, {
					productName: P.row.product_name,
					variants: P.variants,
					variantLabel: w,
					initialVariantId: P.row.variant_id,
					initialModifierIds: P.row.modifierIds,
					initialNote: P.row.note,
					submitLabel: "Зберегти",
					withQuantity: !1,
					onAdd: ({ item: e, modifiers: t, note: n }) => Re(e, t, n),
					onClose: () => F(null)
				})
			})
		]
	});
}
// src/modules/tables/components/TableTile.tsx
var En = {
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
}, Dn = {
	free: "Вільний",
	mine: "Мій стіл",
	busy: "Зайнятий",
	bill: "Просять рахунок"
};
function On({ seat: t, now: n, meId: r, onOpen: i, disabled: a, guestWaiting: o = 0, calling: s, sentUnseen: l = 0, lowScore: u = null }) {
	let f = s?.waiter === !0, h = s?.bill === !0, { table: g, bill: _ } = t, v = c(_, r), x = F(_), C = g.shape === "round";
	return /* @__PURE__ */ J("button", {
		type: "button",
		"data-testid": `table-tile-${g.id}`,
		"data-tone": v,
		"data-kitchen": x ?? void 0,
		"data-guest": o > 0 ? o : void 0,
		"data-call": f || h ? [f ? "waiter" : "", h ? "bill" : ""].filter(Boolean).join(" ") : void 0,
		"data-sent": l > 0 ? l : void 0,
		"data-low-score": u ?? void 0,
		disabled: a,
		onClick: () => i(t),
		style: {
			gridColumn: `${g.pos_x + 1} / span ${g.width}`,
			gridRow: `${g.pos_y + 1} / span ${g.height}`
		},
		className: `relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${C ? "rounded-full" : "rounded-card"} ${En[v].tile}`,
		children: [
			En[v].dot && /* @__PURE__ */ q("span", {
				"aria-hidden": !0,
				className: `absolute top-3 w-2.5 h-2.5 rounded-full ${C ? "right-[18%]" : "right-3.5"} ${En[v].dot}`
			}),
			(x || o > 0 || f || h || l > 0 || u != null || _ && _.draft_count > 0) && /* @__PURE__ */ J("span", {
				className: `absolute top-2.5 flex flex-wrap items-center gap-1 ${C ? "left-[16%] right-[24%]" : "left-3 right-8"}`,
				children: [
					f && /* @__PURE__ */ J("span", {
						"data-testid": `table-call-waiter-${g.id}`,
						title: "Гість кличе офіціанта",
						className: "h-5 px-1 rounded-md bg-[#8A6CEF]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ q(P, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ q("span", {
							className: "sr-only",
							children: "Гість кличе офіціанта"
						})]
					}),
					h && /* @__PURE__ */ J("span", {
						"data-testid": `table-call-bill-${g.id}`,
						title: "Гість просить рахунок",
						className: "h-5 px-1 rounded-md bg-[#1B9DF0]/15 inline-flex items-center animate-pulse",
						children: [/* @__PURE__ */ q(e, {
							size: 14,
							"aria-hidden": !0
						}), /* @__PURE__ */ q("span", {
							className: "sr-only",
							children: "Гість просить рахунок"
						})]
					}),
					u != null && /* @__PURE__ */ J("span", {
						"data-testid": `table-low-${g.id}`,
						title: "Гість поставив низьку оцінку з телефону",
						className: "h-5 px-1 rounded-md bg-sq-danger/15 text-sq-danger text-[11px] font-semibold inline-flex items-center gap-0.5 animate-pulse",
						children: [
							/* @__PURE__ */ q(I, {
								size: 14,
								"aria-hidden": !0
							}),
							u,
							/* @__PURE__ */ q("span", {
								className: "sr-only",
								children: "Низька оцінка з телефону"
							})
						]
					}),
					l > 0 && /* @__PURE__ */ J("span", {
						"data-testid": `table-sent-${g.id}`,
						title: "Гість замовив сам — уже на кухні",
						className: "h-5 px-1 rounded-md bg-[#F4891F]/15 text-[#B35F0C] text-[11px] font-semibold inline-flex items-center gap-0.5 animate-pulse",
						children: [
							/* @__PURE__ */ q(y, {
								size: 14,
								"aria-hidden": !0
							}),
							l > 1 ? l : null,
							/* @__PURE__ */ q("span", {
								className: "sr-only",
								children: "Замовлення гостя вже на кухні"
							})
						]
					}),
					o > 0 && /* @__PURE__ */ J("span", {
						"data-testid": `table-guest-${g.id}`,
						title: "Гість надіслав запит із телефону",
						className: "h-5 px-1.5 rounded-md bg-sq-blue text-white text-[11px] font-semibold inline-flex items-center gap-1 animate-pulse",
						children: [
							/* @__PURE__ */ q(b, {
								size: 13,
								"aria-hidden": !0
							}),
							o > 1 ? o : null,
							/* @__PURE__ */ q("span", {
								className: "sr-only",
								children: o > 1 ? `Запитів гостей: ${o}` : "Запит гостя"
							})
						]
					}),
					x && /* @__PURE__ */ q("span", {
						className: `h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${x === "ready" ? "bg-sq-success text-white" : "bg-sq-warning/15 text-[#B35F0C]"}`,
						children: x === "ready" ? "готово" : "готується"
					}),
					_ && _.draft_count > 0 && /* @__PURE__ */ q("span", {
						"data-testid": `table-draft-${g.id}`,
						title: "Не відправлено на кухню",
						className: "text-sq-blue",
						children: /* @__PURE__ */ q(S, {
							size: 16,
							"aria-label": "Не відправлено на кухню"
						})
					})
				]
			}),
			/* @__PURE__ */ q("span", {
				className: "text-[30px] font-bold leading-none text-sq-heading tabular-nums",
				children: g.name
			}),
			_ ? /* @__PURE__ */ J(le, { children: [
				v === "bill" ? /* @__PURE__ */ q("span", {
					className: "text-[13px] font-semibold text-sq-danger",
					"data-testid": `table-precheck-${g.id}`,
					children: "Просять рахунок"
				}) : /* @__PURE__ */ J("span", {
					className: "text-[13px] font-semibold text-sq-text tabular-nums",
					children: [
						d(_.fired_total_cents),
						" · ",
						p(_.opened_at, n)
					]
				}),
				/* @__PURE__ */ J("span", {
					className: "text-xs text-sq-muted truncate max-w-full",
					children: [ne(_.guests), _.opened_by_name ? ` · ${_.opened_by_name}` : ""]
				}),
				/* @__PURE__ */ q("span", {
					className: "sr-only",
					children: Dn[v]
				})
			] }) : /* @__PURE__ */ q("span", {
				className: "text-[13px] text-sq-muted",
				children: m(g.seats)
			})
		]
	});
}
function kn({ guest: t = !1, callWaiter: n = !1, callBill: r = !1, sent: i = !1, low: a = !1 }) {
	let o = {
		free: "bg-sq-divider",
		mine: "bg-sq-blue",
		busy: "bg-[#F8C00F]",
		bill: "bg-sq-danger"
	};
	return /* @__PURE__ */ J("div", {
		className: "flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary",
		"data-testid": "tables-legend",
		children: [
			Object.keys(o).map((e) => /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q("span", {
					"aria-hidden": !0,
					className: `w-2.5 h-2.5 rounded-full ${o[e]}`
				}), Dn[e]]
			}, e)),
			t && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(b, {
					size: 14,
					className: "text-sq-blue",
					"aria-hidden": !0
				}), "Запит гостя"]
			}),
			n && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(P, {
					size: 14,
					"aria-hidden": !0
				}), "Кличе офіціанта"]
			}),
			r && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(e, {
					size: 14,
					"aria-hidden": !0
				}), "Рахунок з телефону"]
			}),
			i && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(y, {
					size: 14,
					"aria-hidden": !0
				}), "Замовив сам — на кухні"]
			}),
			a && /* @__PURE__ */ J("span", {
				className: "flex items-center gap-1.5",
				children: [/* @__PURE__ */ q(I, {
					size: 14,
					className: "text-sq-danger",
					"aria-hidden": !0
				}), "Низька оцінка з телефону"]
			})
		]
	});
}
// src/modules/tables/pages/HallMapPage.tsx
function An(e) {
	let t = new Date(e);
	return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}
function jn() {
	let e = ve((e) => e.online), n = ye(), r = _e((e) => e.auth?.store.id ?? null), i = _e((e) => e.auth?.staff.id ?? null), { halls: o, bills: s, now: c, loading: l, error: u, stale: d, savedAt: f, refresh: p } = re({
		online: e,
		mirrored: n !== "web",
		storeId: r
	}), { orders: m, sent: h, calls: v, feedback: y, loaded: x, refresh: S } = pn({ online: e }), [C, w] = Sn(), [T, D] = K(null), [k, A] = K(!1), [j, M] = K(null), [N, P] = K(null), F = (e, t = !1) => P(e == null ? null : {
		text: e,
		warn: t
	}), ne = Te(), I = we().state, L = typeof I?.note == "string" ? I.note : null, ie = I?.warn === !0;
	U(() => {
		L && P({
			text: L,
			warn: ie
		});
	}, [L, ie]);
	let R = W(() => jt({
		orders: m,
		sent: h,
		calls: v,
		feedback: y
	}), [
		m,
		h,
		v,
		y
	]);
	Cn(W(() => Nt({
		orders: m,
		sent: h,
		calls: v,
		feedback: y
	}), [
		m,
		h,
		v,
		y
	]), x, C);
	let ae = m.length + h.length + v.length + y.length > 0;
	U(() => {
		if (N == null || N.warn) return;
		let e = setTimeout(() => P(null), 8e3);
		return () => clearTimeout(e);
	}, [N]);
	let B = W(() => g(o, s), [o, s]), V = B.find((e) => e.id === T) ?? B[0] ?? null, se = W(() => V ? a(V, s) : [], [V, s]), ce = W(() => t(se), [se]);
	async function H(t) {
		if (!k) {
			if (!e) M("Потрібна мережа, щоб відкрити стіл");
			else {
				A(!0), M(null);
				try {
					let e = await _(t.table.id);
					ne(`/tables/${e.bill.id}`);
				} catch (e) {
					M(z(e, "Не вдалося відкрити стіл")), p();
				} finally {
					A(!1);
				}
			}
		}
	}
	async function G(t, n) {
		if (k) return { ok: !1 };
		if (!e) return M("Потрібна мережа, щоб прийняти запит"), { ok: !1 };
		A(!0), M(null), F(null);
		try {
			let e = await E(t.id, n);
			return S(), p(), e.warning ? ne(`/tables/${e.bill.id}`, { state: { notice: e.warning } }) : F(e.already ? `Стіл ${t.table_name}: запит уже було прийнято` : `Стіл ${t.table_name}: прийнято — замовлення на кухні`), { ok: !0 };
		} catch (e) {
			return M(z(e, "Не вдалося прийняти запит")), S(), {
				ok: !1,
				refusedLineId: Dt(e)
			};
		} finally {
			A(!1);
		}
	}
	async function le(t) {
		if (!e) return M("Потрібна мережа, щоб відповісти гостю"), !1;
		M(null);
		try {
			return await oe(t.id), F(`Стіл ${t.table_name}: гість бачить «Офіціант іде»`), !0;
		} catch (e) {
			return M(z(e, "Не вдалося відповісти на виклик")), !1;
		} finally {
			S();
		}
	}
	async function ue(t) {
		if (!e) return M("Потрібна мережа"), !1;
		M(null);
		try {
			return await te(t.id), F(`Стіл ${t.table_name}: оцінку позначено як опрацьовану`), !0;
		} catch (e) {
			return M(z(e, "Не вдалося позначити")), !1;
		} finally {
			S();
		}
	}
	async function de(t) {
		if (!e) return M("Потрібна мережа"), !1;
		M(null);
		try {
			return await ee(t.id), F(t.bill_opened_by_guest ? `Стіл ${t.table_name} тепер ваш — замовлення вже на кухні` : `Стіл ${t.table_name}: замовлення вже на кухні`), t.bill_opened_by_guest && p(), !0;
		} catch (e) {
			return M(z(e, "Не вдалося позначити")), !1;
		} finally {
			S();
		}
	}
	async function Y(t, n) {
		if (k) return !1;
		if (!e) return M("Потрібна мережа, щоб відхилити запит"), !1;
		A(!0), M(null), F(null);
		try {
			return await O(t.id, n ?? void 0), S(), F(`Стіл ${t.table_name}: запит відхилено`), !0;
		} catch (e) {
			return M(z(e, "Не вдалося відхилити запит")), S(), !1;
		} finally {
			A(!1);
		}
	}
	return !e && !d && !l ? /* @__PURE__ */ q("div", {
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
					B.length > 1 && /* @__PURE__ */ q("div", {
						className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full",
						children: B.map((e) => {
							let t = V?.id === e.id, n = e.tables.reduce((e, t) => e + Mt(R.get(t.id)), 0);
							return /* @__PURE__ */ J("button", {
								type: "button",
								"aria-pressed": t,
								"data-testid": `hall-tab-${e.id}`,
								onClick: () => D(e.id),
								className: `whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${t ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
								children: [e.name, n > 0 && /* @__PURE__ */ J("span", {
									"data-testid": `hall-tab-guest-${e.id}`,
									className: "ml-1.5 inline-flex items-center gap-0.5 text-sq-blue font-semibold",
									children: [/* @__PURE__ */ q(b, {
										size: 14,
										"aria-hidden": !0
									}), n]
								})]
							}, e.id);
						})
					}),
					/* @__PURE__ */ q("div", { className: "flex-1" }),
					V && /* @__PURE__ */ q(kn, {
						guest: m.length > 0,
						callWaiter: v.some((e) => e.kind === "waiter"),
						callBill: v.some((e) => e.kind === "bill"),
						sent: h.length > 0,
						low: y.length > 0
					}),
					/* @__PURE__ */ q("button", {
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
			d && /* @__PURE__ */ J("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
				"data-testid": "tables-stale",
				children: ["Немає звʼязку — зала з памʼяті каси", f == null ? "" : `, станом на ${An(f)}`]
			}),
			j && /* @__PURE__ */ q("p", {
				className: "mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "tables-banner",
				children: j
			}),
			N && /* @__PURE__ */ q("p", {
				className: `mx-4 md:mx-7 mb-3 rounded-sq px-3 py-2 text-sm ${N.warn ? "bg-amber-50 text-amber-900" : "bg-sq-success/10 text-sq-success-ink"}`,
				"data-testid": "tables-note",
				"data-tone": N.warn ? "warn" : "ok",
				children: N.text
			}),
			ae && /* @__PURE__ */ J("section", {
				className: "mx-4 md:mx-7 mb-3 max-h-[45vh] overflow-auto space-y-2.5",
				"data-testid": "tables-requests",
				children: [
					/* @__PURE__ */ J("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: [
							"З телефонів гостей ·",
							" ",
							Ft({
								requests: m.length,
								sent: h.length,
								calls: v.length,
								feedback: y.length
							})
						]
					}),
					/* @__PURE__ */ q(Bt, {
						calls: v,
						sent: h,
						feedback: y,
						showTable: !0,
						busy: k,
						onAnswer: le,
						onSeen: de,
						onSeenFeedback: ue,
						onOpenBill: (e) => ne(`/tables/${e}`)
					}),
					/* @__PURE__ */ q(Vt, {
						orders: m,
						showTable: !0,
						busy: k,
						onAccept: G,
						onReject: Y
					})
				]
			}),
			l && B.length === 0 && /* @__PURE__ */ q("p", {
				className: "p-6 text-center text-sm text-sq-muted",
				children: "Завантаження зали…"
			}),
			!l && u && /* @__PURE__ */ q("div", {
				className: "px-4 md:px-7",
				children: /* @__PURE__ */ J("div", {
					className: "sq-card p-6 text-center",
					children: [/* @__PURE__ */ q("p", {
						className: "text-sm",
						children: u
					}), /* @__PURE__ */ q("button", {
						type: "button",
						className: "sq-btn-primary mt-3 px-4 py-2.5",
						onClick: () => void p(),
						children: "Повторити"
					})]
				})
			}),
			!l && !u && B.length === 0 && /* @__PURE__ */ q("div", {
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
			V && /* @__PURE__ */ q("div", {
				className: "grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6",
				style: {
					gridTemplateColumns: `repeat(${ce.cols}, minmax(2.5rem, 1fr))`,
					gridAutoRows: "minmax(3.75rem, auto)"
				},
				children: se.map((e) => /* @__PURE__ */ q(On, {
					seat: e,
					now: c,
					meId: i,
					disabled: k,
					guestWaiting: R.get(e.table.id)?.requests ?? 0,
					calling: R.get(e.table.id),
					sentUnseen: R.get(e.table.id)?.sent ?? 0,
					lowScore: R.get(e.table.id)?.low ?? null,
					onOpen: (e) => void H(e)
				}, e.table.id))
			})
		]
	});
}
// src/modules/tables/pages/TablesRoutes.tsx
function Mn() {
	return /* @__PURE__ */ J(Ce, { children: [/* @__PURE__ */ q(Se, {
		index: !0,
		element: /* @__PURE__ */ q(jn, {})
	}), /* @__PURE__ */ q(Se, {
		path: ":billId",
		element: /* @__PURE__ */ q(Tn, {})
	})] });
}
export { Mn as TablesRoutes };
