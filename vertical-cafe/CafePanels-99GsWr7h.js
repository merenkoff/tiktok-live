import { a as e } from "./hostPlatform-BSaDrC_D.js";
import { d as t, l as n, o as r, r as i, s as a, u as o } from "./figures-CvCQJyZx.js";
import { useEffect as s, useState as c } from "react";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { formatUah as d } from "@pos/platform";
import { Link as f } from "react-router-dom";
//#region node_modules/lucide-react/dist/esm/icons/coffee.js
var p = e("Coffee", [
	["path", {
		d: "M10 2v2",
		key: "7u0qdc"
	}],
	["path", {
		d: "M14 2v2",
		key: "6buw04"
	}],
	["path", {
		d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1",
		key: "pwadti"
	}],
	["path", {
		d: "M6 2v2",
		key: "colzsn"
	}]
]);
//#endregion
//#region src/modules/vertical-cafe/panels/CafePanels.tsx
function m({ from: e, to: m }) {
	let [h, g] = c(null), [_, v] = c(!1);
	if (s(() => {
		let t = !0;
		return v(!1), o({
			from: e,
			to: m
		}).then((e) => {
			t && g(e);
		}).catch(() => {
			t && v(!0);
		}), () => {
			t = !1;
		};
	}, [e, m]), _) return null;
	let y = h ? a(h.peak_hours) : null, b = h ? n(h.top_modifiers) : null, x = h?.food_cost.unpriced_lines ?? 0, S = h?.tables ?? null;
	return /* @__PURE__ */ u("section", {
		className: "bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm",
		"data-testid": "cafe-panels",
		children: [/* @__PURE__ */ u("div", {
			className: "flex items-center justify-between mb-4",
			children: [/* @__PURE__ */ u("p", {
				className: "sq-section-label flex items-center gap-2",
				children: [/* @__PURE__ */ l(p, {
					size: 14,
					className: "text-sq-blue"
				}), "Кухня"]
			}), /* @__PURE__ */ l(f, {
				to: "/admin/cafe",
				className: "text-xs font-semibold text-sq-blue uppercase tracking-wide",
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
export { m as default };
