import { lazy as e } from "react";
// src/platform/version.ts
var t = "2.7.0";
// src/modules/lazyWithRetry.ts
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
// src/modules/vertical-cafe/manifest.ts
var i = r(() => import("./CafeCatalog-D_RkwdXa.js")), a = r(() => import("./KitchenPage-wPraXHLZ.js")), o = r(() => import("./CafePanels-CP72cm0O.js")), s = r(() => import("./CafeAnalyticsPage-CuMIdswF.js")), c = {
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
		icon: "ChefHat",
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
export { c as manifest };
