import { n as e, t } from "./ids-DKpT3dMP.js";
import { P as n, Y as r, g as i } from "./debt-B208o_Xv.js";
import { useEffect as a } from "react";
import { getMeta as o, printSlip as s, resolveModuleStationPrinter as c } from "@pos/platform";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { createPortal as d } from "react-dom";
var f = /* @__PURE__ */ new Map();
function p(e, t, n) {
	return `issue:${e}:${JSON.stringify([t, n])}`;
}
function m(e, t) {
	return `${e}:${t}`;
}
function h(e, t, n) {
	return `chain-${e}:${t}:${n}`;
}
function g(e, t = Date.now()) {
	let n = f.get(e);
	return n ? t - n.at > 18e5 ? (f.delete(e), null) : n.key : null;
}
function _(e, t = Date.now()) {
	return g(e, t) == null ? void 0 : f.get(e)?.body;
}
function v(e, t, n = Date.now(), r) {
	f.set(e, {
		key: t,
		at: n,
		...r === void 0 ? {} : { body: r }
	});
}
function y(e) {
	f.delete(e);
}
// src/modules/debts/lib/slip.ts
function b(e) {
	return e.toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function x(e) {
	return e.map((e) => ({
		title: i(e),
		quantity: e.quantity,
		unit: e.unit,
		unitPriceCents: e.unit_price_cents,
		totalCents: e.line_total_cents,
		pricePer: e.price_per ?? 1
	}));
}
function S(e) {
	let t = e.entryId == null;
	return {
		title: "ПІД ЗАПИС",
		store_name: e.storeName,
		lines: [
			`Покупець: ${e.customer.name}`,
			...e.customer.phone ? [`Телефон: ${e.customer.phone}`] : [],
			`Касир: ${e.staffName}`,
			t ? "Записано на касі без мережі" : `Запис № ${e.entryId}`,
			b(e.at),
			...e.note ? [`Примітка: ${e.note}`] : []
		],
		items: e.lines.map((e) => ({
			name: e.title,
			quantity: n(e.quantity, e.unit, e.pricePer),
			unit_price_cents: e.unitPriceCents,
			line_total_cents: e.totalCents
		})),
		totals: [
			...e.discountCents > 0 ? [{
				label: "Знижка",
				amount_cents: e.discountCents
			}] : [],
			{
				label: "Під запис",
				amount_cents: e.totalCents
			},
			...e.balanceAfterCents == null ? [] : [{
				label: t ? "Борг після, за даними каси" : "Борг після",
				amount_cents: e.balanceAfterCents
			}]
		],
		footer: ["Фіскальний чек — коли борг буде оплачено.", "Підпис покупця ________________"],
		printed_at: b(/* @__PURE__ */ new Date())
	};
}
function C(e) {
	return {
		title: "ВНЕСОК",
		store_name: e.storeName,
		lines: [
			`Покупець: ${e.customer.name}`,
			...e.customer.phone ? [`Телефон: ${e.customer.phone}`] : [],
			`Касир: ${e.staffName}`,
			...e.number ? [`Внесок № ${e.number}`] : [],
			b(e.at)
		],
		items: [{
			name: i(e.line),
			quantity: n(e.line.remaining_quantity, e.line.unit, e.line.price_per)
		}],
		totals: [
			{
				label: "Внесок",
				amount_cents: e.amountCents
			},
			{
				label: "Лишилося за товаром",
				amount_cents: e.leftCents
			},
			...e.balanceAfterCents == null ? [] : [{
				label: "Борг після",
				amount_cents: e.balanceAfterCents
			}]
		],
		footer: ["Товар лишається під запис, доки його не оплачено повністю.", "Підпис покупця ________________"],
		printed_at: b(/* @__PURE__ */ new Date())
	};
}
function w(e) {
	return !e || e.kind === "none" ? null : e.kind === "printed" ? `Квитанцію надруковано (${e.printer})` : `Квитанцію не надруковано: ${e.error}`;
}
async function T(n) {
	let r = null;
	try {
		r = await c(o, t, e);
	} catch {
		return { kind: "none" };
	}
	if (!r) return { kind: "none" };
	try {
		return await s(r.name, n, r.paperWidth), {
			kind: "printed",
			printer: r.name
		};
	} catch (e) {
		return {
			kind: "failed",
			printer: r.name,
			error: e instanceof Error ? e.message : String(e)
		};
	}
}
// src/modules/debts/components/Sheet.tsx
function E({ title: e, onClose: t, children: n, wide: i, testId: o }) {
	return a(() => {
		let e = (e) => {
			e.key === "Escape" && t();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [t]), d(/* @__PURE__ */ u("div", {
		className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4",
		children: [/* @__PURE__ */ l("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: t,
			"aria-label": "Закрити"
		}), /* @__PURE__ */ u("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": e,
			"data-testid": o,
			className: `relative w-full ${i ? "max-w-lg" : "max-w-sm"} max-h-[92vh] overflow-auto bg-white rounded-t-card sm:rounded-card px-5 pt-5 pb-6 shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up text-sq-text`,
			children: [/* @__PURE__ */ u("div", {
				className: "flex items-start justify-between gap-3 mb-4",
				children: [/* @__PURE__ */ l("h2", {
					className: "text-[20px] font-bold text-sq-heading leading-tight",
					children: e
				}), /* @__PURE__ */ l("button", {
					type: "button",
					className: "-mr-1 -mt-1 h-10 w-10 grid place-items-center rounded-full hover:bg-sq-bg",
					onClick: t,
					"aria-label": "Закрити",
					children: /* @__PURE__ */ l(r, { size: 20 })
				})]
			}), n]
		})]
	}), document.body);
}
export { x as a, m as c, y as d, _ as f, T as i, p as l, S as n, w as o, g as p, C as r, h as s, E as t, v as u };
