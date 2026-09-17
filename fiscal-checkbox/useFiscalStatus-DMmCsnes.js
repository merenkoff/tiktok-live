import { useCallback as e, useEffect as t, useRef as n, useState as r } from "react";
import * as i from "@pos/platform";
import { api as a } from "@pos/platform";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
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
//#region src/modules/fiscal-core/lib/hostPlatform.ts
var f = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), d(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function p(e) {
	return typeof e == "function";
}
function m() {
	let e = [];
	return p(i.api?.posRequest) || e.push("api.posRequest"), e;
}
function h() {
	return typeof i.POS_APP_VERSION == "string" ? i.POS_APP_VERSION : "unknown";
}
function g() {
	return p(i.apiOrigin) ? i.apiOrigin() : "";
}
p(i.usePosShell) && i.usePosShell;
function _(e, t, n) {
	let r = m();
	return r.length > 0 ? Promise.reject(new f(r)) : i.api.posRequest(e, t, n);
}
//#endregion
//#region src/modules/fiscal-core/data/fiscalApi.ts
function v() {
	return a.fiscalSettings();
}
function y(e) {
	return _("patch", "/fiscal/settings", { secrets: e });
}
function b() {
	return _("get", "/fiscal/status");
}
function x() {
	return _("post", "/fiscal/test-connection");
}
function S() {
	return _("post", "/fiscal/shift/open");
}
function C() {
	return _("post", "/fiscal/shift/close");
}
function w() {
	return _("post", "/fiscal/x-report");
}
function T(e) {
	return _("post", "/fiscal/service", { amount_cents: e });
}
function E() {
	return _("get", "/fiscal/attention");
}
function D(e) {
	return _("post", "/fiscal/register/claim", e ? { device_name: e } : {});
}
function O() {
	return _("post", "/fiscal/register/release", {});
}
function k(e) {
	return _("post", "/fiscal/register/handover/request", e ? { device_name: e } : {});
}
function A(e, t = !1) {
	return _("post", "/fiscal/register/handover/confirm", {
		outbox_pending: e,
		...t ? { close_shift: !0 } : {}
	});
}
function j(e) {
	return _("post", "/fiscal/register/handover/force", e ? { device_id: e } : {});
}
//#endregion
//#region src/modules/fiscal-core/types.ts
function M(e) {
	return !!e && typeof e == "object" && typeof e.error == "string";
}
//#endregion
//#region src/modules/fiscal-core/lib/diagnostics.ts
var N = "2.0.0", P = {
	host_too_old: "HOST",
	server: "SRV",
	network: "NET",
	unknown: "UNK"
};
function F(e) {
	let t = e?.response?.data;
	return M(t) ? t : null;
}
function I(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function L(e, t) {
	return e instanceof f ? "host_too_old" : t === null ? e instanceof Error ? "network" : "unknown" : "server";
}
function R(e) {
	let t = I(e), n = F(e), r = {
		reason: L(e, t),
		status: t,
		serverError: n?.error ?? null,
		missingHostApi: m(),
		moduleVersion: N,
		hostVersion: h(),
		apiBase: g(),
		at: (/* @__PURE__ */ new Date()).toISOString()
	}, i = n?.support_code ?? `FC-${r.reason === "server" && t !== null ? `${P.server}${t}` : P[r.reason]}-${r.moduleVersion}-${r.hostVersion}`;
	return {
		...r,
		code: i
	};
}
function z(e, t) {
	let n = F(e);
	if (n?.message) return n.message;
	switch (t.reason) {
		case "host_too_old": return "Оновіть застосунок каси, щоб продовжити";
		case "network": return "Немає звʼязку з сервером";
		default: return "Помилка ПРРО";
	}
}
function B(e) {
	return JSON.stringify({
		module: "fiscal-checkbox",
		...e
	}, null, 2);
}
var V = /* @__PURE__ */ new Set();
function H(e) {
	typeof window < "u" && (window.__POS_FISCAL_DIAG__ = e), !V.has(e.code) && (V.add(e.code), console.error(`[fiscal] ${e.code}`, e));
}
//#endregion
//#region src/modules/fiscal-core/components/FiscalErrorCard.tsx
function U({ error: e }) {
	let [t, n] = r(!1), i = R(e), a = z(e, i);
	async function c() {
		try {
			await navigator.clipboard.writeText(B(i)), n(!0), setTimeout(() => n(!1), 2e3);
		} catch {
			n(!1);
		}
	}
	return /* @__PURE__ */ s("div", {
		role: "alert",
		className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700",
		children: [/* @__PURE__ */ o("p", {
			className: "font-semibold",
			children: a
		}), /* @__PURE__ */ s("div", {
			className: "mt-2 flex items-center gap-2",
			children: [/* @__PURE__ */ o("code", {
				"data-testid": "fiscal-support-code",
				className: "select-all rounded-sq bg-white/60 px-2 py-1 font-mono text-xs text-red-800",
				children: i.code
			}), /* @__PURE__ */ o("button", {
				type: "button",
				onClick: () => void c(),
				className: "rounded-sq border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-white/50",
				children: t ? "Скопійовано" : "Копіювати деталі"
			})]
		})]
	});
}
//#endregion
//#region src/modules/fiscal-core/lib/deviceLabel.ts
function W(e, t) {
	return e?.trim() || t.slice(0, 8);
}
//#endregion
//#region src/modules/fiscal-core/hooks/useFiscalStatus.ts
var G = 5e3;
function K() {
	let [i, a] = r(null), [o, s] = r(!0), [c, l] = r(null), [u, d] = r(null), f = n(!0);
	t(() => (f.current = !0, () => {
		f.current = !1;
	}), []);
	let p = e(async () => {
		try {
			let e = await b();
			if (!f.current) return;
			a(e), l(null), d(null);
		} catch (e) {
			let t = R(e);
			H(t), f.current && (l(t), d(e));
		} finally {
			f.current && s(!1);
		}
	}, []);
	return t(() => {
		p();
		let e = setInterval(() => void p(), G);
		return () => clearInterval(e);
	}, [p]), {
		status: i,
		isLoading: o,
		diagnostic: c,
		error: u,
		refresh: p
	};
}
//#endregion
export { C as a, w as c, E as d, S as f, x as g, y as h, D as i, j as l, k as m, W as n, A as o, O as p, U as r, T as s, K as t, v as u };
