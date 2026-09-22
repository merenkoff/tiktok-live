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
//#region src/modules/returns/manifest.ts
var i = r(() => import("./TillReceiptsPage-ByFN7uJ0.js").then((e) => ({ default: e.TillReceiptsPage }))), a = r(() => import("./AdminSalesPage-DjcDHEtO.js").then((e) => ({ default: e.AdminSalesPage }))), o = (e) => e.shell === "web" && e.role === "owner", s = {
	id: "returns",
	title: "Чеки та повернення",
	defaultEnabled: !0,
	shells: ["web", "cashier"],
	routes: [{
		path: "/sales",
		element: i
	}, {
		path: "sales",
		mount: "admin",
		element: a
	}],
	nav: [
		{
			to: "/admin/sales",
			label: "Продажі",
			icon: "ListOrdered",
			location: "cashier-primary",
			order: 30,
			visible: o
		},
		{
			to: "/sales",
			label: "Чеки",
			icon: "Receipt",
			location: "cashier-primary",
			order: 30,
			visible: (e) => !o(e)
		},
		{
			to: "/admin/sales",
			label: "Продажі",
			location: "admin-sidebar",
			order: 50
		}
	],
	version: t
};
//#endregion
export { s as manifest };
