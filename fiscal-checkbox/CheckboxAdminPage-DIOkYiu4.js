import { jsxs as r, jsx as e, Fragment as g } from "react/jsx-runtime";
import { useState as i, useCallback as S, useEffect as v } from "react";
import { b as E, F as x, s as F, t as w, l as P } from "./FiscalErrorCard-TfrDPJkY.js";
function _({ specs: a, secretsSet: o, saving: c, onSave: d }) {
  const [s, u] = i({}), p = (t, n) => u((m) => ({ ...m, [t]: n }));
  function b() {
    const t = {};
    for (const n of a)
      s[n.key] !== void 0 && s[n.key] !== "" && (t[n.key] = s[n.key]);
    Object.keys(t).length !== 0 && (d(t), u({}));
  }
  function l(t) {
    d({ [t]: null });
  }
  return /* @__PURE__ */ r("div", { className: "space-y-3", children: [
    a.map((t) => {
      const n = o.includes(t.key);
      return /* @__PURE__ */ r("div", { className: "space-y-1", children: [
        /* @__PURE__ */ r("label", { className: "block text-sm", children: [
          /* @__PURE__ */ r("span", { className: "text-sq-secondary", children: [
            t.label,
            t.required && /* @__PURE__ */ e("span", { className: "text-red-600", children: " *" })
          ] }),
          /* @__PURE__ */ r("div", { className: "mt-1 flex items-center gap-2", children: [
            /* @__PURE__ */ e(
              "input",
              {
                type: t.kind === "password" ? "password" : "text",
                className: "pos-input flex-1",
                value: s[t.key] ?? "",
                onChange: (m) => p(t.key, m.target.value),
                placeholder: n ? "••••••••" : t.hint,
                autoComplete: "off"
              }
            ),
            n && /* @__PURE__ */ e(
              "button",
              {
                type: "button",
                className: "shrink-0 rounded-sq border border-sq-divider px-2 py-1.5 text-xs text-sq-secondary hover:bg-sq-bg",
                onClick: () => l(t.key),
                children: "Очистити"
              }
            )
          ] })
        ] }),
        n && !s[t.key] && /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: "Значення збережено — залиште порожнім, щоб не змінювати." }),
        t.hint && /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: t.hint })
      ] }, t.key);
    }),
    /* @__PURE__ */ e(
      "button",
      {
        type: "button",
        className: "pos-btn-primary px-4 py-2",
        disabled: c,
        onClick: b,
        children: c ? "Збереження…" : "Зберегти дані доступу"
      }
    )
  ] });
}
const j = [
  {
    key: "licenceKey",
    label: "Ліцензійний ключ",
    required: !0,
    kind: "password",
    hint: "Кабінет Checkbox → Каси → обраний реєстратор"
  },
  {
    key: "cashierPin",
    label: "PIN-код касира",
    required: !0,
    kind: "password",
    hint: "4–6 цифр, як у кабінеті Checkbox"
  }
];
function A(a) {
  return (a / 100).toFixed(2) + " ₴";
}
function B() {
  const [a, o] = i(null), [c, d] = i(null);
  return v(() => {
    P().then((s) => o(s.documents)).catch(d);
  }, []), c ? /* @__PURE__ */ e(x, { error: c }) : a ? a.length === 0 ? /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Немає документів, що потребують уваги." }) : /* @__PURE__ */ e("ul", { className: "divide-y divide-sq-divider rounded-sq border border-sq-divider", children: a.map((s) => /* @__PURE__ */ r("li", { className: "p-3 text-sm", children: [
    /* @__PURE__ */ r("div", { className: "flex justify-between", children: [
      /* @__PURE__ */ e("span", { className: "font-medium", children: s.receipt_number ?? `#${s.id}` }),
      /* @__PURE__ */ e("span", { children: A(s.total_cents) })
    ] }),
    /* @__PURE__ */ e("p", { className: "mt-1 text-xs text-red-600", children: s.error_message ?? s.error_code ?? "Помилка ПРРО" }),
    /* @__PURE__ */ r("p", { className: "mt-0.5 text-xs text-sq-muted", children: [
      "Спроб: ",
      s.attempts,
      " · ",
      new Date(s.created_at).toLocaleString("uk-UA")
    ] })
  ] }, s.id)) }) : /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Завантаження…" });
}
function K() {
  const [a, o] = i(null), [c, d] = i(null), [s, u] = i(!1), [p, b] = i(null), [l, t] = i(null), [n, m] = i(!1), [f, N] = i(null), k = S(() => {
    E().then(o).catch(d);
  }, []);
  v(k, [k]);
  async function q(h) {
    u(!0), b(null);
    try {
      const y = await F(h);
      o(y);
    } catch (y) {
      b(y);
    } finally {
      u(!1);
    }
  }
  async function C() {
    m(!0), N(null), t(null);
    try {
      t(await w());
    } catch (h) {
      N(h);
    } finally {
      m(!1);
    }
  }
  return /* @__PURE__ */ r("div", { className: "p-5 space-y-6 max-w-lg", children: [
    /* @__PURE__ */ e("h1", { className: "text-lg font-semibold", children: "Фіскалізація — Checkbox" }),
    !!c && /* @__PURE__ */ e(x, { error: c }),
    a && /* @__PURE__ */ r(g, { children: [
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Дані доступу" }),
        /* @__PURE__ */ e(
          _,
          {
            specs: j,
            secretsSet: a.secrets_set,
            saving: s,
            onSave: (h) => void q(h)
          }
        ),
        !!p && /* @__PURE__ */ e(x, { error: p })
      ] }),
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Зʼєднання" }),
        /* @__PURE__ */ e(
          "button",
          {
            type: "button",
            className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
            disabled: n,
            onClick: () => void C(),
            children: n ? "Перевірка…" : "Перевірити з'єднання"
          }
        ),
        !!f && /* @__PURE__ */ e(x, { error: f }),
        l && /* @__PURE__ */ e(
          "div",
          {
            className: `rounded-sq px-3 py-2 text-sm ${l.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-900"}`,
            children: l.ok ? /* @__PURE__ */ r(g, { children: [
              /* @__PURE__ */ e("p", { className: "font-semibold", children: "З'єднання успішне" }),
              l.cashierName && /* @__PURE__ */ r("p", { children: [
                "Касир: ",
                l.cashierName
              ] }),
              l.cashRegister && /* @__PURE__ */ r("p", { children: [
                "Каса: ",
                l.cashRegister
              ] })
            ] }) : /* @__PURE__ */ e("p", { children: l.message ?? "Перевірка не пройдена" })
          }
        )
      ] }),
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Потребують уваги" }),
        /* @__PURE__ */ e(B, {})
      ] })
    ] })
  ] });
}
export {
  K as CheckboxAdminPage
};
