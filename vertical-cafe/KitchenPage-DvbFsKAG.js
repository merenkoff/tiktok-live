import { C as e, S as t, c as n, d as r, i, l as a, n as o, r as s, t as c } from "./hostPlatform-D3rxsd42.js";
import { useCallback as l, useEffect as u, useReducer as d, useRef as f, useState as p } from "react";
import { jsx as m, jsxs as h } from "react/jsx-runtime";
import { assetUrl as g, useOfflineStatus as _, useVertical as v } from "@pos/platform";
function y(e, t = Date.now()) {
	let n = new Date(e).getTime();
	return Number.isNaN(n) ? 0 : n - t;
}
function b(e, t, n = Date.now()) {
	let r = new Date(e).getTime();
	return Number.isNaN(r) ? 0 : Math.max(0, Math.floor((n + t - r) / 1e3));
}
function x(e) {
	return e >= 600 ? "late" : e >= 300 ? "warn" : "ok";
}
function S(e) {
	let t = Math.max(0, Math.floor(e)), n = Math.floor(t / 3600), r = Math.floor(t % 3600 / 60), i = t % 60, a = String(r).padStart(n > 0 ? 2 : 1, "0"), o = String(i).padStart(2, "0");
	return n > 0 ? `${n}:${a}:${o}` : `${a}:${o}`;
}
function C(e) {
	return {
		inWork: e.filter((e) => e.prep_status === "new"),
		pickup: e.filter((e) => e.prep_status === "ready")
	};
}
function w(e) {
	return e.kind === "round";
}
function T(e) {
	return w(e) ? e.table_name || e.title || "" : e.order_no == null ? e.receipt_number : String(e.order_no);
}
function E(e) {
	return !w(e) || e.round_seq == null ? null : `раунд ${e.round_seq}`;
}
function D(e) {
	return `${e.kind ?? "sale"}-${e.id}`;
}
function O(e, t, n, r) {
	let i = D(t);
	return n === "served" ? e.filter((e) => D(e) !== i) : e.map((e) => D(e) === i ? {
		...e,
		prep_status: "ready",
		ready_at: e.ready_at ?? r
	} : e);
}
function k(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		if (n.sellable === !1) continue;
		let e = t.get(n.product_id);
		e ? (e.stock += n.quantity, e.stop_listed = e.stop_listed || n.stop_listed === !0) : t.set(n.product_id, {
			product_id: n.product_id,
			name: n.product_name,
			image_url: n.image_url ?? null,
			stop_listed: n.stop_listed === !0,
			stock: n.quantity
		});
	}
	return [...t.values()].sort((e, t) => e.name.localeCompare(t.name, "uk"));
}
function A(e, t) {
	let n = e?.response?.data?.error;
	return typeof n == "string" && n.trim() ? n : t;
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/kitchenApi.ts
function j() {
	return s("get", "/kitchen/orders");
}
function M(e, t) {
	let n = e.kind === "round" ? `/kitchen/rounds/${e.id}/prep` : `/sales/${e.id}/prep`;
	return s("patch", n, { prep_status: t });
}
function N(e, t) {
	return s("post", `/kitchen/stop-list/${e}`, { stop_listed: t });
}
function P() {
	return s("get", "/catalog");
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/useKitchenOrders.ts
var F = 5e3;
function I(e) {
	let [t, n] = p([]), [r, i] = p(0), [a, o] = p(!0), [s, c] = p(null), [d, m] = p(null), h = f(!0);
	u(() => (h.current = !0, () => {
		h.current = !1;
	}), []);
	let g = l(async () => {
		try {
			let e = await j();
			if (!h.current) return;
			n(e.orders), i(y(e.now)), c(null);
		} catch (e) {
			h.current && c(A(e, "Не вдалося прочитати замовлення"));
		} finally {
			h.current && o(!1);
		}
	}, []);
	u(() => {
		if (!e) return;
		g();
		let t = setInterval(() => {
			typeof document < "u" && document.visibilityState !== "visible" || g();
		}, F);
		return () => clearInterval(t);
	}, [e, g]);
	let _ = l(async (e, t) => {
		n((n) => O(n, e, t, (/* @__PURE__ */ new Date()).toISOString()));
		try {
			await M(e, t), h.current && m(null);
		} catch (e) {
			h.current && m(A(e, "Не вдалося оновити замовлення"));
		} finally {
			await g();
		}
	}, [g]);
	return {
		orders: t,
		offset: r,
		loading: a,
		error: s,
		banner: d,
		refresh: g,
		markReady: l((e) => _(e, "ready"), [_]),
		markServed: l((e) => _(e, "served"), [_]),
		clearBanner: l(() => m(null), [])
	};
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/OrdersTab.tsx
var L = {
	kitchen: "кухня",
	bar: "бар"
}, R = {
	ok: "text-sq-text",
	warn: "text-amber-600",
	late: "text-sq-danger"
};
function z() {
	let { orders: t, offset: n, loading: r, error: i, banner: a, markReady: o, markServed: s, clearBanner: c } = I(!0), [, l] = d((e) => e + 1, 0);
	u(() => {
		let e = setInterval(l, 1e3);
		return () => clearInterval(e);
	}, []);
	let { inWork: f, pickup: p } = C(t);
	return /* @__PURE__ */ h("div", {
		className: "flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 space-y-3",
		children: [
			i && /* @__PURE__ */ m("p", {
				className: "text-sm text-red-600",
				"data-testid": "kitchen-error",
				children: i
			}),
			a && /* @__PURE__ */ h("div", {
				className: "flex items-center justify-between gap-3 rounded-sq bg-amber-50 text-amber-800 px-3 py-2 text-sm",
				"data-testid": "kitchen-banner",
				children: [/* @__PURE__ */ m("span", { children: a }), /* @__PURE__ */ m("button", {
					type: "button",
					className: "min-h-11 px-2 font-semibold",
					onClick: c,
					"aria-label": "Закрити",
					children: /* @__PURE__ */ m(e, { size: 20 })
				})]
			}),
			r && t.length === 0 && /* @__PURE__ */ m("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			/* @__PURE__ */ h("div", {
				className: "grid gap-6 lg:grid-cols-[2fr_1fr] items-start",
				children: [/* @__PURE__ */ m(B, {
					title: "В роботі",
					tone: "blue",
					testId: "kitchen-in-work",
					empty: "Замовлень немає",
					wide: !0,
					children: f.map((e) => /* @__PURE__ */ m(V, {
						order: e,
						since: e.created_at,
						offset: n,
						action: "ready",
						actionTestId: `kitchen-ready-${D(e)}`,
						onAction: () => void o(e)
					}, D(e)))
				}), /* @__PURE__ */ m(B, {
					title: "Видача",
					tone: "green",
					testId: "kitchen-pickup",
					empty: "Нічого не чекає видачі",
					children: p.map((e) => /* @__PURE__ */ m(V, {
						order: e,
						since: e.ready_at ?? e.created_at,
						offset: n,
						action: "served",
						actionTestId: `kitchen-served-${D(e)}`,
						onAction: () => void s(e)
					}, D(e)))
				})]
			})
		]
	});
}
function B({ title: e, tone: t, testId: n, empty: r, wide: i = !1, children: a }) {
	return /* @__PURE__ */ h("section", {
		className: "space-y-3 min-w-0",
		"data-testid": n,
		children: [/* @__PURE__ */ h("h2", {
			className: "flex items-baseline gap-2 pb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
			children: [/* @__PURE__ */ m("span", {
				className: `text-[15px] font-bold ${t === "blue" ? "text-sq-blue" : "text-sq-success"}`,
				children: e
			}), /* @__PURE__ */ m("span", {
				className: "text-[13px] text-sq-muted tabular-nums",
				children: a.length
			})]
		}), a.length === 0 ? /* @__PURE__ */ m("p", {
			className: "rounded-card bg-white/60 p-6 text-center text-sm text-sq-muted",
			children: r
		}) : /* @__PURE__ */ m("div", {
			className: `grid gap-3 items-start ${i ? "sm:grid-cols-2" : ""}`,
			children: a
		})]
	});
}
function V({ order: e, since: t, offset: i, action: a, actionTestId: o, onAction: s }) {
	let c = b(t, i), l = x(c), u = /* @__PURE__ */ new Set();
	for (let t of e.items) for (let e of t.stations) u.add(e);
	let d = E(e);
	return /* @__PURE__ */ h("article", {
		className: `rounded-2xl bg-white px-4 py-3.5 flex flex-col gap-2.5 ${l === "late" ? "shadow-[0_0_0_2px_rgb(var(--sq-danger-rgb)),0_2px_8px_rgba(0,0,0,.1)]" : "shadow-card"}`,
		"data-testid": `kitchen-order-${D(e)}`,
		children: [
			/* @__PURE__ */ h("div", {
				className: "flex items-start gap-3",
				children: [
					/* @__PURE__ */ m("p", {
						className: "text-[32px] font-bold leading-none text-sq-heading tabular-nums break-words min-w-0",
						"data-testid": "kitchen-order-no",
						children: T(e)
					}),
					/* @__PURE__ */ h("div", {
						className: "flex-1 min-w-0 flex flex-col gap-1",
						children: [d ? /* @__PURE__ */ m("p", {
							className: "text-[13px] text-sq-secondary",
							"data-testid": "kitchen-order-round",
							children: d
						}) : /* @__PURE__ */ m("p", {
							className: "text-[13px] text-sq-secondary",
							children: "за стійкою"
						}), u.size > 0 && /* @__PURE__ */ m("div", {
							className: "flex flex-wrap gap-1.5",
							children: [...u].map((e) => /* @__PURE__ */ m("span", {
								className: "h-[22px] px-2 rounded-md bg-sq-empty text-xs font-semibold text-sq-secondary inline-flex items-center",
								children: L[e]
							}, e))
						})]
					}),
					/* @__PURE__ */ h("div", {
						className: "flex flex-col items-end gap-0.5 shrink-0",
						children: [/* @__PURE__ */ h("span", {
							className: `flex items-center gap-1 ${R[l]}`,
							children: [/* @__PURE__ */ m(r, {
								size: 20,
								"aria-hidden": !0
							}), /* @__PURE__ */ m("span", {
								className: "text-base font-bold tabular-nums",
								"data-testid": "kitchen-wait",
								children: S(c)
							})]
						}), /* @__PURE__ */ m("span", {
							className: "text-xs text-sq-muted",
							children: e.staff_name
						})]
					})
				]
			}),
			/* @__PURE__ */ m("ul", {
				className: "flex flex-col gap-1 py-2 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]",
				children: e.items.map((e) => /* @__PURE__ */ h("li", {
					className: "flex gap-2.5 text-base leading-snug text-sq-text",
					children: [/* @__PURE__ */ h("span", {
						className: "font-bold tabular-nums shrink-0",
						children: [e.quantity, "×"]
					}), /* @__PURE__ */ h("span", {
						className: "min-w-0",
						children: [
							e.product_name,
							e.variant_label && /* @__PURE__ */ h("span", {
								className: "text-sq-secondary",
								children: [" ", e.variant_label]
							}),
							e.note && /* @__PURE__ */ h("span", {
								className: "font-semibold text-sq-warning",
								children: [" · ", e.note]
							})
						]
					})]
				}, e.id))
			}),
			e.note && /* @__PURE__ */ h("p", {
				className: "text-sm text-sq-secondary -mt-1",
				children: ["Замовлення: ", e.note]
			}),
			/* @__PURE__ */ h("button", {
				type: "button",
				onClick: s,
				className: `w-full min-h-12 rounded-xl text-[17px] font-semibold text-white inline-flex items-center justify-center gap-2 ${a === "ready" ? "bg-sq-blue hover:bg-sq-blue-press" : "bg-sq-success hover:brightness-95"}`,
				"data-testid": o,
				children: [a === "ready" && /* @__PURE__ */ m(n, {
					size: 20,
					"aria-hidden": !0
				}), a === "ready" ? "Готово" : "Видано"]
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/StopListTab.tsx
function H({ onCount: e } = {}) {
	let [t, n] = p(null), [r, a] = p(null), [o, s] = p(null), c = l(async () => {
		try {
			n(k(await P())), a(null);
		} catch (e) {
			a(A(e, "Не вдалося прочитати меню")), n([]);
		}
	}, []);
	u(() => {
		c();
	}, [c]), u(() => {
		t && e?.(t.filter((e) => e.stop_listed).length);
	}, [t, e]);
	async function d(e) {
		s(e.product_id);
		try {
			let t = await N(e.product_id, !e.stop_listed);
			n((n) => (n ?? []).map((n) => n.product_id === e.product_id ? {
				...n,
				stop_listed: t.stop_listed
			} : n)), a(null), await i();
		} catch (e) {
			a(A(e, "Не вдалося змінити стоп-лист"));
		} finally {
			s(null);
		}
	}
	return /* @__PURE__ */ h("div", {
		className: "flex-1 min-h-0 overflow-auto px-4 md:px-7 pb-6 space-y-3 max-w-3xl",
		"data-testid": "kitchen-stop-list",
		children: [
			/* @__PURE__ */ m("p", {
				className: "text-sm text-sq-secondary",
				children: "Чого сьогодні не робимо. Знімається само опівночі; плитка на касі сіріє з підписом «стоп»."
			}),
			r && /* @__PURE__ */ m("p", {
				className: "text-sm text-red-600",
				"data-testid": "stop-list-error",
				children: r
			}),
			t === null && /* @__PURE__ */ m("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			t !== null && t.length === 0 && /* @__PURE__ */ m("p", {
				className: "rounded-card bg-white/60 p-6 text-center text-sm text-sq-muted",
				children: "Меню порожнє"
			}),
			/* @__PURE__ */ m("ul", {
				className: "divide-y divide-sq-divider rounded-card bg-white shadow-card overflow-hidden",
				children: (t ?? []).map((e) => {
					let t = g(e.image_url);
					return /* @__PURE__ */ h("li", {
						className: "flex items-center gap-3 px-4 py-2.5",
						"data-testid": `stop-list-${e.product_id}`,
						children: [
							/* @__PURE__ */ m("div", {
								className: "w-11 h-11 rounded-xl bg-sq-empty overflow-hidden shrink-0",
								children: t && /* @__PURE__ */ m("img", {
									src: t,
									alt: "",
									className: "w-full h-full object-cover"
								})
							}),
							/* @__PURE__ */ h("div", {
								className: "flex-1 min-w-0",
								children: [/* @__PURE__ */ m("p", {
									className: `text-base font-semibold truncate ${e.stop_listed ? "text-sq-muted line-through" : "text-sq-text"}`,
									children: e.name
								}), e.stock <= 0 && /* @__PURE__ */ m("p", {
									className: "text-[13px] text-sq-muted",
									children: "немає — закінчилось"
								})]
							}),
							/* @__PURE__ */ m("button", {
								type: "button",
								role: "switch",
								"aria-checked": e.stop_listed,
								"aria-label": `Стоп-лист: ${e.name}`,
								disabled: o === e.product_id,
								onClick: () => void d(e),
								"data-testid": `stop-list-toggle-${e.product_id}`,
								className: `min-h-11 min-w-24 rounded-sq px-3 text-[15px] font-semibold ${e.stop_listed ? "bg-sq-danger text-white" : "bg-sq-empty text-sq-text hover:bg-sq-selected"}`,
								children: e.stop_listed ? "Стоп" : "Робимо"
							})
						]
					}, e.product_id);
				})
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/KitchenPage.tsx
function U() {
	let e = o();
	if (e.length > 0) throw new c(e);
	return /* @__PURE__ */ m(W, {});
}
function W() {
	let e = v(), n = _((e) => e.online), [r, i] = p("orders"), [o, s] = p(null);
	return u(() => {
		if (!n || e.id !== "cafe") return;
		let t = !1;
		return P().then((e) => {
			t || s(k(e).filter((e) => e.stop_listed).length);
		}).catch(() => void 0), () => {
			t = !0;
		};
	}, [n, e.id]), e.id === "cafe" ? /* @__PURE__ */ h("div", {
		className: "flex flex-col h-full min-h-0 bg-sq-bg text-sq-text",
		"data-testid": "kitchen-board",
		children: [/* @__PURE__ */ h("div", {
			className: "flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0",
			children: [/* @__PURE__ */ h("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ m(a, { size: 24 }), /* @__PURE__ */ m("h1", {
					className: "text-2xl font-bold text-sq-heading",
					children: "Кухня"
				})]
			}), /* @__PURE__ */ h("div", {
				className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty",
				children: [/* @__PURE__ */ m(G, {
					active: r === "orders",
					onClick: () => i("orders"),
					testId: "kitchen-tab-orders",
					children: "Замовлення"
				}), /* @__PURE__ */ m(G, {
					active: r === "stop",
					onClick: () => i("stop"),
					testId: "kitchen-tab-stop",
					children: o ? `Стоп-лист · ${o}` : "Стоп-лист"
				})]
			})]
		}), n ? r === "orders" ? /* @__PURE__ */ m(z, {}) : /* @__PURE__ */ m(H, { onCount: s }) : /* @__PURE__ */ h("div", {
			className: "mx-4 md:mx-7 rounded-card bg-white shadow-card p-8 text-center",
			"data-testid": "kitchen-offline",
			children: [
				/* @__PURE__ */ m(t, {
					size: 48,
					className: "mx-auto text-sq-muted"
				}),
				/* @__PURE__ */ m("p", {
					className: "mt-3 text-sm font-medium",
					children: "Потрібна мережа"
				}),
				/* @__PURE__ */ m("p", {
					className: "mt-1 text-xs text-sq-secondary",
					children: "Замовлення живуть на сервері. Дошка оновиться, щойно звʼязок повернеться."
				})
			]
		})]
	}) : /* @__PURE__ */ h("div", {
		className: "p-4",
		children: [/* @__PURE__ */ m("h1", {
			className: "text-lg font-semibold text-sq-text",
			children: "Кухня"
		}), /* @__PURE__ */ m("p", {
			className: "mt-2 text-sm text-amber-700",
			children: "Магазин зараз не на вертикалі кафе. Тип магазину змінює адміністратор платформи."
		})]
	});
}
function G({ active: e, onClick: t, testId: n, children: r }) {
	return /* @__PURE__ */ m("button", {
		type: "button",
		onClick: t,
		"aria-pressed": e,
		"data-testid": n,
		className: `min-h-[38px] rounded-[9px] px-4 text-[15px] transition-colors ${e ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary"}`,
		children: r
	});
}
//#endregion
export { U as default };
