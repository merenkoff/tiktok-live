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
//#region src/modules/tiktok-live/manifest.ts
var i = r(() => import("./LiveDeskPage-DjCLjDjw.js").then((e) => ({ default: e.LiveDeskPage }))), a = r(() => import("./LiveSettingsPage-8iLllLuF.js").then((e) => ({ default: e.LiveSettingsPage }))), o = {
	id: "tiktok-live",
	title: "Прямий ефір",
	shells: ["web", "cashier"],
	alwaysEnabled: !0,
	routes: [{
		path: "/live/*",
		element: i
	}, {
		path: "live",
		mount: "admin",
		element: a
	}],
	nav: [{
		to: "/live",
		label: "Ефір",
		icon: "Video",
		location: "cashier-primary",
		order: 85,
		match: "/live"
	}, {
		to: "/admin/live",
		label: "Прямий ефір",
		location: "admin-sidebar",
		order: 60
	}],
	version: t
};
//#endregion
export { o as manifest };
