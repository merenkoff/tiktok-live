import { D as e } from "./debt-GvG7YbfE.js";
import { useEffect as t } from "react";
import { jsx as n, jsxs as r } from "react/jsx-runtime";
import { createPortal as i } from "react-dom";
var a = /* @__PURE__ */ new Map();
function o(e, t, n) {
	return `issue:${e}:${JSON.stringify([t, n])}`;
}
function s(e, t) {
	return `${e}:${t}`;
}
function c(e, t = Date.now()) {
	let n = a.get(e);
	return n ? t - n.at > 18e5 ? (a.delete(e), null) : n.key : null;
}
function l(e, t, n = Date.now()) {
	a.set(e, {
		key: t,
		at: n
	});
}
function u(e) {
	a.delete(e);
}
// src/modules/debts/components/Sheet.tsx
function d({ title: a, onClose: o, children: s, wide: c, testId: l }) {
	return t(() => {
		let e = (e) => {
			e.key === "Escape" && o();
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [o]), i(/* @__PURE__ */ r("div", {
		className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4",
		children: [/* @__PURE__ */ n("button", {
			type: "button",
			className: "absolute inset-0 bg-[rgba(28,32,38,.32)]",
			onClick: o,
			"aria-label": "Закрити"
		}), /* @__PURE__ */ r("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-label": a,
			"data-testid": l,
			className: `relative w-full ${c ? "max-w-lg" : "max-w-sm"} max-h-[92vh] overflow-auto bg-white rounded-t-card sm:rounded-card px-5 pt-5 pb-6 shadow-[0_24px_60px_rgba(0,20,60,.28)] animate-fade-up text-sq-text`,
			children: [/* @__PURE__ */ r("div", {
				className: "flex items-start justify-between gap-3 mb-4",
				children: [/* @__PURE__ */ n("h2", {
					className: "text-[20px] font-bold text-sq-heading leading-tight",
					children: a
				}), /* @__PURE__ */ n("button", {
					type: "button",
					className: "-mr-1 -mt-1 h-10 w-10 grid place-items-center rounded-full hover:bg-sq-bg",
					onClick: o,
					"aria-label": "Закрити",
					children: /* @__PURE__ */ n(e, { size: 20 })
				})]
			}), s]
		})]
	}), document.body);
}
export { u as a, l as i, s as n, c as o, o as r, d as t };
