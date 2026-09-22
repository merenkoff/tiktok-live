import { n as e, r as t, t as n } from "./FiscalBadge-RJoaOqdy.js";
import { useEffect as r, useState as i } from "react";
import { formatUah as a, useVertical as o } from "@pos/platform";
import { jsx as s, jsxs as c } from "react/jsx-runtime";
//#region src/modules/returns/pages/AdminSalesPage.tsx
var l = {
	completed: "Завершено",
	voided: "Скасовано",
	refunded: "Повернено",
	partially_refunded: "Часткове повернення"
};
function u(e) {
	return l[e] ?? e;
}
var d = {
	cash: "Готівка",
	card: "Картка",
	qr: "QR-код"
};
function f() {
	let [l, f] = i([]), [p, m] = i(null), [h, g] = i(null), [_, v] = i({});
	async function y() {
		f(await t.listSales(100));
	}
	r(() => {
		y().catch(() => g("Не вдалося завантажити продажі"));
	}, []);
	async function b(e) {
		let n = await t.getSale(e);
		m(n);
		let r = {};
		for (let e of n.items) r[e.id] = 0;
		v(r);
	}
	async function x() {
		if (!p) return;
		let e = p.items.map((e) => ({
			sale_item_id: e.id,
			quantity: e.quantity - e.refunded_quantity
		})).filter((e) => e.quantity > 0);
		if (e.length === 0) {
			g("За цим чеком уже все повернуто");
			return;
		}
		confirm("Повернути весь чек і товар на склад?") && await C(e);
	}
	async function S() {
		if (!p) return;
		let e = Object.entries(_).filter(([, e]) => e > 0).map(([e, t]) => ({
			sale_item_id: Number(e),
			quantity: t
		}));
		if (e.length === 0) {
			g("Оберіть кількість для повернення");
			return;
		}
		await C(e);
	}
	async function C(e) {
		if (p) try {
			let n = await t.refundSale(p.id, e, { client_uuid: crypto.randomUUID() });
			m(n), v(Object.fromEntries(n.items.map((e) => [e.id, 0]))), await y();
		} catch {
			g("Не вдалося оформити повернення");
		}
	}
	let w = o().id === "cafe";
	return /* @__PURE__ */ c("div", {
		className: "space-y-6 animate-fade-up text-sq-text",
		children: [
			/* @__PURE__ */ c("div", { children: [/* @__PURE__ */ s("h2", {
				className: "text-2xl font-semibold",
				children: "Продажі"
			}), /* @__PURE__ */ s("p", {
				className: "text-sq-secondary mt-1 text-sm",
				children: "Історія чеків, скасування та повернення."
			})] }),
			h && /* @__PURE__ */ s("div", {
				className: "rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				children: h
			}),
			/* @__PURE__ */ c("div", {
				className: "grid lg:grid-cols-2 gap-4",
				children: [/* @__PURE__ */ c("section", {
					className: "bg-sq-surface border border-sq-divider rounded-sq divide-y divide-sq-divider overflow-hidden shadow-sm",
					children: [l.map((e) => /* @__PURE__ */ c("button", {
						type: "button",
						onClick: () => void b(e.id),
						className: "w-full text-left px-4 py-3 hover:bg-sq-bg flex justify-between gap-3",
						children: [/* @__PURE__ */ c("div", { children: [/* @__PURE__ */ c("p", {
							className: "font-semibold text-sq-text",
							children: [w && e.order_no != null && /* @__PURE__ */ c("span", {
								className: "mr-2 rounded-sq bg-sq-bg px-1.5 py-0.5 text-xs tabular-nums",
								"data-testid": "sale-order-no",
								children: ["№ ", e.order_no]
							}), e.receipt_number]
						}), /* @__PURE__ */ c("p", {
							className: "text-xs text-sq-secondary",
							children: [
								new Date(e.created_at).toLocaleString("uk-UA"),
								" · ",
								e.staff_name
							]
						})] }), /* @__PURE__ */ c("div", {
							className: "text-right",
							children: [/* @__PURE__ */ s("p", {
								className: "font-semibold text-sq-text",
								children: a(e.total_cents)
							}), /* @__PURE__ */ c("p", {
								className: "text-xs text-sq-secondary",
								children: [
									u(e.status),
									e.qr_pending && /* @__PURE__ */ s("span", {
										className: "ml-2 text-amber-600",
										children: "QR не підтверджено"
									}),
									/* @__PURE__ */ s(n, { status: e.fiscal_status })
								]
							})]
						})]
					}, e.id)), l.length === 0 && /* @__PURE__ */ s("p", {
						className: "p-4 text-sq-secondary text-sm",
						children: "Поки немає продажів."
					})]
				}), /* @__PURE__ */ s("section", {
					className: "bg-sq-surface border border-sq-divider rounded-sq p-5 min-h-[240px] shadow-sm",
					children: p ? /* @__PURE__ */ c("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ c("div", { children: [
								/* @__PURE__ */ c("h3", {
									className: "text-xl font-bold text-sq-text",
									children: [w && p.order_no != null && /* @__PURE__ */ c("span", {
										className: "mr-2 rounded-sq bg-sq-bg px-1.5 py-0.5 text-sm tabular-nums",
										children: ["№ ", p.order_no]
									}), p.receipt_number]
								}),
								/* @__PURE__ */ c("p", {
									className: "text-sm text-sq-secondary",
									children: [
										u(p.status),
										" · ",
										p.staff_name,
										/* @__PURE__ */ s(n, {
											status: p.fiscal_status,
											mode: p.fiscal?.mode
										})
									]
								}),
								/* @__PURE__ */ s(e, { doc: p.fiscal })
							] }),
							/* @__PURE__ */ s("ul", {
								className: "space-y-2 text-sm",
								children: p.items.map((e) => /* @__PURE__ */ c("li", {
									className: "flex justify-between gap-2 items-center",
									children: [/* @__PURE__ */ c("div", { children: [
										/* @__PURE__ */ s("p", {
											className: "font-medium text-sq-text",
											children: e.product_name
										}),
										/* @__PURE__ */ c("p", {
											className: "text-sq-secondary",
											children: [
												e.variant_label,
												" · ",
												e.quantity,
												" шт",
												e.refunded_quantity > 0 ? ` (повернено ${e.refunded_quantity})` : ""
											]
										}),
										e.note && /* @__PURE__ */ c("p", {
											className: "text-xs text-sq-muted italic",
											children: ["✎ ", e.note]
										})
									] }), /* @__PURE__ */ c("div", {
										className: "flex items-center gap-2",
										children: [p.status !== "voided" && p.status !== "refunded" && /* @__PURE__ */ s("input", {
											type: "number",
											min: 0,
											max: e.quantity - e.refunded_quantity,
											className: "w-16 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1 text-sq-text",
											value: _[e.id] ?? 0,
											onChange: (t) => v((n) => ({
												...n,
												[e.id]: Number(t.target.value)
											}))
										}), /* @__PURE__ */ s("span", {
											className: "font-semibold text-sq-text",
											children: a(e.line_total_cents)
										})]
									})]
								}, e.id))
							}),
							/* @__PURE__ */ c("p", {
								className: "font-bold text-lg text-sq-text",
								children: ["Разом: ", a(p.total_cents)]
							}),
							p.payments.length > 0 && /* @__PURE__ */ s("ul", {
								className: "space-y-1.5 text-sm border-t border-sq-divider pt-3",
								children: p.payments.map((e) => /* @__PURE__ */ c("li", {
									className: "flex justify-between items-center gap-2",
									children: [/* @__PURE__ */ c("span", {
										className: "text-sq-secondary",
										children: [d[e.method] ?? e.method, e.method === "qr" && (e.confirmed_at ? /* @__PURE__ */ s("span", {
											className: "ml-2 text-xs font-semibold text-emerald-600",
											children: "оплату підтверджено"
										}) : /* @__PURE__ */ s("span", {
											className: "ml-2 text-xs font-semibold text-amber-600",
											children: "очікує підтвердження"
										}))]
									}), /* @__PURE__ */ s("span", {
										className: "font-medium text-sq-text",
										children: a(e.amount_cents)
									})]
								}, e.id))
							}),
							p.refunds.length > 0 && /* @__PURE__ */ c("ul", {
								className: "space-y-1.5 text-sm border-t border-sq-divider pt-3",
								children: [/* @__PURE__ */ s("li", {
									className: "sq-section-label",
									children: "Повернення"
								}), p.refunds.map((e) => /* @__PURE__ */ c("li", {
									className: "flex justify-between gap-2",
									children: [/* @__PURE__ */ c("span", {
										className: "text-sq-secondary",
										children: [
											e.refund_number ?? "—",
											e.method ? ` · ${d[e.method] ?? e.method}` : "",
											e.reason ? ` · ${e.reason}` : ""
										]
									}), /* @__PURE__ */ c("span", {
										className: "font-medium text-sq-text",
										children: ["−", a(e.total_cents)]
									})]
								}, e.id))]
							}),
							(p.status === "completed" || p.status === "partially_refunded") && /* @__PURE__ */ c("div", {
								className: "flex flex-wrap gap-2",
								children: [/* @__PURE__ */ s("button", {
									type: "button",
									onClick: () => void x(),
									className: "rounded-sq border border-red-300 bg-red-50 text-red-700 px-4 py-2 text-sm font-semibold",
									children: "Повернути все"
								}), /* @__PURE__ */ s("button", {
									type: "button",
									onClick: () => void S(),
									className: "sq-btn-primary px-4 py-2 text-sm",
									children: "Повернення"
								})]
							})
						]
					}) : /* @__PURE__ */ s("p", {
						className: "text-sq-secondary text-sm",
						children: "Оберіть чек зліва."
					})
				})]
			})
		]
	});
}
//#endregion
export { f as AdminSalesPage };
