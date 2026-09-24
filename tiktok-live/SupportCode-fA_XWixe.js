import { useCallback as e, useEffect as t, useId as n, useRef as r, useState as i } from "react";
import * as a from "@pos/platform";
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
//#region src/modules/tiktok-live/lib/hostPlatform.ts
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
	return p(a.apiOrigin) || e.push("apiOrigin"), p(a.api?.liveSessionToken) || e.push("api.liveSessionToken"), p(a.usePosShell) || e.push("usePosShell"), e;
}
function h() {
	return typeof a.POS_APP_VERSION == "string" ? a.POS_APP_VERSION : "unknown";
}
function g() {
	return p(a.apiOrigin) ? a.apiOrigin() : "";
}
var _ = p(a.usePosShell) ? a.usePosShell : null;
function v() {
	return _ ? _() : "web";
}
function y() {
	let e = m();
	return e.length > 0 ? Promise.reject(new f(e)) : a.api.liveSessionToken();
}
function b() {
	return a.api ?? {};
}
function x() {
	let e = b(), t = [];
	return p(e.liveSettings) || t.push("api.liveSettings"), p(e.updateLiveSettings) || t.push("api.updateLiveSettings"), p(e.testLiveTelegram) || t.push("api.testLiveTelegram"), t;
}
function S() {
	return x().length === 0;
}
function C() {
	let e = x();
	if (e.length > 0) throw new f(e);
	return b();
}
function w() {
	try {
		return C().liveSettings();
	} catch (e) {
		return Promise.reject(e);
	}
}
function T(e) {
	try {
		return C().updateLiveSettings(e);
	} catch (e) {
		return Promise.reject(e);
	}
}
function E() {
	try {
		return C().testLiveTelegram();
	} catch (e) {
		return Promise.reject(e);
	}
}
//#endregion
//#region src/modules/tiktok-live/lib/wsUrl.ts
function D() {
	return g();
}
function O(e) {
	return e.startsWith("https://") ? `wss://${e.slice(8)}` : e.startsWith("http://") ? `ws://${e.slice(7)}` : e;
}
function k(e) {
	let t = D();
	return `${t ? O(t) : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`}/api/sessions/logs/stream?token=${encodeURIComponent(e)}`;
}
//#endregion
//#region src/modules/tiktok-live/lib/errors.ts
var A = class extends Error {
	constructor() {
		super("live_not_configured"), d(this, "status", 409), this.name = "LiveNotConfiguredError";
	}
}, j = class extends Error {
	constructor(e, t) {
		super(t), d(this, "status", void 0), this.status = e, this.name = "LiveApiError";
	}
}, M = "live_token", N = 864e5, P = null, F = !1, I = null;
function L(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function R() {
	if (P) return P;
	if (F) return null;
	F = !0;
	try {
		let e = localStorage.getItem(M);
		e && (P = JSON.parse(e));
	} catch {
		P = null;
	}
	return P;
}
function z() {
	P = null, F = !1, I = null;
	try {
		localStorage.removeItem(M);
	} catch {}
}
async function B() {
	try {
		let e = await y(), t = {
			token: e.token,
			expiresAt: e.expiresAt,
			username: e.user.tiktok_username
		};
		P = t, F = !0;
		try {
			localStorage.setItem(M, JSON.stringify(t));
		} catch {}
		return t;
	} catch (e) {
		throw L(e) === 409 ? (z(), new A()) : e;
	}
}
async function V(e = {}) {
	if (e.force) P = null;
	else {
		let e = R();
		if (e && Date.parse(e.expiresAt) - Date.now() > N) return e.token;
	}
	return I || (I = B().finally(() => {
		I = null;
	})), (await I).token;
}
function ee() {
	return R()?.username ?? null;
}
function H(e, t, n) {
	return fetch(`${D()}${e}`, {
		...t,
		headers: {
			...t.headers ?? {},
			Authorization: `Bearer ${n}`
		}
	});
}
async function U(e, t = {}) {
	let n = await H(e, t, await V());
	if (n.status === 401 && (n = await H(e, t, await V({ force: !0 }))), !n.ok) throw new j(n.status, `${t.method ?? "GET"} ${e} → ${n.status}`);
	let r = await n.text();
	return r ? JSON.parse(r) : null;
}
var W = {
	bridgeToken: V,
	getCurrentSession: () => U("/api/sessions/current"),
	getSessionLogs: (e = 100) => U(`/api/sessions/logs?limit=${e}`),
	startSession: () => U("/api/sessions/start", { method: "POST" }),
	stopSession: () => U("/api/sessions/stop", { method: "POST" })
}, G = "2.4.0", K = {
	not_configured: "CFG",
	host_too_old: "HOST",
	server_missing_bridge: "SRV404",
	server_error: "SRV",
	network: "NET",
	unknown: "UNK"
};
function q(e) {
	if (e instanceof A || e instanceof j) return e.status;
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function J(e, t) {
	return e instanceof f ? "host_too_old" : t === 409 ? "not_configured" : t === 404 ? "server_missing_bridge" : t === null ? e instanceof Error ? "network" : "unknown" : "server_error";
}
function Y(e) {
	return `TL-${e.reason === "server_error" && e.status !== null ? `${K.server_error}${e.status}` : K[e.reason]}-${e.moduleVersion}-${e.hostVersion}`;
}
function X(e) {
	let t = q(e), n = {
		reason: J(e, t),
		status: t,
		missingHostApi: m(),
		moduleVersion: G,
		hostVersion: h(),
		apiBase: g(),
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
var te = 5e3;
function ne(n) {
	let [a, o] = i(null), [s, c] = i(!0), [l, u] = i(!1), [d, f] = i(null), [p, m] = i(!1), [h, g] = i(!1), [_, v] = i(null), y = r(!0);
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
		if (!n) return;
		b();
		let e = setInterval(() => void b(), te);
		return () => clearInterval(e);
	}, [n, b]);
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
//#region src/platform/glyphs.tsx
var re = () => n().replace(/:/g, "") + "-";
function ie({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "AlertTriangle",
		...t,
		children: [
			/* @__PURE__ */ o("path", {
				d: "M12 3.5c.5 0 1 .25 1.25.75l8 14A1.5 1.5 0 0 1 20 20.5H4a1.5 1.5 0 0 1-1.25-2.25l8-14c.25-.5.75-.75 1.25-.75Z",
				fill: "#F4891F"
			}),
			/* @__PURE__ */ o("rect", {
				x: "11",
				y: "9",
				width: "2",
				height: "6",
				rx: "1",
				fill: "#FFFFFF"
			}),
			/* @__PURE__ */ o("circle", {
				cx: "12",
				cy: "17.25",
				r: "1.25",
				fill: "#FFFFFF"
			})
		]
	});
}
function ae({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Download",
		...t,
		children: [/* @__PURE__ */ o("path", {
			d: "M4 14v3.5A3.5 3.5 0 0 0 7.5 21h9a3.5 3.5 0 0 0 3.5-3.5V14",
			fill: "none",
			stroke: "#1B9DF0",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M12 3v11M7.5 9.5 12 14l4.5-4.5",
			fill: "none",
			stroke: "#1B9DF0",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function oe({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "FileText",
		...t,
		children: [
			/* @__PURE__ */ o("path", {
				d: "M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
				fill: "#1B9DF0",
				fillOpacity: ".22",
				stroke: "#1B9DF0",
				strokeWidth: "2",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M14 3v5h5",
				fill: "none",
				stroke: "#1B9DF0",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M9 12H15M9 16H13",
				fill: "none",
				stroke: "#1B9DF0",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function se({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Info",
		...t,
		children: [
			/* @__PURE__ */ o("circle", {
				cx: "12",
				cy: "12",
				r: "9.5",
				fill: "#1B9DF0"
			}),
			/* @__PURE__ */ o("rect", {
				x: "11",
				y: "11",
				width: "2",
				height: "6",
				rx: "1",
				fill: "#FFFFFF"
			}),
			/* @__PURE__ */ o("circle", {
				cx: "12",
				cy: "7.75",
				r: "1.25",
				fill: "#FFFFFF"
			})
		]
	});
}
function ce({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "MessageCircle",
		...t,
		children: [/* @__PURE__ */ o("path", {
			d: "M12 4c5 0 9 3.25 9 7.5S17 19 12 19c-1 0-2-.25-2.75-.5L5 20.5l1.25-3.5C4.25 15.5 3 13.5 3 11.5 3 7.25 7 4 12 4Z",
			fill: "#1B9DF0",
			fillOpacity: ".22",
			stroke: "#1B9DF0",
			strokeWidth: "2",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ s("g", {
			fill: "#1B9DF0",
			children: [
				/* @__PURE__ */ o("circle", {
					cx: "8.5",
					cy: "11.5",
					r: "1.25"
				}),
				/* @__PURE__ */ o("circle", {
					cx: "12",
					cy: "11.5",
					r: "1.25"
				}),
				/* @__PURE__ */ o("circle", {
					cx: "15.5",
					cy: "11.5",
					r: "1.25"
				})
			]
		})]
	});
}
function le({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "PackageCheck",
		...t,
		children: [
			/* @__PURE__ */ o("path", {
				d: "M5 3H19L21 7H3Z",
				fill: "#C0A96B",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ o("rect", {
				x: "3",
				y: "7",
				width: "18",
				height: "14",
				rx: "2.5",
				fill: "#C0A96B"
			}),
			/* @__PURE__ */ o("path", {
				d: "M8.5 13.5 11 16l4.5-4.5",
				fill: "none",
				stroke: "#FFFFFF",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function ue({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ShoppingBag",
		...t,
		children: [
			/* @__PURE__ */ o("path", {
				d: "M9 9V7a3 3 0 0 1 6 0v2",
				fill: "none",
				stroke: "#EE5B93",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1Z",
				fill: "#EE5B93"
			}),
			/* @__PURE__ */ s("g", {
				fill: "#FFFFFF",
				fillOpacity: ".7",
				children: [/* @__PURE__ */ o("circle", {
					cx: "9",
					cy: "11.5",
					r: "1.25"
				}), /* @__PURE__ */ o("circle", {
					cx: "15",
					cy: "11.5",
					r: "1.25"
				})]
			})
		]
	});
}
function de({ size: e = 24, ...t }) {
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Video",
		...t,
		children: [
			/* @__PURE__ */ o("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FF3D7A"
			}),
			/* @__PURE__ */ o("path", {
				d: "M7.75 7.75A6 6 0 0 0 7.75 16.25M16.25 7.75A6 6 0 0 1 16.25 16.25",
				fill: "none",
				stroke: "#FF3D7A",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ o("path", {
				d: "M5.5 5.5A9.25 9.25 0 0 0 5.5 18.5M18.5 5.5A9.25 9.25 0 0 1 18.5 18.5",
				fill: "none",
				stroke: "#FF3D7A",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				strokeOpacity: ".5"
			})
		]
	});
}
function fe({ size: e = 24, ...t }) {
	let n = re();
	return /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "WifiOff",
		...t,
		children: [
			/* @__PURE__ */ s("mask", {
				id: n + "cut",
				maskUnits: "userSpaceOnUse",
				x: "0",
				y: "0",
				width: "24",
				height: "24",
				children: [/* @__PURE__ */ o("rect", {
					x: "0",
					y: "0",
					width: "24",
					height: "24",
					fill: "#FFFFFF"
				}), /* @__PURE__ */ o("path", {
					d: "M4 4 20 20",
					stroke: "#000000",
					strokeWidth: "5",
					strokeLinecap: "round"
				})]
			}),
			/* @__PURE__ */ s("g", {
				mask: "url(#" + n + "cut)",
				children: [/* @__PURE__ */ o("path", {
					d: "M5.25 11.25a9.5 9.5 0 0 1 13.5 0M8.5 14.5a5 5 0 0 1 7 0",
					fill: "none",
					stroke: "#6C7D93",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ o("circle", {
					cx: "12",
					cy: "18.5",
					r: "1.75",
					fill: "#6C7D93"
				})]
			}),
			/* @__PURE__ */ o("path", {
				d: "M4 4 20 20",
				fill: "none",
				stroke: "#6C7D93",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function pe({ size: e = 24, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Wrench",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M14.5 3.5a5 5 0 0 0-4.75 6.5L3.5 16.25a2 2 0 0 0 0 2.75l1.5 1.5a2 2 0 0 0 2.75 0L14 14.25a5 5 0 0 0 6.5-4.75l-3 3-2.5-.5-.5-2.5 3-3Z",
			fill: "#8E9196"
		})
	});
}
function me({ size: e = 20, ...t }) {
	return /* @__PURE__ */ o("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ o("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function he({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "RefreshCw",
		...t,
		children: [/* @__PURE__ */ o("path", {
			d: "M13 7A5 5 0 0 0 4 4.5M3 9a5 5 0 0 0 9 2.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M3 2v3h3M13 14v-3h-3",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	}) : /* @__PURE__ */ s("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "RefreshCw",
		...t,
		children: [/* @__PURE__ */ o("path", {
			d: "M16.5 9A6.5 6.5 0 0 0 4.5 6M3.5 11a6.5 6.5 0 0 0 12 3",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ o("path", {
			d: "M4 2v4h4M16 18v-4h-4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
//#endregion
//#region src/modules/tiktok-live/components/SupportCode.tsx
function ge({ diagnostic: e }) {
	let [t, n] = i(!1);
	async function r() {
		try {
			await navigator.clipboard.writeText(Z(e)), n(!0), setTimeout(() => n(!1), 2e3);
		} catch {
			n(!1);
		}
	}
	return /* @__PURE__ */ s("div", {
		className: "mt-6 border-t border-sq-divider pt-4 text-left",
		children: [
			/* @__PURE__ */ o("div", {
				className: "text-[13px] font-semibold text-sq-secondary",
				children: "Код для підтримки"
			}),
			/* @__PURE__ */ s("div", {
				className: "mt-1.5 flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ o("code", {
					"data-testid": "live-support-code",
					className: "select-all rounded-md bg-sq-empty px-2 py-1 font-mono text-sm text-sq-text",
					children: e.code
				}), /* @__PURE__ */ o("button", {
					type: "button",
					onClick: () => void r(),
					className: "min-h-9 px-3 rounded-sq bg-white ring-1 ring-sq-divider text-[13px] font-semibold text-sq-text hover:bg-sq-sidebar",
					children: t ? "Скопійовано" : "Копіювати деталі"
				})]
			}),
			/* @__PURE__ */ s("details", {
				className: "mt-3",
				children: [/* @__PURE__ */ o("summary", {
					className: "cursor-pointer text-[13px] text-sq-muted",
					children: "Технічні деталі"
				}), /* @__PURE__ */ o("pre", {
					className: "mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-sidebar p-2.5 font-mono text-[11px] leading-relaxed text-sq-secondary",
					children: Z(e)
				})]
			})
		]
	});
}
//#endregion
export { x as C, d as D, v as E, w as S, T, V as _, oe as a, k as b, le as c, de as d, fe as f, $ as g, X as h, ae as i, he as l, ne as m, ie as n, se as o, pe as p, me as r, ce as s, ge as t, ue as u, W as v, E as w, S as x, ee as y };
