import { lazy as e } from "react";
//#region src/platform/version.ts
var t = "2.3.0";
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
//#region src/modules/vertical-cafe/manifest.ts
var i = r(() => import("./CafeCatalog-AZjtXqjn.js")), a = r(() => import("./KitchenPage-IiWYxnPi.js")), o = r(() => import("./CafePanels-99GsWr7h.js")), s = r(() => import("./CafeAnalyticsPage-kqfP7qYj.js")), c = {
	id: "vertical-cafe",
	title: "Кафе",
	shells: [
		"web",
		"cashier",
		"tablet"
	],
	alwaysEnabled: !0,
	sales: { Catalog: i },
	analytics: { Panels: o },
	routes: [{
		path: "/kitchen/*",
		element: a
	}, {
		path: "cafe",
		mount: "admin",
		element: s
	}],
	nav: [{
		to: "/kitchen",
		label: "Кухня",
		icon: "ClipboardList",
		location: "cashier-primary",
		order: 80,
		match: "/kitchen"
	}, {
		to: "/admin/cafe",
		label: "Кафе",
		location: "admin-sidebar",
		order: 55
	}],
	version: t
};
//#endregion
export { c as manifest };
