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
//#region src/modules/stock/manifest.ts
var i = r(() => import("./StockHubPage-BEQh-pee.js").then((e) => ({ default: e.StockHubPage }))), a = r(() => import("./StockActionPage-BM9z0x7M.js").then((e) => ({ default: e.StockActionPage }))), o = r(() => import("./StockProductionPage-BuUTTrTD.js").then((e) => ({ default: e.StockProductionPage }))), s = r(() => import("./StockInventoryPage-BS2ignMb.js").then((e) => ({ default: e.StockInventoryPage }))), c = r(() => import("./StockHistoryPage-DlyJ35Mc.js").then((e) => ({ default: e.StockHistoryPage }))), l = r(() => import("./StockMovementPage-P1RzhZS6.js").then((e) => ({ default: e.StockMovementPage }))), u = r(() => import("./StockDocumentDetailPage-D00YSBsX.js").then((e) => ({ default: e.StockDocumentDetailPage }))), d = {
	id: "stock",
	title: "Склад",
	defaultEnabled: !0,
	shells: ["web"],
	ownerOnly: !0,
	routes: [
		{
			path: "stock",
			mount: "admin",
			element: i
		},
		{
			path: "stock/receipt",
			mount: "admin",
			element: a,
			props: { type: "receipt" }
		},
		{
			path: "stock/writeoff",
			mount: "admin",
			element: a,
			props: { type: "writeoff" }
		},
		{
			path: "stock/adjust",
			mount: "admin",
			element: a,
			props: { type: "adjustment" }
		},
		{
			path: "stock/production",
			mount: "admin",
			element: o
		},
		{
			path: "stock/inventory",
			mount: "admin",
			element: s
		},
		{
			path: "stock/inventory/:id",
			mount: "admin",
			element: s
		},
		{
			path: "stock/history",
			mount: "admin",
			element: c
		},
		{
			path: "stock/movement",
			mount: "admin",
			element: l
		},
		{
			path: "stock/documents/:id",
			mount: "admin",
			element: u
		}
	],
	nav: [{
		to: "/admin/stock",
		label: "Склад",
		location: "admin-sidebar",
		order: 30
	}],
	version: t
};
//#endregion
export { d as manifest };
