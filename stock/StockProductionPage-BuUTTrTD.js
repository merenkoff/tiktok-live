import { useEffect as e, useMemo as t, useState as n } from "react";
import { useNavigate as r } from "react-router-dom";
import { api as i, formatUah as a } from "@pos/platform";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
//#region src/modules/stock/pages/StockProductionPage.tsx
function c() {
	let c = r(), [l, u] = n([]), [d, f] = n(""), [p, m] = n("1"), [h, g] = n(""), [_, v] = n(null), [y, b] = n(!1);
	e(() => {
		i.getProducts().then(u).catch(() => v("Не вдалося завантажити товари"));
	}, []);
	let x = t(() => {
		let e = [];
		for (let t of l) if (t.is_active && t.kind === "composite" && (t.stock_mode ?? "own") === "own") for (let n of t.variants) n.is_active && e.push({
			product: t,
			variant: n,
			caption: n.label ? `${t.name} · ${n.label}` : t.name
		});
		return e.sort((e, t) => e.caption.localeCompare(t.caption, "uk"));
	}, [l]), S = x.find((e) => e.variant.id === d) ?? null, C = Number(p) || 0, w = t(() => {
		let e = S?.variant.components ?? [], t = /* @__PURE__ */ new Map();
		for (let e of l) for (let n of e.variants) t.set(n.id, n.quantity);
		return e.map((e) => {
			let n = e.quantity * C, r = t.get(e.component_variant_id) ?? 0;
			return {
				...e,
				need: n,
				have: r,
				short: n > r
			};
		});
	}, [
		S,
		l,
		C
	]), T = t(() => {
		let e = S?.variant.components ?? [];
		if (e.length === 0) return 0;
		let t = /* @__PURE__ */ new Map();
		for (let e of l) for (let n of e.variants) t.set(n.id, n.quantity);
		return e.reduce((e, n) => {
			let r = t.get(n.component_variant_id) ?? 0;
			return Math.min(e, Math.floor(r / n.quantity));
		}, Infinity);
	}, [S, l]);
	async function E(e) {
		if (e.preventDefault(), !(!S || C <= 0)) {
			v(null), b(!0);
			try {
				let e = await i.createStockDocument({
					type: "production",
					note: h.trim() || null
				});
				await i.addStockDocumentLine(e.id, {
					variant_id: S.variant.id,
					quantity: C
				});
				let t = await i.postStockDocument(e.id);
				c(`/admin/stock/documents/${t.id}`);
			} catch (e) {
				let t = e && typeof e == "object" && "response" in e ? e.response?.data?.error ?? null : null;
				v(t ?? "Не вдалося провести виробництво");
			} finally {
				b(!1);
			}
		}
	}
	return /* @__PURE__ */ s("div", {
		className: "space-y-6 max-w-3xl",
		children: [
			/* @__PURE__ */ s("div", { children: [
				/* @__PURE__ */ o("p", {
					className: "sq-section-label",
					children: "Склад"
				}),
				/* @__PURE__ */ o("h1", {
					className: "text-2xl font-semibold mt-1",
					children: "Виробництво"
				}),
				/* @__PURE__ */ o("p", {
					className: "text-sm text-sq-secondary mt-1",
					children: "Збираємо складений товар зі складників. Складники спишуться, зібране стане на облік."
				})
			] }),
			_ && /* @__PURE__ */ o("p", {
				className: "text-sm text-red-600",
				children: _
			}),
			x.length === 0 ? /* @__PURE__ */ o("p", {
				className: "text-sm text-sq-secondary",
				children: "Немає що збирати. Створіть товар «Складений — збираємо заздалегідь» у розділі «Товари»."
			}) : /* @__PURE__ */ s("form", {
				onSubmit: (e) => void E(e),
				className: "space-y-4",
				children: [
					/* @__PURE__ */ s("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ o("span", {
							className: "text-xs text-sq-secondary",
							children: "Що збираємо"
						}), /* @__PURE__ */ s("select", {
							className: "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm",
							value: d,
							onChange: (e) => f(e.target.value === "" ? "" : Number(e.target.value)),
							children: [/* @__PURE__ */ o("option", {
								value: "",
								children: "Оберіть…"
							}), x.map((e) => /* @__PURE__ */ o("option", {
								value: e.variant.id,
								children: e.caption
							}, e.variant.id))]
						})]
					}),
					/* @__PURE__ */ s("label", {
						className: "block space-y-1 max-w-[12rem]",
						children: [/* @__PURE__ */ o("span", {
							className: "text-xs text-sq-secondary",
							children: "Скільки зібрати"
						}), /* @__PURE__ */ o("input", {
							className: "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm",
							inputMode: "numeric",
							value: p,
							onChange: (e) => m(e.target.value.replace(/\D/g, ""))
						})]
					}),
					/* @__PURE__ */ s("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ o("span", {
							className: "text-xs text-sq-secondary",
							children: "Примітка (необовʼязково)"
						}), /* @__PURE__ */ o("input", {
							className: "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm",
							value: h,
							onChange: (e) => g(e.target.value),
							placeholder: "Наприклад: замовлення на суботу"
						})]
					}),
					S && /* @__PURE__ */ s("div", {
						className: "rounded-sq border border-sq-divider bg-sq-surface p-4 space-y-2",
						children: [
							/* @__PURE__ */ s("div", {
								className: "flex items-baseline justify-between gap-2",
								children: [/* @__PURE__ */ o("p", {
									className: "text-sm font-semibold text-sq-text",
									children: "Піде на це"
								}), /* @__PURE__ */ s("p", {
									className: "text-xs text-sq-secondary",
									children: [
										"Зі складників вистачить на ",
										Number.isFinite(T) ? T : 0,
										" шт"
									]
								})]
							}),
							w.length === 0 && /* @__PURE__ */ o("p", {
								className: "text-sm text-red-600",
								children: "У цього варіанта порожній склад — заповніть його в картці товару."
							}),
							/* @__PURE__ */ o("table", {
								className: "w-full text-sm",
								children: /* @__PURE__ */ o("tbody", { children: w.map((e) => /* @__PURE__ */ s("tr", {
									className: "border-t border-sq-divider",
									children: [
										/* @__PURE__ */ s("td", {
											className: "py-2 pr-2",
											children: [e.product_name, e.label ? ` · ${e.label}` : ""]
										}),
										/* @__PURE__ */ s("td", {
											className: "py-2 pr-2 text-right whitespace-nowrap",
											children: [
												e.need,
												" ",
												e.unit
											]
										}),
										/* @__PURE__ */ s("td", {
											className: `py-2 text-right whitespace-nowrap text-xs ${e.short ? "text-red-600 font-semibold" : "text-sq-secondary"}`,
											children: [
												"є ",
												e.have,
												" ",
												e.unit
											]
										})
									]
								}, e.component_variant_id)) })
							}),
							/* @__PURE__ */ s("p", {
								className: "text-xs text-sq-secondary pt-1",
								children: [
									"Собівартість зібраного порахується зі складників. Поточна ціна продажу —",
									" ",
									a(S.variant.price_cents),
									"."
								]
							})
						]
					}),
					/* @__PURE__ */ o("button", {
						type: "submit",
						disabled: y || !S || C <= 0 || w.length === 0,
						className: "sq-btn-primary px-5 py-2.5 text-sm disabled:opacity-50",
						children: y ? "Проведення…" : "Зібрати і провести"
					})
				]
			})
		]
	});
}
//#endregion
export { c as StockProductionPage };
