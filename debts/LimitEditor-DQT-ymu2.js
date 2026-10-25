import { t as e } from "./debtsApi-DhkvGjzT.js";
import { f as t } from "./queue-B9HzuKEV.js";
import { l as n, n as r, y as i } from "./debt-GvG7YbfE.js";
import { t as a } from "./errors-CLut7Fii.js";
import { useEffect as o, useState as s } from "react";
import { formatUah as c } from "@pos/platform";
import { jsx as l, jsxs as u } from "react/jsx-runtime";
import { Link as d } from "react-router-dom";
// src/components/ui/Page.tsx
function f({ title: e, glyph: t, subtitle: n, actions: r, back: a }) {
	return /* @__PURE__ */ u("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			a && /* @__PURE__ */ u(d, {
				to: a.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ l(i, { size: 20 }), a.label]
			}),
			/* @__PURE__ */ u("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					t && /* @__PURE__ */ l(t, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ l("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					r && /* @__PURE__ */ l("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: r
					})
				]
			}),
			n && /* @__PURE__ */ l("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: n
			})
		]
	});
}
function p({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ u("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ u("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ l("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ l("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
function m({ value: e, options: t, onChange: n, ariaLabel: r, className: i = "" }) {
	let a = i.includes("w-full");
	return /* @__PURE__ */ l("div", {
		className: `inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${i}`,
		role: "group",
		"aria-label": r,
		children: t.map((t) => {
			let r = t.value === e;
			return /* @__PURE__ */ l("button", {
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
// src/modules/debts/components/LimitEditor.tsx
function h(e) {
	return e == null ? "" : String(e / 100).replace(".", ",");
}
function g({ credit: i, touch: d }) {
	let [f, p] = s(() => h(i.limit_cents)), [m, g] = s(!1), [_, v] = s(null), [y, b] = s(null);
	o(() => p(h(i.limit_cents)), [i.limit_cents]);
	async function x(n, r) {
		g(!0), v(null), b(null);
		try {
			t(await e.setCredit(i.customer_id, n)), b(r);
		} catch (e) {
			v(a(e, "Не вдалося зберегти").text);
		} finally {
			g(!1);
		}
	}
	function S() {
		let e = n(f);
		e == null || e < 100 || e > 1e7 ? v(`Ліміт — від ${c(100)} до ${c(r)}`) : x({ credit_limit_cents: e }, "Ліміт збережено");
	}
	let C = d ? "pos-field" : "sq-input", w = i.limit_cents != null;
	return /* @__PURE__ */ u("div", {
		className: "space-y-2",
		"data-testid": "debts-limit-editor",
		children: [
			/* @__PURE__ */ u("form", {
				className: "flex flex-wrap items-end gap-2",
				onSubmit: (e) => {
					e.preventDefault(), S();
				},
				children: [/* @__PURE__ */ u("label", {
					className: "flex flex-col gap-1 min-w-0 flex-1",
					children: [/* @__PURE__ */ l("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: w ? "Ліміт під запис, ₴" : "Дозволити під запис — ліміт, ₴"
					}), /* @__PURE__ */ l("input", {
						className: `${C} w-full`,
						inputMode: "decimal",
						value: f,
						placeholder: "Наприклад: 2000",
						"aria-label": "Ліміт під запис, гривень",
						onChange: (e) => p(e.target.value)
					})]
				}), /* @__PURE__ */ l("button", {
					type: "submit",
					className: "sq-btn-quiet",
					disabled: m,
					children: w ? "Зберегти" : "Дозволити"
				})]
			}),
			w && /* @__PURE__ */ u("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ l("button", {
					type: "button",
					className: "sq-btn-quiet",
					disabled: m,
					onClick: () => void x({ credit_locked: !i.locked }, i.locked ? "Записи знову дозволено" : "Нові записи заблоковано"),
					children: i.locked ? "Розблокувати записи" : "Заблокувати нові записи"
				}), /* @__PURE__ */ l("button", {
					type: "button",
					className: "sq-btn-quiet",
					disabled: m,
					onClick: () => void x({ credit_limit_cents: null }, "Під запис більше не дозволено"),
					children: "Заборонити під запис"
				})]
			}),
			_ && /* @__PURE__ */ l("p", {
				className: "text-sm text-red-600",
				children: _
			}),
			y && /* @__PURE__ */ l("p", {
				className: "text-sm text-sq-success-ink",
				children: y
			}),
			i.set_by_name && i.set_at && /* @__PURE__ */ u("p", {
				className: "text-[13px] text-sq-muted",
				children: [
					"Востаннє змінив(ла) ",
					i.set_by_name,
					", ",
					new Date(i.set_at).toLocaleDateString("uk-UA")
				]
			})
		]
	});
}
export { m as i, f as n, p as r, g as t };
