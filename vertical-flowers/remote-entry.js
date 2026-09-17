import { lazy as e } from "react";
//#region src/platform/version.ts
var t = "2.0.0";
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
//#region src/modules/vertical-flowers/manifest.ts
var i = r(() => import("./FlowersHomePage-DffhguV3.js")), a = {
	id: "vertical-flowers",
	title: "Квіти",
	shells: ["web", "cashier"],
	alwaysEnabled: !0,
	sales: { Catalog: r(() => import("./FlowersCatalog-3PK-qplx.js")) },
	routes: [{
		path: "/flowers/*",
		element: i
	}],
	nav: [{
		to: "/flowers",
		label: "Квіти",
		icon: "Flower2",
		location: "cashier-primary",
		order: 80,
		match: "/flowers"
	}],
	version: t
};
//#endregion
export { a as manifest };
