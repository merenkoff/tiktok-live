import { r as e } from "./debt-DM5F1FYd.js";
import { r as t, t as n } from "./LimitEditor-DNlAwKeu.js";
import { t as r } from "./useCredit-BmNyL3zh.js";
import { useAuthStore as i, usePosShell as a } from "@pos/platform";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
import { Link as c, useLocation as l } from "react-router-dom";
// src/modules/debts/lib/paths.ts
function u(e) {
	return e === "/admin" || e.startsWith("/admin/") ? "/admin/debts" : "/debts";
}
function d(e, t) {
	return `${u(e)}/${t}`;
}
// src/modules/debts/components/CustomerPanel.tsx
function f({ customerId: u, place: f }) {
	let { credit: p, failed: m, local: h } = r(u), g = i((e) => e.auth?.staff.role ?? null), _ = a(), { pathname: v } = l();
	if (m || !p) return null;
	let y = p.balance_cents !== 0, b = p.limit_cents != null, x = g === "owner";
	return f === "cart" ? !y && !b ? null : /* @__PURE__ */ s(c, {
		to: d(v, u),
		className: `block text-[13px] leading-snug tabular-nums hover:underline ${p.locked || (p.available_cents ?? 0) === 0 ? "text-amber-800" : "text-sq-secondary"}`,
		"data-testid": "debts-customer-strip",
		children: [e(p), h ? " · без мережі" : ""]
	}) : !y && !b && !x ? null : /* @__PURE__ */ s("section", {
		className: "rounded-card bg-white ring-1 ring-sq-divider p-4 space-y-2",
		"data-testid": "debts-customer-card",
		children: [
			/* @__PURE__ */ o(t, {
				title: "Під запис",
				action: y ? /* @__PURE__ */ o(c, {
					to: d(v, u),
					children: "Виписка"
				}) : void 0
			}),
			/* @__PURE__ */ s("p", {
				className: "text-[15px] tabular-nums",
				children: [b || y ? e(p) : "Під запис не дозволено", h ? " · без мережі" : ""]
			}),
			x && /* @__PURE__ */ o(n, {
				credit: p,
				touch: _ !== "web"
			})
		]
	});
}
export { f as default };
