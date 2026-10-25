import { n as e, t } from "./sync-D_cQhPeR.js";
import { n, t as r } from "./ids-DKpT3dMP.js";
import { lazy as i } from "react";
// src/platform/version.ts
var a = "2.6.3";
// src/modules/lazyWithRetry.ts
async function o(e, { retries: t = 2, backoffMs: n = 400 } = {}) {
	let r;
	for (let i = 0; i <= t; i += 1) try {
		return await e();
	} catch (e) {
		if (r = e, i === t) break;
		await new Promise((e) => setTimeout(e, n * 2 ** i));
	}
	throw r;
}
function s(e, t) {
	return i(() => o(e, t));
}
// src/modules/debts/manifest.ts
var c = s(() => import("./DebtsRoutes-CD0WrYVT.js").then((e) => ({ default: e.DebtsRoutes }))), l = s(() => import("./CheckoutAction-DzDA1FPI.js")), u = s(() => import("./CustomerPanel-IuWlsd5o.js")), d = s(() => import("./DebtPanels-TT3wKy_O.js")), f = {
	id: r,
	title: "Борги",
	shells: [
		"web",
		"cashier",
		"tablet"
	],
	alwaysEnabled: !0,
	routes: [{
		path: "/debts/*",
		element: c,
		props: { frame: "till" }
	}, {
		path: "debts/*",
		mount: "admin",
		element: c,
		props: { frame: "admin" }
	}],
	nav: [{
		to: "/debts",
		label: "Борги",
		icon: "Wallet",
		location: "cashier-primary",
		order: 55,
		match: "/debts"
	}, {
		to: "/admin/debts",
		label: "Борги",
		icon: "Wallet",
		location: "admin-sidebar",
		order: 42
	}],
	checkout: { Action: l },
	customer: { Panel: u },
	analytics: { Panels: d },
	hardware: { stations: [{
		id: n,
		title: "Квитанції під запис",
		hint: "Квитанція для покупця, коли товар записано під запис. Без принтера квитанція не друкується."
	}] },
	offline: {
		pendingCount: t,
		sync: e
	},
	version: a
};
export { f as manifest };
