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
// src/modules/fiscal-cashalot/manifest.ts
var i = r(() => import("./CashalotTillPage-CVmoFihB.js").then((e) => ({ default: e.CashalotTillPage }))), a = r(() => import("./CashalotAdminPage-CRyy-qqa.js").then((e) => ({ default: e.CashalotAdminPage }))), o = {
	id: "fiscal-cashalot",
	title: "Фіскалізація (Cashalot)",
	shells: [
		"web",
		"cashier",
		"tablet"
	],
	alwaysEnabled: !0,
	routes: [{
		path: "/fiscal/*",
		element: i
	}, {
		path: "fiscal",
		mount: "admin",
		element: a
	}],
	nav: [{
		to: "/fiscal",
		label: "Зміна",
		icon: "ShieldCheck",
		location: "cashier-primary",
		order: 90,
		match: "/fiscal"
	}, {
		to: "/admin/fiscal",
		label: "Фіскалізація",
		location: "admin-sidebar",
		order: 65
	}],
	version: t
};
export { o as manifest };
