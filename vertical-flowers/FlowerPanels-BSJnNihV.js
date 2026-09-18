import { t as e } from "./flower-2-DQVy9i5h.js";
import { a as t, i as n, n as r, o as i, r as a, t as o } from "./Stat-DRWd55Hz.js";
import { useEffect as s, useState as c } from "react";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { api as d, formatUah as f } from "@pos/platform";
import { Link as p } from "react-router-dom";
//#region src/modules/vertical-flowers/panels/FlowerPanels.tsx
function m({ from: m, to: h }) {
	let [g, _] = c(null), [v, y] = c(!1);
	if (s(() => {
		let e = !0;
		return y(!1), d.getFlowerAnalytics({
			from: m,
			to: h
		}).then((t) => {
			e && _(t);
		}).catch(() => {
			e && y(!0);
		}), () => {
			e = !1;
		};
	}, [m, h]), v) return null;
	let b = g ? a(g.margin) : null, x = g ? n(g.margin) : null, S = g ? t(g.loss) : null;
	return /* @__PURE__ */ u("section", {
		className: "bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm",
		"data-testid": "flower-panels",
		children: [/* @__PURE__ */ u("div", {
			className: "flex items-center justify-between mb-4",
			children: [/* @__PURE__ */ u("p", {
				className: "sq-section-label flex items-center gap-2",
				children: [/* @__PURE__ */ l(e, {
					size: 14,
					className: "text-sq-blue"
				}), "Квіти"]
			}), /* @__PURE__ */ l(p, {
				to: "/admin/flowers",
				className: "text-xs font-semibold text-sq-blue uppercase tracking-wide",
				children: "Докладніше"
			})]
		}), /* @__PURE__ */ u("div", {
			className: "grid grid-cols-1 sm:grid-cols-3 gap-3",
			children: [
				/* @__PURE__ */ l(o, {
					label: "У смітнику",
					value: g ? f(g.loss.total_cost_cents) : "—",
					hint: S ? `здебільшого: ${r[S.reason].toLowerCase()}` : void 0,
					strong: !0,
					testId: "panel-loss"
				}),
				/* @__PURE__ */ l(o, {
					label: "Букети у виручці",
					value: b ? f(b.revenue_cents) : "—",
					hint: x == null ? void 0 : `${i(x)} усіх продажів`,
					strong: !0,
					testId: "panel-bouquet-revenue"
				}),
				/* @__PURE__ */ l(o, {
					label: "Націнка на букетах",
					value: b ? i(b.markup_bps) : "—",
					hint: g ? `магазин просить ${i(g.margin.labour_bps)}` : void 0,
					strong: !0,
					testId: "panel-bouquet-markup"
				})
			]
		})]
	});
}
//#endregion
export { m as default };
