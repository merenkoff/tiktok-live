var oe = Object.defineProperty;
var ie = (e, t, s) => t in e ? oe(e, t, { enumerable: !0, configurable: !0, writable: !0, value: s }) : e[t] = s;
var _ = (e, t, s) => ie(e, typeof t != "symbol" ? t + "" : t, s);
import { jsxs as i, jsx as n, Fragment as ae } from "react/jsx-runtime";
import { useState as m, useEffect as E, useCallback as T, useRef as q } from "react";
import * as v from "@pos/platform";
class K extends Error {
  constructor(t) {
    super(`host is missing: ${t.join(", ")}`), this.missing = t, this.name = "HostTooOldError";
  }
}
function O(e) {
  return typeof e == "function";
}
function Y() {
  const e = [];
  return O(v.apiOrigin) || e.push("apiOrigin"), O(v.api?.liveSessionToken) || e.push("api.liveSessionToken"), O(v.usePosShell) || e.push("usePosShell"), e;
}
function le() {
  return typeof v.POS_APP_VERSION == "string" ? v.POS_APP_VERSION : "unknown";
}
function z() {
  return O(v.apiOrigin) ? v.apiOrigin() : "";
}
const F = O(v.usePosShell) ? v.usePosShell : null;
function ce() {
  return F ? F() : "web";
}
function de() {
  const e = Y();
  return e.length > 0 ? Promise.reject(new K(e)) : v.api.liveSessionToken();
}
function Q() {
  return z();
}
function ue(e) {
  return e.startsWith("https://") ? `wss://${e.slice(8)}` : e.startsWith("http://") ? `ws://${e.slice(7)}` : e;
}
function me(e) {
  const t = Q();
  return `${t ? ue(t) : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`}/api/sessions/logs/stream?token=${encodeURIComponent(e)}`;
}
class X extends Error {
  constructor() {
    super("live_not_configured");
    /** The bridge's HTTP status, so `diagnose()` classifies it like any other. */
    _(this, "status", 409);
    this.name = "LiveNotConfiguredError";
  }
}
class Z extends Error {
  constructor(t, s) {
    super(s), this.status = t, this.name = "LiveApiError";
  }
}
const V = "live_token", fe = 24 * 60 * 60 * 1e3;
let k = null, $ = !1, L = null;
function he(e) {
  const t = e?.response?.status;
  return typeof t == "number" ? t : null;
}
function ee() {
  if (k) return k;
  if ($) return null;
  $ = !0;
  try {
    const e = localStorage.getItem(V);
    e && (k = JSON.parse(e));
  } catch {
    k = null;
  }
  return k;
}
function pe() {
  k = null, $ = !1, L = null;
  try {
    localStorage.removeItem(V);
  } catch {
  }
}
async function ge() {
  try {
    const e = await de(), t = {
      token: e.token,
      expiresAt: e.expiresAt,
      username: e.user.tiktok_username
    };
    k = t, $ = !0;
    try {
      localStorage.setItem(V, JSON.stringify(t));
    } catch {
    }
    return t;
  } catch (e) {
    throw he(e) === 409 ? (pe(), new X()) : e;
  }
}
async function I(e = {}) {
  if (e.force)
    k = null;
  else {
    const t = ee();
    if (t && Date.parse(t.expiresAt) - Date.now() > fe) return t.token;
  }
  return L || (L = ge().finally(() => {
    L = null;
  })), (await L).token;
}
function xe() {
  return ee()?.username ?? null;
}
function W(e, t, s) {
  return fetch(`${Q()}${e}`, {
    ...t,
    headers: { ...t.headers ?? {}, Authorization: `Bearer ${s}` }
  });
}
async function A(e, t = {}) {
  let s = await W(e, t, await I());
  if (s.status === 401 && (s = await W(e, t, await I({ force: !0 }))), !s.ok) throw new Z(s.status, `${t.method ?? "GET"} ${e} → ${s.status}`);
  const r = await s.text();
  return r ? JSON.parse(r) : null;
}
const C = {
  bridgeToken: I,
  /** `null` when no session is running — an empty state, not an error. */
  getCurrentSession: () => A("/api/sessions/current"),
  getSessionLogs: (e = 100) => A(`/api/sessions/logs?limit=${e}`),
  startSession: () => A("/api/sessions/start", { method: "POST" }),
  stopSession: () => A("/api/sessions/stop", { method: "POST" })
}, be = "1.0.8", j = {
  not_configured: "CFG",
  host_too_old: "HOST",
  server_missing_bridge: "SRV404",
  server_error: "SRV",
  network: "NET",
  unknown: "UNK"
};
function ve(e) {
  if (e instanceof X || e instanceof Z)
    return e.status;
  const t = e?.response?.status;
  return typeof t == "number" ? t : null;
}
function ye(e, t) {
  return e instanceof K ? "host_too_old" : t === 409 ? "not_configured" : t === 404 ? "server_missing_bridge" : t !== null ? "server_error" : e instanceof Error ? "network" : "unknown";
}
function we(e) {
  return `TL-${e.reason === "server_error" && e.status !== null ? `${j.server_error}${e.status}` : j[e.reason]}-${e.moduleVersion}-${e.hostVersion}`;
}
function te(e) {
  const t = ve(e), s = {
    reason: ye(e, t),
    status: t,
    missingHostApi: Y(),
    moduleVersion: be,
    hostVersion: le(),
    apiBase: z(),
    at: (/* @__PURE__ */ new Date()).toISOString()
  };
  return { ...s, code: we(s) };
}
function U(e) {
  return JSON.stringify({ module: "tiktok-live", ...e }, null, 2);
}
const B = /* @__PURE__ */ new Set();
function se(e) {
  typeof window < "u" && (window.__POS_TIKTOK_LIVE_DIAG__ = e), !B.has(e.code) && (B.add(e.code), console.error(`[tiktok-live] ${e.code}`, e));
}
function Ne() {
  const [e, t] = m("loading"), [s, r] = m(null), [o, l] = m(null), [u, a] = m(0);
  E(() => {
    let c = !0;
    return t("loading"), I().then(() => {
      c && (r(xe()), l(null), t("ready"));
    }).catch((w) => {
      if (!c) return;
      const f = te(w);
      se(f), l(f), t(f.reason === "not_configured" ? "not-configured" : "error");
    }), () => {
      c = !1;
    };
  }, [u]);
  const g = T(() => a((c) => c + 1), []);
  return { status: e, username: s, diagnostic: o, refresh: g };
}
class ke {
  constructor(t) {
    _(this, "ws", null);
    _(this, "url");
    _(this, "logHandlers", /* @__PURE__ */ new Set());
    _(this, "eventHandlers", /* @__PURE__ */ new Map());
    this.url = t;
  }
  connect() {
    return new Promise((t, s) => {
      try {
        this.ws = new WebSocket(this.url), this.ws.onopen = () => t(), this.ws.onmessage = (r) => {
          try {
            this.handleMessage(JSON.parse(String(r.data)));
          } catch (o) {
            console.error("[tiktok-live] bad WebSocket frame", o);
          }
        }, this.ws.onclose = () => this.dispatch("disconnect", {}), this.ws.onerror = (r) => s(r);
      } catch (r) {
        s(r);
      }
    });
  }
  handleMessage(t) {
    if (t.type === "log" && t.log) {
      this.logHandlers.forEach((s) => s(t.log));
      return;
    }
    t.type && this.dispatch(t.type, t);
  }
  dispatch(t, s) {
    this.eventHandlers.get(t)?.forEach((r) => r(s));
  }
  onLog(t) {
    return this.logHandlers.add(t), () => {
      this.logHandlers.delete(t);
    };
  }
  on(t, s) {
    let r = this.eventHandlers.get(t);
    return r || (r = /* @__PURE__ */ new Set(), this.eventHandlers.set(t, r)), r.add(s), () => {
      r?.delete(s);
    };
  }
  onDisconnect(t) {
    return this.on("disconnect", t);
  }
  disconnect() {
    this.ws && (this.ws.onclose = null, this.ws.close(), this.ws = null);
  }
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
const Se = 5e3;
function _e(e) {
  const [t, s] = m([]), [r, o] = m(!1), l = q(null), u = q(null), a = q(!0), g = q(!1), c = T(() => {
    if (!a.current) return;
    l.current?.disconnect(), l.current = null;
    const f = () => {
      a.current && (o(!1), g.current = !0, u.current = setTimeout(() => c(), Se));
    };
    (async () => {
      let x;
      try {
        x = await C.bridgeToken({ force: g.current }), g.current = !1;
      } catch {
        f();
        return;
      }
      if (!a.current) return;
      const N = new ke(me(x));
      l.current = N, N.connect().then(() => {
        a.current && (o(!0), C.getSessionLogs(100).then((b) => {
          a.current && s(b ?? []);
        }).catch(() => {
        }), N.onLog((b) => {
          a.current && s((d) => [...d, b].slice(-1e3));
        }), N.onDisconnect(f));
      }).catch(f);
    })();
  }, []), w = T(() => {
    u.current && (clearTimeout(u.current), u.current = null), o(!1), c();
  }, [c]);
  return E(() => {
    if (e)
      return a.current = !0, c(), () => {
        a.current = !1, u.current && clearTimeout(u.current), l.current?.disconnect(), l.current = null;
      };
  }, [e, c]), {
    logs: t,
    isConnected: r,
    reconnect: w,
    addLog: (f) => s((x) => [...x, f].slice(-1e3)),
    clear: () => s([])
  };
}
const qe = 5e3;
function Te(e) {
  const [t, s] = m(null), [r, o] = m(!0), [l, u] = m(!1), [a, g] = m(null), [c, w] = m(!1), [f, x] = m(!1), [N, b] = m(null), d = q(!0);
  E(() => (d.current = !0, () => {
    d.current = !1;
  }), []);
  const h = T(async () => {
    try {
      const y = await C.getCurrentSession();
      if (!d.current) return;
      s(y), u(!1), g(null);
    } catch (y) {
      const S = te(y);
      se(S), d.current && (u(!0), g(S));
    } finally {
      d.current && o(!1);
    }
  }, []);
  E(() => {
    if (!e) return;
    h();
    const y = setInterval(() => void h(), qe);
    return () => clearInterval(y);
  }, [e, h]);
  const R = T(async () => {
    b(null), w(!0);
    try {
      await C.startSession(), await h();
    } catch {
      d.current && b("Не вдалося почати ефір");
    } finally {
      d.current && w(!1);
    }
  }, [h]), P = T(async () => {
    b(null), x(!0);
    try {
      await C.stopSession(), await h();
    } catch {
      d.current && b("Не вдалося зупинити ефір");
    } finally {
      d.current && x(!1);
    }
  }, [h]);
  return {
    session: t,
    isActive: t?.status === "running",
    isLoading: r,
    isError: l,
    diagnostic: a,
    isStarting: c,
    isStopping: f,
    actionError: N,
    start: R,
    stop: P,
    refresh: h
  };
}
const Ee = {
  tiktok_comment: "border-l-blue-500 bg-blue-50",
  telegram_message: "border-l-violet-500 bg-violet-50",
  order: "border-l-emerald-500 bg-emerald-50",
  error: "border-l-rose-500 bg-rose-50",
  info: "border-l-amber-500 bg-amber-50"
}, Le = {
  tiktok_comment: "text-blue-700",
  telegram_message: "text-violet-700",
  order: "text-emerald-700",
  error: "text-rose-700",
  info: "text-amber-700"
}, Oe = {
  tiktok_comment: "🎬",
  telegram_message: "💬",
  order: "✅",
  error: "❌",
  info: "ℹ️"
}, Ce = {
  tiktok_comment: "TikTok",
  telegram_message: "Telegram",
  order: "Замовлення",
  error: "Помилка",
  info: "Інфо"
}, Ae = "border-l-sq-divider bg-sq-bg";
function $e(e) {
  return new Date(e).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
function Ie({ logs: e, isConnected: t, onReconnect: s }) {
  const r = q(null);
  return E(() => {
    r.current && (r.current.scrollTop = r.current.scrollHeight);
  }, [e]), /* @__PURE__ */ i("div", { className: "sq-card flex h-[600px] flex-col overflow-hidden", "data-testid": "live-logs", children: [
    /* @__PURE__ */ i("div", { className: "flex flex-shrink-0 items-center justify-between border-b border-sq-divider px-5 py-4", children: [
      /* @__PURE__ */ i("div", { children: [
        /* @__PURE__ */ n("div", { className: "text-sm font-semibold text-sq-text", children: "Стрічка ефіру" }),
        /* @__PURE__ */ i("div", { className: "text-xs text-sq-muted", children: [
          e.length,
          " повідомлень · автоскрол увімкнено"
        ] })
      ] }),
      /* @__PURE__ */ i("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ i("span", { className: "flex items-center gap-1.5 text-xs font-semibold", children: [
          /* @__PURE__ */ n(
            "span",
            {
              className: `h-2 w-2 flex-shrink-0 rounded-full ${t ? "bg-emerald-500" : "bg-rose-500"}`
            }
          ),
          /* @__PURE__ */ n("span", { className: t ? "text-emerald-700" : "text-rose-700", children: t ? "Підключено" : "Відключено" })
        ] }),
        !t && s && /* @__PURE__ */ n(
          "button",
          {
            type: "button",
            onClick: s,
            title: "Перепідключити без перезавантаження сторінки",
            className: "rounded-sq border border-sq-divider px-3 py-1.5 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
            children: "↺ Перепідключити"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ n("div", { ref: r, className: "flex flex-1 flex-col gap-2 overflow-y-auto p-4", children: e.length === 0 ? /* @__PURE__ */ i("div", { className: "flex flex-1 flex-col items-center justify-center gap-2 text-center text-sq-muted", children: [
      /* @__PURE__ */ n("span", { className: "text-3xl opacity-40", children: "📭" }),
      /* @__PURE__ */ n("div", { className: "text-sm font-semibold text-sq-secondary", children: "Повідомлень поки немає" }),
      /* @__PURE__ */ n("div", { className: "text-sm", children: "Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут" })
    ] }) : e.map((o) => /* @__PURE__ */ i(
      "div",
      {
        "data-testid": "live-log-row",
        className: `rounded-sq border-l-[3px] px-3.5 py-2.5 ${Ee[o.log_type] ?? Ae}`,
        children: [
          /* @__PURE__ */ i("div", { className: "mb-1.5 flex items-center gap-1.5", children: [
            /* @__PURE__ */ n("span", { className: "text-sm leading-none", children: Oe[o.log_type] ?? "📝" }),
            /* @__PURE__ */ n(
              "span",
              {
                className: `text-[11px] font-bold uppercase tracking-wider ${Le[o.log_type] ?? "text-sq-secondary"}`,
                children: Ce[o.log_type] ?? o.log_type
              }
            ),
            /* @__PURE__ */ n("span", { className: "ml-auto font-mono text-[11px] text-sq-muted", children: $e(o.created_at) })
          ] }),
          /* @__PURE__ */ n("p", { className: "break-words text-[13px] leading-relaxed text-sq-text", children: o.message }),
          o.data && Object.keys(o.data).length > 0 && /* @__PURE__ */ n("div", { className: "mt-1.5 flex flex-wrap gap-2 border-t border-black/5 pt-1.5", children: Object.entries(o.data).map(([l, u]) => /* @__PURE__ */ i("span", { className: "font-mono text-[11px] text-sq-muted", children: [
            /* @__PURE__ */ i("span", { className: "text-sq-secondary", children: [
              l,
              ":"
            ] }),
            " ",
            JSON.stringify(u)
          ] }, l)) })
        ]
      },
      o.id
    )) })
  ] });
}
function Re({
  isActive: e,
  onStart: t,
  onStop: s,
  isStarting: r,
  isStopping: o
}) {
  return e ? /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: s,
      disabled: o,
      "data-testid": "session-stop",
      className: "rounded-sq bg-rose-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50",
      children: o ? "Зупиняємо…" : "■ Зупинити ефір"
    }
  ) : /* @__PURE__ */ n(
    "button",
    {
      type: "button",
      onClick: t,
      disabled: r,
      "data-testid": "session-start",
      className: "sq-btn-primary px-6 py-3 text-base disabled:cursor-not-allowed",
      children: r ? "Запускаємо…" : "▶ Почати ефір"
    }
  );
}
function Pe({ diagnostic: e }) {
  const [t, s] = m(!1);
  async function r() {
    try {
      await navigator.clipboard.writeText(U(e)), s(!0), setTimeout(() => s(!1), 2e3);
    } catch {
      s(!1);
    }
  }
  return /* @__PURE__ */ i("div", { className: "mt-6 border-t border-sq-divider pt-4 text-left", children: [
    /* @__PURE__ */ n("div", { className: "sq-section-label", children: "Код для підтримки" }),
    /* @__PURE__ */ i("div", { className: "mt-1.5 flex items-center gap-2", children: [
      /* @__PURE__ */ n(
        "code",
        {
          "data-testid": "live-support-code",
          className: "select-all rounded-sq bg-sq-bg px-2 py-1 font-mono text-sm text-sq-text",
          children: e.code
        }
      ),
      /* @__PURE__ */ n(
        "button",
        {
          type: "button",
          onClick: () => void r(),
          className: "rounded-sq border border-sq-divider px-2.5 py-1 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
          children: t ? "Скопійовано" : "Копіювати деталі"
        }
      )
    ] }),
    /* @__PURE__ */ i("details", { className: "mt-3", children: [
      /* @__PURE__ */ n("summary", { className: "cursor-pointer text-xs text-sq-muted", children: "Технічні деталі" }),
      /* @__PURE__ */ n("pre", { className: "mt-2 max-h-48 select-all overflow-auto rounded-sq bg-sq-bg p-2 font-mono text-[11px] leading-relaxed text-sq-secondary", children: U(e) })
    ] })
  ] });
}
const J = {
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
function G(e) {
  const t = Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 1e3)), s = Math.floor(t / 3600), r = Math.floor(t % 3600 / 60), o = t % 60;
  return [s, r, o].map((l) => String(l).padStart(2, "0")).join(":");
}
function Me() {
  const e = ce(), { status: t, username: s, diagnostic: r, refresh: o } = Ne(), l = t === "ready", {
    session: u,
    isActive: a,
    isError: g,
    diagnostic: c,
    isStarting: w,
    isStopping: f,
    actionError: x,
    start: N,
    stop: b
  } = Te(l), { logs: d, isConnected: h, reconnect: R } = _e(l), [P, y] = m("00:00:00"), S = u?.started_at ?? null;
  if (E(() => {
    if (!a || !S) {
      y("00:00:00");
      return;
    }
    y(G(S));
    const p = setInterval(() => y(G(S)), 1e3);
    return () => clearInterval(p);
  }, [a, S]), t === "loading")
    return /* @__PURE__ */ n(H, { title: "Підключення до TikTok LIVE…" });
  if (t === "not-configured")
    return /* @__PURE__ */ n(
      H,
      {
        icon: "🔌",
        title: "Магазин не під’єднано до TikTok LIVE",
        body: e === "web" ? "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього ефір буде доступний і в касі, і в адмінці." : "Власник має вказати нікнейм TikTok-акаунта в Налаштуваннях магазину у веб-адмінці.",
        action: { label: "Спробувати ще раз", onClick: o },
        diagnostic: r
      }
    );
  if (t === "error") {
    const p = J[r?.reason ?? "unknown"] ?? J.unknown;
    return /* @__PURE__ */ n(
      H,
      {
        icon: p.icon,
        title: p.title,
        body: p.body,
        action: { label: "Спробувати ще раз", onClick: o },
        diagnostic: r
      }
    );
  }
  const ne = d.filter((p) => p.log_type === "order").length, re = d.filter((p) => p.log_type === "tiktok_comment").length, M = d.filter((p) => p.log_type === "error").length;
  return /* @__PURE__ */ i("div", { className: "animate-fade-up space-y-6 text-sq-text", children: [
    /* @__PURE__ */ i("div", { className: "sq-card p-6 shadow-sm", children: [
      /* @__PURE__ */ i("div", { className: "flex flex-wrap items-start justify-between gap-6", children: [
        /* @__PURE__ */ i("div", { children: [
          /* @__PURE__ */ i("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ n(
              "span",
              {
                className: `h-3 w-3 flex-shrink-0 rounded-full ${a ? "bg-emerald-500" : "bg-sq-muted"}`
              }
            ),
            /* @__PURE__ */ n("h2", { className: "text-2xl font-semibold", children: "Прямий ефір" }),
            /* @__PURE__ */ n(
              "span",
              {
                className: `rounded-sq px-2 py-0.5 text-xs font-semibold ${a ? "bg-emerald-100 text-emerald-800" : "bg-sq-empty text-sq-secondary"}`,
                "data-testid": "session-status",
                children: a ? "Активна" : "Зупинена"
              }
            )
          ] }),
          /* @__PURE__ */ i("p", { className: "mt-2 text-sm text-sq-secondary", children: [
            s ? `Акаунт @${s} · ` : "",
            "WebSocket:",
            " ",
            /* @__PURE__ */ n("span", { className: h ? "text-emerald-700" : "text-rose-700", children: h ? "підключено" : "відключено" })
          ] })
        ] }),
        a && /* @__PURE__ */ i("div", { className: "rounded-sq border border-sq-divider bg-sq-bg px-6 py-3 text-center", children: [
          /* @__PURE__ */ n("div", { className: "sq-section-label", children: "Тривалість" }),
          /* @__PURE__ */ n("div", { className: "mt-1 font-mono text-3xl font-semibold text-emerald-700", children: P })
        ] })
      ] }),
      /* @__PURE__ */ i("div", { className: "mt-6 flex flex-wrap items-center gap-4 border-t border-sq-divider pt-6", children: [
        /* @__PURE__ */ n(
          Re,
          {
            isActive: a,
            onStart: () => void N(),
            onStop: () => void b(),
            isStarting: w,
            isStopping: f
          }
        ),
        x && /* @__PURE__ */ n("span", { className: "text-sm text-rose-700", children: x }),
        g && /* @__PURE__ */ i("span", { className: "text-sm text-sq-secondary", children: [
          "Статус ефіру недоступний — повторюємо спробу…",
          c && /* @__PURE__ */ i(ae, { children: [
            " ",
            /* @__PURE__ */ n(
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
    /* @__PURE__ */ i("div", { className: "grid gap-6 lg:grid-cols-[260px_1fr]", children: [
      /* @__PURE__ */ i("div", { className: "flex flex-col gap-4", children: [
        /* @__PURE__ */ n("span", { className: "sq-section-label", children: "Статистика ефіру" }),
        /* @__PURE__ */ n(D, { label: "Замовлень", value: ne, icon: "🛍", tone: "text-emerald-700" }),
        /* @__PURE__ */ n(D, { label: "Коментарів", value: re, icon: "💬", tone: "text-blue-700" }),
        /* @__PURE__ */ n(
          D,
          {
            label: "Помилок",
            value: M,
            icon: "⚠",
            tone: M > 0 ? "text-rose-700" : "text-sq-muted"
          }
        )
      ] }),
      /* @__PURE__ */ i("div", { className: "space-y-2", children: [
        /* @__PURE__ */ n("span", { className: "sq-section-label", children: "Лайв-лог" }),
        /* @__PURE__ */ n(Ie, { logs: d, isConnected: h, onReconnect: R })
      ] })
    ] })
  ] });
}
function D({
  label: e,
  value: t,
  icon: s,
  tone: r
}) {
  return /* @__PURE__ */ i("div", { className: "sq-card flex items-center gap-4 p-4", children: [
    /* @__PURE__ */ n("div", { className: "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sq bg-sq-bg text-xl", children: s }),
    /* @__PURE__ */ i("div", { children: [
      /* @__PURE__ */ n("div", { className: "sq-section-label", children: e }),
      /* @__PURE__ */ n("div", { className: `font-mono text-2xl font-bold ${r}`, children: t })
    ] })
  ] });
}
function H({
  icon: e,
  title: t,
  body: s,
  action: r,
  diagnostic: o
}) {
  return /* @__PURE__ */ n("div", { className: "grid min-h-[60vh] place-items-center px-6", children: /* @__PURE__ */ i("div", { className: "sq-card animate-fade-up max-w-md p-8 text-center", children: [
    e && /* @__PURE__ */ n("div", { className: "mb-4 text-4xl", children: e }),
    /* @__PURE__ */ n("h2", { className: "text-lg font-semibold text-sq-text", children: t }),
    s && /* @__PURE__ */ n("p", { className: "mt-3 text-sm leading-relaxed text-sq-secondary", children: s }),
    r && /* @__PURE__ */ n(
      "button",
      {
        type: "button",
        onClick: r.onClick,
        className: "sq-btn-primary mt-6 px-4 py-2.5",
        children: r.label
      }
    ),
    o && /* @__PURE__ */ n(Pe, { diagnostic: o })
  ] }) });
}
export {
  Me as LiveDeskPage
};
