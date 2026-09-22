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
//#region src/modules/fiscal-checkbox/manifest.ts
var i = r(() => import("./CheckboxTillPage-ar3dxCz2.js").then((e) => ({ default: e.CheckboxTillPage }))), a = r(() => import("./CheckboxAdminPage-Bg-ffP4j.js").then((e) => ({ default: e.CheckboxAdminPage }))), o = {
	id: "fiscal-checkbox",
	title: "Фіскалізація (Checkbox)",
	shells: ["web", "cashier"],
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
		icon: "Receipt",
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
//#endregion
export { o as manifest };
