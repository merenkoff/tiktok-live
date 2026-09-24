import { c as e } from "./glyphs-yCl9Zx5o.js";
import { useEffect as t, useState as n } from "react";
import { jsx as r, jsxs as i } from "react/jsx-runtime";
import { api as a, useAuthStore as o } from "@pos/platform";
//#region src/modules/vertical-flowers/settings/FloristLabourCard.tsx
function s(e) {
	return Math.round(Number(e.replace(",", ".")) * 100) || 0;
}
function c() {
	let [c, l] = n(""), [u, d] = n(!1), [f, p] = n(!1), [m, h] = n(null), [g, _] = n(null);
	t(() => {
		let e = !0;
		return a.getStore().then((t) => {
			e && (l(String((t.florist_labour_bps ?? 0) / 100)), d(!0));
		}).catch(() => {
			e && _("Не вдалося завантажити налаштування");
		}), () => {
			e = !1;
		};
	}, []);
	async function v() {
		p(!0), _(null), h(null);
		try {
			let e = await a.updateStore({ florist_labour_bps: s(c) });
			l(String((e.florist_labour_bps ?? 0) / 100)), await o.getState().bootstrap(), h("Збережено");
		} catch (e) {
			let t = e.response?.data?.error;
			_(t || "Не вдалося зберегти");
		} finally {
			p(!1);
		}
	}
	return g && !u ? null : /* @__PURE__ */ i("div", {
		className: "bg-sq-surface border border-sq-divider rounded-sq p-5 shadow-sm space-y-3",
		"data-testid": "florist-labour-card",
		children: [
			/* @__PURE__ */ i("p", {
				className: "sq-section-label flex items-center gap-2",
				children: [/* @__PURE__ */ r(e, {
					size: 24,
					className: "text-sq-blue"
				}), "Робота флориста"]
			}),
			/* @__PURE__ */ i("label", {
				className: "block",
				children: [
					/* @__PURE__ */ r("span", {
						className: "text-sm text-sq-secondary",
						children: "Націнка за збирання, %"
					}),
					/* @__PURE__ */ r("input", {
						className: "mt-1.5 w-full rounded-sq border border-sq-divider px-3 py-2.5",
						inputMode: "decimal",
						value: c,
						disabled: !u,
						onChange: (e) => l(e.target.value.replace(/[^\d.,]/g, "")),
						onKeyDown: (e) => {
							e.key === "Enter" && (e.preventDefault(), v());
						},
						"data-testid": "florist-labour-input"
					}),
					/* @__PURE__ */ r("span", {
						className: "mt-1 block text-xs text-sq-muted",
						children: "Скільки додається до вартості складників, коли касир збирає букет. Ціни стебел уже містять вашу націнку, тож тут — плата за саму роботу; у галузі це зазвичай близько 25%. 0 — рахувати тільки складники. Каси підхоплять нову ставку після наступного входу."
					})
				]
			}),
			/* @__PURE__ */ i("div", {
				className: "flex items-center gap-3",
				children: [
					/* @__PURE__ */ r("button", {
						type: "button",
						onClick: () => void v(),
						disabled: f || !u,
						className: "pos-btn-primary min-h-11 px-4 text-sm disabled:opacity-40",
						"data-testid": "florist-labour-save",
						children: "Зберегти"
					}),
					m && /* @__PURE__ */ r("span", {
						className: "text-sm text-sq-secondary",
						children: m
					}),
					g && /* @__PURE__ */ r("span", {
						className: "text-sm text-red-600",
						"data-testid": "florist-labour-error",
						children: g
					})
				]
			})
		]
	});
}
//#endregion
export { c as default };
