import { a as e, f as t, o as n, v as r, x as i, y as a } from "./hostPlatform-D3rxsd42.js";
import { a as o, c as s, d as c, i as l, n as u, o as d, r as f, t as p, u as m } from "./figures-BHrhvwo4.js";
import { useCallback as h, useEffect as g, useMemo as _, useState as v } from "react";
import { Fragment as y, jsx as b, jsxs as x } from "react/jsx-runtime";
import { formatUah as S, useVertical as C } from "@pos/platform";
import { Link as w } from "react-router-dom";
//#region src/components/ui/Page.tsx
function T({ title: e, glyph: t, subtitle: r, actions: i, back: a }) {
	return /* @__PURE__ */ x("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			a && /* @__PURE__ */ x(w, {
				to: a.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ b(n, { size: 20 }), a.label]
			}),
			/* @__PURE__ */ x("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					t && /* @__PURE__ */ b(t, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ b("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					i && /* @__PURE__ */ b("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: i
					})
				]
			}),
			r && /* @__PURE__ */ b("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: r
			})
		]
	});
}
function E({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ x("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ x("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ b("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ b("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
function D({ value: e, options: t, onChange: n, ariaLabel: r, className: i = "" }) {
	let a = i.includes("w-full");
	return /* @__PURE__ */ b("div", {
		className: `inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${i}`,
		role: "group",
		"aria-label": r,
		children: t.map((t) => {
			let r = t.value === e;
			return /* @__PURE__ */ b("button", {
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
//#region src/modules/vertical-cafe/pages/CafeAnalyticsPage.tsx
function O(e) {
	return (/* @__PURE__ */ new Date(Date.now() - e * 864e5)).toISOString().slice(0, 10);
}
var k = [
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
})), A = {
	star: i,
	plowhorse: a,
	puzzle: r,
	dog: e
}, j = "inline-flex items-center h-[22px] px-2 rounded-md ring-1 ring-inset ring-sq-divider text-xs font-medium text-sq-secondary";
function M() {
	let [e, n] = v(30), [r, i] = v(null), [a, w] = v(!0), [M, N] = v(null), P = C(), F = _(() => s(P.writeoffReasons), [P.writeoffReasons]), I = h(async (e) => {
		w(!0), N(null);
		try {
			i(await m({ from: O(e - 1) }));
		} catch (e) {
			let t = e.response?.data?.error;
			N(t === "not_a_cafe" ? "Цей магазин не кафе" : "Не вдалося завантажити аналітику");
		} finally {
			w(!1);
		}
	}, []);
	g(() => {
		I(e);
	}, [e, I]);
	let L = _(() => Math.max(1, ...r?.peak_hours.map((e) => e.orders) ?? [0]), [r]), R = _(() => r ? o(r.menu.rows) : [], [r]), z = r?.food_cost.unpriced_lines ?? 0;
	return /* @__PURE__ */ x("div", {
		className: "space-y-7 animate-fade-up max-w-4xl text-sq-text",
		"data-testid": "cafe-analytics",
		children: [
			/* @__PURE__ */ b(T, {
				glyph: t,
				title: "Меню й кухня",
				subtitle: "Що тримати в меню, що переписати цінником і що прибрати.",
				actions: /* @__PURE__ */ b(D, {
					value: String(e),
					options: k,
					onChange: (e) => n(Number(e)),
					ariaLabel: "Період"
				})
			}),
			a && /* @__PURE__ */ b("p", {
				className: "text-sm text-sq-muted",
				children: "Рахуємо…"
			}),
			M && /* @__PURE__ */ b("p", {
				className: "text-sm text-red-600",
				"data-testid": "cafe-analytics-error",
				children: M
			}),
			r && !a && !M && /* @__PURE__ */ x(y, { children: [
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b(E, { title: "Скільки коштує те, що продали" }),
					/* @__PURE__ */ x("div", {
						className: "mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3.5",
						children: [
							/* @__PURE__ */ b(c, {
								label: "Food cost",
								value: d(r.food_cost.bps),
								hint: z > 0 ? `без ${z} поз.` : void 0,
								tone: z > 0 ? "warn" : void 0,
								strong: !0,
								testId: "cafe-food-cost"
							}),
							/* @__PURE__ */ b(c, {
								label: "Виторг",
								value: S(r.food_cost.revenue_cents)
							}),
							/* @__PURE__ */ b(c, {
								label: "Собівартість",
								value: S(r.food_cost.cost_cents)
							}),
							/* @__PURE__ */ b(c, {
								label: "Середній чек",
								value: r.average_check_cents == null ? "—" : S(r.average_check_cents),
								hint: `${r.sales_count} чеків`,
								strong: !0,
								testId: "cafe-average-check"
							})
						]
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-3 text-[13px] text-sq-muted leading-relaxed",
						children: ["Собівартість — за останніми цінами закупівлі, а не за тими, що були в день продажу. Магазин не веде партій, тож це орієнтир для меню, а не історичний факт.", z > 0 && /* @__PURE__ */ x(y, { children: [" ", /* @__PURE__ */ x("span", {
							className: "text-amber-700",
							"data-testid": "cafe-blind-lines",
							children: [z, " проданих позицій у цей відсоток не входять — у їхньому рецепті є складник без собівартості."]
						})] })]
					}),
					/* @__PURE__ */ x("div", {
						className: "mt-5",
						"aria-hidden": "true",
						children: [/* @__PURE__ */ b("div", {
							className: "flex items-end gap-1 h-24",
							children: r.peak_hours.map((e) => /* @__PURE__ */ b("div", {
								title: `${f(e.hour)}: ${e.orders}`,
								className: "flex-1 bg-sq-blue rounded-t-[4px] min-h-[2px]",
								style: { height: `${Math.round(e.orders / L * 100)}%` }
							}, e.hour))
						}), /* @__PURE__ */ b("div", {
							className: "mt-1 flex gap-1",
							children: r.peak_hours.map((e) => /* @__PURE__ */ b("span", {
								className: "flex-1 min-w-0 text-center text-[10px] text-sq-muted tabular-nums",
								children: e.hour % 3 == 0 ? String(e.hour).padStart(2, "0") : ""
							}, e.hour))
						})]
					}),
					/* @__PURE__ */ b("p", {
						className: "mt-1 text-[13px] text-sq-muted",
						children: "Замовлення за годинами доби."
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b(E, { title: "Матриця меню" }),
					/* @__PURE__ */ x("p", {
						className: "mt-2 text-[13px] text-sq-muted leading-relaxed",
						children: [
							"Популярність проти маржі. Страва «популярна», якщо її частка продажів не менша за",
							" ",
							d(r.menu.thresholds.popularity_share_bps),
							", і «маржинальна», якщо з одиниці лишається не менше за ",
							S(r.menu.thresholds.unit_margin_cents),
							" — середнє по кухні за цей період."
						]
					}),
					r.menu.enough_data ? /* @__PURE__ */ b("div", {
						className: "mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5",
						"data-testid": "cafe-matrix",
						children: R.map(({ quadrant: e, rows: t }) => {
							let n = A[e];
							return /* @__PURE__ */ x("div", {
								className: "sq-card p-5",
								"data-testid": `quadrant-${e}`,
								children: [
									/* @__PURE__ */ x("div", {
										className: "flex items-center gap-2.5",
										children: [/* @__PURE__ */ b(n, {
											size: 24,
											className: "shrink-0"
										}), /* @__PURE__ */ x("p", {
											className: "text-[17px] font-bold text-sq-heading",
											children: [u[e].title, /* @__PURE__ */ b("span", {
												className: "ml-1.5 text-[13px] font-normal text-sq-muted tabular-nums",
												children: t.length
											})]
										})]
									}),
									/* @__PURE__ */ b("p", {
										className: "mt-1 text-[13px] text-sq-secondary",
										children: u[e].advice
									}),
									t.length === 0 ? /* @__PURE__ */ b("p", {
										className: "mt-3 text-[13px] text-sq-muted",
										children: "Порожньо."
									}) : /* @__PURE__ */ b("ul", {
										className: "mt-2",
										children: t.map((e) => /* @__PURE__ */ x("li", {
											className: "sq-row min-h-10 py-1.5 flex items-center justify-between gap-3",
											children: [/* @__PURE__ */ x("span", {
												className: "truncate text-[15px] text-sq-text",
												children: [e.product_name, e.label && /* @__PURE__ */ x("span", {
													className: "text-sq-muted",
													children: [" · ", e.label]
												})]
											}), /* @__PURE__ */ b("span", {
												className: "text-sm text-sq-muted tabular-nums shrink-0",
												children: e.sold
											})]
										}, e.variant_id))
									})
								]
							}, e);
						})
					}) : /* @__PURE__ */ b("p", {
						className: "mt-4 rounded-xl bg-sq-sidebar px-[18px] py-4 text-[15px] text-sq-secondary leading-relaxed",
						"data-testid": "cafe-not-enough",
						children: "Замало продажів, щоб ділити меню на квадранти. Візьміть довший період — цифри нижче правильні й зараз, але порада з них ще не виходить."
					}),
					r.menu.rows.length === 0 ? /* @__PURE__ */ b("p", {
						className: "mt-4 text-[15px] text-sq-secondary",
						children: "За цей період нічого не продали."
					}) : /* @__PURE__ */ b("div", {
						className: "mt-5 overflow-x-auto",
						children: /* @__PURE__ */ x("table", {
							className: "sq-table",
							"data-testid": "cafe-menu-table",
							children: [/* @__PURE__ */ b("thead", { children: /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ b("th", { children: "Страва" }),
								/* @__PURE__ */ b("th", {
									className: "text-right",
									children: "Продано"
								}),
								/* @__PURE__ */ b("th", {
									className: "text-right",
									children: "Частка"
								}),
								/* @__PURE__ */ b("th", {
									className: "text-right",
									children: "Виторг"
								}),
								/* @__PURE__ */ b("th", {
									className: "text-right",
									children: "Маржа"
								}),
								/* @__PURE__ */ b("th", {
									className: "text-right",
									children: "З одиниці"
								})
							] }) }), /* @__PURE__ */ b("tbody", { children: r.menu.rows.map((e) => /* @__PURE__ */ x("tr", { children: [
								/* @__PURE__ */ x("td", { children: [
									e.product_name,
									e.label && /* @__PURE__ */ x("span", {
										className: "text-sq-muted",
										children: [" · ", e.label]
									}),
									r.menu.enough_data && /* @__PURE__ */ b("span", {
										className: `ml-2 align-middle ${j}`,
										children: u[e.quadrant].title.toLowerCase()
									})
								] }),
								/* @__PURE__ */ b("td", {
									className: "text-right tabular-nums",
									children: e.sold
								}),
								/* @__PURE__ */ b("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: d(e.share_bps)
								}),
								/* @__PURE__ */ b("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: S(e.revenue_cents)
								}),
								/* @__PURE__ */ b("td", {
									className: "text-right tabular-nums font-semibold text-sq-heading",
									children: S(e.margin_cents)
								}),
								/* @__PURE__ */ b("td", {
									className: "text-right tabular-nums text-sq-muted",
									children: S(e.unit_margin_cents)
								})
							] }, e.variant_id)) })]
						})
					}),
					r.menu.excluded.length > 0 && /* @__PURE__ */ x("div", {
						className: "mt-5",
						"data-testid": "cafe-excluded",
						children: [
							/* @__PURE__ */ b("p", {
								className: "sq-section-label",
								children: "Поза матрицею"
							}),
							/* @__PURE__ */ b("ul", {
								className: "mt-1",
								children: r.menu.excluded.map((e) => /* @__PURE__ */ x("li", {
									className: "sq-row min-h-11 py-1.5 flex items-center gap-3",
									children: [/* @__PURE__ */ x("span", {
										className: "flex-1 min-w-0 text-[15px] text-sq-text",
										children: [
											e.product_name,
											e.label && /* @__PURE__ */ x("span", {
												className: "text-sq-muted",
												children: [" · ", e.label]
											}),
											/* @__PURE__ */ x("span", {
												className: "text-sq-secondary",
												children: [" — ", p[e.reason]]
											})
										]
									}), /* @__PURE__ */ x("span", {
										className: "text-sm text-sq-muted tabular-nums shrink-0",
										children: [
											"(",
											e.sold,
											")"
										]
									})]
								}, e.variant_id))
							}),
							/* @__PURE__ */ b("p", {
								className: "mt-2 text-[13px] text-sq-muted leading-relaxed",
								children: "Ці страви не класифіковані навмисно: без собівартості їхня маржа була б нулем, а нуль тут означає «не знаємо», а не «безкоштовно»."
							})
						]
					})
				] }),
				/* @__PURE__ */ x("section", { children: [
					/* @__PURE__ */ b(E, { title: "Списання кухні" }),
					/* @__PURE__ */ b("p", {
						className: "mt-3 text-[26px] font-bold text-sq-heading tabular-nums leading-tight",
						"data-testid": "cafe-writeoff-total",
						children: S(r.writeoffs.total_cost_cents)
					}),
					/* @__PURE__ */ x("p", {
						className: "mt-0.5 text-[13px] text-sq-muted tabular-nums",
						children: [
							"за собівартістю, ",
							r.from,
							" — ",
							r.to
						]
					}),
					r.writeoffs.rows.length === 0 ? /* @__PURE__ */ b("p", {
						className: "mt-3 text-[15px] text-sq-secondary",
						children: "За цей період нічого не списували."
					}) : /* @__PURE__ */ b("ul", {
						className: "mt-2",
						children: r.writeoffs.rows.map((e) => /* @__PURE__ */ x("li", {
							className: "sq-row min-h-11 py-1.5 flex items-center gap-3",
							"data-testid": `cafe-writeoff-${e.reason}`,
							children: [
								/* @__PURE__ */ b("span", {
									className: "flex-1 min-w-0 text-[15px] text-sq-text",
									children: F(e.reason)
								}),
								/* @__PURE__ */ x("span", {
									className: "text-sm text-sq-muted tabular-nums",
									children: [
										"(",
										e.quantity,
										")"
									]
								}),
								/* @__PURE__ */ b("span", {
									className: "w-28 text-right text-[15px] font-semibold text-sq-text tabular-nums",
									children: S(e.cost_cents)
								})
							]
						}, e.reason))
					}),
					/* @__PURE__ */ b("p", {
						className: "mt-2 text-[13px] text-sq-muted",
						children: "«Проба» і «Харчування персоналу» — це не втрати, а витрати, які варто бачити окремо від зіпсованого."
					})
				] }),
				r.tables && /* @__PURE__ */ x("section", {
					"data-testid": "cafe-tables",
					children: [/* @__PURE__ */ b(E, { title: "Зала" }), /* @__PURE__ */ x("div", {
						className: "mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3.5",
						children: [
							/* @__PURE__ */ b(c, {
								label: "Чек на стіл",
								value: S(r.tables.avg_bill_cents),
								hint: `${r.tables.bills} рахунків`,
								strong: !0
							}),
							/* @__PURE__ */ b(c, {
								label: "На гостя",
								value: r.tables.avg_per_guest_cents == null ? "—" : S(r.tables.avg_per_guest_cents),
								hint: r.tables.guests > 0 ? `${r.tables.guests} гостей` : "гостей не вказували"
							}),
							/* @__PURE__ */ b(c, {
								label: "Оборотів на стіл",
								value: r.tables.turns_per_table_per_day.toFixed(1).replace(".", ","),
								hint: "за день"
							}),
							/* @__PURE__ */ b(c, {
								label: "Триває візит",
								value: l(r.tables.avg_minutes)
							})
						]
					})]
				})
			] })
		]
	});
}
//#endregion
export { M as default };
