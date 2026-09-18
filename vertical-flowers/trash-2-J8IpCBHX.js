import { createElement as e, forwardRef as t } from "react";
//#region node_modules/lucide-react/dist/esm/shared/src/utils.js
var n = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), r = (...e) => e.filter((e, t, n) => !!e && n.indexOf(e) === t).join(" "), i = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, a = t(({ color: t = "currentColor", size: n = 24, strokeWidth: a = 2, absoluteStrokeWidth: o, className: s = "", children: c, iconNode: l, ...u }, d) => e("svg", {
	ref: d,
	...i,
	width: n,
	height: n,
	stroke: t,
	strokeWidth: o ? Number(a) * 24 / Number(n) : a,
	className: r("lucide", s),
	...u
}, [...l.map(([t, n]) => e(t, n)), ...Array.isArray(c) ? c : [c]])), o = (i, o) => {
	let s = t(({ className: t, ...s }, c) => e(a, {
		ref: c,
		iconNode: o,
		className: r(`lucide-${n(i)}`, t),
		...s
	}));
	return s.displayName = `${i}`, s;
}, s = o("Flower2", [
	["path", {
		d: "M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1",
		key: "3pnvol"
	}],
	["circle", {
		cx: "12",
		cy: "8",
		r: "2",
		key: "1822b1"
	}],
	["path", {
		d: "M12 10v12",
		key: "6ubwww"
	}],
	["path", {
		d: "M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z",
		key: "9hd38g"
	}],
	["path", {
		d: "M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z",
		key: "ufn41s"
	}]
]), c = o("Trash2", [
	["path", {
		d: "M3 6h18",
		key: "d0wm0j"
	}],
	["path", {
		d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
		key: "4alrt4"
	}],
	["path", {
		d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
		key: "v07s0e"
	}],
	["line", {
		x1: "10",
		x2: "10",
		y1: "11",
		y2: "17",
		key: "1uufr5"
	}],
	["line", {
		x1: "14",
		x2: "14",
		y1: "11",
		y2: "17",
		key: "xtxkd"
	}]
]);
//#endregion
export { s as n, o as r, c as t };
