var Q = Object.defineProperty;
var X = (t, e, s) => e in t ? Q(t, e, { enumerable: !0, configurable: !0, writable: !0, value: s }) : t[e] = s;
var A = (t, e, s) => X(t, typeof e != "symbol" ? e + "" : e, s);
import { useState as o, useRef as Z, useEffect as b, useCallback as m } from "react";
import { jsxs as S, jsx as f } from "react/jsx-runtime";
import * as n from "@pos/platform";
class y extends Error {
  constructor(e) {
    super(`host is missing: ${e.join(", ")}`), this.missing = e, this.name = "HostTooOldError";
  }
}
function u(t) {
  return typeof t == "function";
}
function C() {
  const t = [];
  return u(n.apiOrigin) || t.push("apiOrigin"), u(n.api?.liveSessionToken) || t.push("api.liveSessionToken"), u(n.usePosShell) || t.push("usePosShell"), t;
}
function tt() {
  return typeof n.POS_APP_VERSION == "string" ? n.POS_APP_VERSION : "unknown";
}
function R() {
  return u(n.apiOrigin) ? n.apiOrigin() : "";
}
const N = u(n.usePosShell) ? n.usePosShell : null;
function St() {
  return N ? N() : "web";
}
function et() {
  const t = C();
  return t.length > 0 ? Promise.reject(new y(t)) : n.api.liveSessionToken();
}
function V() {
  return n.api ?? {};
}
function j() {
  const t = V(), e = [];
  return u(t.liveSettings) || e.push("api.liveSettings"), u(t.updateLiveSettings) || e.push("api.updateLiveSettings"), u(t.testLiveTelegram) || e.push("api.testLiveTelegram"), e;
}
function vt() {
  return j().length === 0;
}
function _() {
  const t = j();
  if (t.length > 0) throw new y(t);
  return V();
}
function wt() {
  try {
    return _().liveSettings();
  } catch (t) {
    return Promise.reject(t);
  }
}
function yt(t) {
  try {
    return _().updateLiveSettings(t);
  } catch (e) {
    return Promise.reject(e);
  }
}
function _t() {
  try {
    return _().testLiveTelegram();
  } catch (t) {
    return Promise.reject(t);
  }
}
function F() {
  return R();
}
function st(t) {
  return t.startsWith("https://") ? `wss://${t.slice(8)}` : t.startsWith("http://") ? `ws://${t.slice(7)}` : t;
}
function xt(t) {
  const e = F();
  return `${e ? st(e) : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`}/api/sessions/logs/stream?token=${encodeURIComponent(t)}`;
}
class D extends Error {
  constructor() {
    super("live_not_configured");
    /** The bridge's HTTP status, so `diagnose()` classifies it like any other. */
    A(this, "status", 409);
    this.name = "LiveNotConfiguredError";
  }
}
class H extends Error {
  constructor(e, s) {
    super(s), this.status = e, this.name = "LiveApiError";
  }
}
const x = "live_token", nt = 24 * 60 * 60 * 1e3;
let a = null, h = !1, p = null;
function rt(t) {
  const e = t?.response?.status;
  return typeof e == "number" ? e : null;
}
function G() {
  if (a) return a;
  if (h) return null;
  h = !0;
  try {
    const t = localStorage.getItem(x);
    t && (a = JSON.parse(t));
  } catch {
    a = null;
  }
  return a;
}
function it() {
  a = null, h = !1, p = null;
  try {
    localStorage.removeItem(x);
  } catch {
  }
}
async function ot() {
  try {
    const t = await et(), e = {
      token: t.token,
      expiresAt: t.expiresAt,
      username: t.user.tiktok_username
    };
    a = e, h = !0;
    try {
      localStorage.setItem(x, JSON.stringify(e));
    } catch {
    }
    return e;
  } catch (t) {
    throw rt(t) === 409 ? (it(), new D()) : t;
  }
}
async function w(t = {}) {
  if (t.force)
    a = null;
  else {
    const e = G();
    if (e && Date.parse(e.expiresAt) - Date.now() > nt) return e.token;
  }
  return p || (p = ot().finally(() => {
    p = null;
  })), (await p).token;
}
function Ot() {
  return G()?.username ?? null;
}
function $(t, e, s) {
  return fetch(`${F()}${t}`, {
    ...e,
    headers: { ...e.headers ?? {}, Authorization: `Bearer ${s}` }
  });
}
async function g(t, e = {}) {
  let s = await $(t, e, await w());
  if (s.status === 401 && (s = await $(t, e, await w({ force: !0 }))), !s.ok) throw new H(s.status, `${e.method ?? "GET"} ${t} → ${s.status}`);
  const c = await s.text();
  return c ? JSON.parse(c) : null;
}
const v = {
  bridgeToken: w,
  /** `null` when no session is running — an empty state, not an error. */
  getCurrentSession: () => g("/api/sessions/current"),
  getSessionLogs: (t = 100) => g(`/api/sessions/logs?limit=${t}`),
  startSession: () => g("/api/sessions/start", { method: "POST" }),
  stopSession: () => g("/api/sessions/stop", { method: "POST" })
}, at = "1.0.9", P = {
  not_configured: "CFG",
  host_too_old: "HOST",
  server_missing_bridge: "SRV404",
  server_error: "SRV",
  network: "NET",
  unknown: "UNK"
};
function ut(t) {
  if (t instanceof D || t instanceof H)
    return t.status;
  const e = t?.response?.status;
  return typeof e == "number" ? e : null;
}
function ct(t, e) {
  return t instanceof y ? "host_too_old" : e === 409 ? "not_configured" : e === 404 ? "server_missing_bridge" : e !== null ? "server_error" : t instanceof Error ? "network" : "unknown";
}
function lt(t) {
  return `TL-${t.reason === "server_error" && t.status !== null ? `${P.server_error}${t.status}` : P[t.reason]}-${t.moduleVersion}-${t.hostVersion}`;
}
function ft(t) {
  const e = ut(t), s = {
    reason: ct(t, e),
    status: e,
    missingHostApi: C(),
    moduleVersion: at,
    hostVersion: tt(),
    apiBase: R(),
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { ...s, code: lt(s) };
}
function I(t) {
  return JSON.stringify({ module: "tiktok-live", ...t }, null, 2);
}
const q = /* @__PURE__ */ new Set();
function pt(t) {
  typeof window < "u" && (window.__POS_TIKTOK_LIVE_DIAG__ = t), !q.has(t.code) && (q.add(t.code), console.error(`[tiktok-live] ${t.code}`, t));
}
const dt = 5e3;
function Et(t) {
  const [e, s] = o(null), [c, U] = o(!0), [B, O] = o(!1), [J, E] = o(null), [K, k] = o(!1), [M, T] = o(!1), [W, d] = o(null), r = Z(!0);
  b(() => (r.current = !0, () => {
    r.current = !1;
  }), []);
  const i = m(async () => {
    try {
      const l = await v.getCurrentSession();
      if (!r.current) return;
      s(l), O(!1), E(null);
    } catch (l) {
      const L = ft(l);
      pt(L), r.current && (O(!0), E(L));
    } finally {
      r.current && U(!1);
    }
  }, []);
  b(() => {
    if (!t) return;
    i();
    const l = setInterval(() => void i(), dt);
    return () => clearInterval(l);
  }, [t, i]);
  const z = m(async () => {
    d(null), k(!0);
    try {
      await v.startSession(), await i();
    } catch {
      r.current && d("Не вдалося почати ефір");
    } finally {
      r.current && k(!1);
    }
  }, [i]), Y = m(async () => {
    d(null), T(!0);
    try {
      await v.stopSession(), await i();
    } catch {
      r.current && d("Не вдалося зупинити ефір");
    } finally {
      r.current && T(!1);
    }
  }, [i]);
  return {
    session: e,
    isActive: e?.status === "running",
    isLoading: c,
    isError: B,
    diagnostic: J,
    isStarting: K,
    isStopping: M,
    actionError: W,
    start: z,
    stop: Y,
    refresh: i
  };
}
function kt({ diagnostic: t }) {
  const [e, s] = o(!1);
  async function c() {
    try {
      await navigator.clipboard.writeText(I(t)), s(!0), setTimeout(() => s(!1), 2e3);
    } catch {
      s(!1);
    }
  }
  return /* @__PURE__ */ S("div", { className: "mt-6 border-t border-sq-divider pt-4 text-left", children: [
    /* @__PURE__ */ f("div", { className: "sq-section-label", children: "Код для підтримки" }),
    /* @__PURE__ */ S("div", { className: "mt-1.5 flex items-center gap-2", children: [
      /* @__PURE__ */ f(
        "code",
        {
          "data-testid": "live-support-code",
          className: "select-all rounded-sq bg-sq-bg px-2 py-1 font-mono text-sm text-sq-text",
          children: t.code
        }
      ),
      /* @__PURE__ */ f(
        "button",
        {
          type: "button",
          onClick: () => void c(),
          className: "rounded-sq border border-sq-divider px-2.5 py-1 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
          children: e ? "Скопійовано" : "Копіювати деталі"
        }
      )
    ] }),
    /* @__PURE__ */ S("details", { className: "mt-3", children: [
      /* @__PURE__ */ f("summary", { className: "cursor-pointer text-xs text-sq-muted", children: "Технічні деталі" }),
      /* @__PURE__ */ f("pre", { className: "mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-bg p-2 font-mono text-[11px] leading-relaxed text-sq-secondary", children: I(t) })
    ] })
  ] });
}
export {
  kt as S,
  v as a,
  w as b,
  xt as c,
  ft as d,
  Et as e,
  wt as f,
  yt as g,
  vt as h,
  Ot as l,
  j as m,
  pt as r,
  _t as t,
  St as u
};
