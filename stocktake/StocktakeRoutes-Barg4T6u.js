import { n as e, r as t } from "./sync-CyxwpwU0.js";
import { Suspense as n, lazy as r, useCallback as i, useEffect as a, useRef as o, useState as s } from "react";
import { QuantityUnitToggle as c, cashierApi as l, isOfflinePosEnabled as u, packOf as d, quantityToBase as f, useAuthStore as p, useOfflineStatus as m } from "@pos/platform";
import { Link as h, Route as g, Routes as _, useNavigate as v, useParams as y } from "react-router-dom";
import { Fragment as b, jsx as x, jsxs as S } from "react/jsx-runtime";
//#region src/modules/stocktake/data/repository.ts
function C(e) {
	return [e.product_name, e.label].filter((e) => e && e.trim()).join(" · ");
}
async function w(e) {
	return (await t.sheets.where("storeId").equals(e).toArray()).sort((e, t) => t.createdAt - e.createdAt);
}
function T(e) {
	return t.sheets.get(e);
}
async function E(e) {
	return (await t.lines.where("sheetId").equals(e).toArray()).sort((e, t) => t.updatedAt - e.updatedAt);
}
async function D(e) {
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
async function O(e) {
	let n = await t.sheets.get(e);
	if (!n) throw Error("Лист не знайдено");
	if (n.status !== "counting") throw Error("Лист уже завершено");
	return n;
}
async function ee(e, n, r = 1) {
	await O(e);
	let i = [e, n.variant_id], a = await t.lines.get(i), o = {
		sheetId: e,
		variantId: n.variant_id,
		countedQty: Math.max(0, (a?.countedQty ?? 0) + r),
		label: a?.label ?? C(n),
		barcode: n.barcode ?? a?.barcode ?? null,
		updatedAt: Date.now(),
		unit: n.unit ?? a?.unit,
		packQty: n.pack_qty ?? a?.packQty ?? null,
		packLabel: n.pack_label ?? a?.packLabel ?? ""
	};
	return await t.lines.put(o), o;
}
async function k(e, n, r) {
	await O(e);
	let i = [e, n], a = await t.lines.get(i);
	if (!a) throw Error("Рядок не знайдено");
	await t.lines.put({
		...a,
		countedQty: Math.max(0, Math.floor(r)),
		updatedAt: Date.now()
	});
}
async function te(e, n) {
	await O(e), await t.lines.delete([e, n]);
}
async function A(e) {
	let n = await O(e);
	if (await t.lines.where("sheetId").equals(e).count() === 0) throw Error("Порожній лист — відскануйте хоча б один товар");
	let r = {
		...n,
		status: "queued",
		finishedAt: Date.now()
	};
	return await t.sheets.put(r), r;
}
async function j(e) {
	let n = await t.sheets.get(e);
	if (n) {
		if (n.status === "synced") throw Error("Надісланий лист не видаляється");
		await t.transaction("rw", t.sheets, t.lines, async () => {
			await t.lines.where("sheetId").equals(e).delete(), await t.sheets.delete(e);
		});
	}
}
async function M(e) {
	let t = e.trim();
	if (!t) return null;
	let n = await l.getCatalog({
		barcode: t,
		include_unsellable: !0
	});
	return n.find((e) => e.barcode === t) ?? (n.length === 1 ? n[0] : null);
}
async function N(e) {
	let t = e.trim();
	return t.length < 2 ? [] : (await l.getCatalog({
		q: t,
		include_unsellable: !0
	})).slice(0, 20);
}
//#endregion
//#region src/modules/stocktake/components/SheetStatusBadge.tsx
var P = {
	counting: "Рахую",
	queued: "В черзі",
	error: "Помилка, повторю",
	synced: "Надіслано",
	dead: "Відхилено"
}, F = {
	counting: "bg-sq-blue/10 text-sq-blue",
	queued: "bg-amber-100 text-amber-800",
	error: "bg-amber-100 text-amber-800",
	synced: "bg-emerald-100 text-emerald-800",
	dead: "bg-red-100 text-red-800"
};
function I({ sheet: e }) {
	let t = e.status === "synced" && e.serverDocNumber ? `${P.synced} · ${e.serverDocNumber}` : P[e.status];
	return /* @__PURE__ */ x("span", {
		className: `rounded-sq px-2 py-0.5 text-xs font-medium ${F[e.status]}`,
		children: t
	});
}
//#endregion
//#region src/modules/stocktake/pages/StocktakePage.tsx
function L(e) {
	return new Date(e).toLocaleString("uk-UA", {
		dateStyle: "short",
		timeStyle: "short"
	});
}
function R() {
	let e = p((e) => e.auth), n = m((e) => e.online), r = v(), [o, c] = s([]), [l, d] = s({}), [f, h] = s(null), g = e?.store.id ?? null, _ = i(async () => {
		if (g == null) return;
		let e = await w(g), n = {};
		await Promise.all(e.map(async (e) => {
			n[e.id] = await t.lines.where("sheetId").equals(e.id).count();
		})), c(e), d(n);
	}, [g]);
	a(() => {
		_();
		let e = window.setInterval(() => void _(), 3e3);
		return () => window.clearInterval(e);
	}, [_]);
	async function y() {
		if (e) {
			h(null);
			try {
				let t = await D({
					storeId: e.store.id,
					staffId: e.staff.id
				});
				r(`/stocktake/${t.id}`);
			} catch (e) {
				h(e instanceof Error ? e.message : "Помилка");
			}
		}
	}
	async function b(e) {
		h(null);
		try {
			await j(e.id), await _();
		} catch (e) {
			h(e instanceof Error ? e.message : "Помилка");
		}
	}
	return /* @__PURE__ */ S("div", {
		className: "mx-auto max-w-2xl px-4 py-4",
		children: [
			/* @__PURE__ */ S("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ x("h1", {
					className: "text-lg font-semibold text-sq-text",
					children: "Інвентаризація"
				}), /* @__PURE__ */ x("button", {
					type: "button",
					className: "sq-btn-primary px-4 py-2",
					onClick: y,
					children: "Новий підрахунок"
				})]
			}),
			/* @__PURE__ */ S("p", {
				className: "mt-1 text-sm text-sq-secondary",
				children: ["Порахуйте товар сканером; завершений лист стане чернеткою інвентаризації, яку проведе власник.", u() && !n && " Зараз офлайн — листи відправляться, щойно з’явиться мережа."]
			}),
			f && /* @__PURE__ */ x("p", {
				className: "mt-3 text-sm text-red-600",
				children: f
			}),
			/* @__PURE__ */ S("ul", {
				className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
				children: [o.length === 0 && /* @__PURE__ */ x("li", {
					className: "px-4 py-6 text-center text-sm text-sq-secondary",
					children: "Ще немає жодного листа."
				}), o.map((e) => /* @__PURE__ */ S("li", {
					className: "flex items-center gap-3 px-4 py-3",
					children: [/* @__PURE__ */ S("button", {
						type: "button",
						className: "min-w-0 flex-1 text-left",
						onClick: () => r(`/stocktake/${e.id}`),
						children: [/* @__PURE__ */ S("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ x(I, { sheet: e }), /* @__PURE__ */ x("span", {
								className: "text-sm text-sq-secondary",
								children: L(e.createdAt)
							})]
						}), /* @__PURE__ */ S("div", {
							className: "mt-1 text-sm text-sq-text",
							children: [
								"Рядків: ",
								l[e.id] ?? 0,
								e.lastError && e.status !== "synced" && /* @__PURE__ */ x("span", {
									className: "ml-2 text-xs text-red-600",
									children: e.lastError
								})
							]
						})]
					}), e.status !== "synced" && /* @__PURE__ */ x("button", {
						type: "button",
						className: "px-2 py-1 text-xs text-sq-secondary hover:text-red-600",
						onClick: () => b(e),
						children: "Видалити"
					})]
				}, e.id))]
			})
		]
	});
}
//#endregion
//#region src/modules/stocktake/pages/CountSheetPage.tsx
var z = r(() => import("./ui-DDyd6b-m.js").then((e) => ({ default: e.BarcodeScanner })));
function B() {
	let { id: t = "" } = y(), r = m((e) => e.online), [l, p] = s(void 0), [g, _] = s([]), [v, w] = s(""), [D, O] = s(""), [j, P] = s([]), [F, L] = s(!1), [R, B] = s(null), [V, H] = s(null), [U, W] = s(!1), [G, ne] = s({}), K = o(null), q = i(async () => {
		let [e, n] = await Promise.all([T(t), E(t)]);
		p(e ?? null), _(n);
	}, [t]);
	a(() => {
		q();
	}, [q]), a(() => {
		if (!l || l.status === "counting" || l.status === "synced" || l.status === "dead") return;
		let e = window.setInterval(() => void q(), 3e3);
		return () => window.clearInterval(e);
	}, [l, q]), a(() => {
		let e = D.trim();
		if (e.length < 2) {
			P([]);
			return;
		}
		let t = window.setTimeout(() => {
			N(e).then(P).catch(() => P([]));
		}, 300);
		return () => window.clearTimeout(t);
	}, [D]);
	let J = l?.status === "counting", Y = (e) => G[e] ?? "base", X = (e) => d({
		pack_qty: e.packQty,
		pack_label: e.packLabel
	});
	async function Z(e, n = 1) {
		H(null);
		try {
			await ee(t, e, n), await q();
		} catch (e) {
			H(e instanceof Error ? e.message : "Помилка");
		}
	}
	async function Q(e) {
		let t = e.trim();
		if (t) {
			w(""), B(null);
			try {
				let e = await M(t);
				if (!e) {
					B(`Штрихкод ${t} не знайдено в каталозі`);
					return;
				}
				await Z(e), B(`+1 · ${e.product_name}`);
			} catch (e) {
				H(e instanceof Error ? e.message : "Помилка");
			} finally {
				K.current?.focus();
			}
		}
	}
	async function $(e, n) {
		H(null);
		try {
			let r = X(e), i = Y(e.variantId) === "pack" && r ? n * r.qty : n;
			await k(t, e.variantId, e.countedQty + i), await q();
		} catch (e) {
			H(e instanceof Error ? e.message : "Помилка");
		}
	}
	async function re(e, n) {
		let r = Number(n);
		if (!Number.isFinite(r)) return;
		let i = f(r, Y(e.variantId), X(e));
		await k(t, e.variantId, i).catch(() => void 0), await q();
	}
	async function ie() {
		W(!0), H(null);
		try {
			await A(t), await e(), await q();
		} catch (e) {
			H(e instanceof Error ? e.message : "Помилка");
		} finally {
			W(!1);
		}
	}
	if (l === void 0) return /* @__PURE__ */ x("div", {
		className: "px-4 py-6 text-sm text-sq-secondary",
		children: "Завантаження…"
	});
	if (l === null) return /* @__PURE__ */ S("div", {
		className: "px-4 py-6 text-sm text-sq-secondary",
		children: ["Лист не знайдено. ", /* @__PURE__ */ x(h, {
			to: "/stocktake",
			className: "underline",
			children: "До списку"
		})]
	});
	let ae = g.reduce((e, t) => e + t.countedQty, 0);
	return /* @__PURE__ */ S("div", {
		className: "mx-auto max-w-2xl px-4 py-4",
		children: [
			/* @__PURE__ */ S("div", {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ S("div", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ x(h, {
						to: "/stocktake",
						className: "text-sm text-sq-secondary hover:text-sq-text",
						children: "← Листи"
					}), /* @__PURE__ */ x(I, { sheet: l })]
				}), /* @__PURE__ */ S("span", {
					className: "text-sm text-sq-secondary",
					children: [
						g.length,
						" поз. · ",
						ae,
						" шт."
					]
				})]
			}),
			l.status === "synced" && /* @__PURE__ */ S("p", {
				className: "mt-3 rounded-sq bg-emerald-50 px-3 py-2 text-sm text-emerald-800",
				children: [
					"Надіслано як чернетку інвентаризації ",
					l.serverDocNumber ?? "",
					". Провести її може власник у розділі «Склад»."
				]
			}),
			(l.status === "queued" || l.status === "error") && /* @__PURE__ */ S("p", {
				className: "mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-800",
				children: [u() && !r ? "Офлайн. Лист у черзі — відправиться автоматично, щойно з’явиться мережа." : "Лист у черзі на відправлення.", l.lastError && ` (${l.lastError})`]
			}),
			l.status === "dead" && /* @__PURE__ */ S("p", {
				className: "mt-3 rounded-sq bg-red-50 px-3 py-2 text-sm text-red-800",
				children: [
					"Сервер відхилив лист: ",
					l.lastError ?? "невідома помилка",
					". Видаліть його і порахуйте знову."
				]
			}),
			V && /* @__PURE__ */ x("p", {
				className: "mt-3 text-sm text-red-600",
				children: V
			}),
			J && /* @__PURE__ */ S("div", {
				className: "mt-4 space-y-3",
				children: [
					/* @__PURE__ */ S("form", {
						className: "flex gap-2",
						onSubmit: (e) => {
							e.preventDefault(), Q(v);
						},
						children: [
							/* @__PURE__ */ x("input", {
								ref: K,
								autoFocus: !0,
								value: v,
								onChange: (e) => w(e.target.value),
								placeholder: "Скануйте штрихкод або введіть його",
								inputMode: "numeric",
								"aria-label": "Штрихкод",
								className: "min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
							}),
							/* @__PURE__ */ x("button", {
								type: "submit",
								className: "sq-btn-primary px-3 py-2",
								children: "+1"
							}),
							/* @__PURE__ */ x("button", {
								type: "button",
								className: "rounded-sq border border-sq-divider px-3 py-2 text-sm text-sq-secondary",
								onClick: () => L((e) => !e),
								children: F ? "Закрити камеру" : "Камера"
							})
						]
					}),
					F && /* @__PURE__ */ x(n, {
						fallback: /* @__PURE__ */ x("p", {
							className: "text-sm text-sq-secondary",
							children: "Вмикаю камеру…"
						}),
						children: /* @__PURE__ */ x(z, {
							onScan: (e) => void Q(e),
							onClose: () => L(!1)
						})
					}),
					R && /* @__PURE__ */ x("p", {
						className: "text-sm text-sq-secondary",
						children: R
					}),
					/* @__PURE__ */ x("input", {
						value: D,
						onChange: (e) => O(e.target.value),
						placeholder: "Або знайдіть за назвою / артикулом",
						"aria-label": "Пошук товару",
						className: "w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
					}),
					j.length > 0 && /* @__PURE__ */ x("ul", {
						className: "divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
						children: j.map((e) => /* @__PURE__ */ x("li", { children: /* @__PURE__ */ S("button", {
							type: "button",
							className: "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
							onClick: () => {
								Z(e), O("");
							},
							children: [/* @__PURE__ */ x("span", {
								className: "text-sq-text",
								children: C(e)
							}), /* @__PURE__ */ x("span", {
								className: "text-sq-secondary",
								children: "+1"
							})]
						}) }, e.variant_id))
					})
				]
			}),
			/* @__PURE__ */ S("ul", {
				className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface",
				children: [g.length === 0 && /* @__PURE__ */ x("li", {
					className: "px-4 py-6 text-center text-sm text-sq-secondary",
					children: J ? "Відскануйте перший товар." : "Порожній лист."
				}), g.map((e) => {
					let n = X(e), r = Y(e.variantId), i = r === "pack" && n ? Math.round(e.countedQty / n.qty * 1e4) / 1e4 : e.countedQty;
					return /* @__PURE__ */ S("li", {
						className: "px-3 py-2",
						children: [/* @__PURE__ */ S("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ S("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ x("div", {
									className: "truncate text-sm text-sq-text",
									children: e.label
								}), e.barcode && /* @__PURE__ */ x("div", {
									className: "text-xs text-sq-secondary",
									children: e.barcode
								})]
							}), J ? /* @__PURE__ */ S(b, { children: [
								/* @__PURE__ */ x("button", {
									type: "button",
									"aria-label": "Менше",
									className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
									onClick: () => $(e, -1),
									children: "−"
								}),
								/* @__PURE__ */ x("input", {
									type: "number",
									min: 0,
									step: "any",
									value: i,
									"aria-label": `Кількість: ${e.label}`,
									onChange: (t) => void re(e, t.target.value),
									className: "h-9 w-16 rounded-sq border border-sq-divider bg-sq-bg text-center text-sm text-sq-text"
								}),
								/* @__PURE__ */ x("button", {
									type: "button",
									"aria-label": "Більше",
									className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
									onClick: () => $(e, 1),
									children: "+"
								}),
								/* @__PURE__ */ x("button", {
									type: "button",
									"aria-label": "Прибрати",
									className: "px-2 text-xs text-sq-secondary hover:text-red-600",
									onClick: () => void te(t, e.variantId).then(q),
									children: "✕"
								})
							] }) : /* @__PURE__ */ x("span", {
								className: "w-16 text-right text-sm font-medium text-sq-text",
								children: e.countedQty
							})]
						}), J && /* @__PURE__ */ x(c, {
							className: "mt-1 w-40 ml-auto",
							pack: n,
							unit: e.unit ?? "",
							mode: r,
							value: i,
							onModeChange: (t) => ne((n) => ({
								...n,
								[e.variantId]: t
							}))
						})]
					}, e.variantId);
				})]
			}),
			J && /* @__PURE__ */ x("button", {
				type: "button",
				disabled: U || g.length === 0,
				className: "sq-btn-primary mt-4 w-full py-3 disabled:opacity-50",
				onClick: ie,
				children: U ? "Відправляю…" : "Завершити і відправити"
			})
		]
	});
}
//#endregion
//#region src/modules/stocktake/pages/StocktakeRoutes.tsx
function V() {
	return /* @__PURE__ */ S(_, { children: [/* @__PURE__ */ x(g, {
		index: !0,
		element: /* @__PURE__ */ x(R, {})
	}), /* @__PURE__ */ x(g, {
		path: ":id",
		element: /* @__PURE__ */ x(B, {})
	})] });
}
//#endregion
export { V as StocktakeRoutes };
