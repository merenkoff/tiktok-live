import { useEffect as e, useState as t } from "react";
import { Link as n, useParams as r } from "react-router-dom";
import { api as i, formatUah as a } from "@pos/platform";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
//#region src/modules/stock/pages/StockDocumentDetailPage.tsx
var c = {
	receipt: "Прихід",
	writeoff: "Списання",
	adjustment: "Корекція",
	inventory: "Інвентаризація",
	production: "Виробництво"
}, l = {
	draft: "Чернетка",
	posted: "Проведено",
	voided: "Скасовано",
	reversed: "Відмінено"
};
function u(e) {
	if (e && typeof e == "object" && "response" in e) {
		let t = e.response?.data?.error;
		if (t) return t;
	}
	return e instanceof Error ? e.message : "Помилка";
}
function d() {
	let { id: d } = r(), [f, p] = t(null), [m, h] = t(null), [g, _] = t(!1);
	e(() => {
		d && i.getStockDocument(Number(d)).then(p).catch(() => h("Документ не знайдено"));
	}, [d]);
	async function v() {
		if (!f) return;
		let e = (f.lines ?? []).filter((e) => e.is_placeholder).length;
		if (!(e > 0 && !window.confirm(`Буде створено ${e} ${e === 1 ? "новий товар" : "нових товарів"} у каталозі. Продовжити?`))) {
			_(!0), h(null);
			try {
				p(await i.postStockDocument(f.id, crypto.randomUUID()));
			} catch (e) {
				h(u(e));
			} finally {
				_(!1);
			}
		}
	}
	async function y() {
		if (f && window.confirm("Скасувати проведення цього документа?")) {
			_(!0);
			try {
				await i.reverseStockDocument(f.id), p(await i.getStockDocument(f.id));
			} catch (e) {
				h(u(e));
			} finally {
				_(!1);
			}
		}
	}
	return m && !f ? /* @__PURE__ */ s("div", { children: [/* @__PURE__ */ o(n, {
		to: "/admin/stock",
		className: "text-sm text-[#006AFF]",
		children: "← Склад"
	}), /* @__PURE__ */ o("p", {
		className: "mt-4 text-red-600",
		children: m
	})] }) : f ? /* @__PURE__ */ s("div", {
		className: "max-w-3xl space-y-4",
		children: [
			/* @__PURE__ */ o(n, {
				to: "/admin/stock",
				className: "text-sm text-[#006AFF] hover:underline",
				children: "← Склад"
			}),
			/* @__PURE__ */ s("div", { children: [
				/* @__PURE__ */ o("p", {
					className: "sq-section-label",
					children: c[f.type] ?? f.type
				}),
				/* @__PURE__ */ o("h1", {
					className: "text-2xl font-semibold",
					children: f.doc_number
				}),
				/* @__PURE__ */ s("p", {
					className: "text-sm text-[#6E6E6E] mt-1",
					children: [
						l[f.status] ?? f.status,
						" · ",
						new Date(f.occurred_at).toLocaleString("uk-UA"),
						f.reason_code ? ` · ${f.reason_code}` : ""
					]
				}),
				f.note && /* @__PURE__ */ o("p", {
					className: "text-sm mt-2",
					children: f.note
				})
			] }),
			m && /* @__PURE__ */ o("p", {
				className: "text-sm text-red-600",
				children: m
			}),
			/* @__PURE__ */ o("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]",
				children: (f.lines ?? []).map((e) => {
					let t = !!e.is_placeholder, r = !!e.placeholder_name && !t;
					return /* @__PURE__ */ s("div", {
						className: "px-4 py-3 flex justify-between gap-3 text-sm",
						children: [/* @__PURE__ */ s("div", { children: [
							/* @__PURE__ */ s("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [/* @__PURE__ */ s("p", {
									className: "font-medium",
									children: [
										e.product_name,
										" ",
										e.label
									]
								}), t && /* @__PURE__ */ o("span", {
									className: "text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]",
									children: "Новий"
								})]
							}),
							t && /* @__PURE__ */ o("p", {
								className: "text-xs text-[#6E6E6E]",
								children: "Створиться при проведенні"
							}),
							r && e.product_id != null && /* @__PURE__ */ o(n, {
								to: "/admin/products",
								className: "text-xs text-[#006AFF] hover:underline",
								children: "Відкрити в каталозі"
							}),
							f.type === "inventory" && /* @__PURE__ */ s("p", {
								className: "text-xs text-[#6E6E6E]",
								children: [
									"Облік ",
									e.system_qty,
									" → пораховано ",
									e.counted_qty
								]
							}),
							e.unit_cost_cents != null && /* @__PURE__ */ s("p", {
								className: "text-xs text-[#6E6E6E]",
								children: ["Закупка ", a(e.unit_cost_cents)]
							}),
							t && e.placeholder_price_cents != null && /* @__PURE__ */ s("p", {
								className: "text-xs text-[#6E6E6E]",
								children: ["Ціна продажу ", a(e.placeholder_price_cents)]
							})
						] }), /* @__PURE__ */ o("p", {
							className: "font-semibold tabular-nums",
							children: f.type === "inventory" ? e.quantity : f.type === "writeoff" ? `−${e.quantity}` : f.type === "adjustment" ? e.quantity > 0 ? `+${e.quantity}` : e.quantity : `+${e.quantity}`
						})]
					}, e.id);
				})
			}),
			/* @__PURE__ */ s("div", {
				className: "flex flex-wrap gap-2",
				children: [
					f.status === "draft" && /* @__PURE__ */ o("button", {
						type: "button",
						disabled: g,
						onClick: () => void v(),
						className: "sq-btn-primary px-4 py-2.5 text-sm",
						children: "Провести"
					}),
					f.status === "posted" && f.type !== "inventory" && /* @__PURE__ */ o("button", {
						type: "button",
						disabled: g,
						onClick: () => void y(),
						className: "rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm",
						children: "Скасувати проведення"
					}),
					f.type === "inventory" && /* @__PURE__ */ o(n, {
						to: `/admin/stock/inventory/${f.id}`,
						className: "rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm",
						children: "Відкрити підрахунок"
					})
				]
			})
		]
	}) : /* @__PURE__ */ o("p", {
		className: "text-[#6E6E6E]",
		children: "Завантаження…"
	});
}
//#endregion
export { d as StockDocumentDetailPage };
