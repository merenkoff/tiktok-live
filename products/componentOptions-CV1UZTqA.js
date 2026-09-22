//#region src/modules/products/components/componentOptions.ts
function e(e, t = {}) {
	let { excludeProductId: n, maxDepth: r = 1 } = t, i = [];
	for (let t of e) if (t.is_active && !(t.kind === "composite" && r <= 1) && (n == null || t.id !== n)) for (let e of t.variants) e.is_active && i.push({
		variant_id: e.id,
		caption: e.label ? `${t.name} · ${e.label}` : t.name,
		unit: e.unit,
		quantity: e.quantity
	});
	return i.sort((e, t) => e.caption.localeCompare(t.caption, "uk"));
}
//#endregion
export { e as t };
