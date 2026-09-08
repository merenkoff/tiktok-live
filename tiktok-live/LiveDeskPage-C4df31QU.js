var M = Object.defineProperty;
var j = (o, e, r) => e in o ? M(o, e, { enumerable: !0, configurable: !0, writable: !0, value: r }) : o[e] = r;
var N = (o, e, r) => j(o, typeof e != "symbol" ? e + "" : e, r);
import { jsxs as l, jsx as t, Fragment as W } from "react/jsx-runtime";
import { useState as f, useEffect as q, useCallback as T, useRef as y } from "react";
import { b as $, l as P, d as U, r as F, a as E, c as V, u as B, e as J, S as K } from "./SupportCode-BvbTWiyf.js";
function Y() {
  const [o, e] = f("loading"), [r, s] = f(null), [n, i] = f(null), [d, a] = f(0);
  q(() => {
    let c = !0;
    return e("loading"), $().then(() => {
      c && (s(P()), i(null), e("ready"));
    }).catch((g) => {
      if (!c) return;
      const m = U(g);
      F(m), i(m), e(m.reason === "not_configured" ? "not-configured" : "error");
    }), () => {
      c = !1;
    };
  }, [d]);
  const h = T(() => a((c) => c + 1), []);
  return { status: o, username: r, diagnostic: n, refresh: h };
}
class z {
  constructor(e) {
    N(this, "ws", null);
    N(this, "url");
    N(this, "logHandlers", /* @__PURE__ */ new Set());
    N(this, "eventHandlers", /* @__PURE__ */ new Map());
    this.url = e;
  }
  connect() {
    return new Promise((e, r) => {
      try {
        this.ws = new WebSocket(this.url), this.ws.onopen = () => e(), this.ws.onmessage = (s) => {
          try {
            this.handleMessage(JSON.parse(String(s.data)));
          } catch (n) {
            console.error("[tiktok-live] bad WebSocket frame", n);
          }
        }, this.ws.onclose = () => this.dispatch("disconnect", {}), this.ws.onerror = (s) => r(s);
      } catch (s) {
        r(s);
      }
    });
  }
  handleMessage(e) {
    if (e.type === "log" && e.log) {
      this.logHandlers.forEach((r) => r(e.log));
      return;
    }
    e.type && this.dispatch(e.type, e);
  }
  dispatch(e, r) {
    this.eventHandlers.get(e)?.forEach((s) => s(r));
  }
  onLog(e) {
    return this.logHandlers.add(e), () => {
      this.logHandlers.delete(e);
    };
  }
  on(e, r) {
    let s = this.eventHandlers.get(e);
    return s || (s = /* @__PURE__ */ new Set(), this.eventHandlers.set(e, s)), s.add(r), () => {
      s?.delete(r);
    };
  }
  onDisconnect(e) {
    return this.on("disconnect", e);
  }
  disconnect() {
    this.ws && (this.ws.onclose = null, this.ws.close(), this.ws = null);
  }
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
const G = 5e3;
function Q(o) {
  const [e, r] = f([]), [s, n] = f(!1), i = y(null), d = y(null), a = y(!0), h = y(!1), c = T(() => {
    if (!a.current) return;
    i.current?.disconnect(), i.current = null;
    const m = () => {
      a.current && (n(!1), h.current = !0, d.current = setTimeout(() => c(), G));
    };
    (async () => {
      let x;
      try {
        x = await E.bridgeToken({ force: h.current }), h.current = !1;
      } catch {
        m();
        return;
      }
      if (!a.current) return;
      const p = new z(V(x));
      i.current = p, p.connect().then(() => {
        a.current && (n(!0), E.getSessionLogs(100).then((v) => {
          a.current && r(v ?? []);
        }).catch(() => {
        }), p.onLog((v) => {
          a.current && r((b) => [...b, v].slice(-1e3));
        }), p.onDisconnect(m));
      }).catch(m);
    })();
  }, []), g = T(() => {
    d.current && (clearTimeout(d.current), d.current = null), n(!1), c();
  }, [c]);
  return q(() => {
    if (o)
      return a.current = !0, c(), () => {
        a.current = !1, d.current && clearTimeout(d.current), i.current?.disconnect(), i.current = null;
      };
  }, [o, c]), {
    logs: e,
    isConnected: s,
    reconnect: g,
    addLog: (m) => r((x) => [...x, m].slice(-1e3)),
    clear: () => r([])
  };
}
const X = {
  tiktok_comment: "border-l-blue-500 bg-blue-50",
  telegram_message: "border-l-violet-500 bg-violet-50",
  order: "border-l-emerald-500 bg-emerald-50",
  error: "border-l-rose-500 bg-rose-50",
  info: "border-l-amber-500 bg-amber-50"
}, Z = {
  tiktok_comment: "text-blue-700",
  telegram_message: "text-violet-700",
  order: "text-emerald-700",
  error: "text-rose-700",
  info: "text-amber-700"
}, ee = {
  tiktok_comment: "🎬",
  telegram_message: "💬",
  order: "✅",
  error: "❌",
  info: "ℹ️"
}, te = {
  tiktok_comment: "TikTok",
  telegram_message: "Telegram",
  order: "Замовлення",
  error: "Помилка",
  info: "Інфо"
}, se = "border-l-sq-divider bg-sq-bg";
function re(o) {
  return new Date(o).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function ne({ logs: o, isConnected: e, onReconnect: r }) {
  const s = y(null);
  return q(() => {
    s.current && (s.current.scrollTop = s.current.scrollHeight);
  }, [o]), /* @__PURE__ */ l("div", { className: "sq-card flex h-[600px] flex-col overflow-hidden", "data-testid": "live-logs", children: [
    /* @__PURE__ */ l("div", { className: "flex flex-shrink-0 items-center justify-between border-b border-sq-divider px-5 py-4", children: [
      /* @__PURE__ */ l("div", { children: [
        /* @__PURE__ */ t("div", { className: "text-sm font-semibold text-sq-text", children: "Стрічка ефіру" }),
        /* @__PURE__ */ l("div", { className: "text-xs text-sq-muted", children: [
          o.length,
          " повідомлень · автоскрол увімкнено"
        ] })
      ] }),
      /* @__PURE__ */ l("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ l("span", { className: "flex items-center gap-1.5 text-xs font-semibold", children: [
          /* @__PURE__ */ t(
            "span",
            {
              className: `h-2 w-2 flex-shrink-0 rounded-full ${e ? "bg-emerald-500" : "bg-rose-500"}`
            }
          ),
          /* @__PURE__ */ t("span", { className: e ? "text-emerald-700" : "text-rose-700", children: e ? "Підключено" : "Відключено" })
        ] }),
        !e && r && /* @__PURE__ */ t(
          "button",
          {
            type: "button",
            onClick: r,
            title: "Перепідключити без перезавантаження сторінки",
            className: "rounded-sq border border-sq-divider px-3 py-1.5 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
            children: "↺ Перепідключити"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ t("div", { ref: s, className: "flex flex-1 flex-col gap-2 overflow-y-auto p-4", children: o.length === 0 ? /* @__PURE__ */ l("div", { className: "flex flex-1 flex-col items-center justify-center gap-2 text-center text-sq-muted", children: [
      /* @__PURE__ */ t("span", { className: "text-3xl opacity-40", children: "📭" }),
      /* @__PURE__ */ t("div", { className: "text-sm font-semibold text-sq-secondary", children: "Повідомлень поки немає" }),
      /* @__PURE__ */ t("div", { className: "text-sm", children: "Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут" })
    ] }) : o.map((n) => /* @__PURE__ */ l(
      "div",
      {
        "data-testid": "live-log-row",
        className: `rounded-sq border-l-[3px] px-3.5 py-2.5 ${X[n.log_type] ?? se}`,
        children: [
          /* @__PURE__ */ l("div", { className: "mb-1.5 flex items-center gap-1.5", children: [
            /* @__PURE__ */ t("span", { className: "text-sm leading-none", children: ee[n.log_type] ?? "📝" }),
            /* @__PURE__ */ t(
              "span",
              {
                className: `text-[11px] font-bold uppercase tracking-wider ${Z[n.log_type] ?? "text-sq-secondary"}`,
                children: te[n.log_type] ?? n.log_type
              }
            ),
            /* @__PURE__ */ t("span", { className: "ml-auto font-mono text-[11px] text-sq-muted", children: re(n.created_at) })
          ] }),
          /* @__PURE__ */ t("p", { className: "break-words text-[13px] leading-relaxed text-sq-text", children: n.message }),
          n.data && Object.keys(n.data).length > 0 && /* @__PURE__ */ t("div", { className: "mt-1.5 flex flex-wrap gap-2 border-t border-black/5 pt-1.5", children: Object.entries(n.data).map(([i, d]) => /* @__PURE__ */ l("span", { className: "font-mono text-[11px] text-sq-muted", children: [
            /* @__PURE__ */ l("span", { className: "text-sq-secondary", children: [
              i,
              ":"
            ] }),
            " ",
            JSON.stringify(d)
          ] }, i)) })
        ]
      },
      n.id
    )) })
  ] });
}
function oe({
  isActive: o,
  onStart: e,
  onStop: r,
  isStarting: s,
  isStopping: n
}) {
  return o ? /* @__PURE__ */ t(
    "button",
    {
      type: "button",
      onClick: r,
      disabled: n,
      "data-testid": "session-stop",
      className: "rounded-sq bg-rose-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50",
      children: n ? "Зупиняємо…" : "■ Зупинити ефір"
    }
  ) : /* @__PURE__ */ t(
    "button",
    {
      type: "button",
      onClick: e,
      disabled: s,
      "data-testid": "session-start",
      className: "sq-btn-primary px-6 py-3 text-base disabled:cursor-not-allowed",
      children: s ? "Запускаємо…" : "▶ Почати ефір"
    }
  );
}
const A = {
  host_too_old: {
    icon: "⬆️",
    title: "Застосунок каси застарів для модуля ефіру",
    body: "Оновіть застосунок до останньої версії. Якщо після оновлення нічого не змінилось — передайте код нижче в підтримку."
  },
  server_missing_bridge: {
    icon: "🛠",
    title: "Сервер не підтримує модуль ефіру",
    body: "Схоже, сервер магазину ще не оновлено. Передайте код нижче в підтримку — оновлення на нашому боці."
  },
  server_error: {
    icon: "⚠️",
    title: "Сервер відповів помилкою",
    body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
  },
  network: {
    icon: "📡",
    title: "Немає зʼєднання з сервером",
    body: "Модуль ефіру працює лише онлайн. Перевірте інтернет і спробуйте ще раз."
  },
  unknown: {
    icon: "⚠️",
    title: "Не вдалося підключитися до TikTok LIVE",
    body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
  }
};
function D(o) {
  const e = Math.max(0, Math.floor((Date.now() - new Date(o).getTime()) / 1e3)), r = Math.floor(e / 3600), s = Math.floor(e % 3600 / 60), n = e % 60;
  return [r, s, n].map((i) => String(i).padStart(2, "0")).join(":");
}
function de() {
  const o = B(), { status: e, username: r, diagnostic: s, refresh: n } = Y(), i = e === "ready", {
    session: d,
    isActive: a,
    isError: h,
    diagnostic: c,
    isStarting: g,
    isStopping: m,
    actionError: x,
    start: p,
    stop: v
  } = J(i), { logs: b, isConnected: w, reconnect: O } = Q(i), [R, _] = f("00:00:00"), k = d?.started_at ?? null;
  if (q(() => {
    if (!a || !k) {
      _("00:00:00");
      return;
    }
    _(D(k));
    const u = setInterval(() => _(D(k)), 1e3);
    return () => clearInterval(u);
  }, [a, k]), e === "loading")
    return /* @__PURE__ */ t(L, { title: "Підключення до TikTok LIVE…" });
  if (e === "not-configured")
    return /* @__PURE__ */ t(
      L,
      {
        icon: "🔌",
        title: "Магазин не під’єднано до TikTok LIVE",
        body: o === "web" ? "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього ефір буде доступний і в касі, і в адмінці." : "Власник має вказати нікнейм TikTok-акаунта в Налаштуваннях магазину у веб-адмінці.",
        action: { label: "Спробувати ще раз", onClick: n },
        diagnostic: s
      }
    );
  if (e === "error") {
    const u = A[s?.reason ?? "unknown"] ?? A.unknown;
    return /* @__PURE__ */ t(
      L,
      {
        icon: u.icon,
        title: u.title,
        body: u.body,
        action: { label: "Спробувати ще раз", onClick: n },
        diagnostic: s
      }
    );
  }
  const H = b.filter((u) => u.log_type === "order").length, I = b.filter((u) => u.log_type === "tiktok_comment").length, C = b.filter((u) => u.log_type === "error").length;
  return /* @__PURE__ */ l("div", { className: "animate-fade-up space-y-6 text-sq-text", children: [
    /* @__PURE__ */ l("div", { className: "sq-card p-6 shadow-sm", children: [
      /* @__PURE__ */ l("div", { className: "flex flex-wrap items-start justify-between gap-6", children: [
        /* @__PURE__ */ l("div", { children: [
          /* @__PURE__ */ l("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ t(
              "span",
              {
                className: `h-3 w-3 flex-shrink-0 rounded-full ${a ? "bg-emerald-500" : "bg-sq-muted"}`
              }
            ),
            /* @__PURE__ */ t("h2", { className: "text-2xl font-semibold", children: "Прямий ефір" }),
            /* @__PURE__ */ t(
              "span",
              {
                className: `rounded-sq px-2 py-0.5 text-xs font-semibold ${a ? "bg-emerald-100 text-emerald-800" : "bg-sq-empty text-sq-secondary"}`,
                "data-testid": "session-status",
                children: a ? "Активна" : "Зупинена"
              }
            )
          ] }),
          /* @__PURE__ */ l("p", { className: "mt-2 text-sm text-sq-secondary", children: [
            r ? `Акаунт @${r} · ` : "",
            "WebSocket:",
            " ",
            /* @__PURE__ */ t("span", { className: w ? "text-emerald-700" : "text-rose-700", children: w ? "підключено" : "відключено" })
          ] })
        ] }),
        a && /* @__PURE__ */ l("div", { className: "rounded-sq border border-sq-divider bg-sq-bg px-6 py-3 text-center", children: [
          /* @__PURE__ */ t("div", { className: "sq-section-label", children: "Тривалість" }),
          /* @__PURE__ */ t("div", { className: "mt-1 font-mono text-3xl font-semibold text-emerald-700", children: R })
        ] })
      ] }),
      /* @__PURE__ */ l("div", { className: "mt-6 flex flex-wrap items-center gap-4 border-t border-sq-divider pt-6", children: [
        /* @__PURE__ */ t(
          oe,
          {
            isActive: a,
            onStart: () => void p(),
            onStop: () => void v(),
            isStarting: g,
            isStopping: m
          }
        ),
        x && /* @__PURE__ */ t("span", { className: "text-sm text-rose-700", children: x }),
        h && /* @__PURE__ */ l("span", { className: "text-sm text-sq-secondary", children: [
          "Статус ефіру недоступний — повторюємо спробу…",
          c && /* @__PURE__ */ l(W, { children: [
            " ",
            /* @__PURE__ */ t(
              "code",
              {
                "data-testid": "live-poll-support-code",
                className: "select-all font-mono text-xs text-sq-muted",
                children: c.code
              }
            )
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ l("div", { className: "grid gap-6 lg:grid-cols-[260px_1fr]", children: [
      /* @__PURE__ */ l("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ t("span", { className: "sq-section-label", children: "Статистика ефіру" }),
        /* @__PURE__ */ t(S, { label: "Замовлень", value: H, icon: "🛍", tone: "text-emerald-700" }),
        /* @__PURE__ */ t(S, { label: "Коментарів", value: I, icon: "💬", tone: "text-blue-700" }),
        /* @__PURE__ */ t(
          S,
          {
            label: "Помилок",
            value: C,
            icon: "⚠",
            tone: C > 0 ? "text-rose-700" : "text-sq-muted"
          }
        )
      ] }),
      /* @__PURE__ */ l("div", { className: "space-y-2", children: [
        /* @__PURE__ */ t("span", { className: "sq-section-label", children: "Лайв-лог" }),
        /* @__PURE__ */ t(ne, { logs: b, isConnected: w, onReconnect: O })
      ] })
    ] })
  ] });
}
function S({
  label: o,
  value: e,
  icon: r,
  tone: s
}) {
  return /* @__PURE__ */ l("div", { className: "sq-card flex items-center gap-4 p-4", children: [
    /* @__PURE__ */ t("div", { className: "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sq bg-sq-bg text-xl", children: r }),
    /* @__PURE__ */ l("div", { children: [
      /* @__PURE__ */ t("div", { className: "sq-section-label", children: o }),
      /* @__PURE__ */ t("div", { className: `font-mono text-2xl font-bold ${s}`, children: e })
    ] })
  ] });
}
function L({
  icon: o,
  title: e,
  body: r,
  action: s,
  diagnostic: n
}) {
  return /* @__PURE__ */ t("div", { className: "grid min-h-[60vh] place-items-center px-6", children: /* @__PURE__ */ l("div", { className: "sq-card animate-fade-up max-w-md p-8 text-center", children: [
    o && /* @__PURE__ */ t("div", { className: "mb-4 text-4xl", children: o }),
    /* @__PURE__ */ t("h2", { className: "text-lg font-semibold text-sq-text", children: e }),
    r && /* @__PURE__ */ t("p", { className: "mt-3 text-sm leading-relaxed text-sq-secondary", children: r }),
    s && /* @__PURE__ */ t(
      "button",
      {
        type: "button",
        onClick: s.onClick,
        className: "sq-btn-primary mt-6 px-4 py-2.5",
        children: s.label
      }
    ),
    n && /* @__PURE__ */ t(K, { diagnostic: n })
  ] }) });
}
export {
  de as LiveDeskPage
};
