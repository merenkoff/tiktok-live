import { jsxs as r, jsx as e, Fragment as f } from "react/jsx-runtime";
import { useState as c, useCallback as E, useEffect as C } from "react";
import { u as w, g as F, F as b, s as P, t as $, l as A, h as B } from "./useFiscalStatus-ChAQOngm.js";
function L({ specs: a, secretsSet: h, saving: d, onSave: m }) {
  const [l, u] = c({}), t = (s, n) => u((o) => ({ ...o, [s]: n }));
  function p() {
    const s = {};
    for (const n of a)
      l[n.key] !== void 0 && l[n.key] !== "" && (s[n.key] = l[n.key]);
    Object.keys(s).length !== 0 && (m(s), u({}));
  }
  function i(s) {
    m({ [s]: null });
  }
  return /* @__PURE__ */ r("div", { className: "space-y-3", children: [
    a.map((s) => {
      const n = h.includes(s.key);
      return /* @__PURE__ */ r("div", { className: "space-y-1", children: [
        /* @__PURE__ */ r("label", { className: "block text-sm", children: [
          /* @__PURE__ */ r("span", { className: "text-sq-secondary", children: [
            s.label,
            s.required && /* @__PURE__ */ e("span", { className: "text-red-600", children: " *" })
          ] }),
          /* @__PURE__ */ r("div", { className: "mt-1 flex items-center gap-2", children: [
            /* @__PURE__ */ e(
              "input",
              {
                type: s.kind === "password" ? "password" : "text",
                className: "pos-input flex-1",
                value: l[s.key] ?? "",
                onChange: (o) => t(s.key, o.target.value),
                placeholder: n ? "••••••••" : s.hint,
                autoComplete: "off"
              }
            ),
            n && /* @__PURE__ */ e(
              "button",
              {
                type: "button",
                className: "shrink-0 rounded-sq border border-sq-divider px-2 py-1.5 text-xs text-sq-secondary hover:bg-sq-bg",
                onClick: () => i(s.key),
                children: "Очистити"
              }
            )
          ] })
        ] }),
        n && !l[s.key] && /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: "Значення збережено — залиште порожнім, щоб не змінювати." }),
        s.hint && /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: s.hint })
      ] }, s.key);
    }),
    /* @__PURE__ */ e(
      "button",
      {
        type: "button",
        className: "pos-btn-primary px-4 py-2",
        disabled: d,
        onClick: p,
        children: d ? "Збереження…" : "Зберегти дані доступу"
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
function D(a) {
  return (a / 100).toFixed(2) + " ₴";
}
function R() {
  const [a, h] = c(null), [d, m] = c([]), [l, u] = c(null);
  return C(() => {
    A().then((t) => {
      h(t.documents), m(t.sessions ?? []);
    }).catch(u);
  }, []), l ? /* @__PURE__ */ e(b, { error: l }) : a ? a.length === 0 && d.length === 0 ? /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Немає документів, що потребують уваги." }) : /* @__PURE__ */ r("div", { className: "space-y-3", children: [
    d.map((t) => /* @__PURE__ */ r(
      "div",
      {
        role: "alert",
        className: "rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700",
        children: [
          /* @__PURE__ */ r("p", { className: "font-semibold", children: [
            "Офлайн-сесія #",
            t.id,
            " зупинена"
          ] }),
          /* @__PURE__ */ e("p", { className: "mt-1", children: t.error_message ?? t.error_code ?? "Причина невідома" }),
          /* @__PURE__ */ r("p", { className: "mt-0.5 text-xs", children: [
            "Чеків: ",
            t.documents.pending + t.documents.done + t.documents.abandoned,
            " · не надіслано: ",
            t.documents.pending,
            " · з ",
            new Date(t.started_at).toLocaleString("uk-UA")
          ] }),
          /* @__PURE__ */ e("p", { className: "mt-1 text-xs", children: "Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть." })
        ]
      },
      `session-${t.id}`
    )),
    a.length > 0 && /* @__PURE__ */ e("ul", { className: "divide-y divide-sq-divider rounded-sq border border-sq-divider", children: a.map((t) => /* @__PURE__ */ r("li", { className: "p-3 text-sm", children: [
      /* @__PURE__ */ r("div", { className: "flex justify-between", children: [
        /* @__PURE__ */ e("span", { className: "font-medium", children: t.receipt_number ?? `#${t.id}` }),
        /* @__PURE__ */ e("span", { children: D(t.total_cents) })
      ] }),
      /* @__PURE__ */ e("p", { className: "mt-1 text-xs text-red-600", children: t.error_message ?? t.error_code ?? "Помилка ПРРО" }),
      /* @__PURE__ */ r("p", { className: "mt-0.5 text-xs text-sq-muted", children: [
        "Спроб: ",
        t.attempts,
        " · ",
        new Date(t.created_at).toLocaleString("uk-UA")
      ] })
    ] }, t.id)) })
  ] }) : /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Завантаження…" });
}
function U({ status: a, onChanged: h }) {
  const [d, m] = c(!1), [l, u] = c(null), [t, p] = c(null);
  if (!a.offline?.enabled) return null;
  const i = a.holder, s = i?.handover_request ?? null;
  async function n() {
    m(!0), u(null), p(null);
    try {
      const o = await B();
      p(
        `Касу передано. Зупинено сесій: ${o.stuck_sessions}, згорілих кодів: ${o.burned_codes}.`
      ), h();
    } catch (o) {
      u(o);
    } finally {
      m(!1);
    }
  }
  return /* @__PURE__ */ r("section", { className: "space-y-2", children: [
    /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Каса ПРРО" }),
    i ? /* @__PURE__ */ r("p", { className: "text-sm text-sq-secondary", children: [
      "Зайнята: «",
      i.name?.trim() || `пристрій ${i.device_id.slice(0, 8)}`,
      "»",
      i.since && ` з ${new Date(i.since).toLocaleString("uk-UA")}`,
      i.stale && " · немає звʼязку"
    ] }) : /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: "Вільна" }),
    s ? /* @__PURE__ */ r(f, { children: [
      /* @__PURE__ */ r("p", { className: "text-sm", children: [
        "Запит на передачу: «",
        s.name?.trim() || `пристрій ${s.device_id.slice(0, 8)}`,
        "»"
      ] }),
      /* @__PURE__ */ e(
        "button",
        {
          type: "button",
          className: "rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700",
          disabled: d,
          onClick: () => void n(),
          children: "Забрати касу примусово"
        }
      ),
      /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: "Тільки якщо попередня каса не може підтвердити передачу сама: її незавершена офлайн-сесія зупиниться, а видані їй коди згорять." })
    ] }) : i && /* @__PURE__ */ e("p", { className: "text-xs text-sq-muted", children: "Щоб передати касу, надішліть запит із тієї каси, якій вона потрібна." }),
    t && /* @__PURE__ */ e("p", { className: "text-sm text-sq-secondary", children: t }),
    !!l && /* @__PURE__ */ e(b, { error: l })
  ] });
}
function V() {
  const { status: a, refresh: h } = w(), [d, m] = c(null), [l, u] = c(null), [t, p] = c(!1), [i, s] = c(null), [n, o] = c(null), [N, g] = c(!1), [k, v] = c(null), q = E(() => {
    F().then(m).catch(u);
  }, []);
  C(q, [q]);
  async function S(x) {
    p(!0), s(null);
    try {
      const y = await P(x);
      m(y);
    } catch (y) {
      s(y);
    } finally {
      p(!1);
    }
  }
  async function _() {
    g(!0), v(null), o(null);
    try {
      o(await $());
    } catch (x) {
      v(x);
    } finally {
      g(!1);
    }
  }
  return /* @__PURE__ */ r("div", { className: "p-5 space-y-6 max-w-lg", children: [
    /* @__PURE__ */ e("h1", { className: "text-lg font-semibold", children: "Фіскалізація — Checkbox" }),
    !!l && /* @__PURE__ */ e(b, { error: l }),
    d && /* @__PURE__ */ r(f, { children: [
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Дані доступу" }),
        /* @__PURE__ */ e(
          L,
          {
            specs: j,
            secretsSet: d.secrets_set,
            saving: t,
            onSave: (x) => void S(x)
          }
        ),
        !!i && /* @__PURE__ */ e(b, { error: i })
      ] }),
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Зʼєднання" }),
        /* @__PURE__ */ e(
          "button",
          {
            type: "button",
            className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
            disabled: N,
            onClick: () => void _(),
            children: N ? "Перевірка…" : "Перевірити з'єднання"
          }
        ),
        !!k && /* @__PURE__ */ e(b, { error: k }),
        n && /* @__PURE__ */ e(
          "div",
          {
            className: `rounded-sq px-3 py-2 text-sm ${n.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-900"}`,
            children: n.ok ? /* @__PURE__ */ r(f, { children: [
              /* @__PURE__ */ e("p", { className: "font-semibold", children: "З'єднання успішне" }),
              n.cashierName && /* @__PURE__ */ r("p", { children: [
                "Касир: ",
                n.cashierName
              ] }),
              n.cashRegister && /* @__PURE__ */ r("p", { children: [
                "Каса: ",
                n.cashRegister
              ] })
            ] }) : /* @__PURE__ */ e("p", { children: n.message ?? "Перевірка не пройдена" })
          }
        )
      ] }),
      a && /* @__PURE__ */ e(U, { status: a, onChanged: () => void h() }),
      /* @__PURE__ */ r("section", { className: "space-y-2", children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Потребують уваги" }),
        /* @__PURE__ */ e(R, {})
      ] })
    ] })
  ] });
}
export {
  V as CheckboxAdminPage
};
