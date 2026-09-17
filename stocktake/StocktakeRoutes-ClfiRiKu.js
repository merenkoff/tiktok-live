import { n as e, r as t } from "./sync-CyxwpwU0.js";
import { Suspense as n, lazy as r, useCallback as i, useEffect as a, useRef as o, useState as s } from "react";
import { cashierApi as c, isOfflinePosEnabled as l, useAuthStore as u, useOfflineStatus as d } from "@pos/platform";
import { Link as f, Route as p, Routes as m, useNavigate as h, useParams as g } from "react-router-dom";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
//#region src/modules/stocktake/data/repository.ts
function b(e) {
	return [e.product_name, e.label].filter((e) => e && e.trim()).join(" · ");
}
async function x(e) {
	return (await t.sheets.where("storeId").equals(e).toArray()).sort((e, t) => t.createdAt - e.createdAt);
}
function S(e) {
	return t.sheets.get(e);
}
async function C(e) {
	return (await t.lines.where("sheetId").equals(e).toArray()).sort((e, t) => t.updatedAt - e.updatedAt);
}
async function w(e) {
	let n = {
		id: crypto.randomUUID(),
		storeId: e.storeId,
		staffId: e.staffId,
		status: "counting",
		note: e.note?.trim() || null,
		createdAt: Date.now(),
		attempts: 0
	};
	return await t.sheets.add(n), n;
}
async function T(e) {
	let n = await t.sheets.get(e);
	if (!n) throw Error("Лист не знайдено");
	if (n.status !== "counting") throw Error("Лист уже завершено");
	return n;
}
async function E(e, n, r = 1) {
	await T(e);
	let i = [e, n.variant_id], a = await t.lines.get(i), o = {
		sheetId: e,
		variantId: n.variant_id,
		countedQty: Math.max(0, (a?.countedQty ?? 0) + r),
		label: a?.label ?? b(n),
		barcode: n.barcode ?? a?.barcode ?? null,
		updatedAt: Date.now()
	};
	return await t.lines.put(o), o;
}
async function D(e, n, r) {
	await T(e);
	let i = [e, n], a = await t.lines.get(i);
	if (!a) throw Error("Рядок не знайдено");
	await t.lines.put({
		...a,
		countedQty: Math.max(0, Math.floor(r)),
		updatedAt: Date.now()
	});
}
async function O(e, n) {
	await T(e), await t.lines.delete([e, n]);
}
async function k(e) {
	let n = await T(e);
	if (await t.lines.where("sheetId").equals(e).count() === 0) throw Error("Порожній лист — відскануйте хоча б один товар");
	let r = {
		...n,
		status: "queued",
		finishedAt: Date.now()
	};
	return await t.sheets.put(r), r;
}
async function A(e) {
	let n = await t.sheets.get(e);
	if (n) {
		if (n.status === "synced") throw Error("Надісланий лист не видаляється");
		await t.transaction("rw", t.sheets, t.lines, async () => {
			await t.lines.where("sheetId").equals(e).delete(), await t.sheets.delete(e);
		});
	}
}
async function j(e) {
	let t = e.trim();
	if (!t) return null;
	let n = await c.getCatalog({ barcode: t });
	return n.find((e) => e.barcode === t) ?? (n.length === 1 ? n[0] : null);
}
async function M(e) {
	let t = e.trim();
	return t.length < 2 ? [] : (await c.getCatalog({ q: t })).slice(0, 20);
}
//#endregion
//#region src/modules/stocktake/components/SheetStatusBadge.tsx
var N = {
	counting: "Рахую",
	queued: "В черзі",
	error: "Помилка, повторю",
	synced: "Надіслано",
	dead: "Відхилено"
}, P = {
	counting: "bg-sq-blue/10 text-sq-blue",
	queued: "bg-amber-100 text-amber-800",
	error: "bg-amber-100 text-amber-800",
	synced: "bg-emerald-100 text-emerald-800",
	dead: "bg-red-100 text-red-800"
};
function F({ sheet: e }) {
	let t = e.status === "synced" && e.serverDocNumber ? `${N.synced} · ${e.serverDocNumber}` : N[e.status];
	return /* @__PURE__ */ v("span", {
		className: `rounded-sq px-2 py-0.5 text-xs font-medium ${P[e.status]}`,
		children: t
	});
}
//#endregion
//#region src/modules/stocktake/pages/StocktakePage.tsx
function I(e) {
	return new Date(e).toLocaleString("uk-UA", {
		dateStyle: "short",
		timeStyle: "short"
	});
}
function L() {
	let e = u((e) => e.auth), n = d((e) => e.online), r = h(), [o, c] = s([]), [f, p] = s({}), [m, g] = s(null), _ = e?.store.id ?? null, b = i(async () => {
		if (_ == null) return;
		let e = await x(_), n = {};
		await Promise.all(e.map(async (e) => {
			n[e.id] = await t.lines.where("sheetId").equals(e.id).count();
		})), c(e), p(n);
	}, [_]);
	a(() => {
		b();
		let e = window.setInterval(() => void b(), 3e3);
		return () => window.clearInterval(e);
	}, [b]);
	async function S() {
		if (e) {
			g(null);
			try {
				let t = await w({
					storeId: e.store.id,
					staffId: e.staff.id
				});
				r(`/stocktake/${t.id}`);
			} catch (e) {
				g(e instanceof Error ? e.message : "Помилка");
			}
		}
	}
	async function C(e) {
		g(null);
		try {
			await A(e.id), await b();
		} catch (e) {
			g(e instanceof Error ? e.message : "Помилка");
		}
	}
	return /* @__PURE__ */ y("div", {
		className: "mx-auto max-w-2xl px-4 py-4",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ v("h1", {
					className: "text-lg font-semibold text-sq-text",
					children: "Інвентаризація"
				}), /* @__PURE__ */ v("button", {
					type: "button",
					className: "sq-btn-primary px-4 py-2",
					onClick: S,
					children: "Новий підрахунок"
				})]
			}),
			/* @__PURE__ */ y("p", {
				className: "mt-1 text-sm text-sq-secondary",
				children: ["Порахуйте товар сканером; завершений лист стане чернеткою інвентаризації, яку проведе власник.", l() && !n && " Зараз офлайн — листи відправляться, щойно з’явиться мережа."]
			}),
			m && /* @__PURE__ */ v("p", {
				className: "mt-3 text-sm text-red-600",
				children: m
			}),
			/* @__PURE__ */ y("ul", {
				className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
				children: [o.length === 0 && /* @__PURE__ */ v("li", {
					className: "px-4 py-6 text-center text-sm text-sq-secondary",
					children: "Ще немає жодного листа."
				}), o.map((e) => /* @__PURE__ */ y("li", {
					className: "flex items-center gap-3 px-4 py-3",
					children: [/* @__PURE__ */ y("button", {
						type: "button",
						className: "min-w-0 flex-1 text-left",
						onClick: () => r(`/stocktake/${e.id}`),
						children: [/* @__PURE__ */ y("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ v(F, { sheet: e }), /* @__PURE__ */ v("span", {
								className: "text-sm text-sq-secondary",
								children: I(e.createdAt)
							})]
						}), /* @__PURE__ */ y("div", {
							className: "mt-1 text-sm text-sq-text",
							children: [
								"Рядків: ",
								f[e.id] ?? 0,
								e.lastError && e.status !== "synced" && /* @__PURE__ */ v("span", {
									className: "ml-2 text-xs text-red-600",
									children: e.lastError
								})
							]
						})]
					}), e.status !== "synced" && /* @__PURE__ */ v("button", {
						type: "button",
						className: "px-2 py-1 text-xs text-sq-secondary hover:text-red-600",
						onClick: () => C(e),
						children: "Видалити"
					})]
				}, e.id))]
			})
		]
	});
}
//#endregion
//#region src/modules/stocktake/pages/CountSheetPage.tsx
var R = r(() => import("./ui-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function z() {
	let { id: t = "" } = g(), r = d((e) => e.online), [c, u] = s(void 0), [p, m] = s([]), [h, x] = s(""), [w, T] = s(""), [A, N] = s([]), [P, I] = s(!1), [L, z] = s(null), [B, V] = s(null), [H, U] = s(!1), W = o(null), G = i(async () => {
		let [e, n] = await Promise.all([S(t), C(t)]);
		u(e ?? null), m(n);
	}, [t]);
	a(() => {
		G();
	}, [G]), a(() => {
		if (!c || c.status === "counting" || c.status === "synced" || c.status === "dead") return;
		let e = window.setInterval(() => void G(), 3e3);
		return () => window.clearInterval(e);
	}, [c, G]), a(() => {
		let e = w.trim();
		if (e.length < 2) {
			N([]);
			return;
		}
		let t = window.setTimeout(() => {
			M(e).then(N).catch(() => N([]));
		}, 300);
		return () => window.clearTimeout(t);
	}, [w]);
	let K = c?.status === "counting";
	async function q(e, n = 1) {
		V(null);
		try {
			await E(t, e, n), await G();
		} catch (e) {
			V(e instanceof Error ? e.message : "Помилка");
		}
	}
	async function J(e) {
		let t = e.trim();
		if (t) {
			x(""), z(null);
			try {
				let e = await j(t);
				if (!e) {
					z(`Штрихкод ${t} не знайдено в каталозі`);
					return;
				}
				await q(e), z(`+1 · ${e.product_name}`);
			} catch (e) {
				V(e instanceof Error ? e.message : "Помилка");
			} finally {
				W.current?.focus();
			}
		}
	}
	async function Y(e, n) {
		V(null);
		try {
			await D(t, e.variantId, e.countedQty + n), await G();
		} catch (e) {
			V(e instanceof Error ? e.message : "Помилка");
		}
	}
	async function X(e, n) {
		let r = Number(n);
		Number.isFinite(r) && (await D(t, e.variantId, r).catch(() => void 0), await G());
	}
	async function Z() {
		U(!0), V(null);
		try {
			await k(t), await e(), await G();
		} catch (e) {
			V(e instanceof Error ? e.message : "Помилка");
		} finally {
			U(!1);
		}
	}
	if (c === void 0) return /* @__PURE__ */ v("div", {
		className: "px-4 py-6 text-sm text-sq-secondary",
		children: "Завантаження…"
	});
	if (c === null) return /* @__PURE__ */ y("div", {
		className: "px-4 py-6 text-sm text-sq-secondary",
		children: ["Лист не знайдено. ", /* @__PURE__ */ v(f, {
			to: "/stocktake",
			className: "underline",
			children: "До списку"
		})]
	});
	let Q = p.reduce((e, t) => e + t.countedQty, 0);
	return /* @__PURE__ */ y("div", {
		className: "mx-auto max-w-2xl px-4 py-4",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ y("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ v(f, {
						to: "/stocktake",
						className: "text-sm text-sq-secondary hover:text-sq-text",
						children: "← Листи"
					}), /* @__PURE__ */ v(F, { sheet: c })]
				}), /* @__PURE__ */ y("span", {
					className: "text-sm text-sq-secondary",
					children: [
						p.length,
						" поз. · ",
						Q,
						" шт."
					]
				})]
			}),
			c.status === "synced" && /* @__PURE__ */ y("p", {
				className: "mt-3 rounded-sq bg-emerald-50 px-3 py-2 text-sm text-emerald-800",
				children: [
					"Надіслано як чернетку інвентаризації ",
					c.serverDocNumber ?? "",
					". Провести її може власник у розділі «Склад»."
				]
			}),
			(c.status === "queued" || c.status === "error") && /* @__PURE__ */ y("p", {
				className: "mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-800",
				children: [l() && !r ? "Офлайн. Лист у черзі — відправиться автоматично, щойно з’явиться мережа." : "Лист у черзі на відправлення.", c.lastError && ` (${c.lastError})`]
			}),
			c.status === "dead" && /* @__PURE__ */ y("p", {
				className: "mt-3 rounded-sq bg-red-50 px-3 py-2 text-sm text-red-800",
				children: [
					"Сервер відхилив лист: ",
					c.lastError ?? "невідома помилка",
					". Видаліть його і порахуйте знову."
				]
			}),
			B && /* @__PURE__ */ v("p", {
				className: "mt-3 text-sm text-red-600",
				children: B
			}),
			K && /* @__PURE__ */ y("div", {
				className: "mt-4 space-y-3",
				children: [
					/* @__PURE__ */ y("form", {
						className: "flex gap-2",
						onSubmit: (e) => {
							e.preventDefault(), J(h);
						},
						children: [
							/* @__PURE__ */ v("input", {
								ref: W,
								autoFocus: !0,
								value: h,
								onChange: (e) => x(e.target.value),
								placeholder: "Скануйте штрихкод або введіть його",
								inputMode: "numeric",
								"aria-label": "Штрихкод",
								className: "min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
							}),
							/* @__PURE__ */ v("button", {
								type: "submit",
								className: "sq-btn-primary px-3 py-2",
								children: "+1"
							}),
							/* @__PURE__ */ v("button", {
								type: "button",
								className: "rounded-sq border border-sq-divider px-3 py-2 text-sm text-sq-secondary",
								onClick: () => I((e) => !e),
								children: P ? "Закрити камеру" : "Камера"
							})
						]
					}),
					P && /* @__PURE__ */ v(n, {
						fallback: /* @__PURE__ */ v("p", {
							className: "text-sm text-sq-secondary",
							children: "Вмикаю камеру…"
						}),
						children: /* @__PURE__ */ v(R, {
							onScan: (e) => void J(e),
							onClose: () => I(!1)
						})
					}),
					L && /* @__PURE__ */ v("p", {
						className: "text-sm text-sq-secondary",
						children: L
					}),
					/* @__PURE__ */ v("input", {
						value: w,
						onChange: (e) => T(e.target.value),
						placeholder: "Або знайдіть за назвою / артикулом",
						"aria-label": "Пошук товару",
						className: "w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
					}),
					A.length > 0 && /* @__PURE__ */ v("ul", {
						className: "divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
						children: A.map((e) => /* @__PURE__ */ v("li", { children: /* @__PURE__ */ y("button", {
							type: "button",
							className: "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
							onClick: () => {
								q(e), T("");
							},
							children: [/* @__PURE__ */ v("span", {
								className: "text-sq-text",
								children: b(e)
							}), /* @__PURE__ */ v("span", {
								className: "text-sq-secondary",
								children: "+1"
							})]
						}) }, e.variant_id))
					})
				]
			}),
			/* @__PURE__ */ y("ul", {
				className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
				children: [p.length === 0 && /* @__PURE__ */ v("li", {
					className: "px-4 py-6 text-center text-sm text-sq-secondary",
					children: K ? "Відскануйте перший товар." : "Порожній лист."
				}), p.map((e) => /* @__PURE__ */ y("li", {
					className: "flex items-center gap-2 px-3 py-2",
					children: [/* @__PURE__ */ y("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ v("div", {
							className: "truncate text-sm text-sq-text",
							children: e.label
						}), e.barcode && /* @__PURE__ */ v("div", {
							className: "text-xs text-sq-secondary",
							children: e.barcode
						})]
					}), K ? /* @__PURE__ */ y(_, { children: [
						/* @__PURE__ */ v("button", {
							type: "button",
							"aria-label": "Менше",
							className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
							onClick: () => Y(e, -1),
							children: "−"
						}),
						/* @__PURE__ */ v("input", {
							type: "number",
							min: 0,
							value: e.countedQty,
							"aria-label": `Кількість: ${e.label}`,
							onChange: (t) => void X(e, t.target.value),
							className: "h-9 w-16 rounded-sq border border-sq-divider bg-sq-bg text-center text-sm text-sq-text"
						}),
						/* @__PURE__ */ v("button", {
							type: "button",
							"aria-label": "Більше",
							className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
							onClick: () => Y(e, 1),
							children: "+"
						}),
						/* @__PURE__ */ v("button", {
							type: "button",
							"aria-label": "Прибрати",
							className: "px-2 text-xs text-sq-secondary hover:text-red-600",
							onClick: () => void O(t, e.variantId).then(G),
							children: "✕"
						})
					] }) : /* @__PURE__ */ v("span", {
						className: "w-16 text-right text-sm font-medium text-sq-text",
						children: e.countedQty
					})]
				}, e.variantId))]
			}),
			K && /* @__PURE__ */ v("button", {
				type: "button",
				disabled: H || p.length === 0,
				className: "sq-btn-primary mt-4 w-full py-3 disabled:opacity-50",
				onClick: Z,
				children: H ? "Відправляю…" : "Завершити і відправити"
			})
		]
	});
}
//#endregion
//#region src/modules/stocktake/pages/StocktakeRoutes.tsx
function B() {
	return /* @__PURE__ */ y(m, { children: [/* @__PURE__ */ v(p, {
		index: !0,
		element: /* @__PURE__ */ v(L, {})
	}), /* @__PURE__ */ v(p, {
		path: ":id",
		element: /* @__PURE__ */ v(z, {})
	})] });
}
//#endregion
export { B as StocktakeRoutes };
