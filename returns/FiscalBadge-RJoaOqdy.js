import { api as e, cashierApi as t } from "@pos/platform";
import { jsx as n, jsxs as r } from "react/jsx-runtime";
//#region src/modules/returns/data/returnsApi.ts
var i = {
	listSales: (e = 50) => t.listSales(e),
	getSale: (e) => t.getSale(e),
	refundSale: (e, n, r = {}) => t.refundSale(e, n, r),
	discardQueuedSale: (e) => t.discardQueuedSale(e)
}, a = {
	listSales: (t = 100) => e.listSales(t),
	getSale: (t) => e.getSale(t),
	refundSale: (t, n, r = {}) => e.refundSale(t, n, r)
}, o = {
	pending: {
		label: "ПРРО: реєструється",
		cls: "text-amber-600"
	},
	failed: {
		label: "ПРРО: не зареєстровано",
		cls: "text-red-600"
	},
	done: {
		label: "ПРРО",
		cls: "text-emerald-600"
	}
};
function s({ status: e, mode: t }) {
	if (e === "pending" && t === "offline") return /* @__PURE__ */ n("span", {
		className: "ml-2 text-xs font-semibold text-amber-600",
		children: "ПРРО: офлайн"
	});
	let r = e ? o[e] : void 0;
	return r ? /* @__PURE__ */ n("span", {
		className: `ml-2 text-xs font-semibold ${r.cls}`,
		children: r.label
	}) : null;
}
function c({ doc: e }) {
	if (!e) return null;
	if (e.status === "done") return /* @__PURE__ */ r("div", {
		className: "mt-3 rounded-sq bg-sq-surface border border-sq-divider px-3 py-2 text-sm",
		children: [
			/* @__PURE__ */ n("p", {
				className: "sq-section-label",
				children: "Фіскальний чек"
			}),
			e.fiscal_code && /* @__PURE__ */ n("p", {
				className: "mt-1 font-semibold select-all",
				children: e.fiscal_code
			}),
			e.tax_url && /* @__PURE__ */ n("a", {
				href: e.tax_url,
				target: "_blank",
				rel: "noreferrer",
				className: "mt-1 inline-block text-sq-blue underline break-all",
				children: "Перевірити в кабінеті ДПС"
			})
		]
	});
	if (e.status === "pending" && e.mode === "offline") return /* @__PURE__ */ r("div", {
		className: "mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900",
		children: [
			/* @__PURE__ */ n("p", {
				className: "font-semibold",
				children: "Чек з офлайн-резерву ПРРО"
			}),
			e.fiscal_code && /* @__PURE__ */ n("p", {
				className: "mt-1 font-semibold select-all",
				children: e.fiscal_code
			}),
			/* @__PURE__ */ n("p", {
				className: "mt-1",
				children: "Буде надіслано в ДПС автоматично, щойно відновиться звʼязок із ПРРО."
			})
		]
	});
	let t = e.status === "failed" || e.status === "abandoned";
	return /* @__PURE__ */ r("div", {
		className: `mt-3 rounded-sq px-3 py-2 text-sm ${t ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}`,
		children: [
			/* @__PURE__ */ n("p", {
				className: "font-semibold",
				children: t ? "Чек не зареєстровано в ПРРО" : "Реєструється в ПРРО…"
			}),
			e.error_message && /* @__PURE__ */ n("p", {
				className: "mt-1",
				children: e.error_message
			}),
			e.status === "abandoned" ? /* @__PURE__ */ n("p", {
				className: "mt-1",
				children: "Зверніться до власника магазину."
			}) : t ? /* @__PURE__ */ n("p", {
				className: "mt-1",
				children: "Реєстрація повториться автоматично."
			}) : null
		]
	});
}
//#endregion
export { i, c as n, a as r, s as t };
