import { jsxs as l, jsx as e, Fragment as N } from "react/jsx-runtime";
import { useState as s, useRef as w, useEffect as q, useCallback as F } from "react";
import { F as g, o as S, c as C, f as R, g as k, d as L, r as B, a as E } from "./FiscalErrorCard-TfrDPJkY.js";
function T({ status: t, onChanged: c }) {
  const [r, i] = s(!1), [m, u] = s(null), [p, f] = s(null), [o, d] = s(null);
  async function n(b) {
    i(!0), u(null);
    try {
      await b();
    } catch (v) {
      u(v);
    } finally {
      i(!1);
    }
  }
  const a = () => n(async () => {
    await S(), c();
  }), x = () => n(async () => {
    const b = await C();
    f(b.z_report_text), c();
  }), h = () => n(async () => {
    const b = await R();
    d(b.text);
  });
  if (!t.configured)
    return /* @__PURE__ */ l("div", { role: "alert", className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700", children: [
      /* @__PURE__ */ e("p", { className: "font-semibold", children: "ПРРО не налаштовано" }),
      t.error?.message && /* @__PURE__ */ e("p", { className: "mt-1", children: t.error.message })
    ] });
  const y = t.shift?.status === "open";
  return /* @__PURE__ */ l("div", { className: "space-y-4", children: [
    /* @__PURE__ */ l("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4", children: [
      /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Зміна" }),
      /* @__PURE__ */ e("p", { className: `mt-1 text-lg font-semibold ${y ? "text-emerald-600" : "text-sq-secondary"}`, children: y ? "Відкрита" : "Закрита" }),
      t.shift?.opened_at && /* @__PURE__ */ l("p", { className: "mt-1 text-xs text-sq-muted", children: [
        "Відкрита: ",
        new Date(t.shift.opened_at).toLocaleString("uk-UA")
      ] }),
      t.error && /* @__PURE__ */ e("p", { className: "mt-2 text-sm text-red-600", children: t.error.message })
    ] }),
    !!m && /* @__PURE__ */ e(g, { error: m }),
    /* @__PURE__ */ e("div", { className: "flex flex-wrap gap-2", children: y ? /* @__PURE__ */ l(N, { children: [
      /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
          disabled: r,
          onClick: () => void h(),
          children: "X-звіт"
        }
      ),
      /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700",
          disabled: r,
          onClick: () => void x(),
          children: "Закрити зміну"
        }
      )
    ] }) : /* @__PURE__ */ e("button", { type: "button", className: "pos-btn-primary px-4 py-2", disabled: r, onClick: () => void a(), children: "Відкрити зміну" }) }),
    o && /* @__PURE__ */ e("pre", { className: "max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap", children: o }),
    p && /* @__PURE__ */ l("div", { children: [
      /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Z-звіт" }),
      /* @__PURE__ */ e("pre", { className: "mt-1 max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap", children: p })
    ] })
  ] });
}
const _ = 5e3;
function D() {
  const [t, c] = s(null), [r, i] = s(!0), [m, u] = s(null), [p, f] = s(null), o = w(!0);
  q(() => (o.current = !0, () => {
    o.current = !1;
  }), []);
  const d = F(async () => {
    try {
      const n = await k();
      if (!o.current) return;
      c(n), u(null), f(null);
    } catch (n) {
      const a = L(n);
      B(a), o.current && (u(a), f(n));
    } finally {
      o.current && i(!1);
    }
  }, []);
  return q(() => {
    d();
    const n = setInterval(() => void d(), _);
    return () => clearInterval(n);
  }, [d]), { status: t, isLoading: r, diagnostic: m, error: p, refresh: d };
}
function I() {
  const [t, c] = s(""), [r, i] = s("in"), [m, u] = s(!1), [p, f] = s(null), [o, d] = s(!1);
  async function n() {
    const a = Number(t.replace(",", "."));
    if (!Number.isFinite(a) || a <= 0) return;
    const x = Math.round(a * 100) * (r === "in" ? 1 : -1);
    u(!0), f(null), d(!1);
    try {
      await E(x), d(!0), c("");
    } catch (h) {
      f(h);
    } finally {
      u(!1);
    }
  }
  return /* @__PURE__ */ l("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3", children: [
    /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Внесення / видача готівки" }),
    /* @__PURE__ */ l("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${r === "in" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
          onClick: () => i("in"),
          children: "Внесення"
        }
      ),
      /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${r === "out" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
          onClick: () => i("out"),
          children: "Видача"
        }
      )
    ] }),
    /* @__PURE__ */ e(
      "input",
      {
        className: "pos-input w-full",
        inputMode: "decimal",
        placeholder: "Сума, ₴",
        value: t,
        onChange: (a) => c(a.target.value)
      }
    ),
    !!p && /* @__PURE__ */ e(g, { error: p }),
    o && /* @__PURE__ */ e("p", { className: "text-sm text-emerald-600", children: "Чек проведено" }),
    /* @__PURE__ */ e(
      "button",
      {
        type: "button",
        className: "pos-btn-primary px-4 py-2",
        disabled: m || !t,
        onClick: () => void n(),
        children: m ? "Проведення…" : "Провести чек"
      }
    )
  ] });
}
function $() {
  const { status: t, isLoading: c, error: r, refresh: i } = D();
  return /* @__PURE__ */ l("div", { className: "p-4 space-y-4 max-w-md mx-auto", children: [
    /* @__PURE__ */ e("h1", { className: "text-lg font-semibold", children: "Зміна ПРРО" }),
    c && /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Завантаження…" }),
    !!r && /* @__PURE__ */ e(g, { error: r }),
    t && /* @__PURE__ */ l(N, { children: [
      /* @__PURE__ */ e(T, { status: t, onChanged: () => void i() }),
      t.shift?.status === "open" && /* @__PURE__ */ e(I, {})
    ] })
  ] });
}
export {
  $ as CheckboxTillPage
};
