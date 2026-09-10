import { jsx as a, jsxs as c, Fragment as J } from "react/jsx-runtime";
import { useNavigate as K, useParams as V, Link as j, Routes as W, Route as B } from "react-router-dom";
import { useState as m, useCallback as R, useEffect as C, useRef as X, Suspense as Y, lazy as Z } from "react";
import { cashierApi as U, useAuthStore as tt, useOfflineStatus as M, isOfflinePosEnabled as z } from "@pos/platform";
import { d as o, s as et } from "./remote-entry-mVb3HO5B.js";
function st(t) {
  return [t.product_name, t.size, t.color].filter((s) => s && s.trim()).join(" · ");
}
async function at(t) {
  return (await o.sheets.where("storeId").equals(t).toArray()).sort((n, i) => i.createdAt - n.createdAt);
}
function nt(t) {
  return o.sheets.get(t);
}
async function rt(t) {
  return (await o.lines.where("sheetId").equals(t).toArray()).sort((n, i) => i.updatedAt - n.updatedAt);
}
async function ct(t) {
  const s = {
    id: crypto.randomUUID(),
    storeId: t.storeId,
    staffId: t.staffId,
    status: "counting",
    note: t.note?.trim() || null,
    createdAt: Date.now(),
    attempts: 0
  };
  return await o.sheets.add(s), s;
}
async function E(t) {
  const s = await o.sheets.get(t);
  if (!s) throw new Error("Лист не знайдено");
  if (s.status !== "counting") throw new Error("Лист уже завершено");
  return s;
}
async function ot(t, s, n = 1) {
  await E(t);
  const i = [t, s.variant_id], u = await o.lines.get(i), b = {
    sheetId: t,
    variantId: s.variant_id,
    countedQty: Math.max(0, (u?.countedQty ?? 0) + n),
    label: u?.label ?? st(s),
    barcode: s.barcode ?? u?.barcode ?? null,
    updatedAt: Date.now()
  };
  return await o.lines.put(b), b;
}
async function T(t, s, n) {
  await E(t);
  const i = [t, s], u = await o.lines.get(i);
  if (!u) throw new Error("Рядок не знайдено");
  await o.lines.put({ ...u, countedQty: Math.max(0, Math.floor(n)), updatedAt: Date.now() });
}
async function it(t, s) {
  await E(t), await o.lines.delete([t, s]);
}
async function dt(t) {
  const s = await E(t);
  if (await o.lines.where("sheetId").equals(t).count() === 0) throw new Error("Порожній лист — відскануйте хоча б один товар");
  const i = { ...s, status: "queued", finishedAt: Date.now() };
  return await o.sheets.put(i), i;
}
async function lt(t) {
  const s = await o.sheets.get(t);
  if (s) {
    if (s.status === "synced") throw new Error("Надісланий лист не видаляється");
    await o.transaction("rw", o.sheets, o.lines, async () => {
      await o.lines.where("sheetId").equals(t).delete(), await o.sheets.delete(t);
    });
  }
}
async function ut(t) {
  const s = t.trim();
  if (!s) return null;
  const n = await U.getCatalog({ barcode: s });
  return n.find((i) => i.barcode === s) ?? (n.length === 1 ? n[0] : null);
}
async function mt(t) {
  const s = t.trim();
  return s.length < 2 ? [] : (await U.getCatalog({ q: s })).slice(0, 20);
}
const P = {
  counting: "Рахую",
  queued: "В черзі",
  error: "Помилка, повторю",
  synced: "Надіслано",
  dead: "Відхилено"
}, xt = {
  counting: "bg-sq-blue/10 text-sq-blue",
  queued: "bg-amber-100 text-amber-800",
  error: "bg-amber-100 text-amber-800",
  synced: "bg-emerald-100 text-emerald-800",
  dead: "bg-red-100 text-red-800"
};
function F({ sheet: t }) {
  const s = t.status === "synced" && t.serverDocNumber ? `${P.synced} · ${t.serverDocNumber}` : P[t.status];
  return /* @__PURE__ */ a("span", { className: `rounded-sq px-2 py-0.5 text-xs font-medium ${xt[t.status]}`, children: s });
}
function yt(t) {
  return new Date(t).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}
