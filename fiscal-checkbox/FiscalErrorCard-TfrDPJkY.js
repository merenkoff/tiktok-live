import * as r from "@pos/platform";
import { api as h } from "@pos/platform";
import { jsxs as a, jsx as c } from "react/jsx-runtime";
import { useState as S } from "react";
class l extends Error {
  constructor(e) {
    super(`host is missing: ${e.join(", ")}`), this.missing = e, this.name = "HostTooOldError";
  }
}
function d(t) {
  return typeof t == "function";
}
function p() {
  const t = [];
  return d(r.api?.posRequest) || t.push("api.posRequest"), t;
}
function x() {
  return typeof r.POS_APP_VERSION == "string" ? r.POS_APP_VERSION : "unknown";
}
function y() {
  return d(r.apiOrigin) ? r.apiOrigin() : "";
}
function o(t, e, n) {
  const s = p();
  return s.length > 0 ? Promise.reject(new l(s)) : r.api.posRequest(t, e, n);
}
function A() {
  return h.fiscalSettings();
}
function k(t) {
  return o("patch", "/fiscal/settings", { secrets: t });
}
function P() {
  return o("get", "/fiscal/status");
}
function T() {
  return o("post", "/fiscal/test-connection");
}
function q() {
  return o("post", "/fiscal/shift/open");
}
function $() {
  return o("post", "/fiscal/shift/close");
}
function C() {
  return o("post", "/fiscal/x-report");
}
function I(t) {
  return o("post", "/fiscal/service", { amount_cents: t });
}
function j() {
  return o("get", "/fiscal/attention");
}
function _(t) {
  return !!t && typeof t == "object" && typeof t.error == "string";
}
const w = "1.1.0", u = {
  host_too_old: "HOST",
  server: "SRV",
  network: "NET",
  unknown: "UNK"
};
function m(t) {
  const e = t?.response?.data;
  return _(e) ? e : null;
}
function b(t) {
  const e = t?.response?.status;
  return typeof e == "number" ? e : null;
}
function O(t, e) {
  return t instanceof l ? "host_too_old" : e !== null ? "server" : t instanceof Error ? "network" : "unknown";
}
function F(t) {
  const e = b(t), n = m(t), s = {
    reason: O(t, e),
    status: e,
    serverError: n?.error ?? null,
    missingHostApi: p(),
    moduleVersion: w,
    hostVersion: x(),
    apiBase: y(),
    at: (/* @__PURE__ */ new Date()).toISOString()
  }, i = n?.support_code ?? `FC-${s.reason === "server" && e !== null ? `${u.server}${e}` : u[s.reason]}-${s.moduleVersion}-${s.hostVersion}`;
  return { ...s, code: i };
}
function E(t, e) {
  const n = m(t);
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
function N(t) {
  return JSON.stringify({ module: "fiscal-checkbox", ...t }, null, 2);
}
const f = /* @__PURE__ */ new Set();
function H(t) {
  typeof window < "u" && (window.__POS_FISCAL_DIAG__ = t), !f.has(t.code) && (f.add(t.code), console.error(`[fiscal] ${t.code}`, t));
}
function B({ error: t }) {
  const [e, n] = S(!1), s = F(t), i = E(t, s);
  async function g() {
    try {
      await navigator.clipboard.writeText(N(s)), n(!0), setTimeout(() => n(!1), 2e3);
    } catch {
      n(!1);
    }
  }
  return /* @__PURE__ */ a("div", { role: "alert", className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700", children: [
    /* @__PURE__ */ c("p", { className: "font-semibold", children: i }),
    /* @__PURE__ */ a("div", { className: "mt-2 flex items-center gap-2", children: [
      /* @__PURE__ */ c(
        "code",
        {
          "data-testid": "fiscal-support-code",
          className: "select-all rounded-sq bg-white/60 px-2 py-1 font-mono text-xs text-red-800",
          children: s.code
        }
      ),
      /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          onClick: () => void g(),
          className: "rounded-sq border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-white/50",
          children: e ? "Скопійовано" : "Копіювати деталі"
        }
      )
    ] })
  ] });
}
export {
  B as F,
  I as a,
  A as b,
  $ as c,
  F as d,
  C as f,
  P as g,
  j as l,
  q as o,
  H as r,
  k as s,
  T as t
};
