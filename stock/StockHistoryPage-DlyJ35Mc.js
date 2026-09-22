import { useEffect as e, useState as t } from "react";
import { Link as n } from "react-router-dom";
import { api as r } from "@pos/platform";
import { jsx as i, jsxs as a } from "react/jsx-runtime";
//#region src/modules/stock/pages/StockHistoryPage.tsx
var o = {
	sale: "Продаж",
	refund: "Повернення",
	void: "Скасування чека",
	seed: "Початковий",
	adjust: "Корекція",
	receipt: "Прихід",
	writeoff: "Списання",
	inventory: "Інвентаризація",
	production: "Виробництво"
};
function s() {
	let [s, c] = t([]), [l, u] = t(""), [d, f] = t(null);
	async function p(e) {
		let t = await r.stockMovements({
			reason: e || void 0,
			from: (/* @__PURE__ */ new Date(Date.now() - 2592e6)).toISOString()
		});
		c(t);
	}
	return e(() => {
		p().catch(() => f("Не вдалося завантажити історію"));
	}, []), /* @__PURE__ */ a("div", {
		className: "max-w-5xl space-y-4",
		children: [
			/* @__PURE__ */ i(n, {
				to: "/admin/stock",
				className: "text-sm text-[#006AFF] hover:underline",
				children: "← Склад"
			}),
			/* @__PURE__ */ a("div", { children: [/* @__PURE__ */ i("p", {
				className: "sq-section-label",
				children: "Inventory history"
			}), /* @__PURE__ */ i("h1", {
				className: "text-2xl font-semibold mt-1",
				children: "Історія рухів"
			})] }),
			/* @__PURE__ */ a("div", {
				className: "flex flex-wrap gap-1.5",
				children: [/* @__PURE__ */ i("button", {
					type: "button",
					onClick: () => {
						u(""), p("");
					},
					className: `px-3 py-1.5 text-sm rounded-[4px] border ${l ? "border-[#E0E0E0] bg-white" : "border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]"}`,
					children: "Усі"
				}), Object.entries(o).map(([e, t]) => /* @__PURE__ */ i("button", {
					type: "button",
					onClick: () => {
						u(e), p(e);
					},
					className: `px-3 py-1.5 text-sm rounded-[4px] border ${l === e ? "border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]" : "border-[#E0E0E0] bg-white"}`,
					children: t
				}, e))]
			}),
			d && /* @__PURE__ */ i("p", {
				className: "text-sm text-red-600",
				children: d
			}),
			/* @__PURE__ */ a("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]",
				children: [s.map((e) => /* @__PURE__ */ a("div", {
					className: "px-4 py-3 flex flex-wrap gap-3 justify-between text-sm",
					children: [/* @__PURE__ */ a("div", { children: [
						/* @__PURE__ */ a("p", {
							className: "font-medium",
							children: [
								e.product_name,
								" ",
								/* @__PURE__ */ i("span", {
									className: "text-[#6E6E6E] font-normal",
									children: e.label
								})
							]
						}),
						/* @__PURE__ */ a("p", {
							className: "text-xs text-[#6E6E6E] mt-0.5",
							children: [
								o[e.reason] ?? e.reason,
								e.staff_name ? ` · ${e.staff_name}` : "",
								e.note ? ` · ${e.note}` : ""
							]
						}),
						/* @__PURE__ */ i("p", {
							className: "text-xs text-[#6E6E6E]",
							children: new Date(e.occurred_at).toLocaleString("uk-UA")
						})
					] }), /* @__PURE__ */ a("div", {
						className: "text-right",
						children: [/* @__PURE__ */ i("p", {
							className: `font-semibold tabular-nums ${e.delta >= 0 ? "text-emerald-700" : "text-red-600"}`,
							children: e.delta >= 0 ? `+${e.delta}` : e.delta
						}), e.reference_type === "stock_document" && e.reference_id && /* @__PURE__ */ i(n, {
							to: `/admin/stock/documents/${e.reference_id}`,
							className: "text-xs text-[#006AFF] hover:underline",
							children: "Документ"
						})]
					})]
				}, e.id)), s.length === 0 && /* @__PURE__ */ i("p", {
					className: "p-6 text-sm text-[#6E6E6E] text-center",
					children: "Немає рухів за період"
				})]
			})
		]
	});
}
//#endregion
export { s as StockHistoryPage };
