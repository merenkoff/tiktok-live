import { _ as e, c as t, g as n, r } from "./glyphs-yCl9Zx5o.js";
import { t as i } from "./BouquetPhoto-CymTfdUQ.js";
import { useCallback as a, useEffect as o, useMemo as s, useState as c } from "react";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { api as d, assetUrl as f, cashierApi as p, formatUah as m, useVertical as h } from "@pos/platform";
//#region src/modules/vertical-flowers/pages/ShowcasePage.tsx
var g = [{
	code: "damaged",
	label: "Завʼяв",
	hint: "Втрата — піде у звіт про списання"
}, {
	code: "gift",
	label: "Віддали",
	hint: "Подарували або віддали працівнику"
}];
function _() {
	let _ = h(), [v, y] = c(null), [b, x] = c(null), [S, C] = c(null), [w, T] = c(null), [E, D] = c(!1), O = a(async () => {
		try {
			let e = await p.getCatalog({});
			y(e), x(null);
		} catch {
			x("Не вдалося прочитати вітрину"), y([]);
		}
	}, []);
	o(() => {
		O();
	}, [O]);
	let k = s(() => (v ?? []).filter((e) => e.one_off && e.quantity > 0), [v]);
	async function A(e, t) {
		D(!0);
		try {
			await d.setShowcasePhoto({
				variant_id: e.variant_id,
				image_url: t
			}), T(null), await O();
		} catch (e) {
			let t = e.response?.data?.error;
			x(t || "Не вдалося зберегти фото");
		} finally {
			D(!1);
		}
	}
	async function j(e, t) {
		D(!0);
		try {
			await d.writeOffShowcase({
				client_uuid: crypto.randomUUID(),
				variant_id: e.variant_id,
				reason_code: t
			}), C(null), await O();
		} catch (e) {
			let t = e.response?.data?.error;
			x(t || "Не вдалося списати букет");
		} finally {
			D(!1);
		}
	}
	return _.id === "flowers" ? /* @__PURE__ */ u("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text",
		children: [
			/* @__PURE__ */ u("div", {
				className: "flex items-center gap-3 px-4 md:px-7 py-4 md:min-h-[72px]",
				children: [
					/* @__PURE__ */ l(t, {
						size: 24,
						className: "shrink-0"
					}),
					/* @__PURE__ */ l("h1", {
						className: "text-2xl font-bold text-sq-heading",
						children: "Вітрина"
					}),
					/* @__PURE__ */ l("p", {
						className: "ml-auto text-[15px] text-sq-muted tabular-nums",
						children: k.length > 0 ? `${k.length} готових` : ""
					})
				]
			}),
			/* @__PURE__ */ u("div", {
				className: "px-4 md:px-7 pb-6 space-y-4",
				children: [
					b && /* @__PURE__ */ l("p", {
						className: "text-sm text-red-600",
						"data-testid": "showcase-page-error",
						children: b
					}),
					v === null && /* @__PURE__ */ l("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					v !== null && k.length === 0 && /* @__PURE__ */ u("div", {
						className: "py-16 text-center",
						children: [
							/* @__PURE__ */ l(t, {
								size: 48,
								className: "mx-auto"
							}),
							/* @__PURE__ */ l("p", {
								className: "mt-3 text-[15px] text-sq-secondary",
								children: "На вітрині зараз порожньо"
							}),
							/* @__PURE__ */ l("p", {
								className: "mt-1 text-[13px] text-sq-muted max-w-[34ch] mx-auto",
								children: "Зберіть букет на екрані продажу й натисніть «На вітрину» — він зʼявиться тут."
							})
						]
					}),
					/* @__PURE__ */ l("ul", {
						className: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5",
						"data-testid": "showcase-list",
						children: k.map((e) => {
							let t = f(e.image_url);
							return /* @__PURE__ */ u("li", {
								className: "rounded-card bg-white shadow-card overflow-hidden flex flex-col",
								"data-testid": "showcase-row",
								children: [
									/* @__PURE__ */ l("button", {
										type: "button",
										onClick: () => {
											x(null), T(e);
										},
										className: "aspect-[4/3] w-full bg-sq-empty overflow-hidden grid place-items-center hover:opacity-90",
										"aria-label": e.image_url ? `Змінити фото: ${e.product_name}` : `Додати фото: ${e.product_name}`,
										"data-testid": "showcase-photo",
										children: t ? /* @__PURE__ */ l("img", {
											src: t,
											alt: "",
											className: "w-full h-full object-cover"
										}) : /* @__PURE__ */ l(r, {
											size: 40,
											className: "text-sq-muted"
										})
									}),
									/* @__PURE__ */ u("div", {
										className: "flex-1 min-w-0 px-4 pt-3 pb-1",
										children: [/* @__PURE__ */ l("p", {
											className: "text-[17px] font-semibold text-sq-text truncate",
											children: e.product_name
										}), e.components && e.components.length > 0 && /* @__PURE__ */ l("p", {
											className: "mt-0.5 text-[13px] text-sq-muted line-clamp-2",
											children: e.components.map((e) => `${e.product_name} × ${e.quantity}`).join(", ")
										})]
									}),
									/* @__PURE__ */ u("div", {
										className: "flex items-center gap-2 pl-4 pr-2 pb-2",
										children: [/* @__PURE__ */ l("p", {
											className: "flex-1 text-[17px] font-bold text-sq-heading tabular-nums",
											children: m(e.price_cents)
										}), /* @__PURE__ */ l("button", {
											type: "button",
											onClick: () => {
												x(null), C(e);
											},
											className: "w-11 h-11 grid place-items-center rounded-sq text-sq-secondary hover:bg-sq-empty hover:text-red-600 shrink-0",
											"aria-label": `Списати: ${e.product_name}`,
											"data-testid": "showcase-writeoff",
											children: /* @__PURE__ */ l(n, { size: 20 })
										})]
									})
								]
							}, e.variant_id);
						})
					})
				]
			}),
			w && /* @__PURE__ */ l("div", {
				className: "fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
				children: /* @__PURE__ */ u("div", {
					className: "bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
					"data-testid": "photo-dialog",
					children: [/* @__PURE__ */ u("div", {
						className: "px-5 pt-[18px] pb-3.5 flex items-start gap-2.5",
						children: [/* @__PURE__ */ u("div", {
							className: "flex-1 min-w-0",
							children: [/* @__PURE__ */ l("h3", {
								className: "text-[19px] font-bold text-sq-heading",
								children: "Фото букета"
							}), /* @__PURE__ */ l("p", {
								className: "text-[15px] text-sq-secondary truncate mt-0.5",
								children: w.product_name
							})]
						}), /* @__PURE__ */ l("button", {
							type: "button",
							disabled: E,
							onClick: () => T(null),
							className: "w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40 shrink-0",
							"aria-label": "Закрити",
							children: /* @__PURE__ */ l(e, { size: 20 })
						})]
					}), /* @__PURE__ */ l("div", {
						className: "px-5 pb-5",
						children: /* @__PURE__ */ l(i, {
							value: w.image_url,
							onChange: (e) => {
								e ? A(w, e) : T(null);
							},
							disabled: E
						})
					})]
				})
			}),
			S && /* @__PURE__ */ l("div", {
				className: "fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4",
				children: /* @__PURE__ */ u("div", {
					className: "bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]",
					"data-testid": "writeoff-dialog",
					children: [/* @__PURE__ */ u("div", {
						className: "px-5 pt-[18px] pb-3",
						children: [/* @__PURE__ */ l("h3", {
							className: "text-[19px] font-bold text-sq-heading",
							children: "Списати букет"
						}), /* @__PURE__ */ u("p", {
							className: "text-[15px] text-sq-secondary truncate mt-0.5 tabular-nums",
							children: [
								S.product_name,
								" · ",
								m(S.price_cents)
							]
						})]
					}), /* @__PURE__ */ u("div", {
						className: "px-5 pb-4 flex flex-col gap-2.5",
						children: [
							/* @__PURE__ */ l("p", {
								className: "text-[13px] text-sq-muted",
								children: "Стебла не повернуться на залишок — їх списав документ виробництва, коли букет зібрали."
							}),
							g.map((e) => /* @__PURE__ */ u("button", {
								type: "button",
								disabled: E,
								onClick: () => void j(S, e.code),
								className: "w-full min-h-16 rounded-[14px] bg-white ring-1 ring-sq-divider hover:bg-sq-sidebar px-4 py-2.5 text-left disabled:opacity-50",
								"data-testid": `writeoff-${e.code}`,
								children: [/* @__PURE__ */ l("span", {
									className: "block text-[17px] font-semibold text-sq-text",
									children: e.label
								}), /* @__PURE__ */ l("span", {
									className: "block text-[13px] text-sq-muted",
									children: e.hint
								})]
							}, e.code)),
							/* @__PURE__ */ l("button", {
								type: "button",
								disabled: E,
								onClick: () => C(null),
								className: "min-h-11 w-full text-base font-semibold text-sq-blue disabled:opacity-50",
								children: "Скасувати"
							})
						]
					})]
				})
			})
		]
	}) : /* @__PURE__ */ u("div", {
		className: "px-4 md:px-7 py-4 text-sq-text",
		children: [/* @__PURE__ */ u("div", {
			className: "flex items-center gap-3",
			children: [/* @__PURE__ */ l(t, { size: 24 }), /* @__PURE__ */ l("h1", {
				className: "text-2xl font-bold text-sq-heading",
				children: "Вітрина"
			})]
		}), /* @__PURE__ */ l("p", {
			className: "mt-3 text-[15px] text-amber-800",
			children: "Магазин зараз не на квітковій вертикалі. Тип магазину змінює адміністратор платформи."
		})]
	});
}
//#endregion
export { _ as default };
