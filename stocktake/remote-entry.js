import { n as e, t } from "./sync-CyxwpwU0.js";
import { lazy as n } from "react";
//#region src/platform/version.ts
var r = "2.0.0";
//#endregion
//#region src/modules/lazyWithRetry.ts
async function i(e, { retries: t = 2, backoffMs: n = 400 } = {}) {
	let r;
	for (let i = 0; i <= t; i += 1) try {
		return await e();
	} catch (e) {
		if (r = e, i === t) break;
		await new Promise((e) => setTimeout(e, n * 2 ** i));
	}
	throw r;
}
function a(e, t) {
	return n(() => i(e, t));
}
//#endregion
//#region src/modules/stocktake/remote-entry.ts
var o = {
	id: "stocktake",
	title: "Інвентаризація",
	shells: ["web", "cashier"],
	alwaysEnabled: !0,
	routes: [{
		path: "/stocktake/*",
		element: a(() => import("./StocktakeRoutes-ClfiRiKu.js").then((e) => ({ default: e.StocktakeRoutes })))
	}],
	nav: [{
		to: "/stocktake",
		label: "Інвентаризація",
		icon: "ClipboardCheck",
		location: "cashier-primary",
		order: 70,
		match: "/stocktake"
	}],
	offline: {
		pendingCount: t,
		sync: e
	},
	version: r
};
//#endregion
export { o as manifest };
