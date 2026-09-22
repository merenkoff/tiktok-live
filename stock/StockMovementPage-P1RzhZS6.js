import { t as e } from "./useDragScroll-Hmq7ij8E.js";
import { useEffect as t, useState as n } from "react";
import { Link as r } from "react-router-dom";
import { api as i } from "@pos/platform";
import { jsx as a, jsxs as o } from "react/jsx-runtime";
//#region src/modules/stock/pages/StockMovementPage.tsx
function s(e) {
	let t = new Date(e);
	return t.setHours(0, 0, 0, 0), t.toISOString();
}
function c(e) {
	let t = new Date(e);
	return t.setHours(23, 59, 59, 999), t.toISOString();
}
function l() {
	let [l, u] = n(() => {
		let e = /* @__PURE__ */ new Date();
		return e.setDate(e.getDate() - 7), e.toISOString().slice(0, 10);
	}), [d, f] = n(() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)), [p, m] = n([]), [h, g] = n(null), _ = e();
	async function v() {
		g(null);
		try {
			let e = await i.stockMovementSummary(s(new Date(l)), c(new Date(d)));
			m(e);
		} catch {
			g("Не вдалося побудувати звіт");
		}
	}
	return t(() => {
		v();
	}, []), /* @__PURE__ */ o("div", {
		className: "max-w-6xl space-y-4",
		children: [
			/* @__PURE__ */ a(r, {
				to: "/admin/stock",
				className: "text-sm text-[#006AFF] hover:underline",
				children: "← Склад"
			}),
			/* @__PURE__ */ o("div", { children: [/* @__PURE__ */ a("p", {
				className: "sq-section-label",
				children: "Movement report"
			}), /* @__PURE__ */ a("h1", {
				className: "text-2xl font-semibold mt-1",
				children: "Рух за період"
			})] }),
			/* @__PURE__ */ o("div", {
				className: "flex flex-wrap gap-3 items-end",
				children: [
					/* @__PURE__ */ o("label", {
						className: "text-sm space-y-1",
						children: [/* @__PURE__ */ a("span", {
							className: "text-[#6E6E6E] block",
							children: "Від"
						}), /* @__PURE__ */ a("input", {
							type: "date",
							value: l,
							onChange: (e) => u(e.target.value),
							className: "rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2"
						})]
					}),
					/* @__PURE__ */ o("label", {
						className: "text-sm space-y-1",
						children: [/* @__PURE__ */ a("span", {
							className: "text-[#6E6E6E] block",
							children: "До"
						}), /* @__PURE__ */ a("input", {
							type: "date",
							value: d,
							onChange: (e) => f(e.target.value),
							className: "rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2"
						})]
					}),
					/* @__PURE__ */ a("button", {
						type: "button",
						onClick: () => void v(),
						className: "sq-btn-primary px-4 py-2.5 text-sm",
						children: "Показати"
					})
				]
			}),
			h && /* @__PURE__ */ a("p", {
				className: "text-sm text-red-600",
				children: h
			}),
			/* @__PURE__ */ a("div", {
				ref: _,
				className: "rounded-[4px] border border-[#E0E0E0] bg-white overflow-x-auto select-none",
				children: /* @__PURE__ */ o("table", {
					className: "w-full text-sm min-w-[800px]",
					children: [/* @__PURE__ */ a("thead", {
						className: "bg-[#F5F5F5] text-left text-[#6E6E6E]",
						children: /* @__PURE__ */ o("tr", { children: [
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium",
								children: "Товар"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Початковий"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Прихід"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Продаж"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Списання"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Корекції"
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Інвент."
							}),
							/* @__PURE__ */ a("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Кінцевий"
							})
						] })
					}), /* @__PURE__ */ o("tbody", { children: [p.map((e) => /* @__PURE__ */ o("tr", {
						className: "border-t border-[#E0E0E0]",
						children: [
							/* @__PURE__ */ o("td", {
								className: "px-3 py-2",
								children: [
									e.product_name,
									" ",
									/* @__PURE__ */ a("span", {
										className: "text-[#6E6E6E]",
										children: e.label
									})
								]
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.opening
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.receipt || "—"
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.sale || "—"
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.writeoff || "—"
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.adjust || "—"
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums",
								children: e.inventory || "—"
							}),
							/* @__PURE__ */ a("td", {
								className: "px-3 py-2 text-right tabular-nums font-semibold",
								children: e.closing
							})
						]
					}, e.variant_id)), p.length === 0 && /* @__PURE__ */ a("tr", { children: /* @__PURE__ */ a("td", {
						colSpan: 8,
						className: "px-3 py-8 text-center text-[#6E6E6E]",
						children: "Немає руху за вибраний період"
					}) })] })]
				})
			})
		]
	});
}
//#endregion
export { l as StockMovementPage };
