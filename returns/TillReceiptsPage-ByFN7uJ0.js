import { i as e, n as t, t as n } from "./FiscalBadge-RJoaOqdy.js";
import { createElement as r, forwardRef as i, useEffect as a, useMemo as o, useRef as s, useState as c } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as l, OfflineRefundError as u, buildRefundReceiptPayload as d, formatUah as f, getMeta as p, printReceipt as m, refundLineAmount as h, useAuthStore as g, usePrintableReceipt as _, useVertical as v } from "@pos/platform";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { Link as S } from "react-router-dom";
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var C = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), w = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), T = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, E = i(({ color: e = "currentColor", size: t = 24, strokeWidth: n = 2, absoluteStrokeWidth: i, className: a = "", children: o, iconNode: s, ...c }, l) => r("svg", {
	ref: l,
	...T,
	width: t,
	height: t,
	stroke: e,
	strokeWidth: i ? Number(n) * 24 / Number(t) : n,
	className: w("lucide", a),
	...c
}, [...s.map(([e, t]) => r(e, t)), ...Array.isArray(o) ? o : [o]])), D = (e, t) => {
	let n = i(({ className: n, ...i }, a) => r(E, {
		ref: a,
		iconNode: t,
		className: w(`lucide-${C(e)}`, n),
		...i
	}));
	return n.displayName = `${e}`, n;
}, O = D("Check", [["path", {
	d: "M20 6 9 17l-5-5",
	key: "1gmf2c"
}]]), k = D("Minus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}]]), A = D("Plus", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}], ["path", {
	d: "M12 5v14",
	key: "s699le"
}]]), j = 6;
function M() {
	let e = s(null);
	return a(() => {
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
			!n.moved && Math.hypot(r, i) > j && (n.moved = !0, t.setPointerCapture(e.pointerId)), n.moved && (t.scrollLeft = n.scrollLeft - r, t.scrollTop = n.scrollTop - i);
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
//#region src/modules/returns/components/RefundSaleDialog.tsx
var N = [
	{
		id: "cash",
		label: "Готівка"
	},
	{
		id: "card",
		label: "Картка"
	},
	{
		id: "qr",
		label: "QR-код"
	}
];
function P(e) {
	return e.quantity - e.refunded_quantity;
}
function F({ sale: t, detail: n, selectAll: r, onClose: i, onRefunded: s }) {
	let v = o(() => (n?.items ?? []).filter((e) => P(e) > 0), [n]), [S, C] = c(() => Object.fromEntries(v.map((e) => [e.id, r ? P(e) : 0]))), [w, T] = c(n?.payments.length === 1 ? n.payments[0].method : "cash"), [E, D] = c(""), [j, M] = c(!1), [F, I] = c(null), [L, R] = c(null), [z, B] = c(!1), [V, H] = c(null), U = g((e) => e.auth), { printToPdf: W, printablePortal: G } = _(), K = v.reduce((e, t) => e + h(t.line_total_cents, t.quantity, t.refunded_quantity, S[t.id] ?? 0), 0), q = v.filter((e) => (S[e.id] ?? 0) > 0), J = v.length > 0 && v.every((e) => (S[e.id] ?? 0) === P(e));
	function Y(e, t, n) {
		C((r) => ({
			...r,
			[e]: Math.max(0, Math.min(n, t))
		}));
	}
	async function X() {
		if (q.length === 0) {
			I("Оберіть, що повертаємо");
			return;
		}
		M(!0), I(null);
		let n = q.map((e) => ({
			sale_item_id: e.id,
			quantity: S[e.id]
		}));
		try {
			let r = await e.refundSale(t, n, {
				method: w,
				reason: E.trim() || void 0
			});
			s(r);
			let a = r.detail, o = a?.refunds[a.refunds.length - 1];
			if (!a || !o) {
				i();
				return;
			}
			R({
				row: r,
				receipt: d(a, o, n, {
					name: U?.store.name ?? "",
					fiscal: U?.store.fiscal ?? null
				}, r.refund_fiscal ?? null),
				fiscal: r.refund_fiscal ?? null
			}), M(!1);
		} catch (e) {
			I(e instanceof u || e instanceof Error ? e.message : "Не вдалося оформити повернення"), M(!1);
		}
	}
	async function Z(e) {
		let [t, n] = await Promise.all([p("receiptPrinterName"), p("receiptPaperWidthMm")]);
		if (!t) {
			W(e);
			return;
		}
		B(!0), H(null);
		try {
			await m(t, e, n === 58 || n === 80 ? n : l), H("Чек повернення надіслано на друк");
		} catch (e) {
			H(`Не вдалося надрукувати: ${typeof e == "string" ? e : String(e)}`);
		} finally {
			B(!1);
		}
	}
	return a(() => {
		L && (U?.store.auto_print_receipt ?? !1) && ((U?.store.fiscal?.enabled ?? !1) && L.fiscal?.status !== "done" || Z(L.receipt));
	}, [L]), L ? /* @__PURE__ */ x("div", {
		className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center",
		children: [
			/* @__PURE__ */ b("button", {
				type: "button",
				className: "absolute inset-0 bg-black/40",
				onClick: i,
				"aria-label": "Закрити"
			}),
			/* @__PURE__ */ x("div", {
				role: "dialog",
				"aria-modal": "true",
				"aria-label": "Повернення оформлено",
				className: "relative w-full max-w-sm bg-white rounded-t-sq sm:rounded-sq p-6 text-center shadow-lg",
				children: [
					/* @__PURE__ */ b("div", {
						className: "mx-auto w-12 h-12 rounded-full bg-sq-blue text-white grid place-items-center",
						children: /* @__PURE__ */ b(O, {
							size: 24,
							strokeWidth: 2.5
						})
					}),
					L.fiscal?.status === "failed" && /* @__PURE__ */ x("div", {
						role: "alert",
						className: "mt-4 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm text-left",
						children: [
							/* @__PURE__ */ b("p", {
								className: "font-semibold",
								children: "Чек повернення не зареєстровано в ПРРО"
							}),
							L.fiscal.message && /* @__PURE__ */ b("p", {
								className: "mt-1",
								children: L.fiscal.message
							}),
							/* @__PURE__ */ b("p", {
								className: "mt-1",
								children: "Реєстрація повториться автоматично."
							})
						]
					}),
					/* @__PURE__ */ b("p", {
						className: "sq-section-label mt-5",
						children: "Повернено"
					}),
					/* @__PURE__ */ b("p", {
						className: "text-3xl font-bold mt-1 text-sq-text",
						children: f(L.receipt.total_cents)
					}),
					/* @__PURE__ */ x("p", {
						className: "text-sm text-sq-secondary mt-1",
						children: [
							L.receipt.receipt_number,
							" · до чека ",
							t.receipt_number
						]
					}),
					/* @__PURE__ */ b("button", {
						type: "button",
						className: "pos-btn-primary mt-6 w-full py-3.5",
						onClick: i,
						children: "Готово"
					}),
					/* @__PURE__ */ b("button", {
						type: "button",
						className: "mt-3 w-full min-h-12 text-sm font-medium text-sq-blue disabled:opacity-50",
						onClick: () => void Z(L.receipt),
						disabled: z,
						children: z ? "Друк…" : "Друкувати чек повернення"
					}),
					V && /* @__PURE__ */ b("p", {
						className: "text-sq-secondary text-sm mt-1",
						children: V
					})
				]
			}),
			G
		]
	}) : /* @__PURE__ */ x("div", {
		className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center",
		children: [/* @__PURE__ */ b("button", {
			type: "button",
			className: "absolute inset-0 bg-black/40",
			onClick: i,
			"aria-label": "Закрити"
		}), /* @__PURE__ */ x("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Повернення",
			className: "relative w-full max-w-md max-h-[92dvh] bg-white rounded-t-sq sm:rounded-sq flex flex-col shadow-lg",
			children: [
				/* @__PURE__ */ x("div", {
					className: "px-5 pt-5 pb-3 shrink-0",
					children: [/* @__PURE__ */ b("p", {
						className: "font-semibold text-sq-text",
						children: J ? "Скасувати чек?" : "Повернення"
					}), /* @__PURE__ */ x("p", {
						className: "text-sm text-sq-secondary mt-0.5",
						children: [
							t.receipt_number,
							" · ",
							f(t.total_cents)
						]
					})]
				}),
				/* @__PURE__ */ x("div", {
					className: "flex-1 overflow-auto px-5 space-y-3 min-h-0",
					children: [
						(U?.store.fiscal?.enabled ?? !1) && (t.fiscal_status ?? "none") !== "done" && /* @__PURE__ */ b("p", {
							className: "rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm",
							children: "Цей продаж не зареєстровано в ПРРО — чек повернення теж не буде зареєстровано."
						}),
						v.length === 0 ? /* @__PURE__ */ b("p", {
							className: "text-sm text-sq-secondary",
							children: n ? "За цим чеком уже все повернуто." : "Позиції чека недоступні — відкрийте чек онлайн."
						}) : v.map((e) => {
							let t = P(e), n = S[e.id] ?? 0;
							return /* @__PURE__ */ x("div", {
								className: "flex items-center gap-3",
								children: [/* @__PURE__ */ x("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ b("p", {
										className: "font-medium text-sq-text truncate",
										children: e.product_name
									}), /* @__PURE__ */ x("p", {
										className: "text-xs text-sq-secondary truncate",
										children: [
											e.variant_label,
											" · доступно ",
											t,
											" шт"
										]
									})]
								}), /* @__PURE__ */ x("div", {
									className: "flex items-center gap-1 shrink-0",
									children: [
										/* @__PURE__ */ b("button", {
											type: "button",
											className: "w-11 h-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text disabled:opacity-30",
											onClick: () => Y(e.id, n - 1, t),
											disabled: n === 0,
											"aria-label": `Менше ${e.product_name}`,
											children: /* @__PURE__ */ b(k, { size: 18 })
										}),
										/* @__PURE__ */ b("span", {
											className: "w-8 text-center font-semibold tabular-nums",
											children: n
										}),
										/* @__PURE__ */ b("button", {
											type: "button",
											className: "w-11 h-11 grid place-items-center rounded-sq border border-sq-divider text-sq-text disabled:opacity-30",
											onClick: () => Y(e.id, n + 1, t),
											disabled: n === t,
											"aria-label": `Більше ${e.product_name}`,
											children: /* @__PURE__ */ b(A, { size: 18 })
										})
									]
								})]
							}, e.id);
						}),
						v.length > 0 && /* @__PURE__ */ x(y, { children: [
							/* @__PURE__ */ b("button", {
								type: "button",
								className: "text-sm font-semibold text-sq-blue min-h-12",
								onClick: () => C(Object.fromEntries(v.map((e) => [e.id, J ? 0 : P(e)]))),
								children: J ? "Зняти все" : "Повернути все"
							}),
							/* @__PURE__ */ x("div", { children: [/* @__PURE__ */ b("p", {
								className: "sq-section-label mb-1.5",
								children: "Спосіб повернення"
							}), /* @__PURE__ */ b("div", {
								className: "flex gap-2",
								children: N.map((e) => /* @__PURE__ */ b("button", {
									type: "button",
									className: `flex-1 min-h-12 rounded-sq text-sm font-medium border ${w === e.id ? "border-sq-blue text-sq-blue bg-sq-blue/5" : "border-sq-divider text-sq-text"}`,
									onClick: () => T(e.id),
									children: e.label
								}, e.id))
							})] }),
							/* @__PURE__ */ b("input", {
								className: "pos-field text-sm",
								placeholder: "Причина (необов'язково)",
								value: E,
								onChange: (e) => D(e.target.value)
							})
						] }),
						F && /* @__PURE__ */ b("p", {
							className: "rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
							children: F
						})
					]
				}),
				/* @__PURE__ */ x("div", {
					className: "p-5 pt-3 shrink-0 space-y-2",
					children: [/* @__PURE__ */ x("div", {
						className: "flex justify-between items-baseline",
						children: [/* @__PURE__ */ b("span", {
							className: "text-sm text-sq-secondary",
							children: "До повернення"
						}), /* @__PURE__ */ b("span", {
							className: "text-2xl font-bold text-sq-text",
							children: f(K)
						})]
					}), /* @__PURE__ */ x("div", {
						className: "flex gap-2",
						children: [/* @__PURE__ */ b("button", {
							type: "button",
							className: "flex-1 min-h-12 rounded-sq border border-sq-divider text-sm font-semibold text-sq-text disabled:opacity-50",
							onClick: i,
							disabled: j,
							children: "Назад"
						}), /* @__PURE__ */ b("button", {
							type: "button",
							className: "flex-1 min-h-12 rounded-sq bg-red-600 text-white text-sm font-semibold disabled:opacity-50",
							onClick: () => void X(),
							disabled: j || q.length === 0,
							children: j ? "Оформлення…" : J ? "Скасувати чек" : "Повернути"
						})]
					})]
				})
			]
		})]
	});
}
//#endregion
//#region src/modules/returns/pages/TillReceiptsPage.tsx
var I = {
	completed: "Завершено",
	voided: "Скасовано",
	refunded: "Повернено",
	partially_refunded: "Часткове повернення"
};
function L(e) {
	return I[e.status] ?? e.status;
}
function R(e) {
	return e.status === "voided" || e.status === "refunded" ? "text-red-600" : e.status === "partially_refunded" ? "text-amber-600" : "text-sq-secondary";
}
var z = {
	cash: "Готівка",
	card: "Картка",
	qr: "QR-код"
};
function B(e) {
	return e.status === "completed" || e.status === "partially_refunded";
}
function V() {
	let [t, r] = c([]), [i, o] = c(null), [s, l] = c(null), [u, d] = c(!1), [p, m] = c(!1), [h, g] = c(null), _ = M();
	async function v() {
		r(await e.listSales(50));
	}
	a(() => {
		v().catch(() => g("Не вдалося завантажити чеки"));
	}, []);
	async function C(t) {
		o(t), l(t.detail ?? null), d(!0), g(null);
		try {
			l(await e.getSale(t));
		} catch {
			g("Не вдалося завантажити чек");
		} finally {
			d(!1);
		}
	}
	async function w(t) {
		g(null);
		try {
			await e.discardQueuedSale(t.client_uuid), o(null), l(null), await v();
		} catch (e) {
			g(e instanceof Error ? e.message : "Не вдалося видалити чек із черги");
		}
	}
	function T(e) {
		m(!1), o(e), l(e.detail ?? s), v().catch(() => void 0);
	}
	let E = /* @__PURE__ */ x("div", {
		className: "flex-1 min-h-0 grid lg:grid-cols-2 gap-3 p-3 overflow-hidden",
		children: [/* @__PURE__ */ x("section", {
			className: "flex flex-col min-h-0 bg-white border border-sq-divider rounded-sq overflow-hidden",
			children: [/* @__PURE__ */ x("div", {
				className: "px-4 py-3 border-b border-sq-divider flex items-center justify-between shrink-0",
				children: [/* @__PURE__ */ b("h1", {
					className: "text-lg font-semibold text-sq-text",
					children: "Чеки"
				}), /* @__PURE__ */ b(S, {
					to: "/register",
					className: "text-sm font-semibold text-sq-blue min-h-12 flex items-center",
					children: "← Каса"
				})]
			}), /* @__PURE__ */ x("div", {
				ref: _,
				className: "flex-1 overflow-auto divide-y divide-sq-divider select-none",
				children: [t.map((e) => /* @__PURE__ */ x("button", {
					type: "button",
					onClick: () => void C(e),
					className: `w-full text-left px-4 py-3 min-h-12 flex justify-between gap-3 ${i?.client_uuid === e.client_uuid ? "bg-sq-bg" : "hover:bg-sq-bg"}`,
					children: [/* @__PURE__ */ x("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ b("p", {
							className: "font-semibold text-sq-text truncate",
							children: e.receipt_number
						}), /* @__PURE__ */ x("p", {
							className: "text-xs text-sq-secondary truncate",
							children: [
								new Date(e.created_at).toLocaleString("uk-UA"),
								" · ",
								e.staff_name
							]
						})]
					}), /* @__PURE__ */ x("div", {
						className: "text-right shrink-0",
						children: [/* @__PURE__ */ b("p", {
							className: "font-semibold text-sq-text",
							children: f(e.total_cents)
						}), /* @__PURE__ */ x("p", {
							className: `text-xs ${R(e)}`,
							children: [L(e), /* @__PURE__ */ b(n, { status: e.fiscal_status })]
						})]
					})]
				}, e.client_uuid)), t.length === 0 && /* @__PURE__ */ b("p", {
					className: "p-4 text-sq-secondary text-sm",
					children: "Поки немає чеків."
				})]
			})]
		}), /* @__PURE__ */ b("section", {
			className: "hidden lg:flex flex-col min-h-0 bg-white border border-sq-divider rounded-sq overflow-hidden",
			children: i ? /* @__PURE__ */ b(H, {
				row: i,
				detail: s,
				loading: u,
				onRefund: () => m(!0),
				onDiscard: () => void w(i)
			}) : /* @__PURE__ */ b("p", {
				className: "p-5 text-sq-secondary text-sm",
				children: "Оберіть чек зліва."
			})
		})]
	});
	return /* @__PURE__ */ x(y, { children: [
		h && /* @__PURE__ */ b("div", {
			className: "mx-3 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm shrink-0",
			children: h
		}),
		E,
		i && /* @__PURE__ */ x("div", {
			className: "lg:hidden fixed inset-0 z-40 bg-white flex flex-col",
			children: [/* @__PURE__ */ x("div", {
				className: "px-4 py-3 border-b border-sq-divider flex items-center justify-between shrink-0",
				children: [/* @__PURE__ */ b("p", {
					className: "font-semibold text-sq-text",
					children: i.receipt_number
				}), /* @__PURE__ */ b("button", {
					type: "button",
					className: "text-sm font-semibold text-sq-blue min-h-12 px-2",
					onClick: () => o(null),
					children: "Закрити"
				})]
			}), /* @__PURE__ */ b(H, {
				row: i,
				detail: s,
				loading: u,
				onRefund: () => m(!0),
				onDiscard: () => void w(i)
			})]
		}),
		p && i && /* @__PURE__ */ b(F, {
			sale: i,
			detail: s,
			onClose: () => m(!1),
			onRefunded: T
		})
	] });
}
function H({ row: e, detail: r, loading: i, onRefund: a, onDiscard: o }) {
	let s = M(), c = v().id === "cafe";
	return /* @__PURE__ */ x(y, { children: [/* @__PURE__ */ x("div", {
		ref: s,
		className: "flex-1 overflow-auto p-5 space-y-4 select-none",
		children: [
			/* @__PURE__ */ x("div", { children: [
				/* @__PURE__ */ x("h2", {
					className: "text-xl font-bold text-sq-text",
					children: [
						c && r?.order_no != null && /* @__PURE__ */ x("span", {
							className: "mr-2 rounded-sq bg-sq-bg px-1.5 py-0.5 text-sm tabular-nums",
							children: ["№ ", r.order_no]
						}),
						c && r?.order_no == null && r?.local_order_no != null && /* @__PURE__ */ x("span", {
							className: "mr-2 rounded-sq bg-sq-bg px-1.5 py-0.5 text-sm tabular-nums",
							title: "Номер каси — сервер призначить свій після синхронізації",
							"data-testid": "local-order-no",
							children: ["К", r.local_order_no]
						}),
						e.receipt_number
					]
				}),
				/* @__PURE__ */ x("p", {
					className: "text-sm text-sq-secondary",
					children: [
						new Date(e.created_at).toLocaleString("uk-UA"),
						" · ",
						e.staff_name
					]
				}),
				/* @__PURE__ */ x("p", {
					className: `text-sm font-semibold mt-1 ${R(e)}`,
					children: [L(e), /* @__PURE__ */ b(n, {
						status: e.fiscal_status,
						mode: r?.fiscal?.mode
					})]
				}),
				/* @__PURE__ */ b(t, { doc: r?.fiscal })
			] }),
			r ? /* @__PURE__ */ b("ul", {
				className: "space-y-2 text-sm",
				children: r.items.map((e) => /* @__PURE__ */ x("li", {
					className: "flex justify-between gap-2",
					children: [/* @__PURE__ */ x("div", { children: [
						/* @__PURE__ */ b("p", {
							className: "font-medium text-sq-text",
							children: e.product_name
						}),
						/* @__PURE__ */ x("p", {
							className: "text-sq-secondary",
							children: [
								e.variant_label,
								" · ",
								e.quantity,
								" шт",
								e.refunded_quantity > 0 ? ` (повернено ${e.refunded_quantity})` : ""
							]
						}),
						e.note && /* @__PURE__ */ x("p", {
							className: "text-xs text-sq-muted italic",
							children: ["✎ ", e.note]
						})
					] }), /* @__PURE__ */ b("span", {
						className: "font-semibold text-sq-text shrink-0",
						children: f(e.line_total_cents)
					})]
				}, e.id))
			}) : /* @__PURE__ */ b("p", {
				className: "text-sm text-sq-secondary",
				children: i ? "Завантаження…" : "Позиції цього чека недоступні офлайн."
			}),
			/* @__PURE__ */ x("p", {
				className: "font-bold text-lg text-sq-text",
				children: ["Разом: ", f(e.total_cents)]
			}),
			r && r.payments.length > 0 && /* @__PURE__ */ b("ul", {
				className: "space-y-1.5 text-sm border-t border-sq-divider pt-3",
				children: r.payments.map((e) => /* @__PURE__ */ x("li", {
					className: "flex justify-between gap-2",
					children: [/* @__PURE__ */ b("span", {
						className: "text-sq-secondary",
						children: z[e.method] ?? e.method
					}), /* @__PURE__ */ b("span", {
						className: "font-medium text-sq-text",
						children: f(e.amount_cents)
					})]
				}, e.id))
			}),
			r && r.refunds.length > 0 && /* @__PURE__ */ x("ul", {
				className: "space-y-1.5 text-sm border-t border-sq-divider pt-3",
				children: [/* @__PURE__ */ b("li", {
					className: "sq-section-label",
					children: "Повернення"
				}), r.refunds.map((e) => /* @__PURE__ */ x("li", {
					className: "flex justify-between gap-2",
					children: [/* @__PURE__ */ x("span", {
						className: "text-sq-secondary",
						children: [
							e.refund_number ?? "—",
							e.method ? ` · ${z[e.method] ?? e.method}` : "",
							e.reason ? ` · ${e.reason}` : ""
						]
					}), /* @__PURE__ */ x("span", {
						className: "font-medium text-sq-text shrink-0",
						children: ["−", f(e.total_cents)]
					})]
				}, e.id))]
			})
		]
	}), /* @__PURE__ */ x("div", {
		className: "p-4 border-t border-sq-divider shrink-0",
		children: [/* @__PURE__ */ b("button", {
			type: "button",
			className: "w-full min-h-12 rounded-sq border border-red-300 bg-red-50 text-red-700 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed",
			onClick: a,
			disabled: !B(e),
			children: "Повернення"
		}), e.sync_state === "dead" && /* @__PURE__ */ x("div", {
			className: "rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm space-y-2",
			children: [
				/* @__PURE__ */ b("p", {
					className: "font-semibold",
					children: "Чек не потрапив на сервер"
				}),
				/* @__PURE__ */ b("p", { children: e.detail?.fiscal?.error_message ?? "Сервер відхилив цей чек." }),
				/* @__PURE__ */ b("button", {
					type: "button",
					className: "w-full min-h-11 rounded-sq border border-red-300 bg-white text-red-700 text-sm font-semibold",
					onClick: () => void o?.(),
					children: "Видалити з черги"
				})
			]
		})]
	})] });
}
//#endregion
export { V as TillReceiptsPage };
