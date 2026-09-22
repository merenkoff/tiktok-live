import { t as e } from "./componentOptions-CV1UZTqA.js";
import { useEffect as t, useMemo as n, useState as r } from "react";
import { Link as i } from "react-router-dom";
import { api as a, formatUah as o, uahInputToCents as s } from "@pos/platform";
import { jsx as c, jsxs as l } from "react/jsx-runtime";
//#region src/modules/products/components/modifierInput.ts
function u(e) {
	let t = e.trim(), n = /^[-−–]/.test(t), r = s(t.replace(/^[-−–+]\s*/, ""));
	return n ? -r : r;
}
function d(e, t) {
	return e?.response?.data?.error || t;
}
//#endregion
//#region src/modules/products/components/ModifierEditor.tsx
var f = "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm text-sq-text placeholder:text-sq-muted focus:outline-none focus:border-sq-blue";
function p(e) {
	return e > 0 ? `+${o(e)}` : e < 0 ? `−${o(-e)}` : "без доплати";
}
var m = {
	name: "",
	delta: "0",
	isDefault: !1,
	componentId: "",
	componentQty: "1"
};
function h(e) {
	return {
		name: e.name,
		delta: String(e.price_delta_cents / 100),
		isDefault: e.is_default,
		componentId: e.component_variant_id ?? "",
		componentQty: String(e.component_quantity ?? 1)
	};
}
function g({ group: e, options: t, onChanged: i, onError: o }) {
	let [s, g] = r(m), [_, v] = r(null), [y, b] = r(!1), x = n(() => new Map(t.map((e) => [e.variant_id, e])), [t]), S = s.componentId === "" ? null : x.get(Number(s.componentId));
	function C(e) {
		let t = e.componentId !== "";
		return {
			name: e.name.trim(),
			price_delta_cents: u(e.delta),
			is_default: e.isDefault,
			component_variant_id: t ? Number(e.componentId) : null,
			component_quantity: t ? Number(e.componentQty) || 1 : null
		};
	}
	async function w(t) {
		if (t.preventDefault(), !y) {
			b(!0);
			try {
				i(_ == null ? await a.createModifier(e.id, C(s)) : await a.updateModifier(_, C(s))), g(m), v(null);
			} catch (e) {
				o(d(e, "Не вдалося зберегти відповідь"));
			} finally {
				b(!1);
			}
		}
	}
	async function T(e) {
		try {
			i(await a.updateModifier(e.id, { is_default: !e.is_default }));
		} catch (e) {
			o(d(e, "Не вдалося змінити відповідь"));
		}
	}
	async function E(t) {
		if (confirm(`Прибрати відповідь «${t.name}»?`)) try {
			await a.deleteModifier(t.id), i({
				...e,
				modifiers: e.modifiers.filter((e) => e.id !== t.id)
			}), _ === t.id && (v(null), g(m));
		} catch (e) {
			o(d(e, "Не вдалося прибрати відповідь"));
		}
	}
	return /* @__PURE__ */ l("div", {
		className: "space-y-3",
		children: [
			e.modifiers.length === 0 && /* @__PURE__ */ c("p", {
				className: "text-sm text-sq-muted",
				children: "Ще жодної відповіді. Без відповідей питання на касі не зʼявиться."
			}),
			/* @__PURE__ */ c("ul", {
				className: "divide-y divide-sq-divider",
				children: e.modifiers.map((e) => {
					let t = e.component_variant_id == null ? null : x.get(e.component_variant_id), n = t ? t.caption : e.component ? [e.component.product_name, e.component.label].filter(Boolean).join(" · ") : null;
					return /* @__PURE__ */ l("li", {
						className: "py-2 flex flex-wrap items-center gap-x-3 gap-y-1",
						"data-testid": "modifier-row",
						children: [
							/* @__PURE__ */ c("span", {
								className: "font-medium text-sq-text",
								children: e.name
							}),
							/* @__PURE__ */ c("span", {
								className: "text-sm text-sq-secondary tabular-nums",
								children: p(e.price_delta_cents)
							}),
							e.is_default && /* @__PURE__ */ c("span", {
								className: "text-[11px] font-semibold px-1.5 py-0.5 rounded-[3px] bg-[#EEF4FF] text-[#2B4ACB]",
								children: "за умовчанням"
							}),
							/* @__PURE__ */ c("span", {
								className: "text-xs text-sq-secondary",
								children: n ? `списує ${n} × ${e.component_quantity} ${t?.unit ?? e.component?.unit ?? ""}`.trim() : "без списання"
							}),
							!e.is_active && /* @__PURE__ */ c("span", {
								className: "text-xs text-sq-muted",
								children: "вимкнено"
							}),
							/* @__PURE__ */ l("span", {
								className: "ml-auto flex gap-2 text-sm",
								children: [
									/* @__PURE__ */ c("button", {
										type: "button",
										className: "text-sq-blue",
										onClick: () => void T(e),
										children: e.is_default ? "Не за умовчанням" : "За умовчанням"
									}),
									/* @__PURE__ */ c("button", {
										type: "button",
										className: "text-sq-blue",
										onClick: () => {
											v(e.id), g(h(e));
										},
										children: "Змінити"
									}),
									/* @__PURE__ */ c("button", {
										type: "button",
										className: "text-red-600",
										onClick: () => void E(e),
										children: "Прибрати"
									})
								]
							})
						]
					}, e.id);
				})
			}),
			/* @__PURE__ */ l("form", {
				onSubmit: w,
				className: "grid gap-2 sm:grid-cols-[1fr_120px_1fr_90px_auto] items-end rounded-sq border border-sq-divider bg-sq-bg/40 p-3",
				children: [
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["Відповідь", /* @__PURE__ */ c("input", {
							className: f,
							placeholder: "вівсяне",
							value: s.name,
							onChange: (e) => g({
								...s,
								name: e.target.value
							}),
							required: !0,
							"data-testid": "modifier-form-name"
						})]
					}),
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["До ціни, ₴", /* @__PURE__ */ c("input", {
							className: f,
							inputMode: "decimal",
							placeholder: "15 або -20",
							value: s.delta,
							onChange: (e) => g({
								...s,
								delta: e.target.value
							}),
							"data-testid": "modifier-form-delta"
						})]
					}),
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["Списує", /* @__PURE__ */ l("select", {
							className: f,
							value: s.componentId,
							onChange: (e) => g({
								...s,
								componentId: e.target.value === "" ? "" : Number(e.target.value)
							}),
							"data-testid": "modifier-form-component",
							children: [/* @__PURE__ */ c("option", {
								value: "",
								children: "нічого"
							}), t.map((e) => /* @__PURE__ */ c("option", {
								value: e.variant_id,
								children: e.caption
							}, e.variant_id))]
						})]
					}),
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: [
							"Кількість",
							S ? `, ${S.unit}` : "",
							/* @__PURE__ */ c("input", {
								className: f,
								type: "number",
								min: 1,
								step: 1,
								disabled: s.componentId === "",
								value: s.componentQty,
								onChange: (e) => g({
									...s,
									componentQty: e.target.value
								}),
								"data-testid": "modifier-form-qty"
							})
						]
					}),
					/* @__PURE__ */ l("div", {
						className: "flex items-center gap-3",
						children: [
							/* @__PURE__ */ l("label", {
								className: "inline-flex items-center gap-1.5 text-sm text-sq-text whitespace-nowrap",
								children: [/* @__PURE__ */ c("input", {
									type: "checkbox",
									checked: s.isDefault,
									onChange: (e) => g({
										...s,
										isDefault: e.target.checked
									}),
									"data-testid": "modifier-form-default"
								}), "за умовчанням"]
							}),
							/* @__PURE__ */ c("button", {
								type: "submit",
								className: "sq-btn-primary px-3 py-2 whitespace-nowrap",
								disabled: y,
								"data-testid": "modifier-form-submit",
								children: _ == null ? "Додати" : "Зберегти"
							}),
							_ != null && /* @__PURE__ */ c("button", {
								type: "button",
								className: "text-sm text-sq-secondary",
								onClick: () => {
									v(null), g(m);
								},
								children: "Скасувати"
							})
						]
					})
				]
			})
		]
	});
}
//#endregion
//#region src/modules/products/pages/ModifiersPage.tsx
var _ = "w-full rounded-sq border border-sq-divider bg-sq-surface px-3 py-2.5 text-sm text-sq-text placeholder:text-sq-muted focus:outline-none focus:border-sq-blue";
function v(e) {
	return e.min_select >= 1 && e.max_select === 1 ? "обовʼязково · одна відповідь" : e.min_select >= 1 ? `обовʼязково · від ${e.min_select} до ${e.max_select}` : e.max_select === 1 ? "за бажанням · одна відповідь" : `за бажанням · до ${e.max_select}`;
}
function y() {
	let [o, s] = r([]), [u, f] = r([]), [p, m] = r(null), [h, y] = r({
		name: "",
		min: "1",
		max: "1"
	}), [b, x] = r(null), S = n(() => e(u, { maxDepth: 99 }), [u]);
	async function C() {
		let [e, t] = await Promise.all([a.listModifierGroups(), a.getProducts()]);
		s(e), f(t);
	}
	t(() => {
		C().catch(() => m("Не вдалося завантажити"));
	}, []);
	function w(e) {
		s((t) => t.map((t) => t.id === e.id ? e : t));
	}
	async function T(e) {
		e.preventDefault(), m(null);
		try {
			let e = await a.createModifierGroup({
				name: h.name.trim(),
				min_select: Number(h.min) || 0,
				max_select: Number(h.max) || 1
			});
			s((t) => [...t, e]), y({
				name: "",
				min: "1",
				max: "1"
			});
		} catch (e) {
			m(d(e, "Не вдалося створити групу"));
		}
	}
	async function E(e) {
		if (e.preventDefault(), b) {
			m(null);
			try {
				w(await a.updateModifierGroup(b.id, {
					name: b.draft.name.trim(),
					min_select: Number(b.draft.min) || 0,
					max_select: Number(b.draft.max) || 1
				})), x(null);
			} catch (e) {
				m(d(e, "Не вдалося зберегти групу"));
			}
		}
	}
	async function D(e) {
		m(null);
		try {
			w(await a.updateModifierGroup(e.id, { is_active: !e.is_active }));
		} catch (e) {
			m(d(e, "Не вдалося змінити групу"));
		}
	}
	async function O(e) {
		if (confirm(`Видалити групу «${e.name}»? Товари перестануть її питати.`)) {
			m(null);
			try {
				await a.deleteModifierGroup(e.id), s((t) => t.filter((t) => t.id !== e.id));
			} catch (e) {
				m(d(e, "Не вдалося видалити групу"));
			}
		}
	}
	return /* @__PURE__ */ l("div", {
		className: "space-y-6 animate-fade-up text-sq-text",
		children: [
			/* @__PURE__ */ l("div", { children: [/* @__PURE__ */ c("h2", {
				className: "text-2xl font-semibold",
				children: "Модифікатори"
			}), /* @__PURE__ */ l("p", {
				className: "text-sq-secondary mt-1 text-sm",
				children: [
					"Питання, які каса ставить про товар, і відповіді на них. Ціна відповіді додається до ціни картки; відповідь може списувати інгредієнт. Які товари що питають — у ",
					/* @__PURE__ */ c(i, {
						to: "/admin/products",
						className: "text-sq-blue",
						children: "картці товару"
					}),
					"."
				]
			})] }),
			p && /* @__PURE__ */ c("div", {
				className: "rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm",
				"data-testid": "modifiers-error",
				children: p
			}),
			/* @__PURE__ */ l("form", {
				onSubmit: T,
				className: "bg-sq-surface border border-sq-divider rounded-sq p-5 grid sm:grid-cols-[1fr_110px_110px_auto] gap-3 items-end shadow-sm",
				children: [
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["Питання", /* @__PURE__ */ c("input", {
							className: _,
							placeholder: "Молоко",
							value: h.name,
							onChange: (e) => y({
								...h,
								name: e.target.value
							}),
							required: !0,
							"data-testid": "group-form-name"
						})]
					}),
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["Щонайменше", /* @__PURE__ */ c("input", {
							className: _,
							type: "number",
							min: 0,
							max: 50,
							value: h.min,
							onChange: (e) => y({
								...h,
								min: e.target.value
							}),
							"data-testid": "group-form-min"
						})]
					}),
					/* @__PURE__ */ l("label", {
						className: "text-xs text-sq-secondary",
						children: ["Щонайбільше", /* @__PURE__ */ c("input", {
							className: _,
							type: "number",
							min: 1,
							max: 50,
							value: h.max,
							onChange: (e) => y({
								...h,
								max: e.target.value
							}),
							"data-testid": "group-form-max"
						})]
					}),
					/* @__PURE__ */ c("button", {
						type: "submit",
						className: "sq-btn-primary px-4 py-2.5",
						"data-testid": "group-form-submit",
						children: "Додати групу"
					}),
					/* @__PURE__ */ c("p", {
						className: "sm:col-span-4 text-[11px] text-sq-secondary",
						children: "«Щонайменше 1» робить питання обовʼязковим — тоді одну відповідь позначте «за умовчанням», щоб «як завжди» лишалось одним тапом. «Щонайбільше» — скільки відповідей можна обрати разом."
					})
				]
			}),
			o.length === 0 && /* @__PURE__ */ c("p", {
				className: "text-sm text-sq-muted",
				children: "Поки жодного питання."
			}),
			/* @__PURE__ */ c("div", {
				className: "space-y-4",
				children: o.map((e) => /* @__PURE__ */ l("section", {
					className: "bg-sq-surface border border-sq-divider rounded-sq p-5 space-y-4 shadow-sm",
					"data-testid": `group-card-${e.id}`,
					children: [b?.id === e.id ? /* @__PURE__ */ l("form", {
						onSubmit: E,
						className: "grid sm:grid-cols-[1fr_110px_110px_auto_auto] gap-3 items-end",
						children: [
							/* @__PURE__ */ l("label", {
								className: "text-xs text-sq-secondary",
								children: ["Питання", /* @__PURE__ */ c("input", {
									className: _,
									value: b.draft.name,
									onChange: (e) => x({
										...b,
										draft: {
											...b.draft,
											name: e.target.value
										}
									}),
									required: !0
								})]
							}),
							/* @__PURE__ */ l("label", {
								className: "text-xs text-sq-secondary",
								children: ["Щонайменше", /* @__PURE__ */ c("input", {
									className: _,
									type: "number",
									min: 0,
									max: 50,
									value: b.draft.min,
									onChange: (e) => x({
										...b,
										draft: {
											...b.draft,
											min: e.target.value
										}
									})
								})]
							}),
							/* @__PURE__ */ l("label", {
								className: "text-xs text-sq-secondary",
								children: ["Щонайбільше", /* @__PURE__ */ c("input", {
									className: _,
									type: "number",
									min: 1,
									max: 50,
									value: b.draft.max,
									onChange: (e) => x({
										...b,
										draft: {
											...b.draft,
											max: e.target.value
										}
									})
								})]
							}),
							/* @__PURE__ */ c("button", {
								type: "submit",
								className: "sq-btn-primary px-3 py-2",
								children: "Зберегти"
							}),
							/* @__PURE__ */ c("button", {
								type: "button",
								className: "text-sm text-sq-secondary",
								onClick: () => x(null),
								children: "Скасувати"
							})
						]
					}) : /* @__PURE__ */ l("div", {
						className: "flex flex-wrap items-center gap-x-3 gap-y-1",
						children: [
							/* @__PURE__ */ c("h3", {
								className: "text-lg font-semibold text-sq-text",
								children: e.name
							}),
							/* @__PURE__ */ c("span", {
								className: "text-sm text-sq-secondary",
								children: v(e)
							}),
							!e.is_active && /* @__PURE__ */ c("span", {
								className: "text-xs text-sq-muted",
								children: "вимкнено"
							}),
							/* @__PURE__ */ l("span", {
								className: "ml-auto flex gap-3 text-sm",
								children: [
									/* @__PURE__ */ l("label", {
										className: "inline-flex items-center gap-1.5 text-sq-text",
										children: [/* @__PURE__ */ c("input", {
											type: "checkbox",
											checked: e.is_active,
											onChange: () => void D(e),
											"data-testid": `group-active-${e.id}`
										}), "активна"]
									}),
									/* @__PURE__ */ c("button", {
										type: "button",
										className: "text-sq-blue",
										onClick: () => x({
											id: e.id,
											draft: {
												name: e.name,
												min: String(e.min_select),
												max: String(e.max_select)
											}
										}),
										children: "Змінити"
									}),
									/* @__PURE__ */ c("button", {
										type: "button",
										className: "text-red-600",
										onClick: () => void O(e),
										"data-testid": `group-delete-${e.id}`,
										children: "Видалити"
									})
								]
							})
						]
					}), /* @__PURE__ */ c(g, {
						group: e,
						options: S,
						onChanged: w,
						onError: m
					})]
				}, e.id))
			})
		]
	});
}
//#endregion
export { y as ModifiersPage };
