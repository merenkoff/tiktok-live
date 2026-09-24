import { c as e, t } from "./glyphs-yCl9Zx5o.js";
import { n, o as r, t as i } from "./Stat-BU_EepWd.js";
import { useCallback as a, useEffect as o, useMemo as s, useState as c } from "react";
import { Fragment as l, jsx as u, jsxs as d } from "react/jsx-runtime";
import { api as f, formatUah as p } from "@pos/platform";
import { Link as m } from "react-router-dom";
//#region src/components/ui/Page.tsx
function h({ title: e, glyph: n, subtitle: r, actions: i, back: a }) {
	return /* @__PURE__ */ d("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			a && /* @__PURE__ */ d(m, {
				to: a.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ u(t, { size: 20 }), a.label]
			}),
			/* @__PURE__ */ d("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					n && /* @__PURE__ */ u(n, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ u("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					i && /* @__PURE__ */ u("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: i
					})
				]
			}),
			r && /* @__PURE__ */ u("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: r
			})
		]
	});
}
function g({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ d("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ d("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ u("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ u("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
function _({ value: e, options: t, onChange: n, ariaLabel: r, className: i = "" }) {
	let a = i.includes("w-full");
	return /* @__PURE__ */ u("div", {
		className: `inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${i}`,
		role: "group",
		"aria-label": r,
		children: t.map((t) => {
			let r = t.value === e;
			return /* @__PURE__ */ u("button", {
				type: "button",
				"aria-pressed": r,
				onClick: () => n(t.value),
				"data-testid": t.testId,
				className: `min-h-[34px] px-3.5 rounded-[9px] text-[15px] whitespace-nowrap transition-colors ${a ? "flex-1" : ""} ${r ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary hover:text-sq-text"}`,
				children: t.label
			}, t.value);
		})
	});
}
//#endregion
//#region src/modules/vertical-flowers/pages/FlowerAnalyticsPage.tsx
function v(e) {
	return (/* @__PURE__ */ new Date(Date.now() - e * 864e5)).toISOString().slice(0, 10);
}
var y = [
	{
		days: 7,
		label: "Тиждень"
	},
	{
		days: 30,
		label: "Місяць"
	},
	{
		days: 90,
		label: "Квартал"
	}
].map((e) => ({
	value: String(e.days),
	label: e.label,
	testId: `range-${e.days}`
}));
function b() {
	let [t, m] = c(30), [b, x] = c(null), [S, C] = c(!0), [w, T] = c(null), E = a(async (e) => {
		C(!0), T(null);
		try {
			x(await f.getFlowerAnalytics({ from: v(e - 1) }));
		} catch (e) {
			let t = e.response?.data?.error;
			T(t === "not_a_flower_shop" ? "Цей магазин не продає квіти" : "Не вдалося завантажити аналітику");
		} finally {
			C(!1);
		}
	}, []);
	o(() => {
		E(t);
	}, [t, E]);
	let D = s(() => b?.margin.rows.find((e) => e.kind === "bouquet") ?? null, [b]), O = s(() => Math.max(1, ...b?.daily_loss.map((e) => e.cost_cents) ?? [0]), [b]);
	return /* @__PURE__ */ d("div", {
		className: "space-y-7 animate-fade-up max-w-4xl text-sq-text",
		"data-testid": "flower-analytics",
		children: [
			/* @__PURE__ */ u(h, {
				glyph: e,
				title: "Квіти",
				subtitle: "Що завʼяло, що справді йде і чи заробила робота флориста.",
				actions: /* @__PURE__ */ u(_, {
					value: String(t),
					options: y,
					onChange: (e) => m(Number(e)),
					ariaLabel: "Період"
				})
			}),
			S && /* @__PURE__ */ u("p", {
				className: "text-sm text-sq-muted",
				children: "Рахуємо…"
			}),
			w && /* @__PURE__ */ u("p", {
				className: "text-sm text-red-600",
				"data-testid": "flower-analytics-error",
				children: w
			}),
			b && !S && !w && /* @__PURE__ */ d(l, { children: [
				/* @__PURE__ */ d("section", { children: [
					/* @__PURE__ */ u(g, { title: "У смітнику" }),
					/* @__PURE__ */ u("p", {
						className: "mt-3 text-[26px] font-bold text-sq-heading tabular-nums leading-tight",
						"data-testid": "loss-total",
						children: p(b.loss.total_cost_cents)
					}),
					/* @__PURE__ */ d("p", {
						className: "mt-0.5 text-[13px] text-sq-muted tabular-nums",
						children: [
							"за собівартістю, ",
							b.from,
							" — ",
							b.to
						]
					}),
					b.loss.by_reason.length > 0 && /* @__PURE__ */ u("ul", {
						className: "mt-2",
						children: b.loss.by_reason.map((e) => /* @__PURE__ */ d("li", {
							className: "sq-row min-h-11 py-1.5 flex items-center gap-3",
							children: [
								/* @__PURE__ */ u("span", {
									className: "flex-1 min-w-0 text-[15px] text-sq-text",
									children: n[e.reason]
								}),
								/* @__PURE__ */ d("span", {
									className: "text-sm text-sq-muted tabular-nums",
									children: [
										"(",
										e.quantity,
										")"
									]
								}),
								/* @__PURE__ */ u("span", {
									className: "w-28 text-right text-[15px] font-semibold text-sq-text tabular-nums",
									children: p(e.cost_cents)
								})
							]
						}, e.reason))
					}),
					/* @__PURE__ */ u("div", {
						className: "mt-5 flex items-end gap-1 h-20",
						"aria-hidden": "true",
						children: b.daily_loss.map((e) => /* @__PURE__ */ u("div", {
							title: `${e.date}: ${p(e.cost_cents)}`,
							className: "flex-1 bg-sq-blue rounded-t-[4px] min-h-[2px]",
							style: { height: `${Math.round(e.cost_cents / O * 100)}%` }
						}, e.date))
					}),
					b.loss.top_variants.length === 0 ? /* @__PURE__ */ u("p", {
						className: "mt-4 text-[15px] text-sq-secondary",
						children: "За цей період нічого не списували."
					}) : /* @__PURE__ */ u("div", {
						className: "mt-5 overflow-x-auto",
						children: /* @__PURE__ */ d("table", {
							className: "sq-table",
							children: [/* @__PURE__ */ u("thead", { children: /* @__PURE__ */ d("tr", { children: [
								/* @__PURE__ */ u("th", { children: "Позиція" }),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Списано"
								}),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Прийшло"
								}),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Частка"
								}),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Собівартість"
								})
							] }) }), /* @__PURE__ */ u("tbody", { children: b.loss.top_variants.map((e) => /* @__PURE__ */ d("tr", { children: [
								/* @__PURE__ */ d("td", { children: [e.product_name, e.label && /* @__PURE__ */ d("span", {
									className: "text-sq-muted",
									children: [" · ", e.label]
								})] }),
								/* @__PURE__ */ d("td", {
									className: "text-right tabular-nums",
									children: [
										e.written_off,
										" ",
										e.unit
									]
								}),
								/* @__PURE__ */ u("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: e.received || "—"
								}),
								/* @__PURE__ */ u("td", {
									className: `text-right tabular-nums font-semibold ${(e.waste_bps ?? 0) >= 2e3 ? "text-sq-danger" : "text-sq-text"}`,
									children: r(e.waste_bps)
								}),
								/* @__PURE__ */ u("td", {
									className: "text-right tabular-nums",
									children: p(e.cost_cents)
								})
							] }, e.variant_id)) })]
						})
					}),
					/* @__PURE__ */ u("p", {
						className: "mt-3 text-[13px] text-sq-muted leading-relaxed",
						children: "«Частка» — списано проти того, що прийшло за цей самий період. Магазин не веде партій, тож це орієнтир для закупівлі, а не вік конкретного стебла."
					})
				] }),
				/* @__PURE__ */ d("section", { children: [
					/* @__PURE__ */ u(g, { title: "Що справді йде" }),
					/* @__PURE__ */ u("p", {
						className: "mt-2 text-[13px] text-sq-muted leading-relaxed",
						children: "Разом із тим, що пішло всередині букетів — цього не видно у звичайному топі товарів, бо там рахуються картки букетів, а не стебла."
					}),
					b.stems.length === 0 ? /* @__PURE__ */ u("p", {
						className: "mt-4 text-[15px] text-sq-secondary",
						children: "За цей період нічого не продали."
					}) : /* @__PURE__ */ u("div", {
						className: "mt-3 overflow-x-auto",
						children: /* @__PURE__ */ d("table", {
							className: "sq-table",
							"data-testid": "stem-table",
							children: [/* @__PURE__ */ u("thead", { children: /* @__PURE__ */ d("tr", { children: [
								/* @__PURE__ */ u("th", { children: "Позиція" }),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Поштучно"
								}),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "У букетах"
								}),
								/* @__PURE__ */ u("th", {
									className: "text-right",
									children: "Разом"
								})
							] }) }), /* @__PURE__ */ u("tbody", { children: b.stems.map((e) => /* @__PURE__ */ d("tr", { children: [
								/* @__PURE__ */ d("td", { children: [e.product_name, e.label && /* @__PURE__ */ d("span", {
									className: "text-sq-muted",
									children: [" · ", e.label]
								})] }),
								/* @__PURE__ */ u("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: e.loose
								}),
								/* @__PURE__ */ u("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: e.in_bouquets
								}),
								/* @__PURE__ */ d("td", {
									className: "text-right tabular-nums font-semibold text-sq-heading",
									children: [
										e.total,
										" ",
										e.unit
									]
								})
							] }, e.variant_id)) })]
						})
					})
				] }),
				/* @__PURE__ */ d("section", { children: [
					/* @__PURE__ */ u(g, { title: "Реалізована націнка" }),
					/* @__PURE__ */ d("div", {
						className: "mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3.5",
						children: [
							/* @__PURE__ */ u(i, {
								label: "Виторг",
								value: p(b.margin.total_revenue_cents)
							}),
							/* @__PURE__ */ u(i, {
								label: "Собівартість",
								value: p(b.margin.total_cost_cents)
							}),
							/* @__PURE__ */ u(i, {
								label: "Заробіток",
								value: p(b.margin.total_margin_cents),
								strong: !0
							})
						]
					}),
					D && /* @__PURE__ */ d("p", {
						className: "mt-4 text-[15px] text-sq-text",
						"data-testid": "bouquet-markup",
						children: [
							"На букетах — ",
							/* @__PURE__ */ u("strong", { children: r(D.markup_bps) }),
							" націнки на собівартість стебел, ",
							D.lines,
							" ",
							D.lines === 1 ? "рядок" : D.lines < 5 ? "рядки" : "рядків",
							"."
						]
					}),
					/* @__PURE__ */ d("p", {
						className: "mt-2 text-[13px] text-sq-muted leading-relaxed",
						children: [
							"Магазин просить ",
							/* @__PURE__ */ u("strong", {
								className: "text-sq-secondary",
								children: r(b.margin.labour_bps)
							}),
							" ",
							"за збирання поверх роздрібної ціни стебел. Цифра вище — те, що лишилося після знижок, і рахується вона від собівартості, тож більша за неї."
						]
					})
				] })
			] })
		]
	});
}
//#endregion
export { b as default };
