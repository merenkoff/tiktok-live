import { lazy as e } from "react";
//#region src/platform/version.ts
var t = "2.4.0";
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
//#region src/modules/tables/manifest.ts
var i = r(() => import("./TablesRoutes-BO_xLloI.js").then((e) => ({ default: e.TablesRoutes }))), a = r(() => import("./HallEditorPage-CjzFzcXr.js").then((e) => ({ default: e.HallEditorPage }))), o = {
	id: "tables",
	title: "Столи",
	shells: [
		"web",
		"cashier",
		"tablet"
	],
	alwaysEnabled: !0,
	routes: [{
		path: "/tables/*",
		element: i
	}, {
		path: "tables",
		mount: "admin",
		element: a
	}],
	nav: [{
		to: "/tables",
		label: "Столи",
		icon: "Table",
		location: "cashier-primary",
		order: 60,
		match: "/tables"
	}, {
		to: "/admin/tables",
		label: "Зали і столи",
		location: "admin-sidebar",
		order: 24
	}],
	version: t
};
//#endregion
export { o as manifest };
