import { lazy as e } from "react";
// src/platform/version.ts
var t = "2.6.6";
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
// src/modules/tables/manifest.ts
var i = r(() => import("./TablesRoutes-B-AW_Sms.js").then((e) => ({ default: e.TablesRoutes }))), a = r(() => import("./HallEditorPage-gHuoIDDE.js").then((e) => ({ default: e.HallEditorPage }))), o = {
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
export { o as manifest };
