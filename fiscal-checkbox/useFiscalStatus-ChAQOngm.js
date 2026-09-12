import { jsxs as m, jsx as d } from "react/jsx-runtime";
import { useState as u, useRef as F, useEffect as h, useCallback as E } from "react";
import * as i from "@pos/platform";
import { api as R } from "@pos/platform";
class y extends Error {
  constructor(e) {
    super(`host is missing: ${e.join(", ")}`), this.missing = e, this.name = "HostTooOldError";
  }
}
function x(t) {
  return typeof t == "function";
}
function _() {
  const t = [];
  return x(i.api?.posRequest) || t.push("api.posRequest"), t;
}
function N() {
  return typeof i.POS_APP_VERSION == "string" ? i.POS_APP_VERSION : "unknown";
}
function I() {
  return x(i.apiOrigin) ? i.apiOrigin() : "";
}
function r(t, e, n) {
  const s = _();
  return s.length > 0 ? Promise.reject(new y(s)) : i.api.posRequest(t, e, n);
}
function B() {
  return R.fiscalSettings();
}
function M(t) {
  return r("patch", "/fiscal/settings", { secrets: t });
}
function V() {
  return r("get", "/fiscal/status");
}
function G() {
  return r("post", "/fiscal/test-connection");
}
function U() {
  return r("post", "/fiscal/shift/open");
}
function J() {
  return r("post", "/fiscal/shift/close");
}
function K() {
  return r("post", "/fiscal/x-report");
}
function X(t) {
  return r("post", "/fiscal/service", { amount_cents: t });
}
function z() {
  return r("get", "/fiscal/attention");
}
function Q(t) {
  return r("post", "/fiscal/register/claim", {});
}
function W() {
  return r("post", "/fiscal/register/release", {});
}
function Y(t) {
  return r(
    "post",
    "/fiscal/register/handover/request",
    {}
  );
}
function Z(t) {
  return r("post", "/fiscal/register/handover/confirm", {
    outbox_pending: t
  });
}
function tt(t) {
  return r(
    "post",
    "/fiscal/register/handover/force",
    {}
  );
}
function k(t) {
  return !!t && typeof t == "object" && typeof t.error == "string";
}
const q = "1.1.1", S = {
  host_too_old: "HOST",
  server: "SRV",
  network: "NET",
  unknown: "UNK"
};
function w(t) {
  const e = t?.response?.data;
  return k(e) ? e : null;
}
function A(t) {
  const e = t?.response?.status;
  return typeof e == "number" ? e : null;
}
function P(t, e) {
  return t instanceof y ? "host_too_old" : e !== null ? "server" : t instanceof Error ? "network" : "unknown";
}
function b(t) {
  const e = A(t), n = w(t), s = {
    reason: P(t, e),
    status: e,
    serverError: n?.error ?? null,
    missingHostApi: _(),
    moduleVersion: q,
    hostVersion: N(),
    apiBase: I(),
    at: (/* @__PURE__ */ new Date()).toISOString()
  }, c = n?.support_code ?? `FC-${s.reason === "server" && e !== null ? `${S.server}${e}` : S[s.reason]}-${s.moduleVersion}-${s.hostVersion}`;
  return { ...s, code: c };
}
function H(t, e) {
  const n = w(t);
  if (n?.message) return n.message;
  switch (e.reason) {
    case "host_too_old":
      return "Оновіть застосунок каси, щоб продовжити";
    case "network":
      return "Немає звʼязку з сервером";
    default:
      return "Помилка ПРРО";
  }
}
function T(t) {
  return JSON.stringify({ module: "fiscal-checkbox", ...t }, null, 2);
}
const v = /* @__PURE__ */ new Set();
function C(t) {
  typeof window < "u" && (window.__POS_FISCAL_DIAG__ = t), !v.has(t.code) && (v.add(t.code), console.error(`[fiscal] ${t.code}`, t));
}
function et({ error: t }) {
  const [e, n] = u(!1), s = b(t), c = H(t, s);
  async function l() {
    try {
      await navigator.clipboard.writeText(T(s)), n(!0), setTimeout(() => n(!1), 2e3);
    } catch {
      n(!1);
    }
  }
  return /* @__PURE__ */ m("div", { role: "alert", className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700", children: [
    /* @__PURE__ */ d("p", { className: "font-semibold", children: c }),
    /* @__PURE__ */ m("div", { className: "mt-2 flex items-center gap-2", children: [
      /* @__PURE__ */ d(
        "code",
        {
          "data-testid": "fiscal-support-code",
          className: "select-all rounded-sq bg-white/60 px-2 py-1 font-mono text-xs text-red-800",
          children: s.code
        }
      ),
      /* @__PURE__ */ d(
        "button",
        {
          type: "button",
          onClick: () => void l(),
          className: "rounded-sq border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-white/50",
          children: e ? "Скопійовано" : "Копіювати деталі"
        }
      )
    ] })
  ] });
}
const $ = 5e3;
function st() {
  const [t, e] = u(null), [n, s] = u(!0), [c, l] = u(null), [O, p] = u(null), a = F(!0);
  h(() => (a.current = !0, () => {
    a.current = !1;
  }), []);
  const f = E(async () => {
    try {
      const o = await V();
      if (!a.current) return;
      e(o), l(null), p(null);
    } catch (o) {
      const g = b(o);
      C(g), a.current && (l(g), p(o));
    } finally {
      a.current && s(!1);
    }
  }, []);
  return h(() => {
    f();
    const o = setInterval(() => void f(), $);
    return () => clearInterval(o);
  }, [f]), { status: t, isLoading: n, diagnostic: c, error: O, refresh: f };
}
export {
  et as F,
  Q as a,
  Y as b,
  J as c,
  Z as d,
  X as e,
  K as f,
  B as g,
  tt as h,
  z as l,
  U as o,
  W as r,
  M as s,
  G as t,
  st as u
};
