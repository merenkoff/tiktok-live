import { jsx as e, jsxs as t } from "react/jsx-runtime";
import { POS_APP_VERSION as n, useVertical as r } from "@pos/platform";
//#region src/modules/vertical-flowers/pages/FlowersHomePage.tsx
function i() {
	let i = r();
	return /* @__PURE__ */ t("div", {
		className: "p-4 space-y-4 text-sq-text",
		children: [
			/* @__PURE__ */ t("div", { children: [/* @__PURE__ */ e("h1", {
				className: "text-lg font-semibold",
				children: "Квіти"
			}), /* @__PURE__ */ t("p", {
				className: "text-sm text-sq-secondary mt-1",
				children: [
					"Модуль активний на цій касі, версія ",
					n,
					"."
				]
			})] }),
			/* @__PURE__ */ t("section", {
				className: "rounded-sq border border-sq-divider bg-sq-surface p-4",
				children: [/* @__PURE__ */ e("p", {
					className: "sq-section-label",
					children: "Поля товару"
				}), i.id === "flowers" ? /* @__PURE__ */ e("ul", {
					className: "mt-2 space-y-1 text-sm",
					children: i.attributes.map((n) => /* @__PURE__ */ t("li", {
						className: "text-sq-secondary",
						children: [
							/* @__PURE__ */ e("span", {
								className: "text-sq-text",
								children: n.label
							}),
							n.unitSuffix ? `, ${n.unitSuffix}` : "",
							" · ",
							n.key
						]
					}, n.key))
				}) : /* @__PURE__ */ e("p", {
					className: "mt-2 text-sm text-amber-700",
					children: "Магазин зараз не на квітковій вертикалі — каса продає на загальному екрані. Тип магазину змінює адміністратор платформи."
				})]
			}),
			/* @__PURE__ */ e("p", {
				className: "text-xs text-sq-muted",
				children: "Букети, списання та передзамовлення зʼявляться тут у наступних версіях модуля."
			})
		]
	});
}
//#endregion
export { i as default };
