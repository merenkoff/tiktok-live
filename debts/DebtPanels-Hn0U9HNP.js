import { t as e } from "./debtsApi-DhkvGjzT.js";
import { T as t, m as n } from "./debt-80Dd-Q-1.js";
import { useEffect as r, useState as i } from "react";
import { formatUah as a } from "@pos/platform";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
import { Link as c } from "react-router-dom";
// src/modules/debts/components/DebtPanels.tsx
function l({ label: e, value: t, hint: n, testId: r }) {
	return /* @__PURE__ */ s("div", {
		className: "rounded-xl bg-sq-sidebar px-4 py-3.5",
		"data-testid": r,
		children: [
			/* @__PURE__ */ o("p", {
				className: "text-[13px] font-medium text-sq-secondary",
				children: e
			}),
			/* @__PURE__ */ o("p", {
				className: "mt-1 text-[22px] leading-tight font-bold text-sq-heading tabular-nums",
				children: t
			}),
			n && /* @__PURE__ */ o("p", {
				className: "mt-1 text-xs text-sq-muted",
				children: n
			})
		]
	});
}
function u({ from: u, to: d }) {
	let [f, p] = i(null), [m, h] = i(!1);
	return r(() => {
		let t = !0;
		return h(!1), e.summary(u, d).then((e) => {
			t && p(e);
		}).catch(() => {
			t && h(!0);
		}), () => {
			t = !1;
		};
	}, [u, d]), m ? null : /* @__PURE__ */ s("section", {
		"data-testid": "debt-panels",
		children: [/* @__PURE__ */ s("div", {
			className: "flex items-center justify-between gap-3 pb-1.5 mb-3 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
			children: [/* @__PURE__ */ s("h3", {
				className: "flex items-center gap-2 text-[15px] font-bold text-sq-blue",
				children: [/* @__PURE__ */ o(t, { size: 24 }), "Під запис"]
			}), /* @__PURE__ */ o(c, {
				to: "/admin/debts",
				className: "text-[15px] font-semibold text-sq-blue hover:underline",
				children: "Борги"
			})]
		}), /* @__PURE__ */ s("div", {
			className: "grid grid-cols-1 sm:grid-cols-3 gap-3",
			children: [
				/* @__PURE__ */ o(l, {
					label: "Видано під запис",
					value: f ? a(f.issued_cents) : "—",
					hint: f && f.returned_cents > 0 ? `повернуто товару на ${a(f.returned_cents)}` : void 0,
					testId: "panel-debt-issued"
				}),
				/* @__PURE__ */ o(l, {
					label: "Погашено",
					value: f ? a(f.repaid_cents) : "—",
					hint: f && f.written_off_cents > 0 ? `списано ${a(f.written_off_cents)}` : void 0,
					testId: "panel-debt-repaid"
				}),
				/* @__PURE__ */ o(l, {
					label: "Борг на кінець",
					value: f ? a(f.balance_end_cents) : "—",
					hint: f ? `${f.debtors_end} ${n(f.debtors_end, "покупець", "покупці", "покупців")}` : void 0,
					testId: "panel-debt-balance"
				})
			]
		})]
	});
}
export { u as default };
