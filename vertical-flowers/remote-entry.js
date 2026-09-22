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
//#region src/modules/vertical-flowers/manifest.ts
var i = r(() => import("./ShowcasePage-Cmbo-gX6.js")), a = r(() => import("./FlowerAnalyticsPage-CRKXg11e.js")), o = r(() => import("./FlowersCatalog-L1c5I-If.js")), s = r(() => import("./FlowerPanels-BSJnNihV.js")), c = r(() => import("./FloristLabourCard-Jd-khfoM.js")), l = {
	id: "vertical-flowers",
	title: "Квіти",
	shells: ["web", "cashier"],
	alwaysEnabled: !0,
	sales: { Catalog: o },
	analytics: { Panels: s },
	settings: { Card: c },
	routes: [{
		path: "/flowers/*",
		element: i
	}, {
		path: "flowers",
		mount: "admin",
		element: a
	}],
	nav: [{
		to: "/flowers",
		label: "Вітрина",
		icon: "Flower2",
		location: "cashier-primary",
		order: 80,
		match: "/flowers"
	}, {
		to: "/admin/flowers",
		label: "Квіти",
		location: "admin-sidebar",
		order: 55
	}],
	version: t
};
//#endregion
export { l as manifest };
