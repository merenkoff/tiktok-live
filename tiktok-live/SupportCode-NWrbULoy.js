import { useCallback as e, useEffect as t, useRef as n, useState as r } from "react";
import * as i from "@pos/platform";
import { jsx as a, jsxs as o } from "react/jsx-runtime";
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function s(e) {
	"@babel/helpers - typeof";
	return s = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, s(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function c(e, t) {
	if (s(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (s(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function l(e) {
	var t = c(e, "string");
	return s(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function u(e, t, n) {
	return (t = l(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/tiktok-live/lib/hostPlatform.ts
var d = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), u(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function f(e) {
	return typeof e == "function";
}
function p() {
	let e = [];
	return f(i.apiOrigin) || e.push("apiOrigin"), f(i.api?.liveSessionToken) || e.push("api.liveSessionToken"), f(i.usePosShell) || e.push("usePosShell"), e;
}
function m() {
	return typeof i.POS_APP_VERSION == "string" ? i.POS_APP_VERSION : "unknown";
}
function h() {
	return f(i.apiOrigin) ? i.apiOrigin() : "";
}
var g = f(i.usePosShell) ? i.usePosShell : null;
function _() {
	return g ? g() : "web";
}
function v() {
	let e = p();
	return e.length > 0 ? Promise.reject(new d(e)) : i.api.liveSessionToken();
}
function y() {
	return i.api ?? {};
}
function b() {
	let e = y(), t = [];
	return f(e.liveSettings) || t.push("api.liveSettings"), f(e.updateLiveSettings) || t.push("api.updateLiveSettings"), f(e.testLiveTelegram) || t.push("api.testLiveTelegram"), t;
}
function x() {
	return b().length === 0;
}
function S() {
	let e = b();
	if (e.length > 0) throw new d(e);
	return y();
}
function C() {
	try {
		return S().liveSettings();
	} catch (e) {
		return Promise.reject(e);
	}
}
function w(e) {
	try {
		return S().updateLiveSettings(e);
	} catch (e) {
		return Promise.reject(e);
	}
}
function T() {
	try {
		return S().testLiveTelegram();
	} catch (e) {
		return Promise.reject(e);
	}
}
//#endregion
//#region src/modules/tiktok-live/lib/wsUrl.ts
function E() {
	return h();
}
function D(e) {
	return e.startsWith("https://") ? `wss://${e.slice(8)}` : e.startsWith("http://") ? `ws://${e.slice(7)}` : e;
}
function O(e) {
	let t = E();
	return `${t ? D(t) : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`}/api/sessions/logs/stream?token=${encodeURIComponent(e)}`;
}
//#endregion
//#region src/modules/tiktok-live/lib/errors.ts
var k = class extends Error {
	constructor() {
		super("live_not_configured"), u(this, "status", 409), this.name = "LiveNotConfiguredError";
	}
}, A = class extends Error {
	constructor(e, t) {
		super(t), u(this, "status", void 0), this.status = e, this.name = "LiveApiError";
	}
}, j = "live_token", M = 864e5, N = null, P = !1, F = null;
function I(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function L() {
	if (N) return N;
	if (P) return null;
	P = !0;
	try {
		let e = localStorage.getItem(j);
		e && (N = JSON.parse(e));
	} catch {
		N = null;
	}
	return N;
}
function R() {
	N = null, P = !1, F = null;
	try {
		localStorage.removeItem(j);
	} catch {}
}
async function z() {
	try {
		let e = await v(), t = {
			token: e.token,
			expiresAt: e.expiresAt,
			username: e.user.tiktok_username
		};
		N = t, P = !0;
		try {
			localStorage.setItem(j, JSON.stringify(t));
		} catch {}
		return t;
	} catch (e) {
		throw I(e) === 409 ? (R(), new k()) : e;
	}
}
async function B(e = {}) {
	if (e.force) N = null;
	else {
		let e = L();
		if (e && Date.parse(e.expiresAt) - Date.now() > M) return e.token;
	}
	return F || (F = z().finally(() => {
		F = null;
	})), (await F).token;
}
function V() {
	return L()?.username ?? null;
}
function H(e, t, n) {
	return fetch(`${E()}${e}`, {
		...t,
		headers: {
			...t.headers ?? {},
			Authorization: `Bearer ${n}`
		}
	});
}
async function U(e, t = {}) {
	let n = await H(e, t, await B());
	if (n.status === 401 && (n = await H(e, t, await B({ force: !0 }))), !n.ok) throw new A(n.status, `${t.method ?? "GET"} ${e} → ${n.status}`);
	let r = await n.text();
	return r ? JSON.parse(r) : null;
}
var W = {
	bridgeToken: B,
	getCurrentSession: () => U("/api/sessions/current"),
	getSessionLogs: (e = 100) => U(`/api/sessions/logs?limit=${e}`),
	startSession: () => U("/api/sessions/start", { method: "POST" }),
	stopSession: () => U("/api/sessions/stop", { method: "POST" })
}, G = "2.2.0", K = {
	not_configured: "CFG",
	host_too_old: "HOST",
	server_missing_bridge: "SRV404",
	server_error: "SRV",
	network: "NET",
	unknown: "UNK"
};
function q(e) {
	if (e instanceof k || e instanceof A) return e.status;
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function J(e, t) {
	return e instanceof d ? "host_too_old" : t === 409 ? "not_configured" : t === 404 ? "server_missing_bridge" : t === null ? e instanceof Error ? "network" : "unknown" : "server_error";
}
function Y(e) {
	return `TL-${e.reason === "server_error" && e.status !== null ? `${K.server_error}${e.status}` : K[e.reason]}-${e.moduleVersion}-${e.hostVersion}`;
}
function X(e) {
	let t = q(e), n = {
		reason: J(e, t),
		status: t,
		missingHostApi: p(),
		moduleVersion: G,
		hostVersion: m(),
		apiBase: h(),
		at: (/* @__PURE__ */ new Date()).toISOString()
	};
	return {
		...n,
		code: Y(n)
	};
}
function Z(e) {
	return JSON.stringify({
		module: "tiktok-live",
		...e
	}, null, 2);
}
var Q = /* @__PURE__ */ new Set();
function $(e) {
	typeof window < "u" && (window.__POS_TIKTOK_LIVE_DIAG__ = e), !Q.has(e.code) && (Q.add(e.code), console.error(`[tiktok-live] ${e.code}`, e));
}
//#endregion
//#region src/modules/tiktok-live/hooks/useLiveSession.ts
var ee = 5e3;
function te(i) {
	let [a, o] = r(null), [s, c] = r(!0), [l, u] = r(!1), [d, f] = r(null), [p, m] = r(!1), [h, g] = r(!1), [_, v] = r(null), y = n(!0);
	t(() => (y.current = !0, () => {
		y.current = !1;
	}), []);
	let b = e(async () => {
		try {
			let e = await W.getCurrentSession();
			if (!y.current) return;
			o(e), u(!1), f(null);
		} catch (e) {
			let t = X(e);
			$(t), y.current && (u(!0), f(t));
		} finally {
			y.current && c(!1);
		}
	}, []);
	t(() => {
		if (!i) return;
		b();
		let e = setInterval(() => void b(), ee);
		return () => clearInterval(e);
	}, [i, b]);
	let x = e(async () => {
		v(null), m(!0);
		try {
			await W.startSession(), await b();
		} catch {
			y.current && v("Не вдалося почати ефір");
		} finally {
			y.current && m(!1);
		}
	}, [b]), S = e(async () => {
		v(null), g(!0);
		try {
			await W.stopSession(), await b();
		} catch {
			y.current && v("Не вдалося зупинити ефір");
		} finally {
			y.current && g(!1);
		}
	}, [b]);
	return {
		session: a,
		isActive: a?.status === "running",
		isLoading: s,
		isError: l,
		diagnostic: d,
		isStarting: p,
		isStopping: h,
		actionError: _,
		start: x,
		stop: S,
		refresh: b
	};
}
//#endregion
//#region src/modules/tiktok-live/components/SupportCode.tsx
function ne({ diagnostic: e }) {
	let [t, n] = r(!1);
	async function i() {
		try {
			await navigator.clipboard.writeText(Z(e)), n(!0), setTimeout(() => n(!1), 2e3);
		} catch {
			n(!1);
		}
	}
	return /* @__PURE__ */ o("div", {
		className: "mt-6 border-t border-sq-divider pt-4 text-left",
		children: [
			/* @__PURE__ */ a("div", {
				className: "sq-section-label",
				children: "Код для підтримки"
			}),
			/* @__PURE__ */ o("div", {
				className: "mt-1.5 flex items-center gap-2",
				children: [/* @__PURE__ */ a("code", {
					"data-testid": "live-support-code",
					className: "select-all rounded-sq bg-sq-bg px-2 py-1 font-mono text-sm text-sq-text",
					children: e.code
				}), /* @__PURE__ */ a("button", {
					type: "button",
					onClick: () => void i(),
					className: "rounded-sq border border-sq-divider px-2.5 py-1 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
					children: t ? "Скопійовано" : "Копіювати деталі"
				})]
			}),
			/* @__PURE__ */ o("details", {
				className: "mt-3",
				children: [/* @__PURE__ */ a("summary", {
					className: "cursor-pointer text-xs text-sq-muted",
					children: "Технічні деталі"
				}), /* @__PURE__ */ a("pre", {
					className: "mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-bg p-2 font-mono text-[11px] leading-relaxed text-sq-secondary",
					children: Z(e)
				})]
			})
		]
	});
}
//#endregion
export { B as a, O as c, b as d, T as f, u as h, $ as i, x as l, _ as m, te as n, W as o, w as p, X as r, V as s, ne as t, C as u };
