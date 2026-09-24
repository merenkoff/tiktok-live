import "react";
import { jsx as e, jsxs as t } from "react/jsx-runtime";
//#region src/platform/glyphs.tsx
function n({ size: n = 24, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Flower2",
		...r,
		children: [
			/* @__PURE__ */ e("path", {
				d: "M12 14V21",
				fill: "none",
				stroke: "#EE5B93",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ e("path", {
				d: "M13 18.5C13 16.5 14.5 15 17 15 17 17 15.5 18.5 13 18.5Z",
				fill: "#EE5B93",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ t("g", {
				fill: "#EE5B93",
				children: [
					/* @__PURE__ */ e("circle", {
						cx: "12",
						cy: "5.25",
						r: "3.25"
					}),
					/* @__PURE__ */ e("circle", {
						cx: "15.5",
						cy: "7.75",
						r: "3.25"
					}),
					/* @__PURE__ */ e("circle", {
						cx: "14.25",
						cy: "12",
						r: "3.25"
					}),
					/* @__PURE__ */ e("circle", {
						cx: "9.75",
						cy: "12",
						r: "3.25"
					}),
					/* @__PURE__ */ e("circle", {
						cx: "8.5",
						cy: "7.75",
						r: "3.25"
					})
				]
			}),
			/* @__PURE__ */ e("circle", {
				cx: "12",
				cy: "9",
				r: "2",
				fill: "#FFFFFF",
				fillOpacity: ".75"
			})
		]
	});
}
function r({ size: n = 24, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Store",
		...r,
		children: [
			/* @__PURE__ */ e("path", {
				d: "M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5",
				fill: "#F4386A",
				fillOpacity: ".22",
				stroke: "#F4386A",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ e("rect", {
				x: "10",
				y: "15",
				width: "4",
				height: "6",
				rx: "1",
				fill: "#F4386A"
			}),
			/* @__PURE__ */ e("path", {
				d: "M3 8.5 4.75 4h14.5L21 8.5v1a2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 1-4.5 0Z",
				fill: "#F4386A"
			})
		]
	});
}
function i({ size: t = 20, ...n }) {
	return /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function a({ size: n = 20, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "BookMarked",
		...r,
		children: [/* @__PURE__ */ e("rect", {
			x: "4",
			y: "2",
			width: "12",
			height: "16",
			rx: "2",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ e("path", {
			d: "M8 2v6l2-1.5L12 8V2",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function o({ size: n = 20, ...r }) {
	return n <= 16 ? /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...r,
		children: [
			/* @__PURE__ */ e("rect", {
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
			/* @__PURE__ */ e("path", {
				d: "M6 5l1-2h2l1 2",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ e("circle", {
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
	}) : /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Camera",
		...r,
		children: [
			/* @__PURE__ */ e("rect", {
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
			/* @__PURE__ */ e("path", {
				d: "M7 6 8.25 3.5h3.5L13 6",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ e("circle", {
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
function s({ size: t = 20, ...n }) {
	return /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronDown",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M4.5 8 10 13.5 15.5 8",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function c({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M10 3.5 5.5 8 10 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronLeft",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M12 4.5 6.5 10 12 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function l({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronRight",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M6 3.5 10.5 8 6 12.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ChevronRight",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M8 4.5 13.5 10 8 15.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function u({ size: n = 20, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Delete",
		...r,
		children: [/* @__PURE__ */ e("path", {
			d: "M7 4h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7L2 10Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ e("path", {
			d: "M10 8l4 4M14 8l-4 4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function d({ size: t = 20, ...n }) {
	return /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Folder",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M2 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function f({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Minus",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function p({ size: n = 20, ...r }) {
	return /* @__PURE__ */ e("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "MoreHorizontal",
		...r,
		children: /* @__PURE__ */ t("g", {
			fill: "currentColor",
			children: [
				/* @__PURE__ */ e("circle", {
					cx: "4",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ e("circle", {
					cx: "10",
					cy: "10",
					r: "1.75"
				}),
				/* @__PURE__ */ e("circle", {
					cx: "16",
					cy: "10",
					r: "1.75"
				})
			]
		})
	});
}
function m({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M8 3V13M3 8H13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Plus",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M10 4V16M4 10H16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function h({ size: n = 20, ...r }) {
	return /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Printer",
		...r,
		children: [
			/* @__PURE__ */ e("path", {
				d: "M5 8V3h10v5",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ e("rect", {
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
			/* @__PURE__ */ e("path", {
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
function g({ size: n = 20, ...r }) {
	return n <= 16 ? /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...r,
		children: [/* @__PURE__ */ e("circle", {
			cx: "7",
			cy: "7",
			r: "4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ e("path", {
			d: "M10 10 13 13",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	}) : /* @__PURE__ */ t("svg", {
		width: n,
		height: n,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Search",
		...r,
		children: [/* @__PURE__ */ e("circle", {
			cx: "8.5",
			cy: "8.5",
			r: "5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ e("path", {
			d: "M12.5 12.5 16.5 16.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function _({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Trash2",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M2 4H14M6 4V3h4v1M4 4l.75 9h6.5L12 4",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Trash2",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M3 5H17M8 5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 5l.75 11a1 1 0 0 0 1 1h6.5a1 1 0 0 0 1-1L15 5M8 8.5v5M12 8.5v5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function v({ size: t = 20, ...n }) {
	return t <= 16 ? /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...n,
		children: /* @__PURE__ */ e("path", {
			d: "M4 4 12 12M12 4 4 12",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ e("svg", {
		width: t,
		height: t,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "X",
		...n,
		children: /* @__PURE__ */ e("path", {
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
export { v as _, c as a, n as c, p as d, m as f, _ as g, r as h, s as i, d as l, g as m, a as n, l as o, h as p, o as r, u as s, i as t, f as u };
