import { n as e, t } from "./flower-2-DQVy9i5h.js";
import { t as n } from "./trash-2-CBFgWIf2.js";
import { n as r, o as i, t as a } from "./Stat-DRWd55Hz.js";
import { useCallback as o, useEffect as s, useMemo as c, useState as l } from "react";
import { Fragment as u, jsx as d, jsxs as f } from "react/jsx-runtime";
import { api as p, formatUah as m } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/scissors.js
var h = e("Scissors", [
	["circle", {
		cx: "6",
		cy: "6",
		r: "3",
		key: "1lh9wr"
	}],
	["path", {
		d: "M8.12 8.12 12 12",
		key: "1alkpv"
	}],
	["path", {
		d: "M20 4 8.12 15.88",
		key: "xgtan2"
	}],
	["circle", {
		cx: "6",
		cy: "18",
		r: "3",
		key: "fqmcym"
	}],
	["path", {
		d: "M14.8 14.8 20 20",
		key: "ptml3r"
	}]
]), g = e("TrendingUp", [["polyline", {
	points: "22 7 13.5 15.5 8.5 10.5 2 17",
	key: "126l90"
}], ["polyline", {
	points: "16 7 22 7 22 13",
	key: "kwv8wd"
}]]);
//#endregion
//#region src/modules/vertical-flowers/pages/FlowerAnalyticsPage.tsx
function _(e) {
	return (/* @__PURE__ */ new Date(Date.now() - e * 864e5)).toISOString().slice(0, 10);
}
var v = [
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
];
function y() {
	let [e, y] = l(30), [b, x] = l(null), [S, C] = l(!0), [w, T] = l(null), E = o(async (e) => {
		C(!0), T(null);
		try {
			x(await p.getFlowerAnalytics({ from: _(e - 1) }));
		} catch (e) {
			let t = e.response?.data?.error;
			T(t === "not_a_flower_shop" ? "Цей магазин не продає квіти" : "Не вдалося завантажити аналітику");
		} finally {
			C(!1);
		}
	}, []);
	s(() => {
		E(e);
	}, [e, E]);
	let D = c(() => b?.margin.rows.find((e) => e.kind === "bouquet") ?? null, [b]), O = c(() => Math.max(1, ...b?.daily_loss.map((e) => e.cost_cents) ?? [0]), [b]);
	return /* @__PURE__ */ f("div", {
		className: "p-4 md:p-6 space-y-6",
		"data-testid": "flower-analytics",
		children: [
			/* @__PURE__ */ f("header", {
				className: "flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ f("div", { children: [/* @__PURE__ */ f("h1", {
					className: "text-xl font-semibold text-sq-text flex items-center gap-2",
					children: [/* @__PURE__ */ d(t, {
						size: 22,
						className: "text-sq-blue"
					}), "Квіти"]
				}), /* @__PURE__ */ d("p", {
					className: "text-sm text-sq-muted mt-0.5",
					children: "Що завʼяло, що справді йде і чи заробила робота флориста."
				})] }), /* @__PURE__ */ d("div", {
					className: "flex gap-1.5",
					role: "group",
					"aria-label": "Період",
					children: v.map((t) => /* @__PURE__ */ d("button", {
						type: "button",
						onClick: () => y(t.days),
						className: `min-h-10 px-3 rounded-sq text-sm font-semibold ${e === t.days ? "bg-sq-blue text-white" : "bg-sq-bg text-sq-secondary hover:text-sq-text"}`,
						"data-testid": `range-${t.days}`,
						children: t.label
					}, t.days))
				})]
			}),
			S && /* @__PURE__ */ d("p", {
				className: "text-sm text-sq-muted",
				children: "Рахуємо…"
			}),
			w && /* @__PURE__ */ d("p", {
				className: "text-sm text-red-600",
				"data-testid": "flower-analytics-error",
				children: w
			}),
			b && !S && !w && /* @__PURE__ */ f(u, { children: [
				/* @__PURE__ */ f("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ f("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ d(n, {
								size: 18,
								className: "text-sq-secondary"
							}), "У смітнику"]
						}),
						/* @__PURE__ */ d("p", {
							className: "mt-2 text-2xl font-semibold text-sq-text",
							"data-testid": "loss-total",
							children: m(b.loss.total_cost_cents)
						}),
						/* @__PURE__ */ f("p", {
							className: "text-xs text-sq-muted",
							children: [
								"за собівартістю, ",
								b.from,
								" — ",
								b.to
							]
						}),
						b.loss.by_reason.length > 0 && /* @__PURE__ */ d("div", {
							className: "mt-3 flex flex-wrap gap-2",
							children: b.loss.by_reason.map((e) => /* @__PURE__ */ f("span", {
								className: "text-xs px-2 py-1 rounded-[3px] bg-sq-bg text-sq-secondary",
								children: [
									r[e.reason],
									": ",
									m(e.cost_cents),
									" (",
									e.quantity,
									")"
								]
							}, e.reason))
						}),
						/* @__PURE__ */ d("div", {
							className: "mt-4 flex items-end gap-[2px] h-16",
							"aria-hidden": "true",
							children: b.daily_loss.map((e) => /* @__PURE__ */ d("div", {
								title: `${e.date}: ${m(e.cost_cents)}`,
								className: "flex-1 bg-sq-blue/20 rounded-t-[2px] min-h-[2px]",
								style: { height: `${Math.round(e.cost_cents / O * 100)}%` }
							}, e.date))
						}),
						b.loss.top_variants.length === 0 ? /* @__PURE__ */ d("p", {
							className: "mt-4 text-sm text-sq-muted",
							children: "За цей період нічого не списували."
						}) : /* @__PURE__ */ f("table", {
							className: "mt-4 w-full text-sm",
							children: [/* @__PURE__ */ d("thead", {
								className: "text-xs text-sq-muted",
								children: /* @__PURE__ */ f("tr", {
									className: "text-left",
									children: [
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1",
											children: "Позиція"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Списано"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Прийшло"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Частка"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Собівартість"
										})
									]
								})
							}), /* @__PURE__ */ d("tbody", { children: b.loss.top_variants.map((e) => /* @__PURE__ */ f("tr", {
								className: "border-t border-sq-divider",
								children: [
									/* @__PURE__ */ f("td", {
										className: "py-1.5",
										children: [e.product_name, e.label && /* @__PURE__ */ f("span", {
											className: "text-sq-muted",
											children: [" · ", e.label]
										})]
									}),
									/* @__PURE__ */ f("td", {
										className: "py-1.5 text-right tabular-nums",
										children: [
											e.written_off,
											" ",
											e.unit
										]
									}),
									/* @__PURE__ */ d("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: e.received || "—"
									}),
									/* @__PURE__ */ d("td", {
										className: `py-1.5 text-right tabular-nums font-semibold ${(e.waste_bps ?? 0) >= 2e3 ? "text-red-600" : "text-sq-text"}`,
										children: i(e.waste_bps)
									}),
									/* @__PURE__ */ d("td", {
										className: "py-1.5 text-right tabular-nums",
										children: m(e.cost_cents)
									})
								]
							}, e.variant_id)) })]
						}),
						/* @__PURE__ */ d("p", {
							className: "mt-2 text-xs text-sq-muted",
							children: "«Частка» — списано проти того, що прийшло за цей самий період. Магазин не веде партій, тож це орієнтир для закупівлі, а не вік конкретного стебла."
						})
					]
				}),
				/* @__PURE__ */ f("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ f("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ d(h, {
								size: 18,
								className: "text-sq-secondary"
							}), "Що справді йде"]
						}),
						/* @__PURE__ */ d("p", {
							className: "mt-1 text-xs text-sq-muted",
							children: "Разом із тим, що пішло всередині букетів — цього не видно у звичайному топі товарів, бо там рахуються картки букетів, а не стебла."
						}),
						b.stems.length === 0 ? /* @__PURE__ */ d("p", {
							className: "mt-4 text-sm text-sq-muted",
							children: "За цей період нічого не продали."
						}) : /* @__PURE__ */ f("table", {
							className: "mt-3 w-full text-sm",
							"data-testid": "stem-table",
							children: [/* @__PURE__ */ d("thead", {
								className: "text-xs text-sq-muted",
								children: /* @__PURE__ */ f("tr", {
									className: "text-left",
									children: [
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1",
											children: "Позиція"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Поштучно"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "У букетах"
										}),
										/* @__PURE__ */ d("th", {
											className: "font-normal pb-1 text-right",
											children: "Разом"
										})
									]
								})
							}), /* @__PURE__ */ d("tbody", { children: b.stems.map((e) => /* @__PURE__ */ f("tr", {
								className: "border-t border-sq-divider",
								children: [
									/* @__PURE__ */ f("td", {
										className: "py-1.5",
										children: [e.product_name, e.label && /* @__PURE__ */ f("span", {
											className: "text-sq-muted",
											children: [" · ", e.label]
										})]
									}),
									/* @__PURE__ */ d("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: e.loose
									}),
									/* @__PURE__ */ d("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: e.in_bouquets
									}),
									/* @__PURE__ */ f("td", {
										className: "py-1.5 text-right tabular-nums font-semibold",
										children: [
											e.total,
											" ",
											e.unit
										]
									})
								]
							}, e.variant_id)) })]
						})
					]
				}),
				/* @__PURE__ */ f("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ f("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ d(g, {
								size: 18,
								className: "text-sq-secondary"
							}), "Реалізована націнка"]
						}),
						/* @__PURE__ */ f("div", {
							className: "mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3",
							children: [
								/* @__PURE__ */ d(a, {
									label: "Виторг",
									value: m(b.margin.total_revenue_cents)
								}),
								/* @__PURE__ */ d(a, {
									label: "Собівартість",
									value: m(b.margin.total_cost_cents)
								}),
								/* @__PURE__ */ d(a, {
									label: "Заробіток",
									value: m(b.margin.total_margin_cents),
									strong: !0
								})
							]
						}),
						D && /* @__PURE__ */ f("p", {
							className: "mt-4 text-sm text-sq-text",
							"data-testid": "bouquet-markup",
							children: [
								"На букетах — ",
								/* @__PURE__ */ d("strong", { children: i(D.markup_bps) }),
								" націнки на собівартість стебел, ",
								D.lines,
								" ",
								D.lines === 1 ? "рядок" : D.lines < 5 ? "рядки" : "рядків",
								"."
							]
						}),
						/* @__PURE__ */ f("p", {
							className: "mt-1 text-xs text-sq-muted",
							children: [
								"Магазин просить ",
								/* @__PURE__ */ d("strong", { children: i(b.margin.labour_bps) }),
								" за збирання поверх роздрібної ціни стебел. Цифра вище — те, що лишилося після знижок, і рахується вона від собівартості, тож більша за неї."
							]
						})
					]
				})
			] })
		]
	});
}
//#endregion
export { y as default };
