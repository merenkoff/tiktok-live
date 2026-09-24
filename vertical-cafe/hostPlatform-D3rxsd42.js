import { useId as e } from "react";
import { jsx as t, jsxs as n } from "react/jsx-runtime";
import * as r from "@pos/platform";
//#region src/platform/glyphs.tsx
var i = () => e().replace(/:/g, "") + "-";
function a({ size: e = 24, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "AlertTriangle",
		...r,
		children: [
			/* @__PURE__ */ t("path", {
				d: "M12 3.5c.5 0 1 .25 1.25.75l8 14A1.5 1.5 0 0 1 20 20.5H4a1.5 1.5 0 0 1-1.25-2.25l8-14c.25-.5.75-.75 1.25-.75Z",
				fill: "#F4891F"
			}),
			/* @__PURE__ */ t("rect", {
				x: "11",
				y: "9",
				width: "2",
				height: "6",
				rx: "1",
				fill: "#FFFFFF"
			}),
			/* @__PURE__ */ t("circle", {
				cx: "12",
				cy: "17.25",
				r: "1.25",
				fill: "#FFFFFF"
			})
		]
	});
}
function o({ size: e = 24, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChefHat",
		...r,
		children: [/* @__PURE__ */ n("g", {
			fill: "#F4891F",
			children: [
				/* @__PURE__ */ t("circle", {
					cx: "8",
					cy: "9.5",
					r: "4"
				}),
				/* @__PURE__ */ t("circle", {
					cx: "16",
					cy: "9.5",
					r: "4"
				}),
				/* @__PURE__ */ t("circle", {
					cx: "12",
					cy: "7.5",
					r: "5"
				}),
				/* @__PURE__ */ t("rect", {
					x: "7",
					y: "10",
					width: "10",
					height: "7"
				}),
				/* @__PURE__ */ t("rect", {
					x: "7",
					y: "18",
					width: "10",
					height: "3",
					rx: "1"
				})
			]
		}), /* @__PURE__ */ t("path", {
			d: "M10 13v2.5M14 13v2.5",
			fill: "none",
			stroke: "#FFFFFF",
			strokeOpacity: ".55",
			strokeWidth: "2",
			strokeLinecap: "round"
		})]
	});
}
function s({ size: e = 24, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Coffee",
		...r,
		children: [
			/* @__PURE__ */ t("path", {
				d: "M8 3.5V6M12 3.5V6",
				fill: "none",
				stroke: "#F4891F",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				strokeOpacity: ".5"
			}),
			/* @__PURE__ */ t("path", {
				d: "M4 9H17V14A5 5 0 0 1 12 19H9A5 5 0 0 1 4 14Z",
				fill: "#F4891F"
			}),
			/* @__PURE__ */ t("path", {
				d: "M17 11h1.5a2.5 2.5 0 0 1 0 5H16.5",
				fill: "none",
				stroke: "#F4891F",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ t("rect", {
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
function c({ size: e = 24, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Puzzle",
		...r,
		children: [
			/* @__PURE__ */ t("rect", {
				x: "4",
				y: "7",
				width: "13",
				height: "13",
				rx: "2.5",
				fill: "#8E9196"
			}),
			/* @__PURE__ */ t("circle", {
				cx: "10.5",
				cy: "6",
				r: "2.75",
				fill: "#8E9196"
			}),
			/* @__PURE__ */ t("circle", {
				cx: "18",
				cy: "13.5",
				r: "2.75",
				fill: "#8E9196"
			})
		]
	});
}
function l({ size: e = 24, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Repeat",
		...r,
		children: [/* @__PURE__ */ t("path", {
			d: "M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3",
			fill: "none",
			stroke: "#8A6CEF",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ t("path", {
			d: "M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3",
			fill: "none",
			stroke: "#8A6CEF",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function u({ size: e = 24, ...n }) {
	return /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Star",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M12 3.5 14.5 9 20.5 9.5 16.5 14 17.5 20 12 17 6.5 20 7.5 14 3.5 9.5 9.5 9Z",
			fill: "#F8C00F",
			stroke: "#F8C00F",
			strokeWidth: "2",
			strokeLinejoin: "round"
		})
	});
}
function d({ size: e = 24, ...r }) {
	let a = i();
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "WifiOff",
		...r,
		children: [
			/* @__PURE__ */ n("mask", {
				id: a + "cut",
				maskUnits: "userSpaceOnUse",
				x: "0",
				y: "0",
				width: "24",
				height: "24",
				children: [/* @__PURE__ */ t("rect", {
					x: "0",
					y: "0",
					width: "24",
					height: "24",
					fill: "#FFFFFF"
				}), /* @__PURE__ */ t("path", {
					d: "M4 4 20 20",
					stroke: "#000000",
					strokeWidth: "5",
					strokeLinecap: "round"
				})]
			}),
			/* @__PURE__ */ n("g", {
				mask: "url(#" + a + "cut)",
				children: [/* @__PURE__ */ t("path", {
					d: "M5.25 11.25a9.5 9.5 0 0 1 13.5 0M8.5 14.5a5 5 0 0 1 7 0",
					fill: "none",
					stroke: "#6C7D93",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ t("circle", {
					cx: "12",
					cy: "18.5",
					r: "1.75",
					fill: "#6C7D93"
				})]
			}),
			/* @__PURE__ */ t("path", {
				d: "M4 4 20 20",
				fill: "none",
				stroke: "#6C7D93",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function f({ size: e = 20, ...n }) {
	return /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function p({ size: e = 20, ...r }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...r,
		children: [
			/* @__PURE__ */ t("rect", {
				x: "2",
				y: "5",
				width: "12",
				height: "9",
				rx: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ t("path", {
				d: "M6 5l1-2h2l1 2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ t("circle", {
				cx: "8",
				cy: "9.5",
				r: "2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...r,
		children: [
			/* @__PURE__ */ t("rect", {
				x: "2",
				y: "6",
				width: "16",
				height: "11",
				rx: "2.5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ t("path", {
				d: "M7 6 8.25 3.5h3.5L13 6",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ t("circle", {
				cx: "10",
				cy: "11.5",
				r: "3",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	});
}
function m({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function h({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M10 3.5 5.5 8 10 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M12 4.5 6.5 10 12 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function g({ size: e = 20, ...r }) {
	return /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Clock",
		...r,
		children: [/* @__PURE__ */ t("circle", {
			cx: "10",
			cy: "10",
			r: "7",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ t("path", {
			d: "M10 6v4l2.5 2.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function _({ size: e = 20, ...n }) {
	return /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Folder",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function v({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function y({ size: e = 20, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "MoreHorizontal",
		...r,
		children: /* @__PURE__ */ n("g", {
			fill: "currentColor",
			children: [
				/* @__PURE__ */ t("circle", {
					cx: "4",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ t("circle", {
					cx: "10",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ t("circle", {
					cx: "16",
					cy: "10",
					r: "1.75"
				})
			]
		})
	});
}
function b({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Pencil",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M10.5 3 13 5.5 5.5 13H3v-2.5ZM9 4.5 11.5 7",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Pencil",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M13 3.5 16.5 7 7 16.5H3.5V13ZM11 5.5 14.5 9",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function x({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function S({ size: e = 20, ...r }) {
	return e <= 16 ? /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...r,
		children: [/* @__PURE__ */ t("circle", {
			cx: "7",
			cy: "7",
			r: "4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ t("path", {
			d: "M10 10 13 13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	}) : /* @__PURE__ */ n("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...r,
		children: [/* @__PURE__ */ t("circle", {
			cx: "8.5",
			cy: "8.5",
			r: "5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ t("path", {
			d: "M12.5 12.5 16.5 16.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function C({ size: e = 20, ...n }) {
	return e <= 16 ? /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...n,
		children: /* @__PURE__ */ t("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ t("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...n,
		children: /* @__PURE__ */ t("path", {
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
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function w(e) {
	"@babel/helpers - typeof";
	return w = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, w(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function T(e, t) {
	if (w(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (w(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function E(e) {
	var t = T(e, "string");
	return w(t) == "symbol" ? t : t + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function D(e, t, n) {
	return (t = E(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
//#endregion
//#region src/modules/vertical-cafe/lib/hostPlatform.ts
var O = [
	"useSalesCatalog",
	"useCartStore",
	"useVertical",
	"assetUrl",
	"resolveLineModifiers",
	"lineCaption",
	"cartLineUid",
	"defaultModifierIds",
	"needsModifierSheet",
	"groupsOf",
	"useOfflineStatus",
	"api.posRequest"
], k = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), D(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function A(e) {
	return typeof e == "function";
}
function j(e) {
	return e.split(".").reduce((e, t) => e?.[t], r);
}
function M() {
	return O.filter((e) => !A(j(e)));
}
function N(e, t, n) {
	let i = M();
	return i.length > 0 ? Promise.reject(new k(i)) : r.api.posRequest(e, t, n);
}
async function P() {
	let e = j("cashierApi.refreshCatalog");
	A(e) && await e();
}
//#endregion
export { C, d as S, x as _, a, S as b, m as c, g as d, s as f, b as g, y as h, P as i, o as l, v as m, M as n, f as o, _ as p, N as r, p as s, k as t, h as u, c as v, u as x, l as y };
