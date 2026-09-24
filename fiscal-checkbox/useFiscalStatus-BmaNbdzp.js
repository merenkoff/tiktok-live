import { useCallback as e, useEffect as t, useId as n, useRef as r, useState as i } from "react";
import { jsx as a, jsxs as o } from "react/jsx-runtime";
import * as s from "@pos/platform";
import { api as c } from "@pos/platform";
//#region src/platform/glyphs.tsx
var l = () => n().replace(/:/g, "") + "-";
function u({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ a("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ a("rect", {
				x: "17",
				y: "13",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			})
		]
	});
}
function d({ size: e = 24, ...t }) {
	let n = l();
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "CloudOff",
		...t,
		children: [
			/* @__PURE__ */ o("mask", {
				id: n + "cut",
				maskUnits: "userSpaceOnUse",
				x: "0",
				y: "0",
				width: "24",
				height: "24",
				children: [/* @__PURE__ */ a("rect", {
					x: "0",
					y: "0",
					width: "24",
					height: "24",
					fill: "#FFFFFF"
				}), /* @__PURE__ */ a("path", {
					d: "M4 4 20 20",
					stroke: "#000000",
					strokeWidth: "5",
					strokeLinecap: "round"
				})]
			}),
			/* @__PURE__ */ o("g", {
				mask: "url(#" + n + "cut)",
				fill: "#8E9196",
				children: [
					/* @__PURE__ */ a("circle", {
						cx: "9",
						cy: "14",
						r: "4"
					}),
					/* @__PURE__ */ a("circle", {
						cx: "13.5",
						cy: "11.5",
						r: "5"
					}),
					/* @__PURE__ */ a("circle", {
						cx: "17.5",
						cy: "14.5",
						r: "3.5"
					}),
					/* @__PURE__ */ a("rect", {
						x: "9",
						y: "14",
						width: "9",
						height: "4"
					})
				]
			}),
			/* @__PURE__ */ a("path", {
				d: "M4 4 20 20",
				fill: "none",
				stroke: "#8E9196",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function f({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Lock",
		...t,
		children: [
			/* @__PURE__ */ a("path", {
				d: "M8 10V7.5a4 4 0 0 1 8 0V10",
				fill: "none",
				stroke: "#8E9196",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ a("rect", {
				x: "4",
				y: "10",
				width: "16",
				height: "11",
				rx: "3",
				fill: "#8E9196"
			}),
			/* @__PURE__ */ a("rect", {
				x: "11",
				y: "14",
				width: "2",
				height: "4",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".85"
			})
		]
	});
}
function p({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ShieldCheck",
		...t,
		children: [/* @__PURE__ */ a("path", {
			d: "M12 3 19 5.5V11.25C19 15.75 16 19.25 12 21 8 19.25 5 15.75 5 11.25V5.5Z",
			fill: "#6C7D93",
			stroke: "#6C7D93",
			strokeWidth: "2",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ a("path", {
			d: "M8.5 12 11 14.5 15.5 9.5",
			fill: "none",
			stroke: "#FFFFFF",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function m({ size: e = 20, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function h({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ a("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function g(e) {
	"@babel/helpers - typeof";
	return g = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, g(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function _(e, t) {
	if (g(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (g(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function v(e) {
	var t = _(e, "string");
	return g(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function y(e, t, n) {
	return (t = v(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/fiscal-core/lib/hostPlatform.ts
var b = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), y(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function x(e) {
	return typeof e == "function";
}
function S() {
	let e = [];
	return x(s.api?.posRequest) || e.push("api.posRequest"), e;
}
function C() {
	return typeof s.POS_APP_VERSION == "string" ? s.POS_APP_VERSION : "unknown";
}
function w() {
	return x(s.apiOrigin) ? s.apiOrigin() : "";
}
x(s.usePosShell) && s.usePosShell;
function T(e, t, n) {
	let r = S();
	return r.length > 0 ? Promise.reject(new b(r)) : s.api.posRequest(e, t, n);
}
//#endregion
//#region src/modules/fiscal-core/data/fiscalApi.ts
function E() {
	return c.fiscalSettings();
}
function D(e) {
	return T("patch", "/fiscal/settings", { secrets: e });
}
function O() {
	return T("get", "/fiscal/status");
}
function k() {
	return T("post", "/fiscal/test-connection");
}
function A() {
	return T("post", "/fiscal/shift/open");
}
function j() {
	return T("post", "/fiscal/shift/close");
}
function M() {
	return T("post", "/fiscal/x-report");
}
function N(e) {
	return T("post", "/fiscal/service", { amount_cents: e });
}
function P() {
	return T("get", "/fiscal/attention");
}
function F(e) {
	return T("post", "/fiscal/register/claim", e ? { device_name: e } : {});
}
function I() {
	return T("post", "/fiscal/register/release", {});
}
function L(e) {
	return T("post", "/fiscal/register/handover/request", e ? { device_name: e } : {});
}
function R(e, t = !1) {
	return T("post", "/fiscal/register/handover/confirm", {
		outbox_pending: e,
		...t ? { close_shift: !0 } : {}
	});
}
function z(e) {
	return T("post", "/fiscal/register/handover/force", e ? { device_id: e } : {});
}
//#endregion
//#region src/modules/fiscal-core/types.ts
function B(e) {
	return !!e && typeof e == "object" && typeof e.error == "string";
}
//#endregion
//#region src/modules/fiscal-core/lib/diagnostics.ts
var V = "2.4.0", H = {
	host_too_old: "HOST",
	server: "SRV",
	network: "NET",
	unknown: "UNK"
};
function U(e) {
	let t = e?.response?.data;
	return B(t) ? t : null;
}
function W(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function G(e, t) {
	return e instanceof b ? "host_too_old" : t === null ? e instanceof Error ? "network" : "unknown" : "server";
}
function K(e) {
	let t = W(e), n = U(e), r = {
		reason: G(e, t),
		status: t,
		serverError: n?.error ?? null,
		missingHostApi: S(),
		moduleVersion: V,
		hostVersion: C(),
		apiBase: w(),
		at: (/* @__PURE__ */ new Date()).toISOString()
	}, i = n?.support_code ?? `FC-${r.reason === "server" && t !== null ? `${H.server}${t}` : H[r.reason]}-${r.moduleVersion}-${r.hostVersion}`;
	return {
		...r,
		code: i
	};
}
function q(e, t) {
	let n = U(e);
	if (n?.message) return n.message;
	switch (t.reason) {
		case "host_too_old": return "Оновіть застосунок каси, щоб продовжити";
		case "network": return "Немає звʼязку з сервером";
		default: return "Помилка ПРРО";
	}
}
function J(e) {
	return JSON.stringify({
		module: "fiscal-checkbox",
		...e
	}, null, 2);
}
var Y = /* @__PURE__ */ new Set();
function X(e) {
	typeof window < "u" && (window.__POS_FISCAL_DIAG__ = e), !Y.has(e.code) && (Y.add(e.code), console.error(`[fiscal] ${e.code}`, e));
}
//#endregion
//#region src/modules/fiscal-core/components/FiscalErrorCard.tsx
function Z({ error: e }) {
	let [t, n] = i(!1), r = K(e), s = q(e, r);
	async function c() {
		try {
			await navigator.clipboard.writeText(J(r)), n(!0), setTimeout(() => n(!1), 2e3);
		} catch {
			n(!1);
		}
	}
	return /* @__PURE__ */ o("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [/* @__PURE__ */ a("p", {
			className: "font-semibold",
			children: s
		}), /* @__PURE__ */ o("div", {
			className: "mt-2 flex flex-wrap items-center gap-2",
			children: [/* @__PURE__ */ a("code", {
				"data-testid": "fiscal-support-code",
				className: "select-all rounded-md bg-white/70 px-2 py-1 font-mono text-[13px] text-red-800",
				children: r.code
			}), /* @__PURE__ */ a("button", {
				type: "button",
				onClick: () => void c(),
				className: "min-h-9 rounded-sq px-3 text-[13px] font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-white/60",
				children: t ? "Скопійовано" : "Копіювати деталі"
			})]
		})]
	});
}
//#endregion
//#region src/modules/fiscal-core/lib/deviceLabel.ts
function Q(e, t) {
	return e?.trim() || t.slice(0, 8);
}
//#endregion
//#region src/modules/fiscal-core/hooks/useFiscalStatus.ts
var $ = 5e3;
function ee() {
	let [n, a] = i(null), [o, s] = i(!0), [c, l] = i(null), [u, d] = i(null), f = r(!0);
	t(() => (f.current = !0, () => {
		f.current = !1;
	}), []);
	let p = e(async () => {
		try {
			let e = await O();
			if (!f.current) return;
			a(e), l(null), d(null);
		} catch (e) {
			let t = K(e);
			X(t), f.current && (l(t), d(e));
		} finally {
			f.current && s(!1);
		}
	}, []);
	return t(() => {
		p();
		let e = setInterval(() => void p(), $);
		return () => clearInterval(e);
	}, [p]), {
		status: n,
		isLoading: o,
		diagnostic: c,
		error: u,
		refresh: p
	};
}
//#endregion
export { p as S, m as _, j as a, d as b, M as c, P as d, A as f, k as g, D as h, F as i, z as l, L as m, Q as n, R as o, I as p, Z as r, N as s, ee as t, E as u, u as v, f as x, h as y };
