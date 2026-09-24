import { a as e, i as t, n, r, t as i } from "./hostPlatform-BSaDrC_D.js";
import { useCallback as a, useEffect as o, useReducer as s, useRef as c, useState as l } from "react";
import { jsx as u, jsxs as d } from "react/jsx-runtime";
import { assetUrl as f, useOfflineStatus as p, useVertical as m } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/wifi-off.js
var h = e("WifiOff", [
	["path", {
		d: "M12 20h.01",
		key: "zekei9"
	}],
	["path", {
		d: "M8.5 16.429a5 5 0 0 1 7 0",
		key: "1bycff"
	}],
	["path", {
		d: "M5 12.859a10 10 0 0 1 5.17-2.69",
		key: "1dl1wf"
	}],
	["path", {
		d: "M19 12.859a10 10 0 0 0-2.007-1.523",
		key: "4k23kn"
	}],
	["path", {
		d: "M2 8.82a15 15 0 0 1 4.177-2.643",
		key: "1grhjp"
	}],
	["path", {
		d: "M22 8.82a15 15 0 0 0-11.288-3.764",
		key: "z3jwby"
	}],
	["path", {
		d: "m2 2 20 20",
		key: "1ooewy"
	}]
]);
function g(e, t = Date.now()) {
	let n = new Date(e).getTime();
	return Number.isNaN(n) ? 0 : n - t;
}
function _(e, t, n = Date.now()) {
	let r = new Date(e).getTime();
	return Number.isNaN(r) ? 0 : Math.max(0, Math.floor((n + t - r) / 1e3));
}
function v(e) {
	return e >= 600 ? "late" : e >= 300 ? "warn" : "ok";
}
function y(e) {
	let t = Math.max(0, Math.floor(e)), n = Math.floor(t / 3600), r = Math.floor(t % 3600 / 60), i = t % 60, a = String(r).padStart(n > 0 ? 2 : 1, "0"), o = String(i).padStart(2, "0");
	return n > 0 ? `${n}:${a}:${o}` : `${a}:${o}`;
}
function b(e) {
	return {
		inWork: e.filter((e) => e.prep_status === "new"),
		pickup: e.filter((e) => e.prep_status === "ready")
	};
}
function x(e) {
	return e.kind === "round";
}
function S(e) {
	return x(e) ? e.table_name || e.title || "" : e.order_no == null ? e.receipt_number : String(e.order_no);
}
function C(e) {
	return !x(e) || e.round_seq == null ? null : `раунд ${e.round_seq}`;
}
function w(e) {
	return `${e.kind ?? "sale"}-${e.id}`;
}
function T(e, t, n, r) {
	let i = w(t);
	return n === "served" ? e.filter((e) => w(e) !== i) : e.map((e) => w(e) === i ? {
		...e,
		prep_status: "ready",
		ready_at: e.ready_at ?? r
	} : e);
}
function E(e) {
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
function D(e, t) {
	let n = e?.response?.data?.error;
	return typeof n == "string" && n.trim() ? n : t;
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/kitchenApi.ts
function O() {
	return r("get", "/kitchen/orders");
}
function k(e, t) {
	let n = e.kind === "round" ? `/kitchen/rounds/${e.id}/prep` : `/sales/${e.id}/prep`;
	return r("patch", n, { prep_status: t });
}
function A(e, t) {
	return r("post", `/kitchen/stop-list/${e}`, { stop_listed: t });
}
function j() {
	return r("get", "/catalog");
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/useKitchenOrders.ts
var M = 5e3;
function N(e) {
	let [t, n] = l([]), [r, i] = l(0), [s, u] = l(!0), [d, f] = l(null), [p, m] = l(null), h = c(!0);
	o(() => (h.current = !0, () => {
		h.current = !1;
	}), []);
	let _ = a(async () => {
		try {
			let e = await O();
			if (!h.current) return;
			n(e.orders), i(g(e.now)), f(null);
		} catch (e) {
			h.current && f(D(e, "Не вдалося прочитати замовлення"));
		} finally {
			h.current && u(!1);
		}
	}, []);
	o(() => {
		if (!e) return;
		_();
		let t = setInterval(() => {
			typeof document < "u" && document.visibilityState !== "visible" || _();
		}, M);
		return () => clearInterval(t);
	}, [e, _]);
	let v = a(async (e, t) => {
		n((n) => T(n, e, t, (/* @__PURE__ */ new Date()).toISOString()));
		try {
			await k(e, t), h.current && m(null);
		} catch (e) {
			h.current && m(D(e, "Не вдалося оновити замовлення"));
		} finally {
			await _();
		}
	}, [_]);
	return {
		orders: t,
		offset: r,
		loading: s,
		error: d,
		banner: p,
		refresh: _,
		markReady: a((e) => v(e, "ready"), [v]),
		markServed: a((e) => v(e, "served"), [v]),
		clearBanner: a(() => m(null), [])
	};
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/OrdersTab.tsx
var P = {
	kitchen: "кухня",
	bar: "бар"
}, F = {
	ok: "text-sq-secondary",
	warn: "text-amber-600",
	late: "text-red-600"
};
function I() {
	let { orders: e, offset: t, loading: n, error: r, banner: i, markReady: a, markServed: c, clearBanner: l } = N(!0), [, f] = s((e) => e + 1, 0);
	o(() => {
		let e = setInterval(f, 1e3);
		return () => clearInterval(e);
	}, []);
	let { inWork: p, pickup: m } = b(e);
	return /* @__PURE__ */ d("div", {
		className: "flex-1 min-h-0 overflow-auto p-3 space-y-3",
		children: [
			r && /* @__PURE__ */ u("p", {
				className: "text-sm text-red-600",
				"data-testid": "kitchen-error",
				children: r
			}),
			i && /* @__PURE__ */ d("div", {
				className: "flex items-center justify-between gap-3 rounded-sq bg-amber-50 text-amber-800 px-3 py-2 text-sm",
				"data-testid": "kitchen-banner",
				children: [/* @__PURE__ */ u("span", { children: i }), /* @__PURE__ */ u("button", {
					type: "button",
					className: "min-h-11 px-2 font-semibold",
					onClick: l,
					"aria-label": "Закрити",
					children: "×"
				})]
			}),
			n && e.length === 0 && /* @__PURE__ */ u("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			/* @__PURE__ */ d("div", {
				className: "grid gap-3 md:grid-cols-2",
				children: [/* @__PURE__ */ u(L, {
					title: "В роботі",
					testId: "kitchen-in-work",
					empty: "Замовлень немає",
					children: p.map((e) => /* @__PURE__ */ u(R, {
						order: e,
						since: e.created_at,
						offset: t,
						action: "Готово",
						actionTestId: `kitchen-ready-${w(e)}`,
						onAction: () => void a(e)
					}, w(e)))
				}), /* @__PURE__ */ u(L, {
					title: "Видача",
					testId: "kitchen-pickup",
					empty: "Нічого не чекає видачі",
					children: m.map((e) => /* @__PURE__ */ u(R, {
						order: e,
						since: e.ready_at ?? e.created_at,
						offset: t,
						action: "Видано",
						actionTestId: `kitchen-served-${w(e)}`,
						onAction: () => void c(e)
					}, w(e)))
				})]
			})
		]
	});
}
function L({ title: e, testId: t, empty: n, children: r }) {
	return /* @__PURE__ */ d("section", {
		className: "space-y-2",
		"data-testid": t,
		children: [/* @__PURE__ */ u("h2", {
			className: "text-sm font-semibold text-sq-secondary uppercase tracking-wide px-1",
			children: e
		}), r.length === 0 ? /* @__PURE__ */ u("p", {
			className: "rounded-sq border border-dashed border-sq-divider p-6 text-center text-sm text-sq-muted",
			children: n
		}) : r]
	});
}
function R({ order: e, since: t, offset: n, action: r, actionTestId: i, onAction: a }) {
	let o = _(t, n), s = /* @__PURE__ */ new Set();
	for (let t of e.items) for (let e of t.stations) s.add(e);
	return /* @__PURE__ */ d("article", {
		className: "rounded-sq border border-sq-divider bg-white p-3 space-y-2 shadow-sm",
		"data-testid": `kitchen-order-${w(e)}`,
		children: [
			/* @__PURE__ */ d("div", {
				className: "flex items-baseline justify-between gap-3",
				children: [/* @__PURE__ */ d("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ u("p", {
						className: `font-bold leading-none ${x(e) ? "text-4xl break-words" : "text-6xl tabular-nums"}`,
						"data-testid": "kitchen-order-no",
						children: S(e)
					}), C(e) && /* @__PURE__ */ u("p", {
						className: "text-sm text-sq-secondary mt-1",
						"data-testid": "kitchen-order-round",
						children: C(e)
					})]
				}), /* @__PURE__ */ d("div", {
					className: "text-right",
					children: [/* @__PURE__ */ u("p", {
						className: `text-xl font-semibold tabular-nums ${F[v(o)]}`,
						"data-testid": "kitchen-wait",
						children: y(o)
					}), /* @__PURE__ */ u("p", {
						className: "text-xs text-sq-secondary",
						children: e.staff_name
					})]
				})]
			}),
			s.size > 0 && /* @__PURE__ */ u("div", {
				className: "flex gap-1.5",
				children: [...s].map((e) => /* @__PURE__ */ u("span", {
					className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-sq-bg text-sq-secondary",
					children: P[e]
				}, e))
			}),
			/* @__PURE__ */ u("ul", {
				className: "space-y-1.5",
				children: e.items.map((e) => /* @__PURE__ */ d("li", {
					className: "text-base leading-snug",
					children: [
						/* @__PURE__ */ d("span", {
							className: "font-semibold tabular-nums",
							children: [e.quantity, " ×"]
						}),
						" ",
						/* @__PURE__ */ u("span", {
							className: "font-medium",
							children: e.product_name
						}),
						e.variant_label && /* @__PURE__ */ d("span", {
							className: "text-sq-secondary",
							children: [" ", e.variant_label]
						}),
						e.note && /* @__PURE__ */ d("p", {
							className: "ml-6 text-sm italic text-sq-text",
							children: ["✎ ", e.note]
						})
					]
				}, e.id))
			}),
			e.note && /* @__PURE__ */ d("p", {
				className: "text-sm italic text-sq-secondary",
				children: ["Замовлення: ", e.note]
			}),
			/* @__PURE__ */ u("button", {
				type: "button",
				onClick: a,
				className: "sq-btn-primary w-full min-h-14 text-lg",
				"data-testid": i,
				children: r
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-cafe/kitchen/StopListTab.tsx
function z() {
	let [e, n] = l(null), [r, i] = l(null), [s, c] = l(null), p = a(async () => {
		try {
			n(E(await j())), i(null);
		} catch (e) {
			i(D(e, "Не вдалося прочитати меню")), n([]);
		}
	}, []);
	o(() => {
		p();
	}, [p]);
	async function m(e) {
		c(e.product_id);
		try {
			let r = await A(e.product_id, !e.stop_listed);
			n((t) => (t ?? []).map((t) => t.product_id === e.product_id ? {
				...t,
				stop_listed: r.stop_listed
			} : t)), i(null), await t();
		} catch (e) {
			i(D(e, "Не вдалося змінити стоп-лист"));
		} finally {
			c(null);
		}
	}
	return /* @__PURE__ */ d("div", {
		className: "flex-1 min-h-0 overflow-auto p-3 space-y-3",
		"data-testid": "kitchen-stop-list",
		children: [
			/* @__PURE__ */ u("p", {
				className: "text-sm text-sq-secondary",
				children: "Чого сьогодні не робимо. Знімається само опівночі; плитка на касі сіріє з підписом «стоп»."
			}),
			r && /* @__PURE__ */ u("p", {
				className: "text-sm text-red-600",
				"data-testid": "stop-list-error",
				children: r
			}),
			e === null && /* @__PURE__ */ u("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			e !== null && e.length === 0 && /* @__PURE__ */ u("p", {
				className: "rounded-sq border border-dashed border-sq-divider p-6 text-center text-sm text-sq-muted",
				children: "Меню порожнє"
			}),
			/* @__PURE__ */ u("ul", {
				className: "divide-y divide-sq-divider rounded-sq border border-sq-divider bg-white",
				children: (e ?? []).map((e) => {
					let t = f(e.image_url);
					return /* @__PURE__ */ d("li", {
						className: "flex items-center gap-3 px-3 py-2",
						"data-testid": `stop-list-${e.product_id}`,
						children: [
							/* @__PURE__ */ u("div", {
								className: "w-10 h-10 rounded-sq bg-sq-empty overflow-hidden shrink-0",
								children: t && /* @__PURE__ */ u("img", {
									src: t,
									alt: "",
									className: "w-full h-full object-cover"
								})
							}),
							/* @__PURE__ */ d("div", {
								className: "flex-1 min-w-0",
								children: [/* @__PURE__ */ u("p", {
									className: `font-medium truncate ${e.stop_listed ? "text-sq-muted line-through" : ""}`,
									children: e.name
								}), e.stock <= 0 && /* @__PURE__ */ u("p", {
									className: "text-xs text-sq-secondary",
									children: "немає — закінчилось"
								})]
							}),
							/* @__PURE__ */ u("button", {
								type: "button",
								role: "switch",
								"aria-checked": e.stop_listed,
								"aria-label": `Стоп-лист: ${e.name}`,
								disabled: s === e.product_id,
								onClick: () => void m(e),
								"data-testid": `stop-list-toggle-${e.product_id}`,
								className: `min-h-12 min-w-24 rounded-full px-3 text-sm font-semibold border ${e.stop_listed ? "border-red-600 bg-red-600 text-white" : "border-sq-divider bg-white text-sq-text"}`,
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
function B() {
	let e = n();
	if (e.length > 0) throw new i(e);
	return /* @__PURE__ */ u(V, {});
}
function V() {
	let e = m(), t = p((e) => e.online), [n, r] = l("orders");
	return e.id === "cafe" ? /* @__PURE__ */ d("div", {
		className: "flex flex-col h-full min-h-0 text-sq-text",
		"data-testid": "kitchen-board",
		children: [/* @__PURE__ */ d("div", {
			className: "flex items-center gap-2 px-3 pt-3 pb-2 border-b border-sq-divider shrink-0",
			children: [
				/* @__PURE__ */ u("h1", {
					className: "text-lg font-semibold mr-2",
					children: "Кухня"
				}),
				/* @__PURE__ */ u(H, {
					active: n === "orders",
					onClick: () => r("orders"),
					testId: "kitchen-tab-orders",
					children: "Замовлення"
				}),
				/* @__PURE__ */ u(H, {
					active: n === "stop",
					onClick: () => r("stop"),
					testId: "kitchen-tab-stop",
					children: "Стоп-лист"
				})
			]
		}), t ? u(n === "orders" ? I : z, {}) : /* @__PURE__ */ d("div", {
			className: "m-4 rounded-sq border border-dashed border-sq-divider p-8 text-center",
			"data-testid": "kitchen-offline",
			children: [
				/* @__PURE__ */ u(h, {
					size: 28,
					className: "mx-auto text-sq-muted"
				}),
				/* @__PURE__ */ u("p", {
					className: "mt-3 text-sm font-medium",
					children: "Потрібна мережа"
				}),
				/* @__PURE__ */ u("p", {
					className: "mt-1 text-xs text-sq-secondary",
					children: "Замовлення живуть на сервері. Дошка оновиться, щойно звʼязок повернеться."
				})
			]
		})]
	}) : /* @__PURE__ */ d("div", {
		className: "p-4",
		children: [/* @__PURE__ */ u("h1", {
			className: "text-lg font-semibold text-sq-text",
			children: "Кухня"
		}), /* @__PURE__ */ u("p", {
			className: "mt-2 text-sm text-amber-700",
			children: "Магазин зараз не на вертикалі кафе. Тип магазину змінює адміністратор платформи."
		})]
	});
}
function H({ active: e, onClick: t, testId: n, children: r }) {
	return /* @__PURE__ */ u("button", {
		type: "button",
		onClick: t,
		"aria-pressed": e,
		"data-testid": n,
		className: `min-h-11 rounded-full px-4 text-sm font-medium border ${e ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-white text-sq-text"}`,
		children: r
	});
}
//#endregion
export { B as default };
