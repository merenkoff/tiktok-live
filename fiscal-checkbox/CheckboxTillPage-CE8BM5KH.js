import { jsxs as s, jsx as t, Fragment as N } from "react/jsx-runtime";
import { useState as i } from "react";
import { F as v, o as C, c as S, f as R, a as F, r as B, b as T, d as D, u as P, e as $ } from "./useFiscalStatus-ChAQOngm.js";
import { usePosShell as A, useOfflineStatus as L } from "@pos/platform";
function E({ status: e, onChanged: r }) {
  const [n, o] = i(!1), [l, d] = i(null), [m, p] = i(null), [b, h] = i(null);
  async function a(x) {
    o(!0), d(null);
    try {
      await x();
    } catch (g) {
      d(g);
    } finally {
      o(!1);
    }
  }
  const c = () => a(async () => {
    await C(), r();
  }), u = () => a(async () => {
    const x = await S();
    p(x.z_report_text), r();
  }), f = () => a(async () => {
    const x = await R();
    h(x.text);
  });
  if (!e.configured)
    return /* @__PURE__ */ s("div", { role: "alert", className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700", children: [
      /* @__PURE__ */ t("p", { className: "font-semibold", children: "ПРРО не налаштовано" }),
      e.error?.message && /* @__PURE__ */ t("p", { className: "mt-1", children: e.error.message })
    ] });
  const y = e.shift?.status === "open";
  return /* @__PURE__ */ s("div", { className: "space-y-4", children: [
    /* @__PURE__ */ s("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4", children: [
      /* @__PURE__ */ t("p", { className: "sq-section-label", children: "Зміна" }),
      /* @__PURE__ */ t("p", { className: `mt-1 text-lg font-semibold ${y ? "text-emerald-600" : "text-sq-secondary"}`, children: y ? "Відкрита" : "Закрита" }),
      e.shift?.opened_at && /* @__PURE__ */ s("p", { className: "mt-1 text-xs text-sq-muted", children: [
        "Відкрита: ",
        new Date(e.shift.opened_at).toLocaleString("uk-UA")
      ] }),
      e.error && /* @__PURE__ */ t("p", { className: "mt-2 text-sm text-red-600", children: e.error.message })
    ] }),
    !!l && /* @__PURE__ */ t(v, { error: l }),
    /* @__PURE__ */ t("div", { className: "flex flex-wrap gap-2", children: y ? /* @__PURE__ */ s(N, { children: [
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
          disabled: n,
          onClick: () => void f(),
          children: "X-звіт"
        }
      ),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700",
          disabled: n,
          onClick: () => void u(),
          children: "Закрити зміну"
        }
      )
    ] }) : /* @__PURE__ */ t("button", { type: "button", className: "pos-btn-primary px-4 py-2", disabled: n, onClick: () => void c(), children: "Відкрити зміну" }) }),
    b && /* @__PURE__ */ t("pre", { className: "max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap", children: b }),
    m && /* @__PURE__ */ s("div", { children: [
      /* @__PURE__ */ t("p", { className: "sq-section-label", children: "Z-звіт" }),
      /* @__PURE__ */ t("pre", { className: "mt-1 max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap", children: m })
    ] })
  ] });
}
function w(e) {
  return e ? ` з ${new Date(e).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}` : "";
}
function _(e, r) {
  return e?.trim() || `пристрій ${r.slice(0, 8)}`;
}
function M({ status: e, onChanged: r }) {
  const n = A(), o = L((q) => q.pending), [l, d] = i(!1), [m, p] = i(null), [b, h] = i(null);
  if (!e.offline?.enabled) return null;
  const a = e.holder, c = n === "cashier";
  async function u(q) {
    d(!0), p(null), h(null);
    try {
      h(await q()), r();
    } catch (k) {
      p(k), r();
    } finally {
      d(!1);
    }
  }
  const f = () => u(async () => (await F(), null)), y = () => u(async () => (await B(), null)), x = () => u(async () => (await T()).status === "claimed" ? "Касу зайнято — вона була вільна" : "Запит надіслано. Підтвердіть його на іншій касі"), g = () => u(async () => (await D(o), "Касу передано"));
  return /* @__PURE__ */ s("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3", children: [
    /* @__PURE__ */ t("p", { className: "sq-section-label", children: "Каса ПРРО" }),
    !a && /* @__PURE__ */ s(N, { children: [
      /* @__PURE__ */ t("p", { className: "text-sm text-sq-secondary", children: "Вільна" }),
      c ? /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "pos-btn-primary px-4 py-2",
          disabled: l,
          onClick: () => void f(),
          children: "Зайняти касу"
        }
      ) : /* @__PURE__ */ t("p", { className: "text-xs text-sq-muted", children: "Касу займе перший пристрій, який проведе продаж." })
    ] }),
    a?.is_me && /* @__PURE__ */ s(N, { children: [
      /* @__PURE__ */ s("p", { className: "text-sm font-semibold text-emerald-600", children: [
        "Ця каса",
        w(a.since)
      ] }),
      a.handover_request && /* @__PURE__ */ s("div", { className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900", children: [
        /* @__PURE__ */ s("p", { className: "font-semibold", children: [
          "«",
          _(a.handover_request.name, a.handover_request.device_id),
          "» просить передати касу"
        ] }),
        o > 0 && /* @__PURE__ */ s("p", { className: "mt-1", children: [
          "Спершу синхронізуйте чеки, що очікують: ",
          o,
          "."
        ] }),
        /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            className: "pos-btn-primary mt-2 px-4 py-2",
            disabled: l,
            onClick: () => void g(),
            children: "Передати касу"
          }
        )
      ] }),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
          disabled: l,
          onClick: () => void y(),
          children: "Звільнити касу"
        }
      )
    ] }),
    a && !a.is_me && /* @__PURE__ */ s(N, { children: [
      /* @__PURE__ */ s("p", { className: "text-sm text-sq-secondary", children: [
        "Зайнята: «",
        _(a.name, a.device_id),
        "»",
        w(a.since)
      ] }),
      a.stale && /* @__PURE__ */ t("p", { className: "text-xs text-amber-700", children: "Немає зв’язку з тим пристроєм. Якщо він не повернеться, власник може забрати касу примусово в налаштуваннях ПРРО." }),
      c && /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
          disabled: l,
          onClick: () => void x(),
          children: "Запросити передачу"
        }
      )
    ] }),
    b && /* @__PURE__ */ t("p", { className: "text-sm text-sq-secondary", children: b }),
    !!m && /* @__PURE__ */ t(v, { error: m })
  ] });
}
function H(e) {
  return e ? new Date(e).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "";
}
function O(e) {
  return e.pending + e.done + e.abandoned;
}
function U({ session: e }) {
  const r = e.documents, n = O(r);
  return e.status === "stuck" ? /* @__PURE__ */ s("div", { role: "alert", className: "rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700", children: [
    /* @__PURE__ */ t("p", { className: "font-semibold", children: "Офлайн-чеки не надіслані в ДПС" }),
    e.error_message && /* @__PURE__ */ t("p", { className: "mt-1", children: e.error_message }),
    /* @__PURE__ */ s("p", { className: "mt-1", children: [
      "Чеків у сесії: ",
      n,
      ". Зверніться до власника магазину — потрібен ручний розбір."
    ] })
  ] }) : e.status === "replaying" ? /* @__PURE__ */ s("div", { className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900", children: [
    /* @__PURE__ */ t("p", { className: "font-semibold", children: "Надсилаємо чеки в ДПС…" }),
    /* @__PURE__ */ s("p", { className: "mt-1", children: [
      r.done,
      " з ",
      n,
      !e.go_offline_sent && " · готуємо касу"
    ] })
  ] }) : /* @__PURE__ */ s("div", { className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900", children: [
    /* @__PURE__ */ s("p", { className: "font-semibold", children: [
      "Працюємо офлайн з ",
      H(e.started_at)
    ] }),
    /* @__PURE__ */ s("p", { className: "mt-1", children: [
      "Чеків у сесії: ",
      n,
      ". Зв’язок із ПРРО відновиться автоматично — чеки підуть у ДПС самі."
    ] })
  ] });
}
function X({ status: e }) {
  const r = e.offline;
  if (!r?.enabled) return null;
  const n = r.codes?.free ?? 0, o = r.codes?.leased_to_me ?? 0, l = n < Math.max(1, Math.floor(r.codes_target / 4));
  return /* @__PURE__ */ s("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-2", children: [
    /* @__PURE__ */ t("p", { className: "sq-section-label", children: "Офлайн-режим ПРРО" }),
    /* @__PURE__ */ s("p", { className: `text-sm font-semibold ${l ? "text-amber-600" : "text-sq-secondary"}`, children: [
      "Запас фіскальних кодів: ",
      n
    ] }),
    o > 0 && // The store's reserve is not what this till can spend: only the codes
    // leased to it travel into an outage with it (фаза 3).
    /* @__PURE__ */ s("p", { className: "text-sm text-sq-secondary", children: [
      "Із них на цій касі: ",
      o
    ] }),
    l && /* @__PURE__ */ t("p", { className: "text-xs text-amber-700", children: "Запас майже вичерпано. Поки ПРРО доступне, він поповнюється автоматично." }),
    r.session && /* @__PURE__ */ t(U, { session: r.session })
  ] });
}
function j() {
  const [e, r] = i(""), [n, o] = i("in"), [l, d] = i(!1), [m, p] = i(null), [b, h] = i(!1);
  async function a() {
    const c = Number(e.replace(",", "."));
    if (!Number.isFinite(c) || c <= 0) return;
    const u = Math.round(c * 100) * (n === "in" ? 1 : -1);
    d(!0), p(null), h(!1);
    try {
      await $(u), h(!0), r("");
    } catch (f) {
      p(f);
    } finally {
      d(!1);
    }
  }
  return /* @__PURE__ */ s("div", { className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3", children: [
    /* @__PURE__ */ t("p", { className: "sq-section-label", children: "Внесення / видача готівки" }),
    /* @__PURE__ */ s("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${n === "in" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
          onClick: () => o("in"),
          children: "Внесення"
        }
      ),
      /* @__PURE__ */ t(
        "button",
        {
          type: "button",
          className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${n === "out" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
          onClick: () => o("out"),
          children: "Видача"
        }
      )
    ] }),
    /* @__PURE__ */ t(
      "input",
      {
        className: "pos-input w-full",
        inputMode: "decimal",
        placeholder: "Сума, ₴",
        value: e,
        onChange: (c) => r(c.target.value)
      }
    ),
    !!m && /* @__PURE__ */ t(v, { error: m }),
    b && /* @__PURE__ */ t("p", { className: "text-sm text-emerald-600", children: "Чек проведено" }),
    /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        className: "pos-btn-primary px-4 py-2",
        disabled: l || !e,
        onClick: () => void a(),
        children: l ? "Проведення…" : "Провести чек"
      }
    )
  ] });
}
function J() {
  const { status: e, isLoading: r, error: n, refresh: o } = P();
  return /* @__PURE__ */ s("div", { className: "p-4 space-y-4 max-w-md mx-auto", children: [
    /* @__PURE__ */ t("h1", { className: "text-lg font-semibold", children: "Зміна ПРРО" }),
    r && /* @__PURE__ */ t("p", { className: "text-sm text-sq-secondary", children: "Завантаження…" }),
    !!n && /* @__PURE__ */ t(v, { error: n }),
    e && /* @__PURE__ */ s(N, { children: [
      /* @__PURE__ */ t(E, { status: e, onChanged: () => void o() }),
      /* @__PURE__ */ t(X, { status: e }),
      /* @__PURE__ */ t(M, { status: e, onChanged: () => void o() }),
      e.shift?.status === "open" && /* @__PURE__ */ t(j, {})
    ] })
  ] });
}
export {
  J as CheckboxTillPage
};
