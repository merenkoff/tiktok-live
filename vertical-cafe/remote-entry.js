import { lazy as e } from "react";
//#region src/platform/version.ts
var t = "2.2.3";
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
var i = r(() => import("./CafeCatalog-DEL2FDPJ.js")), a = r(() => import("./KitchenPage-Ch_H083T.js")), o = {
	id: "vertical-cafe",
	title: "Кафе",
	shells: ["web", "cashier"],
	alwaysEnabled: !0,
	sales: { Catalog: i },
	routes: [{
		path: "/kitchen/*",
		element: a
	}],
	nav: [{
		to: "/kitchen",
		label: "Кухня",
		icon: "ClipboardList",
		location: "cashier-primary",
		order: 80,
		match: "/kitchen"
	}],
	version: t
};
//#endregion
export { o as manifest };
