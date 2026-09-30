import { useCallback as e, useEffect as t, useRef as n, useState as r } from "react";
import { jsx as i, jsxs as a } from "react/jsx-runtime";
import * as o from "@pos/platform";
import { formatUahCompact as s } from "@pos/platform";
import c from "dexie";
//#region src/platform/glyphs.tsx
function l({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ i("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
				x: "17",
				y: "13",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			})
		]
	});
}
function u({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Bell",
		...t,
		children: [/* @__PURE__ */ i("path", {
			d: "M12 3a1.5 1.5 0 0 1 1.5 1.5v.25A6 6 0 0 1 18 10.5V15l2 2.5H4L6 15v-4.5A6 6 0 0 1 10.5 4.75V4.5A1.5 1.5 0 0 1 12 3Z",
			fill: "#F8C00F"
		}), /* @__PURE__ */ i("path", {
			d: "M9.5 19.5a2.5 2.5 0 0 0 5 0Z",
			fill: "#F8C00F",
			fillOpacity: ".6"
		})]
	});
}
function d({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChefHat",
		...t,
		children: [/* @__PURE__ */ a("g", {
			fill: "#F4891F",
			children: [
				/* @__PURE__ */ i("circle", {
					cx: "8",
					cy: "9.5",
					r: "4"
				}),
				/* @__PURE__ */ i("circle", {
					cx: "16",
					cy: "9.5",
					r: "4"
				}),
				/* @__PURE__ */ i("circle", {
					cx: "12",
					cy: "7.5",
					r: "5"
				}),
				/* @__PURE__ */ i("rect", {
					x: "7",
					y: "10",
					width: "10",
					height: "7"
				}),
				/* @__PURE__ */ i("rect", {
					x: "7",
					y: "18",
					width: "10",
					height: "3",
					rx: "1"
				})
			]
		}), /* @__PURE__ */ i("path", {
			d: "M10 13v2.5M14 13v2.5",
			fill: "none",
			stroke: "#FFFFFF",
			strokeOpacity: ".55",
			strokeWidth: "2",
			strokeLinecap: "round"
		})]
	});
}
function f({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Coffee",
		...t,
		children: [
			/* @__PURE__ */ i("path", {
				d: "M8 3.5V6M12 3.5V6",
				fill: "none",
				stroke: "#F4891F",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				strokeOpacity: ".5"
			}),
			/* @__PURE__ */ i("path", {
				d: "M4 9H17V14A5 5 0 0 1 12 19H9A5 5 0 0 1 4 14Z",
				fill: "#F4891F"
			}),
			/* @__PURE__ */ i("path", {
				d: "M17 11h1.5a2.5 2.5 0 0 1 0 5H16.5",
				fill: "none",
				stroke: "#F4891F",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ i("rect", {
				x: "3",
				y: "20",
				width: "15",
				height: "2",
				rx: "1",
				fill: "#F4891F",
				fillOpacity: ".5"
			})
		]
	});
}
function p({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "CreditCard",
		...t,
		children: [
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "5",
				width: "20",
				height: "14",
				rx: "3",
				fill: "#1B9DF0"
			}),
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "8",
				width: "20",
				height: "3",
				fill: "#000000",
				fillOpacity: ".22"
			}),
			/* @__PURE__ */ i("rect", {
				x: "5",
				y: "14",
				width: "5",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".75"
			})
		]
	});
}
function m({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Split",
		...t,
		children: [/* @__PURE__ */ i("rect", {
			x: "2",
			y: "5",
			width: "9",
			height: "14",
			rx: "2.5",
			fill: "#8A6CEF"
		}), /* @__PURE__ */ i("rect", {
			x: "13",
			y: "5",
			width: "9",
			height: "14",
			rx: "2.5",
			fill: "#8A6CEF",
			fillOpacity: ".5"
		})]
	});
}
function h({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Table",
		...t,
		children: [/* @__PURE__ */ i("rect", {
			x: "6",
			y: "6",
			width: "12",
			height: "12",
			rx: "3",
			fill: "#F4891F"
		}), /* @__PURE__ */ a("g", {
			fill: "#F4891F",
			fillOpacity: ".5",
			children: [
				/* @__PURE__ */ i("rect", {
					x: "9",
					y: "2",
					width: "6",
					height: "2",
					rx: "1"
				}),
				/* @__PURE__ */ i("rect", {
					x: "9",
					y: "20",
					width: "6",
					height: "2",
					rx: "1"
				}),
				/* @__PURE__ */ i("rect", {
					x: "2",
					y: "9",
					width: "2",
					height: "6",
					rx: "1"
				}),
				/* @__PURE__ */ i("rect", {
					x: "20",
					y: "9",
					width: "2",
					height: "6",
					rx: "1"
				})
			]
		})]
	});
}
function g({ size: e = 20, ...t }) {
	return /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function _({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function v({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M10 3.5 5.5 8 10 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M12 4.5 6.5 10 12 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function y({ size: e = 20, ...t }) {
	return /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Folder",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function b({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function x({ size: e = 20, ...t }) {
	return /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "MoreHorizontal",
		...t,
		children: /* @__PURE__ */ a("g", {
			fill: "currentColor",
			children: [
				/* @__PURE__ */ i("circle", {
					cx: "4",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ i("circle", {
					cx: "10",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ i("circle", {
					cx: "16",
					cy: "10",
					r: "1.75"
				})
			]
		})
	});
}
function S({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Pencil",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M10.5 3 13 5.5 5.5 13H3v-2.5ZM9 4.5 11.5 7",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Pencil",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M13 3.5 16.5 7 7 16.5H3.5V13ZM11 5.5 14.5 9",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function C({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function w({ size: e = 20, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Printer",
		...t,
		children: [
			/* @__PURE__ */ i("path", {
				d: "M5 8V3h10v5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "8",
				width: "16",
				height: "7",
				rx: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ i("path", {
				d: "M5 13h10v5H5Z",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function T({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...t,
		children: [/* @__PURE__ */ i("circle", {
			cx: "7",
			cy: "7",
			r: "4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ i("path", {
			d: "M10 10 13 13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	}) : /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...t,
		children: [/* @__PURE__ */ i("circle", {
			cx: "8.5",
			cy: "8.5",
			r: "5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ i("path", {
			d: "M12.5 12.5 16.5 16.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function E({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M5 5 15 15M15 5 5 15",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
//#endregion
//#region src/modules/tables/lib/hallMap.ts
function D(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t) n.set(e.table_id, e);
	return e.tables.map((e) => ({
		table: e,
		bill: n.get(e.id) ?? null
	})).filter((e) => e.table.is_active || e.bill != null);
}
function O(e, t = null) {
	return e ? e.precheck_printed_at ? "bill" : t != null && e.opened_by === t ? "mine" : "busy" : "free";
}
function ee(e) {
	return e?.prep_status === "ready" ? "ready" : e?.prep_status === "new" ? "waiting" : null;
}
function te(e) {
	let t = e % 100, n = e % 10;
	return t >= 11 && t <= 14 ? `${e} місць` : n === 1 ? `${e} місце` : n >= 2 && n <= 4 ? `${e} місця` : `${e} місць`;
}
function ne(e) {
	let t = e % 100, n = e % 10;
	return t >= 11 && t <= 14 ? `${e} гостей` : n === 1 ? `${e} гість` : n >= 2 && n <= 4 ? `${e} гості` : `${e} гостей`;
}
function re(e) {
	let t = e % 100, n = e % 10;
	return t >= 11 && t <= 14 ? `${e} позицій` : n === 1 ? `${e} позиція` : n >= 2 && n <= 4 ? `${e} позиції` : `${e} позицій`;
}
function k(e) {
	return s(Math.round(e / 100) * 100);
}
function A(e, t) {
	let n = Math.max(0, Math.floor((new Date(t).getTime() - new Date(e).getTime()) / 6e4));
	return Number.isFinite(n) ? n < 60 ? `${n} хв` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}` : "";
}
function j(e, t) {
	return e.filter((e) => e.is_active || D(e, t).some((e) => e.bill));
}
function M(e) {
	let t = 1, n = 1;
	for (let { table: r } of e) t = Math.max(t, r.pos_x + r.width), n = Math.max(n, r.pos_y + r.height);
	return {
		cols: t,
		rows: n
	};
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function N(e) {
	"@babel/helpers - typeof";
	return N = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, N(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function P(e, t) {
	if (N(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (N(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function F(e) {
	var t = P(e, "string");
	return N(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function I(e, t, n) {
	return (t = F(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/tables/lib/hostPlatform.ts
var L = [
	"api.posRequest",
	"useOfflineStatus",
	"formatUah",
	"formatUahCompact",
	"useSalesCatalog",
	"useVertical",
	"groupsOf",
	"defaultModifierIds",
	"needsModifierSheet",
	"printPrecheck",
	"getMeta",
	"usePosShell"
], R = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), I(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function z(e) {
	return typeof e == "function";
}
function B(e) {
	return e.split(".").reduce((e, t) => e?.[t], o);
}
function V() {
	return L.filter((e) => !z(B(e)));
}
function H(e, t, n) {
	let r = V();
	return r.length > 0 ? Promise.reject(new R(r)) : o.api.posRequest(e, t, n);
}
//#endregion
//#region src/modules/tables/lib/tablesApi.ts
function U() {
	return H("get", "/halls");
}
function W() {
	return H("get", "/bills");
}
function G(e, t) {
	return H("post", "/bills", {
		table_id: e,
		...t ? { guests: t } : {}
	});
}
function K(e) {
	return H("get", `/bills/${e}`);
}
function q(e, t) {
	return H("post", `/bills/${e}/items`, t);
}
function J(e, t, n) {
	return H("patch", `/bills/${e}/items/${t}`, { quantity: n });
}
function ie(e, t, n) {
	return H("patch", `/bills/${e}/items/${t}`, n);
}
function Y(e, t) {
	return H("delete", `/bills/${e}/items/${t}`);
}
function ae(e, t) {
	return H("post", `/bills/${e}/fire`, { client_uuid: t });
}
function oe(e, t) {
	return H("post", `/bills/${e}/rounds/${t}/cancel`);
}
function se(e, t) {
	return H("post", `/bills/${e}/pay`, { parts: t });
}
function ce(e) {
	return H("post", `/bills/${e}/precheck`);
}
function le(e) {
	return H("get", e == null ? "/guest-orders" : `/guest-orders?table_id=${e}`);
}
function ue(e, t = []) {
	return H("post", `/guest-orders/${e}/accept`, t.length > 0 ? { exclude_item_ids: t } : {});
}
function de(e, t) {
	return H("post", `/guest-orders/${e}/reject`, t ? { reason: t } : {});
}
function fe(e) {
	return H("post", "/halls", { name: e });
}
function pe(e, t) {
	return H("patch", `/halls/${e}`, t);
}
function me(e) {
	return H("post", "/tables", e);
}
function he(e, t) {
	return H("patch", `/tables/${e}`, t);
}
function ge(e) {
	return H("patch", "/tables/positions", { positions: e });
}
var X = new class extends c {
	constructor() {
		super("cloth-pos-module-tables"), I(this, "room", void 0), I(this, "bills", void 0), this.version(1).stores({
			room: "id",
			bills: "id, storeId"
		});
	}
}();
async function Z(e, t) {
	try {
		return await e();
	} catch {
		return t;
	}
}
async function _e(e, t) {
	await Z(() => X.room.put({
		id: 1,
		storeId: e,
		...t,
		savedAt: Date.now()
	}), void 0);
}
async function Q(e) {
	return Z(async () => {
		let t = await X.room.get(1);
		return t && t.storeId === e ? t : null;
	}, null);
}
async function ve(e, t) {
	await Z(() => X.bills.put({
		id: t.id,
		storeId: e,
		bill: t,
		savedAt: Date.now()
	}), void 0);
}
async function ye(e, t) {
	return Z(async () => {
		let n = await X.bills.get(t);
		return n && n.storeId === e ? n : null;
	}, null);
}
async function be(e, t) {
	await Z(async () => {
		let n = new Set(t), r = (await X.bills.where("storeId").equals(e).toArray()).filter((e) => !n.has(e.id)).map((e) => e.id);
		r.length > 0 && await X.bills.bulkDelete(r);
	}, void 0);
}
//#endregion
//#region src/modules/tables/lib/useHallMap.ts
var xe = 1e4;
function $(e, t) {
	let n = e?.response?.data;
	return n && typeof n.error == "string" ? n.error : t;
}
function Se({ online: i, mirrored: a = !1, storeId: o = null }) {
	let [s, c] = r([]), [l, u] = r([]), [d, f] = r(() => (/* @__PURE__ */ new Date()).toISOString()), [p, m] = r(!0), [h, g] = r(null), [_, v] = r(!1), [y, b] = r(null), x = n(!0);
	t(() => (x.current = !0, () => {
		x.current = !1;
	}), []);
	let S = e(async () => {
		if (!a || o == null) return !1;
		let e = await Q(o);
		return !e || !x.current ? !1 : (c(e.halls), u(e.bills), f(e.now), v(!0), b(e.savedAt), m(!1), !0);
	}, [a, o]), C = e(async () => {
		try {
			let [e, t] = await Promise.all([U(), W()]);
			if (!x.current) return;
			c(e.halls), u(t.bills), f((/* @__PURE__ */ new Date()).toISOString()), g(null), v(!1), b(null), a && o != null && (_e(o, {
				halls: e.halls,
				bills: t.bills,
				now: (/* @__PURE__ */ new Date()).toISOString()
			}), be(o, t.bills.map((e) => e.id)));
		} catch (e) {
			if (!x.current) return;
			let t = await S();
			x.current && !t && g($(e, "Не вдалося прочитати зал"));
		} finally {
			x.current && m(!1);
		}
	}, [
		S,
		a,
		o
	]);
	return t(() => {
		i || (async () => {
			let e = await S();
			x.current && !e && m(!1);
		})();
	}, [i, S]), t(() => {
		if (!i) return;
		C();
		let e = setInterval(() => {
			typeof document < "u" && document.visibilityState !== "visible" || C();
		}, xe);
		return () => clearInterval(e);
	}, [i, C]), {
		halls: s,
		bills: l,
		now: d,
		loading: p,
		error: h,
		stale: _,
		savedAt: y,
		refresh: C
	};
}
//#endregion
export { te as A, v as B, he as C, ee as D, M as E, g as F, x as G, p as H, l as I, w as J, S as K, u as L, O as M, k as N, re as O, j as P, E as Q, _ as R, ie as S, ne as T, y as U, f as V, b as W, m as X, T as Y, h as Z, de as _, ue as a, J as b, fe as c, K as d, le as f, se as g, ge as h, ve as i, D as j, A as k, me as l, ce as m, Se as n, q as o, U as p, C as q, ye as r, oe as s, $ as t, ae as u, Y as v, H as w, pe as x, G as y, d as z };
