import { n as e, t } from "./trash-2-J8IpCBHX.js";
import { n, t as r } from "./BouquetPhoto-DgI0gXjX.js";
import { useCallback as i, useEffect as a, useMemo as o, useState as s } from "react";
import { jsx as c, jsxs as l } from "react/jsx-runtime";
import { api as u, assetUrl as d, cashierApi as f, formatUah as p, useVertical as m } from "@pos/platform";
//#region src/modules/vertical-flowers/pages/ShowcasePage.tsx
var h = [{
	code: "damaged",
	label: "Завʼяв",
	hint: "Втрата — піде у звіт про списання"
}, {
	code: "gift",
	label: "Віддали",
	hint: "Подарували або віддали працівнику"
}];
function g() {
	let g = m(), [_, v] = s(null), [y, b] = s(null), [x, S] = s(null), [C, w] = s(null), [T, E] = s(!1), D = i(async () => {
		try {
			let e = await f.getCatalog({});
			v(e), b(null);
		} catch {
			b("Не вдалося прочитати вітрину"), v([]);
		}
	}, []);
	a(() => {
		D();
	}, [D]);
	let O = o(() => (_ ?? []).filter((e) => e.one_off && e.quantity > 0), [_]);
	async function k(e, t) {
		E(!0);
		try {
			await u.setShowcasePhoto({
				variant_id: e.variant_id,
				image_url: t
			}), w(null), await D();
		} catch (e) {
			let t = e.response?.data?.error;
			b(t || "Не вдалося зберегти фото");
		} finally {
			E(!1);
		}
	}
	async function A(e, t) {
		E(!0);
		try {
			await u.writeOffShowcase({
				client_uuid: crypto.randomUUID(),
				variant_id: e.variant_id,
				reason_code: t
			}), S(null), await D();
		} catch (e) {
			let t = e.response?.data?.error;
			b(t || "Не вдалося списати букет");
		} finally {
			E(!1);
		}
	}
	return g.id === "flowers" ? /* @__PURE__ */ l("div", {
		className: "p-4 space-y-4 text-sq-text",
		children: [
			/* @__PURE__ */ l("div", {
				className: "flex items-baseline justify-between gap-3",
				children: [/* @__PURE__ */ c("h1", {
					className: "text-lg font-semibold",
					children: "Вітрина"
				}), /* @__PURE__ */ c("p", {
					className: "text-sm text-sq-secondary",
					children: O.length > 0 ? `${O.length} готових` : ""
				})]
			}),
			y && /* @__PURE__ */ c("p", {
				className: "text-sm text-red-600",
				"data-testid": "showcase-page-error",
				children: y
			}),
			_ === null && /* @__PURE__ */ c("p", {
				className: "text-sm text-sq-muted",
				children: "Завантаження…"
			}),
			_ !== null && O.length === 0 && /* @__PURE__ */ l("div", {
				className: "rounded-sq border border-dashed border-sq-divider p-8 text-center",
				children: [
					/* @__PURE__ */ c(e, {
						size: 28,
						className: "mx-auto text-sq-muted"
					}),
					/* @__PURE__ */ c("p", {
						className: "mt-2 text-sm text-sq-secondary",
						children: "На вітрині зараз порожньо"
					}),
					/* @__PURE__ */ c("p", {
						className: "mt-1 text-xs text-sq-muted max-w-[34ch] mx-auto",
						children: "Зберіть букет на екрані продажу й натисніть «На вітрину» — він зʼявиться тут."
					})
				]
			}),
			/* @__PURE__ */ c("ul", {
				className: "space-y-2",
				"data-testid": "showcase-list",
				children: O.map((e) => /* @__PURE__ */ l("li", {
					className: "rounded-sq border border-sq-divider bg-sq-surface p-3 flex items-center gap-3",
					"data-testid": "showcase-row",
					children: [
						/* @__PURE__ */ c("button", {
							type: "button",
							onClick: () => {
								b(null), w(e);
							},
							className: "w-14 h-14 rounded-sq bg-sq-empty overflow-hidden shrink-0 grid place-items-center",
							"aria-label": e.image_url ? `Змінити фото: ${e.product_name}` : `Додати фото: ${e.product_name}`,
							"data-testid": "showcase-photo",
							children: d(e.image_url) ? /* @__PURE__ */ c("img", {
								src: d(e.image_url) ?? "",
								alt: "",
								className: "w-full h-full object-cover"
							}) : /* @__PURE__ */ c(n, {
								size: 18,
								className: "text-sq-muted"
							})
						}),
						/* @__PURE__ */ l("div", {
							className: "min-w-0 flex-1",
							children: [
								/* @__PURE__ */ c("p", {
									className: "font-medium truncate",
									children: e.product_name
								}),
								/* @__PURE__ */ c("p", {
									className: "text-sm text-sq-secondary",
									children: p(e.price_cents)
								}),
								e.components && e.components.length > 0 && /* @__PURE__ */ c("p", {
									className: "text-xs text-sq-muted truncate",
									children: e.components.map((e) => `${e.product_name} × ${e.quantity}`).join(", ")
								})
							]
						}),
						/* @__PURE__ */ c("button", {
							type: "button",
							onClick: () => {
								b(null), S(e);
							},
							className: "min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-muted hover:text-red-600 shrink-0",
							"aria-label": `Списати: ${e.product_name}`,
							"data-testid": "showcase-writeoff",
							children: /* @__PURE__ */ c(t, { size: 18 })
						})
					]
				}, e.variant_id))
			}),
			C && /* @__PURE__ */ c("div", {
				className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
				children: /* @__PURE__ */ l("div", {
					className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
					"data-testid": "photo-dialog",
					children: [/* @__PURE__ */ l("div", {
						className: "px-4 py-3.5 border-b border-sq-divider",
						children: [/* @__PURE__ */ c("h3", {
							className: "font-semibold",
							children: "Фото букета"
						}), /* @__PURE__ */ c("p", {
							className: "text-sm text-sq-secondary truncate mt-0.5",
							children: C.product_name
						})]
					}), /* @__PURE__ */ l("div", {
						className: "p-4 space-y-3",
						children: [/* @__PURE__ */ c(r, {
							value: C.image_url,
							onChange: (e) => {
								e ? k(C, e) : w(null);
							},
							disabled: T
						}), /* @__PURE__ */ c("button", {
							type: "button",
							disabled: T,
							onClick: () => w(null),
							className: "w-full min-h-12 rounded-sq text-sq-secondary disabled:opacity-50",
							children: "Закрити"
						})]
					})]
				})
			}),
			x && /* @__PURE__ */ c("div", {
				className: "fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4",
				children: /* @__PURE__ */ l("div", {
					className: "bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg",
					"data-testid": "writeoff-dialog",
					children: [/* @__PURE__ */ l("div", {
						className: "px-4 py-3.5 border-b border-sq-divider",
						children: [/* @__PURE__ */ c("h3", {
							className: "font-semibold",
							children: "Списати букет"
						}), /* @__PURE__ */ l("p", {
							className: "text-sm text-sq-secondary truncate mt-0.5",
							children: [
								x.product_name,
								" · ",
								p(x.price_cents)
							]
						})]
					}), /* @__PURE__ */ l("div", {
						className: "p-4 space-y-2",
						children: [
							/* @__PURE__ */ c("p", {
								className: "text-xs text-sq-muted",
								children: "Стебла не повернуться на залишок — їх списав документ виробництва, коли букет зібрали."
							}),
							h.map((e) => /* @__PURE__ */ l("button", {
								type: "button",
								disabled: T,
								onClick: () => void A(x, e.code),
								className: "w-full min-h-12 rounded-sq border border-sq-divider px-3 text-left disabled:opacity-50",
								"data-testid": `writeoff-${e.code}`,
								children: [/* @__PURE__ */ c("span", {
									className: "font-medium",
									children: e.label
								}), /* @__PURE__ */ c("span", {
									className: "block text-xs text-sq-muted",
									children: e.hint
								})]
							}, e.code)),
							/* @__PURE__ */ c("button", {
								type: "button",
								disabled: T,
								onClick: () => S(null),
								className: "w-full min-h-12 rounded-sq text-sq-secondary disabled:opacity-50",
								children: "Скасувати"
							})
						]
					})]
				})
			})
		]
	}) : /* @__PURE__ */ l("div", {
		className: "p-4",
		children: [/* @__PURE__ */ c("h1", {
			className: "text-lg font-semibold text-sq-text",
			children: "Вітрина"
		}), /* @__PURE__ */ c("p", {
			className: "mt-2 text-sm text-amber-700",
			children: "Магазин зараз не на квітковій вертикалі. Тип магазину змінює адміністратор платформи."
		})]
	});
}
//#endregion
export { g as default };
