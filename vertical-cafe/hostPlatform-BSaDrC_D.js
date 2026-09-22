import { createElement as e, forwardRef as t } from "react";
import * as n from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var r = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), i = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), a = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, o = t(({ color: t = "currentColor", size: n = 24, strokeWidth: r = 2, absoluteStrokeWidth: o, className: s = "", children: c, iconNode: l, ...u }, d) => e("svg", {
	ref: d,
	...a,
	width: n,
	height: n,
	stroke: t,
	strokeWidth: o ? Number(r) * 24 / Number(n) : r,
	className: i("lucide", s),
	...u
}, [...l.map(([t, n]) => e(t, n)), ...Array.isArray(c) ? c : [c]])), s = (n, a) => {
	let s = t(({ className: t, ...s }, c) => e(o, {
		ref: c,
		iconNode: a,
		className: i(`lucide-${r(n)}`, t),
		...s
	}));
	return s.displayName = `${n}`, s;
};
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function c(e) {
	"@babel/helpers - typeof";
	return c = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, c(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function l(e, t) {
	if (c(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (c(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function u(e) {
	var t = l(e, "string");
	return c(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function d(e, t, n) {
	return (t = u(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-cafe/lib/hostPlatform.ts
var f = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical",
	"assetUrl",
	"resolveLineModifiers",
	"lineCaption",
	"cartLineUid",
	"defaultModifierIds",
	"needsModifierSheet",
	"groupsOf",
	"useOfflineStatus",
	"api.posRequest"
], p = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), d(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function m(e) {
	return typeof e == "function";
}
function h(e) {
	return e.split(".").reduce((e, t) => e?.[t], n);
}
function g() {
	return f.filter((e) => !m(h(e)));
}
function _(e, t, r) {
	let i = g();
	return i.length > 0 ? Promise.reject(new p(i)) : n.api.posRequest(e, t, r);
}
async function v() {
	let e = h("cashierApi.refreshCatalog");
	m(e) && await e();
}
//#endregion
export { s as a, v as i, g as n, _ as r, p as t };
