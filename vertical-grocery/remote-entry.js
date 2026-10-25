import { lazy as e } from "react";
// src/platform/version.ts
var t = "2.6.3";
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
// src/modules/vertical-grocery/remote-entry.ts
var i = {
	id: "vertical-grocery",
	title: "Продукти",
	shells: [
		"web",
		"cashier",
		"tablet"
	],
	alwaysEnabled: !0,
	sales: { Catalog: r(() => import("./GroceryCatalog-CFGxW7A3.js")) },
	routes: [],
	nav: [],
	version: t
};
export { i as manifest };
