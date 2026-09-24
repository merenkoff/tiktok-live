import { jsx as e, jsxs as t } from "react/jsx-runtime";
//#region src/modules/vertical-flowers/lib/figures.ts
var n = {
	damaged: "Завʼяло",
	gift: "Подаровано",
	lost: "Недостача",
	other: "Інше"
};
function r(e) {
	if (e == null) return "—";
	let t = e / 100;
	return `${Number.isInteger(t) ? t : t.toFixed(1)}%`;
}
function i(e) {
	let t = null;
	for (let n of e.by_reason) n.cost_cents > 0 && (!t || n.cost_cents > t.cost_cents) && (t = n);
	return t;
}
function a(e) {
	return e.rows.find((e) => e.kind === "bouquet") ?? null;
}
function o(e) {
	let t = a(e);
	return !t || e.total_revenue_cents <= 0 ? null : Math.round(t.revenue_cents / e.total_revenue_cents * 1e4);
}
//#endregion
//#region src/modules/vertical-flowers/ui/Stat.tsx
function s({ label: n, value: r, strong: i, hint: a, testId: o }) {
	return /* @__PURE__ */ t("div", {
		className: "rounded-xl bg-sq-sidebar px-4 py-3.5",
		"data-testid": o,
		children: [
			/* @__PURE__ */ e("p", {
				className: "text-[13px] font-medium text-sq-secondary",
				children: n
			}),
			/* @__PURE__ */ e("p", {
				className: `mt-1 tabular-nums ${i ? "text-[22px] leading-tight font-bold text-sq-heading" : "text-sq-text"}`,
				children: r
			}),
			a && /* @__PURE__ */ e("p", {
				className: "mt-1 text-xs text-sq-muted",
				children: a
			})
		]
	});
}
//#endregion
export { i as a, o as i, n, r as o, a as r, s as t };
