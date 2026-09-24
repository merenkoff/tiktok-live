import { a as e } from "./hostPlatform-BSaDrC_D.js";
import { a as t, c as n, d as r, i, n as a, o, r as s, t as c, u as l } from "./figures-CvCQJyZx.js";
import { useCallback as u, useEffect as d, useMemo as f, useState as p } from "react";
import { Fragment as m, jsx as h, jsxs as g } from "react/jsx-runtime";
import { formatUah as _, useVertical as v } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/chef-hat.js
var y = e("ChefHat", [["path", {
	d: "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z",
	key: "1qvrer"
}], ["path", {
	d: "M6 17h12",
	key: "1jwigz"
}]]), b = e("LayoutGrid", [
	["rect", {
		width: "7",
		height: "7",
		x: "3",
		y: "3",
		rx: "1",
		key: "1g98yp"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "14",
		y: "3",
		rx: "1",
		key: "6d4xhi"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "14",
		y: "14",
		rx: "1",
		key: "nxv5o0"
	}],
	["rect", {
		width: "7",
		height: "7",
		x: "3",
		y: "14",
		rx: "1",
		key: "1bb6yr"
	}]
]), x = e("Trash2", [
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
		key: "4alrt4"
	}],
	["path", {
		d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
		key: "v07s0e"
	}],
	["line", {
		x1: "10",
		x2: "10",
		y1: "11",
		y2: "17",
		key: "1uufr5"
	}],
	["line", {
		x1: "14",
		x2: "14",
		y1: "11",
		y2: "17",
		key: "xtxkd"
	}]
]), S = e("UtensilsCrossed", [
	["path", {
		d: "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
		key: "n7qcjb"
	}],
	["path", {
		d: "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
		key: "d0u48b"
	}],
	["path", {
		d: "m2.1 21.8 6.4-6.3",
		key: "yn04lh"
	}],
	["path", {
		d: "m19 5-7 7",
		key: "194lzd"
	}]
]);
//#endregion
//#region src/modules/vertical-cafe/pages/CafeAnalyticsPage.tsx
function C(e) {
	return (/* @__PURE__ */ new Date(Date.now() - e * 864e5)).toISOString().slice(0, 10);
}
var w = [
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
], T = {
	star: "text-emerald-700 bg-emerald-50 border-emerald-200",
	plowhorse: "text-sky-700 bg-sky-50 border-sky-200",
	puzzle: "text-amber-700 bg-amber-50 border-amber-200",
	dog: "text-red-700 bg-red-50 border-red-200"
};
function E() {
	let [e, E] = p(30), [D, O] = p(null), [k, A] = p(!0), [j, M] = p(null), N = v(), P = f(() => n(N.writeoffReasons), [N.writeoffReasons]), F = u(async (e) => {
		A(!0), M(null);
		try {
			O(await l({ from: C(e - 1) }));
		} catch (e) {
			let t = e.response?.data?.error;
			M(t === "not_a_cafe" ? "Цей магазин не кафе" : "Не вдалося завантажити аналітику");
		} finally {
			A(!1);
		}
	}, []);
	d(() => {
		F(e);
	}, [e, F]);
	let I = f(() => Math.max(1, ...D?.peak_hours.map((e) => e.orders) ?? [0]), [D]), L = f(() => D ? t(D.menu.rows) : [], [D]), R = D?.food_cost.unpriced_lines ?? 0;
	return /* @__PURE__ */ g("div", {
		className: "p-4 md:p-6 space-y-6",
		"data-testid": "cafe-analytics",
		children: [
			/* @__PURE__ */ g("header", {
				className: "flex flex-wrap items-center justify-between gap-3",
				children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ g("h1", {
					className: "text-xl font-semibold text-sq-text flex items-center gap-2",
					children: [/* @__PURE__ */ h(y, {
						size: 22,
						className: "text-sq-blue"
					}), "Меню й кухня"]
				}), /* @__PURE__ */ h("p", {
					className: "text-sm text-sq-muted mt-0.5",
					children: "Що тримати в меню, що переписати цінником і що прибрати."
				})] }), /* @__PURE__ */ h("div", {
					className: "flex gap-1.5",
					role: "group",
					"aria-label": "Період",
					children: w.map((t) => /* @__PURE__ */ h("button", {
						type: "button",
						onClick: () => E(t.days),
						className: `min-h-10 px-3 rounded-sq text-sm font-semibold ${e === t.days ? "bg-sq-blue text-white" : "bg-sq-bg text-sq-secondary hover:text-sq-text"}`,
						"data-testid": `range-${t.days}`,
						children: t.label
					}, t.days))
				})]
			}),
			k && /* @__PURE__ */ h("p", {
				className: "text-sm text-sq-muted",
				children: "Рахуємо…"
			}),
			j && /* @__PURE__ */ h("p", {
				className: "text-sm text-red-600",
				"data-testid": "cafe-analytics-error",
				children: j
			}),
			D && !k && !j && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ g("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ h(S, {
								size: 18,
								className: "text-sq-secondary"
							}), "Скільки коштує те, що продали"]
						}),
						/* @__PURE__ */ g("div", {
							className: "mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3",
							children: [
								/* @__PURE__ */ h(r, {
									label: "Food cost",
									value: o(D.food_cost.bps),
									hint: R > 0 ? `без ${R} поз.` : void 0,
									tone: R > 0 ? "warn" : void 0,
									strong: !0,
									testId: "cafe-food-cost"
								}),
								/* @__PURE__ */ h(r, {
									label: "Виторг",
									value: _(D.food_cost.revenue_cents)
								}),
								/* @__PURE__ */ h(r, {
									label: "Собівартість",
									value: _(D.food_cost.cost_cents)
								}),
								/* @__PURE__ */ h(r, {
									label: "Середній чек",
									value: D.average_check_cents == null ? "—" : _(D.average_check_cents),
									hint: `${D.sales_count} чеків`,
									strong: !0,
									testId: "cafe-average-check"
								})
							]
						}),
						/* @__PURE__ */ g("p", {
							className: "mt-3 text-xs text-sq-muted",
							children: ["Собівартість — за останніми цінами закупівлі, а не за тими, що були в день продажу. Магазин не веде партій, тож це орієнтир для меню, а не історичний факт.", R > 0 && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ g("span", {
								className: "text-amber-600",
								"data-testid": "cafe-blind-lines",
								children: [R, " проданих позицій у цей відсоток не входять — у їхньому рецепті є складник без собівартості."]
							})] })]
						}),
						/* @__PURE__ */ h("div", {
							className: "mt-4 flex items-end gap-[2px] h-16",
							"aria-hidden": "true",
							children: D.peak_hours.map((e) => /* @__PURE__ */ h("div", {
								title: `${s(e.hour)}: ${e.orders}`,
								className: "flex-1 bg-sq-blue/20 rounded-t-[2px] min-h-[2px]",
								style: { height: `${Math.round(e.orders / I * 100)}%` }
							}, e.hour))
						}),
						/* @__PURE__ */ h("p", {
							className: "text-xs text-sq-muted",
							children: "Замовлення за годинами доби."
						})
					]
				}),
				/* @__PURE__ */ g("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ g("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ h(b, {
								size: 18,
								className: "text-sq-secondary"
							}), "Матриця меню"]
						}),
						/* @__PURE__ */ g("p", {
							className: "mt-1 text-xs text-sq-muted",
							children: [
								"Популярність проти маржі. Страва «популярна», якщо її частка продажів не менша за",
								" ",
								o(D.menu.thresholds.popularity_share_bps),
								", і «маржинальна», якщо з одиниці лишається не менше за ",
								_(D.menu.thresholds.unit_margin_cents),
								" — середнє по кухні за цей період."
							]
						}),
						D.menu.enough_data ? /* @__PURE__ */ h("div", {
							className: "mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3",
							"data-testid": "cafe-matrix",
							children: L.map(({ quadrant: e, rows: t }) => /* @__PURE__ */ g("div", {
								className: `rounded-sq border p-3 ${T[e]}`,
								"data-testid": `quadrant-${e}`,
								children: [
									/* @__PURE__ */ g("p", {
										className: "font-semibold text-sm",
										children: [a[e].title, /* @__PURE__ */ g("span", {
											className: "font-normal opacity-70",
											children: [" · ", t.length]
										})]
									}),
									/* @__PURE__ */ h("p", {
										className: "text-xs opacity-80",
										children: a[e].advice
									}),
									t.length === 0 ? /* @__PURE__ */ h("p", {
										className: "mt-2 text-xs opacity-60",
										children: "Порожньо."
									}) : /* @__PURE__ */ h("ul", {
										className: "mt-2 space-y-0.5 text-xs",
										children: t.map((e) => /* @__PURE__ */ g("li", {
											className: "flex justify-between gap-2",
											children: [/* @__PURE__ */ g("span", {
												className: "truncate",
												children: [e.product_name, e.label && /* @__PURE__ */ g("span", {
													className: "opacity-60",
													children: [" · ", e.label]
												})]
											}), /* @__PURE__ */ h("span", {
												className: "tabular-nums shrink-0 opacity-80",
												children: e.sold
											})]
										}, e.variant_id))
									})
								]
							}, e))
						}) : /* @__PURE__ */ h("p", {
							className: "mt-4 text-sm text-sq-muted",
							"data-testid": "cafe-not-enough",
							children: "Замало продажів, щоб ділити меню на квадранти. Візьміть довший період — цифри нижче правильні й зараз, але порада з них ще не виходить."
						}),
						D.menu.rows.length === 0 ? /* @__PURE__ */ h("p", {
							className: "mt-4 text-sm text-sq-muted",
							children: "За цей період нічого не продали."
						}) : /* @__PURE__ */ g("table", {
							className: "mt-4 w-full text-sm",
							"data-testid": "cafe-menu-table",
							children: [/* @__PURE__ */ h("thead", {
								className: "text-xs text-sq-muted",
								children: /* @__PURE__ */ g("tr", {
									className: "text-left",
									children: [
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1",
											children: "Страва"
										}),
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1 text-right",
											children: "Продано"
										}),
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1 text-right",
											children: "Частка"
										}),
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1 text-right",
											children: "Виторг"
										}),
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1 text-right",
											children: "Маржа"
										}),
										/* @__PURE__ */ h("th", {
											className: "font-normal pb-1 text-right",
											children: "З одиниці"
										})
									]
								})
							}), /* @__PURE__ */ h("tbody", { children: D.menu.rows.map((e) => /* @__PURE__ */ g("tr", {
								className: "border-t border-sq-divider",
								children: [
									/* @__PURE__ */ g("td", {
										className: "py-1.5",
										children: [
											e.product_name,
											e.label && /* @__PURE__ */ g("span", {
												className: "text-sq-muted",
												children: [" · ", e.label]
											}),
											D.menu.enough_data && /* @__PURE__ */ h("span", {
												className: "ml-1.5 text-[11px] text-sq-muted",
												children: a[e.quadrant].title.toLowerCase()
											})
										]
									}),
									/* @__PURE__ */ h("td", {
										className: "py-1.5 text-right tabular-nums",
										children: e.sold
									}),
									/* @__PURE__ */ h("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: o(e.share_bps)
									}),
									/* @__PURE__ */ h("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: _(e.revenue_cents)
									}),
									/* @__PURE__ */ h("td", {
										className: "py-1.5 text-right tabular-nums font-semibold",
										children: _(e.margin_cents)
									}),
									/* @__PURE__ */ h("td", {
										className: "py-1.5 text-right tabular-nums text-sq-muted",
										children: _(e.unit_margin_cents)
									})
								]
							}, e.variant_id)) })]
						}),
						D.menu.excluded.length > 0 && /* @__PURE__ */ g("div", {
							className: "mt-4",
							"data-testid": "cafe-excluded",
							children: [
								/* @__PURE__ */ h("p", {
									className: "text-xs font-semibold text-sq-text",
									children: "Поза матрицею"
								}),
								/* @__PURE__ */ h("ul", {
									className: "mt-1 space-y-0.5 text-xs text-sq-muted",
									children: D.menu.excluded.map((e) => /* @__PURE__ */ g("li", { children: [
										e.product_name,
										e.label && /* @__PURE__ */ g("span", { children: [" · ", e.label] }),
										" — ",
										c[e.reason],
										" (",
										e.sold,
										")"
									] }, e.variant_id))
								}),
								/* @__PURE__ */ h("p", {
									className: "mt-1 text-xs text-sq-muted",
									children: "Ці страви не класифіковані навмисно: без собівартості їхня маржа була б нулем, а нуль тут означає «не знаємо», а не «безкоштовно»."
								})
							]
						})
					]
				}),
				/* @__PURE__ */ g("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					children: [
						/* @__PURE__ */ g("h2", {
							className: "font-semibold text-sq-text flex items-center gap-2",
							children: [/* @__PURE__ */ h(x, {
								size: 18,
								className: "text-sq-secondary"
							}), "Списання кухні"]
						}),
						/* @__PURE__ */ h("p", {
							className: "mt-2 text-2xl font-semibold text-sq-text",
							"data-testid": "cafe-writeoff-total",
							children: _(D.writeoffs.total_cost_cents)
						}),
						/* @__PURE__ */ g("p", {
							className: "text-xs text-sq-muted",
							children: [
								"за собівартістю, ",
								D.from,
								" — ",
								D.to
							]
						}),
						D.writeoffs.rows.length === 0 ? /* @__PURE__ */ h("p", {
							className: "mt-3 text-sm text-sq-muted",
							children: "За цей період нічого не списували."
						}) : /* @__PURE__ */ h("div", {
							className: "mt-3 flex flex-wrap gap-2",
							children: D.writeoffs.rows.map((e) => /* @__PURE__ */ g("span", {
								className: "text-xs px-2 py-1 rounded-[3px] bg-sq-bg text-sq-secondary",
								"data-testid": `cafe-writeoff-${e.reason}`,
								children: [
									P(e.reason),
									": ",
									_(e.cost_cents),
									" (",
									e.quantity,
									")"
								]
							}, e.reason))
						}),
						/* @__PURE__ */ h("p", {
							className: "mt-2 text-xs text-sq-muted",
							children: "«Проба» і «Харчування персоналу» — це не втрати, а витрати, які варто бачити окремо від зіпсованого."
						})
					]
				}),
				D.tables && /* @__PURE__ */ g("section", {
					className: "bg-white rounded-sq border border-sq-divider p-4",
					"data-testid": "cafe-tables",
					children: [/* @__PURE__ */ h("h2", {
						className: "font-semibold text-sq-text",
						children: "Зала"
					}), /* @__PURE__ */ g("div", {
						className: "mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3",
						children: [
							/* @__PURE__ */ h(r, {
								label: "Чек на стіл",
								value: _(D.tables.avg_bill_cents),
								hint: `${D.tables.bills} рахунків`,
								strong: !0
							}),
							/* @__PURE__ */ h(r, {
								label: "На гостя",
								value: D.tables.avg_per_guest_cents == null ? "—" : _(D.tables.avg_per_guest_cents),
								hint: D.tables.guests > 0 ? `${D.tables.guests} гостей` : "гостей не вказували"
							}),
							/* @__PURE__ */ h(r, {
								label: "Оборотів на стіл",
								value: D.tables.turns_per_table_per_day.toFixed(1).replace(".", ","),
								hint: "за день"
							}),
							/* @__PURE__ */ h(r, {
								label: "Триває візит",
								value: i(D.tables.avg_minutes)
							})
						]
					})]
				})
			] })
		]
	});
}
//#endregion
export { E as default };
