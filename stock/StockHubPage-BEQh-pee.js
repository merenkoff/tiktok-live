import { t as e } from "./useDragScroll-Hmq7ij8E.js";
import { useEffect as t, useMemo as n, useState as r } from "react";
import { Link as i } from "react-router-dom";
import { api as a, formatUah as o, uahInputToCents as s } from "@pos/platform";
import { jsx as c, jsxs as l } from "react/jsx-runtime";
//#region src/modules/stock/components/ManageStockModal.tsx
var u = [
	{
		code: "damaged",
		label: "Брак"
	},
	{
		code: "lost",
		label: "Втрата"
	},
	{
		code: "gift",
		label: "Подарунок"
	},
	{
		code: "other",
		label: "Інше"
	}
], d = [
	{
		code: "found",
		label: "Знайшли"
	},
	{
		code: "loss",
		label: "Не вистачає"
	},
	{
		code: "data_fix",
		label: "Помилка введення"
	},
	{
		code: "other",
		label: "Інше"
	}
];
function f({ row: e, onClose: t, onSaved: n }) {
	let [i, f] = r("set"), [p, m] = r(String(e.quantity)), [h, g] = r(String((e.cost_cents / 100).toFixed(2))), [_, v] = r("data_fix"), [y, b] = r(""), [x, S] = r(!1), [C, w] = r(null);
	async function T(r) {
		r.preventDefault(), S(!0), w(null);
		try {
			let r = Number(p);
			if (!Number.isFinite(r) || r < 0) throw Error("Некоректна кількість");
			if (i === "receive") {
				if (r <= 0) throw Error("Кількість має бути більше 0");
				let t = await a.createStockDocument({
					type: "receipt",
					note: y || "Прихід"
				});
				await a.addStockDocumentLine(t.id, {
					variant_id: e.variant_id,
					quantity: r,
					unit_cost_cents: s(h)
				}), await a.postStockDocument(t.id, crypto.randomUUID());
			} else if (i === "writeoff") {
				if (r <= 0) throw Error("Кількість має бути більше 0");
				if (_ === "other" && !y.trim()) throw Error("Додайте коментар");
				let t = await a.createStockDocument({
					type: "writeoff",
					reason_code: _,
					note: y || null
				});
				await a.addStockDocumentLine(t.id, {
					variant_id: e.variant_id,
					quantity: r
				}), await a.postStockDocument(t.id, crypto.randomUUID());
			} else {
				if (r === e.quantity) throw Error("Залишок уже такий");
				let t = await a.createStockDocument({
					type: "adjustment",
					reason_code: _,
					note: y || null
				});
				await a.addStockDocumentLine(t.id, {
					variant_id: e.variant_id,
					target_qty: r
				}), await a.postStockDocument(t.id, crypto.randomUUID());
			}
			n(), t();
		} catch (e) {
			let t = e && typeof e == "object" && "response" in e ? String(e.response?.data?.error ?? "Помилка збереження") : e instanceof Error ? e.message : "Помилка збереження";
			w(t);
		} finally {
			S(!1);
		}
	}
	let E = i === "writeoff" ? u : d, D = i === "receive" ? "Скільки надійшло" : i === "writeoff" ? "Скільки списати" : "Має бути";
	return /* @__PURE__ */ c("div", {
		className: "fixed inset-0 z-50 grid place-items-center bg-black/40 p-4",
		onClick: t,
		children: /* @__PURE__ */ l("form", {
			onClick: (e) => e.stopPropagation(),
			onSubmit: (e) => void T(e),
			className: "w-full max-w-md rounded-[4px] bg-white border border-[#E0E0E0] p-5 space-y-4 shadow-lg",
			children: [
				/* @__PURE__ */ l("div", { children: [
					/* @__PURE__ */ c("p", {
						className: "sq-section-label",
						children: "Керувати залишком"
					}),
					/* @__PURE__ */ l("h2", {
						className: "text-lg font-semibold mt-1",
						children: [
							e.product_name,
							" ",
							/* @__PURE__ */ c("span", {
								className: "text-[#6E6E6E] font-normal",
								children: e.label
							})
						]
					}),
					/* @__PURE__ */ l("p", {
						className: "text-sm text-[#6E6E6E] mt-1",
						children: [
							"Зараз: ",
							/* @__PURE__ */ c("strong", {
								className: "text-[#1A1A1A]",
								children: e.quantity
							}),
							" шт ·",
							" ",
							o(e.price_cents)
						]
					})
				] }),
				/* @__PURE__ */ c("div", {
					className: "flex gap-1 p-1 bg-[#F5F5F5] rounded-[4px]",
					children: [
						["set", "Має бути"],
						["receive", "Прихід"],
						["writeoff", "Списання"]
					].map(([t, n]) => /* @__PURE__ */ c("button", {
						type: "button",
						onClick: () => {
							f(t), m(t === "set" ? String(e.quantity) : "1"), v(t === "writeoff" ? "damaged" : "data_fix");
						},
						className: `flex-1 py-2 text-sm rounded-[4px] ${i === t ? "bg-white font-medium shadow-sm" : "text-[#6E6E6E]"}`,
						children: n
					}, t))
				}),
				/* @__PURE__ */ l("label", {
					className: "block space-y-1",
					children: [/* @__PURE__ */ c("span", {
						className: "text-sm text-[#6E6E6E]",
						children: D
					}), /* @__PURE__ */ c("input", {
						type: "number",
						min: 0,
						step: 1,
						value: p,
						onChange: (e) => m(e.target.value),
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-3 text-lg font-semibold",
						autoFocus: !0
					})]
				}),
				i === "receive" && /* @__PURE__ */ l("label", {
					className: "block space-y-1",
					children: [/* @__PURE__ */ c("span", {
						className: "text-sm text-[#6E6E6E]",
						children: "Ціна закупки (₴)"
					}), /* @__PURE__ */ c("input", {
						value: h,
						onChange: (e) => g(e.target.value),
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
					})]
				}),
				i !== "receive" && /* @__PURE__ */ c("div", {
					className: "flex flex-wrap gap-1.5",
					children: E.map((e) => /* @__PURE__ */ c("button", {
						type: "button",
						onClick: () => v(e.code),
						className: `px-3 py-1.5 text-sm rounded-[4px] border ${_ === e.code ? "border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]" : "border-[#E0E0E0] bg-white"}`,
						children: e.label
					}, e.code))
				}),
				/* @__PURE__ */ l("label", {
					className: "block space-y-1",
					children: [/* @__PURE__ */ c("span", {
						className: "text-sm text-[#6E6E6E]",
						children: "Коментар"
					}), /* @__PURE__ */ c("input", {
						value: y,
						onChange: (e) => b(e.target.value),
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm",
						placeholder: "необовʼязково"
					})]
				}),
				C && /* @__PURE__ */ c("p", {
					className: "text-sm text-red-600",
					children: C
				}),
				/* @__PURE__ */ l("div", {
					className: "flex gap-2 pt-1",
					children: [/* @__PURE__ */ c("button", {
						type: "button",
						onClick: t,
						className: "flex-1 rounded-[4px] border border-[#E0E0E0] py-2.5 text-sm",
						children: "Скасувати"
					}), /* @__PURE__ */ c("button", {
						type: "submit",
						disabled: x,
						className: "sq-btn-primary flex-1 py-2.5 text-sm",
						children: x ? "Збереження…" : "Провести"
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/modules/stock/pages/StockHubPage.tsx
var p = {
	receipt: "Прихід",
	writeoff: "Списання",
	adjustment: "Корекція",
	inventory: "Інвентаризація",
	production: "Виробництво"
}, m = {
	draft: "Чернетка",
	posted: "Проведено",
	voided: "Скасовано",
	reversed: "Відмінено"
};
function h() {
	let [s, u] = r([]), [d, h] = r([]), [g, _] = r([]), [v, y] = r(""), [b, x] = r(null), [S, C] = r(null), w = e();
	async function T() {
		let [e, t, n] = await Promise.all([
			a.stockOnHand(),
			a.stockLow(),
			a.listStockDocuments({})
		]);
		u(e), h(t.slice(0, 5)), _(n.slice(0, 8));
	}
	t(() => {
		T().catch(() => x("Не вдалося завантажити склад"));
	}, []);
	let E = n(() => {
		let e = v.trim().toLowerCase();
		return e ? s.filter((t) => [
			t.product_name,
			t.label,
			t.sku,
			t.barcode
		].filter(Boolean).some((t) => String(t).toLowerCase().includes(e))) : s;
	}, [s, v]);
	return /* @__PURE__ */ l("div", {
		className: "space-y-6 max-w-6xl",
		children: [
			/* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c("p", {
				className: "sq-section-label",
				children: "Склад"
			}), /* @__PURE__ */ c("h1", {
				className: "text-2xl font-semibold mt-1",
				children: "Огляд залишків"
			})] }),
			/* @__PURE__ */ c("div", {
				className: "grid grid-cols-2 md:grid-cols-5 gap-2",
				children: [
					{
						to: "/admin/stock/receipt",
						label: "Прихід товару",
						hint: "Receive"
					},
					{
						to: "/admin/stock/writeoff",
						label: "Списання",
						hint: "Damage / loss"
					},
					{
						to: "/admin/stock/adjust",
						label: "Корекція",
						hint: "Adjust"
					},
					{
						to: "/admin/stock/inventory",
						label: "Інвентаризація",
						hint: "Stock count"
					},
					{
						to: "/admin/stock/production",
						label: "Виробництво",
						hint: "Assemble"
					}
				].map((e) => /* @__PURE__ */ l(i, {
					to: e.to,
					className: "rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-5 hover:border-[#006AFF] transition-colors",
					children: [/* @__PURE__ */ c("p", {
						className: "font-semibold text-[#1A1A1A]",
						children: e.label
					}), /* @__PURE__ */ c("p", {
						className: "text-xs text-[#6E6E6E] mt-1",
						children: e.hint
					})]
				}, e.to))
			}),
			/* @__PURE__ */ l("div", {
				className: "flex flex-wrap gap-3 text-sm",
				children: [
					/* @__PURE__ */ c(i, {
						to: "/admin/stock/history",
						className: "text-[#006AFF] hover:underline",
						children: "Історія рухів"
					}),
					/* @__PURE__ */ c("span", {
						className: "text-[#E0E0E0]",
						children: "·"
					}),
					/* @__PURE__ */ c(i, {
						to: "/admin/stock/movement",
						className: "text-[#006AFF] hover:underline",
						children: "Звіт «Рух за період»"
					})
				]
			}),
			b && /* @__PURE__ */ c("p", {
				className: "text-sm text-red-600",
				children: b
			}),
			d.length > 0 && /* @__PURE__ */ l("div", {
				className: "rounded-[4px] border border-[#F5D0C8] bg-[#FFF8F6] p-4",
				children: [/* @__PURE__ */ c("p", {
					className: "text-sm font-medium text-[#B33B1E]",
					children: "Мало на складі"
				}), /* @__PURE__ */ c("ul", {
					className: "mt-2 space-y-1 text-sm",
					children: d.map((e) => /* @__PURE__ */ l("li", { children: [
						e.product_name,
						" ",
						e.label,
						" —",
						" ",
						/* @__PURE__ */ c("strong", { children: e.quantity }),
						" шт"
					] }, e.variant_id))
				})]
			}),
			/* @__PURE__ */ l("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white overflow-hidden",
				children: [/* @__PURE__ */ l("div", {
					className: "p-3 border-b border-[#E0E0E0] flex gap-3 items-center",
					children: [/* @__PURE__ */ c("input", {
						value: v,
						onChange: (e) => y(e.target.value),
						placeholder: "Пошук товару, SKU, штрихкод…",
						className: "flex-1 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
					}), /* @__PURE__ */ l("span", {
						className: "text-sm text-[#6E6E6E] whitespace-nowrap",
						children: [E.length, " поз."]
					})]
				}), /* @__PURE__ */ c("div", {
					ref: w,
					className: "overflow-x-auto select-none",
					children: /* @__PURE__ */ l("table", {
						className: "w-full text-sm",
						children: [/* @__PURE__ */ c("thead", {
							className: "bg-[#F5F5F5] text-left text-[#6E6E6E]",
							children: /* @__PURE__ */ l("tr", { children: [
								/* @__PURE__ */ c("th", {
									className: "px-3 py-2 font-medium",
									children: "Товар"
								}),
								/* @__PURE__ */ c("th", {
									className: "px-3 py-2 font-medium",
									children: "Варіант"
								}),
								/* @__PURE__ */ c("th", {
									className: "px-3 py-2 font-medium text-right",
									children: "On Hand"
								}),
								/* @__PURE__ */ c("th", {
									className: "px-3 py-2 font-medium text-right",
									children: "Ціна"
								})
							] })
						}), /* @__PURE__ */ l("tbody", { children: [E.map((e) => /* @__PURE__ */ l("tr", {
							className: "border-t border-[#E0E0E0]",
							children: [
								/* @__PURE__ */ c("td", {
									className: "px-3 py-2.5",
									children: e.product_name
								}),
								/* @__PURE__ */ c("td", {
									className: "px-3 py-2.5 text-[#6E6E6E]",
									children: e.label || "—"
								}),
								/* @__PURE__ */ c("td", {
									className: "px-3 py-2.5 text-right",
									children: /* @__PURE__ */ c("button", {
										type: "button",
										onClick: () => C(e),
										className: "font-semibold text-[#006AFF] hover:underline tabular-nums",
										children: e.quantity
									})
								}),
								/* @__PURE__ */ c("td", {
									className: "px-3 py-2.5 text-right tabular-nums",
									children: o(e.price_cents)
								})
							]
						}, e.variant_id)), E.length === 0 && /* @__PURE__ */ c("tr", { children: /* @__PURE__ */ c("td", {
							colSpan: 4,
							className: "px-3 py-8 text-center text-[#6E6E6E]",
							children: "Немає товарів"
						}) })] })]
					})
				})]
			}),
			/* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c("p", {
				className: "sq-section-label mb-2",
				children: "Останні документи"
			}), /* @__PURE__ */ l("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]",
				children: [g.length === 0 && /* @__PURE__ */ c("p", {
					className: "p-4 text-sm text-[#6E6E6E]",
					children: "Поки немає складських документів"
				}), g.map((e) => /* @__PURE__ */ l(i, {
					to: `/admin/stock/documents/${e.id}`,
					className: "flex items-center justify-between px-4 py-3 hover:bg-[#F5F5F5]",
					children: [/* @__PURE__ */ l("div", { children: [/* @__PURE__ */ l("p", {
						className: "text-sm font-medium",
						children: [
							p[e.type] ?? e.type,
							" · ",
							e.doc_number
						]
					}), /* @__PURE__ */ c("p", {
						className: "text-xs text-[#6E6E6E]",
						children: new Date(e.occurred_at).toLocaleString("uk-UA")
					})] }), /* @__PURE__ */ c("span", {
						className: "text-xs text-[#6E6E6E]",
						children: m[e.status] ?? e.status
					})]
				}, e.id))]
			})] }),
			S && /* @__PURE__ */ c(f, {
				row: S,
				onClose: () => C(null),
				onSaved: () => void T()
			})
		]
	});
}
//#endregion
export { h as StockHubPage };