function ht() {
  const t = tt((r) => r.auth), s = M((r) => r.online), n = K(), [i, u] = m([]), [b, N] = m({}), [v, y] = m(null), w = t?.store.id ?? null, f = R(async () => {
    if (w == null) return;
    const r = await at(w), h = {};
    await Promise.all(
      r.map(async (q) => {
        h[q.id] = await o.lines.where("sheetId").equals(q.id).count();
      })
    ), u(r), N(h);
  }, [w]);
  C(() => {
    f();
    const r = window.setInterval(() => void f(), 3e3);
    return () => window.clearInterval(r);
  }, [f]);
  async function g() {
    if (t) {
      y(null);
      try {
        const r = await ct({ storeId: t.store.id, staffId: t.staff.id });
        n(`/stocktake/${r.id}`);
      } catch (r) {
        y(r instanceof Error ? r.message : "Помилка");
      }
    }
  }
  async function S(r) {
    y(null);
    try {
      await lt(r.id), await f();
    } catch (h) {
      y(h instanceof Error ? h.message : "Помилка");
    }
  }
  return /* @__PURE__ */ c("div", { className: "mx-auto max-w-2xl px-4 py-4", children: [
    /* @__PURE__ */ c("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ a("h1", { className: "text-lg font-semibold text-sq-text", children: "Інвентаризація" }),
      /* @__PURE__ */ a("button", { type: "button", className: "sq-btn-primary px-4 py-2", onClick: g, children: "Новий підрахунок" })
    ] }),
    /* @__PURE__ */ c("p", { className: "mt-1 text-sm text-sq-secondary", children: [
      "Порахуйте товар сканером; завершений лист стане чернеткою інвентаризації, яку проведе власник.",
      z() && !s && " Зараз офлайн — листи відправляться, щойно з’явиться мережа."
    ] }),
    v && /* @__PURE__ */ a("p", { className: "mt-3 text-sm text-red-600", children: v }),
    /* @__PURE__ */ c("ul", { className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface", children: [
      i.length === 0 && /* @__PURE__ */ a("li", { className: "px-4 py-6 text-center text-sm text-sq-secondary", children: "Ще немає жодного листа." }),
      i.map((r) => /* @__PURE__ */ c("li", { className: "flex items-center gap-3 px-4 py-3", children: [
        /* @__PURE__ */ c(
          "button",
          {
            type: "button",
            className: "min-w-0 flex-1 text-left",
            onClick: () => n(`/stocktake/${r.id}`),
            children: [
              /* @__PURE__ */ c("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ a(F, { sheet: r }),
                /* @__PURE__ */ a("span", { className: "text-sm text-sq-secondary", children: yt(r.createdAt) })
              ] }),
              /* @__PURE__ */ c("div", { className: "mt-1 text-sm text-sq-text", children: [
                "Рядків: ",
                b[r.id] ?? 0,
                r.lastError && r.status !== "synced" && /* @__PURE__ */ a("span", { className: "ml-2 text-xs text-red-600", children: r.lastError })
              ] })
            ]
          }
        ),
        r.status !== "synced" && /* @__PURE__ */ a(
          "button",
          {
            type: "button",
            className: "px-2 py-1 text-xs text-sq-secondary hover:text-red-600",
            onClick: () => S(r),
            children: "Видалити"
          }
        )
      ] }, r.id))
    ] })
  ] });
}
const ft = Z(
  () => import("./ui-Kmg-Iq7w.js").then((t) => ({ default: t.BarcodeScanner }))
);
function pt() {
  const { id: t = "" } = V(), s = M((e) => e.online), [n, i] = m(void 0), [u, b] = m([]), [N, v] = m(""), [y, w] = m(""), [f, g] = m([]), [S, r] = m(!1), [h, q] = m(null), [A, p] = m(null), [I, D] = m(!1), L = X(null), x = R(async () => {
    const [e, d] = await Promise.all([nt(t), rt(t)]);
    i(e ?? null), b(d);
  }, [t]);
  C(() => {
    x();
  }, [x]), C(() => {
    if (!n || n.status === "counting" || n.status === "synced" || n.status === "dead") return;
    const e = window.setInterval(() => void x(), 3e3);
    return () => window.clearInterval(e);
  }, [n, x]), C(() => {
    const e = y.trim();
    if (e.length < 2) {
      g([]);
      return;
    }
    const d = window.setTimeout(() => {
      mt(e).then(g).catch(() => g([]));
    }, 300);
    return () => window.clearTimeout(d);
  }, [y]);
  const k = n?.status === "counting";
  async function $(e, d = 1) {
    p(null);
    try {
      await ot(t, e, d), await x();
    } catch (l) {
      p(l instanceof Error ? l.message : "Помилка");
    }
  }
  async function Q(e) {
    const d = e.trim();
    if (d) {
      v(""), q(null);
      try {
        const l = await ut(d);
        if (!l) {
          q(`Штрихкод ${d} не знайдено в каталозі`);
          return;
        }
        await $(l), q(`+1 · ${l.product_name}`);
      } catch (l) {
        p(l instanceof Error ? l.message : "Помилка");
      } finally {
        L.current?.focus();
      }
    }
  }
  async function _(e, d) {
    p(null);
    try {
      await T(t, e.variantId, e.countedQty + d), await x();
    } catch (l) {
      p(l instanceof Error ? l.message : "Помилка");
    }
  }
  async function O(e, d) {
    const l = Number(d);
    Number.isFinite(l) && (await T(t, e.variantId, l).catch(() => {
    }), await x());
  }
  async function G() {
    D(!0), p(null);
    try {
      await dt(t), await et(), await x();
    } catch (e) {
      p(e instanceof Error ? e.message : "Помилка");
    } finally {
      D(!1);
    }
  }
  if (n === void 0)
    return /* @__PURE__ */ a("div", { className: "px-4 py-6 text-sm text-sq-secondary", children: "Завантаження…" });
  if (n === null)
    return /* @__PURE__ */ c("div", { className: "px-4 py-6 text-sm text-sq-secondary", children: [
      "Лист не знайдено. ",
      /* @__PURE__ */ a(j, { to: "/stocktake", className: "underline", children: "До списку" })
    ] });
  const H = u.reduce((e, d) => e + d.countedQty, 0);
  return /* @__PURE__ */ c("div", { className: "mx-auto max-w-2xl px-4 py-4", children: [
    /* @__PURE__ */ c("div", { className: "flex items-center justify-between gap-3", children: [
      /* @__PURE__ */ c("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ a(j, { to: "/stocktake", className: "text-sm text-sq-secondary hover:text-sq-text", children: "← Листи" }),
        /* @__PURE__ */ a(F, { sheet: n })
      ] }),
      /* @__PURE__ */ c("span", { className: "text-sm text-sq-secondary", children: [
        u.length,
        " поз. · ",
        H,
        " шт."
      ] })
    ] }),
    n.status === "synced" && /* @__PURE__ */ c("p", { className: "mt-3 rounded-sq bg-emerald-50 px-3 py-2 text-sm text-emerald-800", children: [
      "Надіслано як чернетку інвентаризації ",
      n.serverDocNumber ?? "",
      ". Провести її може власник у розділі «Склад»."
    ] }),
    (n.status === "queued" || n.status === "error") && /* @__PURE__ */ c("p", { className: "mt-3 rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-800", children: [
      z() && !s ? "Офлайн. Лист у черзі — відправиться автоматично, щойно з’явиться мережа." : "Лист у черзі на відправлення.",
      n.lastError && ` (${n.lastError})`
    ] }),
    n.status === "dead" && /* @__PURE__ */ c("p", { className: "mt-3 rounded-sq bg-red-50 px-3 py-2 text-sm text-red-800", children: [
      "Сервер відхилив лист: ",
      n.lastError ?? "невідома помилка",
      ". Видаліть його і порахуйте знову."
    ] }),
    A && /* @__PURE__ */ a("p", { className: "mt-3 text-sm text-red-600", children: A }),
    k && /* @__PURE__ */ c("div", { className: "mt-4 space-y-3", children: [
      /* @__PURE__ */ c(
        "form",
        {
          className: "flex gap-2",
          onSubmit: (e) => {
            e.preventDefault(), Q(N);
          },
          children: [
            /* @__PURE__ */ a(
              "input",
              {
                ref: L,
                autoFocus: !0,
                value: N,
                onChange: (e) => v(e.target.value),
                placeholder: "Скануйте штрихкод або введіть його",
                inputMode: "numeric",
                "aria-label": "Штрихкод",
                className: "min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
              }
            ),
            /* @__PURE__ */ a("button", { type: "submit", className: "sq-btn-primary px-3 py-2", children: "+1" }),
            /* @__PURE__ */ a(
              "button",
              {
                type: "button",
                className: "rounded-sq border border-sq-divider px-3 py-2 text-sm text-sq-secondary",
                onClick: () => r((e) => !e),
                children: S ? "Закрити камеру" : "Камера"
              }
            )
          ]
        }
      ),
      S && /* @__PURE__ */ a(Y, { fallback: /* @__PURE__ */ a("p", { className: "text-sm text-sq-secondary", children: "Вмикаю камеру…" }), children: /* @__PURE__ */ a(
        ft,
        {
          onScan: (e) => void Q(e),
          onClose: () => r(!1)
        }
      ) }),
      h && /* @__PURE__ */ a("p", { className: "text-sm text-sq-secondary", children: h }),
      /* @__PURE__ */ a(
        "input",
        {
          value: y,
          onChange: (e) => w(e.target.value),
          placeholder: "Або знайдіть за назвою / артикулом",
          "aria-label": "Пошук товару",
          className: "w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text"
        }
      ),
      f.length > 0 && /* @__PURE__ */ a("ul", { className: "divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface", children: f.map((e) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          className: "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
          onClick: () => {
            $(e), w("");
          },
          children: [
            /* @__PURE__ */ c("span", { className: "text-sq-text", children: [
              e.product_name,
              " · ",
              e.size,
              " · ",
              e.color
            ] }),
            /* @__PURE__ */ a("span", { className: "text-sq-secondary", children: "+1" })
          ]
        }
      ) }, e.variant_id)) })
    ] }),
    /* @__PURE__ */ c("ul", { className: "mt-4 divide-y divide-sq-divider rounded-sq border border-sq-divider bg-sq-surface", children: [
      u.length === 0 && /* @__PURE__ */ a("li", { className: "px-4 py-6 text-center text-sm text-sq-secondary", children: k ? "Відскануйте перший товар." : "Порожній лист." }),
      u.map((e) => /* @__PURE__ */ c("li", { className: "flex items-center gap-2 px-3 py-2", children: [
        /* @__PURE__ */ c("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ a("div", { className: "truncate text-sm text-sq-text", children: e.label }),
          e.barcode && /* @__PURE__ */ a("div", { className: "text-xs text-sq-secondary", children: e.barcode })
        ] }),
        k ? /* @__PURE__ */ c(J, { children: [
          /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              "aria-label": "Менше",
              className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
              onClick: () => _(e, -1),
              children: "−"
            }
          ),
          /* @__PURE__ */ a(
            "input",
            {
              type: "number",
              min: 0,
              value: e.countedQty,
              "aria-label": `Кількість: ${e.label}`,
              onChange: (d) => void O(e, d.target.value),
              className: "h-9 w-16 rounded-sq border border-sq-divider bg-sq-bg text-center text-sm text-sq-text"
            }
          ),
          /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              "aria-label": "Більше",
              className: "h-9 w-9 rounded-sq border border-sq-divider text-sq-text",
              onClick: () => _(e, 1),
              children: "+"
            }
          ),
          /* @__PURE__ */ a(
            "button",
            {
              type: "button",
              "aria-label": "Прибрати",
              className: "px-2 text-xs text-sq-secondary hover:text-red-600",
              onClick: () => void it(t, e.variantId).then(x),
              children: "✕"
            }
          )
        ] }) : /* @__PURE__ */ a("span", { className: "w-16 text-right text-sm font-medium text-sq-text", children: e.countedQty })
      ] }, e.variantId))
    ] }),
    k && /* @__PURE__ */ a(
      "button",
      {
        type: "button",
        disabled: I || u.length === 0,
        className: "sq-btn-primary mt-4 w-full py-3 disabled:opacity-50",
        onClick: G,
        children: I ? "Відправляю…" : "Завершити і відправити"
      }
    )
  ] });
}
function Nt() {
  return /* @__PURE__ */ c(W, { children: [
    /* @__PURE__ */ a(B, { index: !0, element: /* @__PURE__ */ a(ht, {}) }),
    /* @__PURE__ */ a(B, { path: ":id", element: /* @__PURE__ */ a(pt, {}) })
  ] });
}
export {
  Nt as StocktakeRoutes
};
