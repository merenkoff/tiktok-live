import { r as e } from "./hostPlatform-BSaDrC_D.js";
import { jsx as t, jsxs as n } from "react/jsx-runtime";
//#region src/modules/vertical-cafe/ui/Stat.tsx
function r({ label: e, value: r, strong: i, hint: a, tone: o, testId: s }) {
	return /* @__PURE__ */ n("div", {
		className: "rounded-sq bg-sq-bg p-3",
		"data-testid": s,
		children: [
			/* @__PURE__ */ t("p", {
				className: "text-xs text-sq-muted",
				children: e
			}),
			/* @__PURE__ */ t("p", {
				className: `mt-0.5 ${i ? "text-lg font-semibold text-sq-text" : "text-sq-text"}`,
				children: r
			}),
			a && /* @__PURE__ */ t("p", {
				className: `mt-0.5 text-[11px] ${o === "warn" ? "text-amber-600" : "text-sq-muted"}`,
				children: a
			})
		]
	});
}
//#endregion
//#region src/modules/vertical-cafe/analytics/cafeAnalyticsApi.ts
function i(t) {
	let n = new URLSearchParams();
	t.from && n.set("from", t.from), t.to && n.set("to", t.to);
	let r = n.toString();
	return e("get", `/analytics/cafe${r ? `?${r}` : ""}`);
}
//#endregion
//#region src/modules/vertical-cafe/lib/figures.ts
function a(e) {
	return e == null ? "—" : `${(e / 100).toFixed(1).replace(".", ",")} %`;
}
function o(e) {
	return `${String(e).padStart(2, "0")}:00`;
}
function s(e) {
	let t = null;
	for (let n of e) n.orders <= 0 || (!t || n.orders > t.orders) && (t = {
		hour: n.hour,
		orders: n.orders
	});
	return t;
}
function c(e) {
	return e[0] ?? null;
}
var l = {
	star: {
		title: "Зірки",
		advice: "тримати як є"
	},
	plowhorse: {
		title: "Робочі конячки",
		advice: "беруть часто, а заробляють мало — підняти ціну"
	},
	puzzle: {
		title: "Загадки",
		advice: "заробляють добре, беруть рідко — рекламувати"
	},
	dog: {
		title: "Собаки",
		advice: "ні популярності, ні маржі — прибрати з меню"
	}
}, u = [
	"star",
	"plowhorse",
	"puzzle",
	"dog"
], d = {
	no_cost: "не вистачає собівартості складника",
	no_price: "продано без ціни"
};
function f(e) {
	return u.map((t) => ({
		quadrant: t,
		rows: e.filter((e) => e.quadrant === t)
	}));
}
function p(e) {
	let t = new Map((e ?? []).map((e) => [e.code, e.label]));
	return (e) => t.get(e) ?? e;
}
function m(e) {
	if (e == null) return "—";
	let t = Math.round(e);
	if (t < 60) return `${t} хв`;
	let n = t % 60;
	return n === 0 ? `${t / 60} год` : `${Math.floor(t / 60)} год ${n} хв`;
}
//#endregion
export { f as a, p as c, r as d, m as i, c as l, l as n, a as o, o as r, s, d as t, i as u };
