import { lazy as e } from "react";
//#region src/platform/version.ts
var t = "2.2.0";
//#endregion
//#region src/modules/lazyWithRetry.ts
async function n(e, { retries: t = 2, backoffMs: n = 400 } = {}) {
	let r;
	for (let i = 0; i <= t; i += 1) try {
		return await e();
	} catch (e) {
		if (r = e, i === t) break;
		await new Promise((e) => setTimeout(e, n * 2 ** i));
	}
	throw r;
}
function r(t, r) {
	return e(() => n(t, r));
}
//#endregion
//#region src/modules/products/manifest.ts
var i = r(() => import("./ProductsPage-UwdjOM2Y.js").then((e) => ({ default: e.ProductsPage }))), a = r(() => import("./ModifiersPage-CkBHO3ui.js").then((e) => ({ default: e.ModifiersPage }))), o = {
	id: "products",
	title: "Товари",
	defaultEnabled: !0,
	shells: ["web"],
	ownerOnly: !0,
	routes: [{
		path: "products",
		mount: "admin",
		element: i
	}, {
		path: "modifiers",
		mount: "admin",
		element: a
	}],
	nav: [
		{
			to: "/admin/products",
			label: "Товари",
			location: "admin-sidebar",
			order: 20
		},
		{
			to: "/admin/modifiers",
			label: "Модифікатори",
			location: "admin-sidebar",
			order: 22
		},
		{
			to: "/admin/products",
			label: "Товари",
			icon: "Package",
			location: "cashier-primary",
			order: 35,
			visible: (e) => e.shell === "web" && e.role === "owner" && e.variant === "rail"
		}
	],
	version: t
};
//#endregion
export { o as manifest };
