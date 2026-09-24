import { f as e } from "./hostPlatform-D3rxsd42.js";
import { d as t, l as n, o as r, r as i, s as a, u as o } from "./figures-BHrhvwo4.js";
import { useEffect as s, useState as c } from "react";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { formatUah as d } from "@pos/platform";
import { Link as f } from "react-router-dom";
//#region src/modules/vertical-cafe/panels/CafePanels.tsx
function p({ from: p, to: m }) {
	let [h, g] = c(null), [_, v] = c(!1);
	if (s(() => {
		let e = !0;
		return v(!1), o({
			from: p,
			to: m
		}).then((t) => {
			e && g(t);
		}).catch(() => {
			e && v(!0);
		}), () => {
			e = !1;
		};
	}, [p, m]), _) return null;
	let y = h ? a(h.peak_hours) : null, b = h ? n(h.top_modifiers) : null, x = h?.food_cost.unpriced_lines ?? 0, S = h?.tables ?? null;
	return /* @__PURE__ */ u("section", {
		"data-testid": "cafe-panels",
		children: [/* @__PURE__ */ u("div", {
			className: "flex items-center justify-between gap-3 pb-1.5 mb-3 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
			children: [/* @__PURE__ */ u("h3", {
				className: "flex items-center gap-2 text-[15px] font-bold text-sq-blue",
				children: [/* @__PURE__ */ l(e, { size: 24 }), "Кухня"]
			}), /* @__PURE__ */ l(f, {
				to: "/admin/cafe",
				className: "text-[15px] font-semibold text-sq-blue hover:underline",
				children: "Докладніше"
			})]
		}), /* @__PURE__ */ u("div", {
			className: "grid grid-cols-2 lg:grid-cols-4 gap-3",
			children: [
				/* @__PURE__ */ l(t, {
					label: "Food cost",
					value: h ? r(h.food_cost.bps) : "—",
					hint: x > 0 ? `${x} поз. без собівартості` : h ? "за останніми цінами закупівлі" : void 0,
					tone: x > 0 ? "warn" : void 0,
					strong: !0,
					testId: "cafe-panel-food-cost"
				}),
				/* @__PURE__ */ l(t, {
					label: "Середній чек",
					value: h?.average_check_cents == null ? "—" : d(h.average_check_cents),
					hint: h ? `${h.sales_count} чеків` : void 0,
					strong: !0,
					testId: "cafe-panel-check"
				}),
				/* @__PURE__ */ l(t, {
					label: "Пік замовлень",
					value: y ? i(y.hour) : "—",
					hint: y ? `${y.orders} замовлень` : void 0,
					strong: !0,
					testId: "cafe-panel-peak"
				}),
				/* @__PURE__ */ l(t, {
					label: "Найчастіша відповідь",
					value: b ? b.name : "—",
					hint: b ? `${b.group_name} · ${b.times}×` : void 0,
					strong: !0,
					testId: "cafe-panel-modifier"
				}),
				S && /* @__PURE__ */ l(t, {
					label: "Середній чек на стіл",
					value: d(S.avg_bill_cents),
					hint: S.avg_minutes == null ? `${S.bills} рахунків` : `${S.bills} рахунків · ${S.avg_minutes} хв`,
					strong: !0,
					testId: "cafe-panel-table-check"
				})
			]
		})]
	});
}
//#endregion
export { p as default };
