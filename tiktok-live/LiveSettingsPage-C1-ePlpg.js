import { jsx as e, jsxs as a } from "react/jsx-runtime";
import { useState as n, useEffect as j, useCallback as A } from "react";
import { Link as E } from "react-router-dom";
import { h as $, f as H, d as O, r as V, g as z, t as G, m as J, e as Q, S as U } from "./SupportCode-BvbTWiyf.js";
function W() {
  const [r, t] = n("loading"), [i, o] = n(null), [m, d] = n(null), [b, k] = n(0), [u, g] = n(!1), [v, p] = n(null), [T, x] = n(!1), [q, N] = n(!1), [y, f] = n(null);
  j(() => {
    if (!$()) {
      t("host-too-old");
      return;
    }
    let l = !0;
    return t("loading"), H().then((c) => {
      l && (o(c), d(null), t("ready"));
    }).catch((c) => {
      if (!l) return;
      const h = O(c);
      V(h), d(h), t(h.reason === "not_configured" ? "not-configured" : "error");
    }), () => {
      l = !1;
    };
  }, [b]);
  const C = A(() => k((l) => l + 1), []), S = A(async (l) => {
    g(!0), p(null), x(!1);
    try {
      return o(await z(l)), x(!0), !0;
    } catch (c) {
      const h = c?.response?.data?.error;
      return p(h || "Не вдалося зберегти. Спробуйте ще раз."), !1;
    } finally {
      g(!1);
    }
  }, []), _ = A(async () => {
    N(!0), f(null);
    try {
      const l = await G();
      f({ ok: l.ok, username: l.username });
    } catch (l) {
      const c = l?.response?.data?.error;
      f({
        ok: !1,
        error: c === "telegram_token_not_set" ? "Токен бота не збережено." : c === "telegram_token_invalid" ? "Telegram відхилив цей токен." : "Не вдалося перевірити."
      });
    } finally {
      N(!1);
    }
  }, []);
  return {
    status: r,
    settings: i,
    diagnostic: m,
    missingHostApi: J(),
    reload: C,
    save: S,
    saving: u,
    saveError: v,
    saved: T,
    clearSaved: () => x(!1),
    testTelegram: _,
    testing: q,
    testResult: y
  };
}
const X = [3, 5, 10, 15, 30];
function se() {
  const {
    status: r,
    settings: t,
    diagnostic: i,
    reload: o,
    save: m,
    saving: d,
    saveError: b,
    saved: k,
    clearSaved: u,
    testTelegram: g,
    testing: v,
    testResult: p
  } = W(), { isActive: T } = Q(r === "ready"), [x, q] = n(""), [N, y] = n(!1), [f, C] = n(""), [S, _] = n(!1), [l, c] = n(""), [h, L] = n(""), [R, B] = n(5);
  if (j(() => {
    t && (c(t.telegram_channel_id ?? ""), L(t.novaposhta_merchant_name ?? ""), B(t.reservation_timeout_minutes || 5), q(""), C(""), y(!1), _(!1));
  }, [t]), r === "loading")
    return /* @__PURE__ */ e(I, { title: "Завантаження налаштувань…" });
  if (r === "host-too-old")
    return /* @__PURE__ */ e(
      I,
      {
        icon: "⬆️",
        title: "Застосунок каси застарів для цього екрана",
        body: "Екран ефіру працює, а його налаштування зʼявляться після оновлення застосунку. Поки що змінюйте їх у старій адмінці.",
        diagnostic: i
      }
    );
  if (r === "not-configured")
    return /* @__PURE__ */ e(
      I,
      {
        icon: "🔌",
        title: "Магазин не підʼєднано до TikTok LIVE",
        body: "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього тут зʼявляться налаштування ефіру.",
        link: { to: "/admin/settings", label: "Перейти до Налаштувань" }
      }
    );
  if (r === "error" || !t)
    return /* @__PURE__ */ e(
      I,
      {
        icon: "⚠️",
        title: "Не вдалося завантажити налаштування",
        body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.",
        action: { label: "Спробувати ще раз", onClick: o },
        diagnostic: i
      }
    );
  const F = t.telegram_bot_token_set && !N, D = t.novaposhta_api_key_set && !S;
  function M() {
    const s = {
      telegram_channel_id: l.trim() || null,
      novaposhta_merchant_name: h.trim() || null,
      reservation_timeout_minutes: R
    };
    return N ? s.telegram_bot_token = null : x.trim() && (s.telegram_bot_token = x.trim()), S ? s.novaposhta_api_key = null : f.trim() && (s.novaposhta_api_key = f.trim()), s;
  }
  function P(s) {
    s.preventDefault(), m(M());
  }
  return /* @__PURE__ */ a("form", { onSubmit: P, className: "mx-auto w-full max-w-2xl space-y-6 pb-10", children: [
    /* @__PURE__ */ a("div", { children: [
      /* @__PURE__ */ e("h1", { className: "text-lg font-semibold text-sq-text", children: "Прямий ефір" }),
      /* @__PURE__ */ e("p", { className: "mt-1 text-sm text-sq-secondary", children: "Інтеграції та таймер бронювання для трансляцій." })
    ] }),
    k && /* @__PURE__ */ a(
      "div",
      {
        role: "status",
        className: "rounded-sq border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800",
        children: [
          "Збережено",
          T && " — зміни застосуються після перезапуску ефіру."
        ]
      }
    ),
    b && /* @__PURE__ */ e(
      "div",
      {
        role: "alert",
        className: "rounded-sq border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700",
        children: b
      }
    ),
    /* @__PURE__ */ a("section", { className: "sq-card space-y-3 p-5", children: [
      /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Акаунт" }),
      /* @__PURE__ */ a("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [
        /* @__PURE__ */ a("div", { children: [
          /* @__PURE__ */ e("p", { className: "font-medium text-sq-text", children: t.tiktok_username ? `@${t.tiktok_username}` : "—" }),
          /* @__PURE__ */ a("p", { className: "mt-0.5 text-xs text-sq-muted", children: [
            "Нікнейм змінюється в",
            " ",
            /* @__PURE__ */ e(E, { to: "/admin/settings", className: "text-sq-blue underline", children: "Налаштуваннях магазину" }),
            "."
          ] })
        ] }),
        /* @__PURE__ */ e(E, { to: "/live", className: "rounded-sq border border-sq-divider px-3 py-2 text-sm font-medium", children: "Відкрити екран ефіру" })
      ] }),
      T && /* @__PURE__ */ e("p", { className: "rounded-sq bg-amber-50 px-3 py-2 text-xs text-amber-800", children: "Зараз іде ефір. Він працює зі знімком налаштувань, зробленим на старті — щоб зміни подіяли, зупиніть і запустіть ефір знову." })
    ] }),
    /* @__PURE__ */ a("section", { className: "sq-card space-y-4 p-5", children: [
      /* @__PURE__ */ a("div", { children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Telegram" }),
        /* @__PURE__ */ e("p", { className: "mt-1 text-xs text-sq-muted", children: "Бот, який приймає замовлення з коментарів ефіру." })
      ] }),
      /* @__PURE__ */ e(
        K,
        {
          label: "Токен бота",
          name: "telegram_bot_token",
          value: x,
          stored: F,
          clearing: N,
          hint: "Отримайте у @BotFather.",
          placeholder: "123456:ABC-DEF1234ghIkl",
          onChange: (s) => {
            q(s), y(!1), u();
          },
          onClear: () => {
            y(!0), q("");
          },
          onCancelClear: () => y(!1)
        }
      ),
      /* @__PURE__ */ e(w, { label: "ID каналу", hint: "Через @userinfobot. Порожнє поле — прибрати.", children: /* @__PURE__ */ e(
        "input",
        {
          name: "telegram_channel_id",
          type: "text",
          inputMode: "numeric",
          className: "pos-field text-sm",
          placeholder: "-1001234567890",
          value: l,
          onChange: (s) => {
            c(s.target.value), u();
          }
        }
      ) }),
      /* @__PURE__ */ a("div", { className: "flex flex-wrap items-center gap-3", children: [
        /* @__PURE__ */ e(
          "button",
          {
            type: "button",
            onClick: () => void g(),
            disabled: v || !F,
            className: "rounded-sq border border-sq-divider px-3 py-2 text-sm font-medium disabled:opacity-50",
            children: v ? "Перевірка…" : "Перевірити зʼєднання"
          }
        ),
        p && /* @__PURE__ */ e(
          "span",
          {
            role: "status",
            className: `text-sm ${p.ok ? "text-emerald-700" : "text-rose-600"}`,
            children: p.ok ? `Бот працює${p.username ? ` — @${p.username}` : ""}` : p.error
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ a("section", { className: "sq-card space-y-4 p-5", children: [
      /* @__PURE__ */ a("div", { children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Нова Пошта" }),
        /* @__PURE__ */ e("p", { className: "mt-1 text-xs text-sq-muted", children: "Необовʼязково — для ТТН та відстеження посилок." })
      ] }),
      /* @__PURE__ */ e(
        K,
        {
          label: "API-ключ",
          name: "novaposhta_api_key",
          value: f,
          stored: D,
          clearing: S,
          hint: "developers.novaposhta.ua",
          placeholder: "Ваш API-ключ",
          onChange: (s) => {
            C(s), _(!1), u();
          },
          onClear: () => {
            _(!0), C("");
          },
          onCancelClear: () => _(!1)
        }
      ),
      /* @__PURE__ */ e(w, { label: "Назва відправника", hint: "Показується в замовленнях і ТТН.", children: /* @__PURE__ */ e(
        "input",
        {
          name: "novaposhta_merchant_name",
          type: "text",
          className: "pos-field text-sm",
          placeholder: "Назва вашого магазину",
          value: h,
          onChange: (s) => {
            L(s.target.value), u();
          }
        }
      ) })
    ] }),
    /* @__PURE__ */ a("section", { className: "sq-card space-y-4 p-5", children: [
      /* @__PURE__ */ a("div", { children: [
        /* @__PURE__ */ e("p", { className: "sq-section-label", children: "Бронювання" }),
        /* @__PURE__ */ e("p", { className: "mt-1 text-xs text-sq-muted", children: "Скільки часу товар утримується за глядачем після коментаря." })
      ] }),
      /* @__PURE__ */ e(w, { label: "Таймер броні", children: /* @__PURE__ */ e(
        "select",
        {
          name: "reservation_timeout_minutes",
          className: "pos-field text-sm",
          value: R,
          onChange: (s) => {
            B(parseInt(s.target.value, 10)), u();
          },
          children: X.map((s) => /* @__PURE__ */ a("option", { value: s, children: [
            s,
            " хвилин"
          ] }, s))
        }
      ) })
    ] }),
    /* @__PURE__ */ e("div", { className: "flex justify-end", children: /* @__PURE__ */ e("button", { type: "submit", disabled: d, className: "sq-btn-primary px-5 py-2.5 text-sm", children: d ? "Збереження…" : "Зберегти" }) })
  ] });
}
function w({
  label: r,
  hint: t,
  children: i
}) {
  return /* @__PURE__ */ a("label", { className: "block", children: [
    /* @__PURE__ */ e("span", { className: "mb-1.5 block text-xs font-semibold text-sq-text", children: r }),
    i,
    t && /* @__PURE__ */ e("span", { className: "mt-1.5 block text-xs text-sq-muted", children: t })
  ] });
}
function K({
  label: r,
  name: t,
  value: i,
  stored: o,
  clearing: m,
  hint: d,
  placeholder: b,
  onChange: k,
  onClear: u,
  onCancelClear: g
}) {
  return /* @__PURE__ */ a(
    w,
    {
      label: r,
      hint: o ? "Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний." : d,
      children: [
        /* @__PURE__ */ e(
          "input",
          {
            name: t,
            type: "password",
            autoComplete: "off",
            className: "pos-field text-sm",
            placeholder: o ? "•••••••• збережено" : b,
            value: i,
            onChange: (v) => k(v.target.value)
          }
        ),
        m ? /* @__PURE__ */ a("span", { className: "mt-1.5 block text-xs text-rose-600", children: [
          "Буде видалено при збереженні.",
          " ",
          /* @__PURE__ */ e("button", { type: "button", className: "underline", onClick: g, children: "Скасувати" })
        ] }) : o && /* @__PURE__ */ e(
          "button",
          {
            type: "button",
            className: "mt-1.5 text-xs text-sq-secondary underline",
            onClick: u,
            children: "Видалити збережене значення"
          }
        )
      ]
    }
  );
}
function I({
  icon: r,
  title: t,
  body: i,
  action: o,
  link: m,
  diagnostic: d
}) {
  return /* @__PURE__ */ e("div", { className: "grid min-h-[60vh] place-items-center px-6", children: /* @__PURE__ */ a("div", { className: "sq-card animate-fade-up max-w-md p-8 text-center", children: [
    r && /* @__PURE__ */ e("div", { className: "mb-4 text-4xl", children: r }),
    /* @__PURE__ */ e("h2", { className: "text-lg font-semibold text-sq-text", children: t }),
    i && /* @__PURE__ */ e("p", { className: "mt-3 text-sm leading-relaxed text-sq-secondary", children: i }),
    o && /* @__PURE__ */ e("button", { type: "button", onClick: o.onClick, className: "sq-btn-primary mt-6 px-4 py-2.5", children: o.label }),
    m && /* @__PURE__ */ e(E, { to: m.to, className: "sq-btn-primary mt-6 inline-block px-4 py-2.5", children: m.label }),
    d && /* @__PURE__ */ e(U, { diagnostic: d })
  ] }) });
}
export {
  se as LiveSettingsPage
};
