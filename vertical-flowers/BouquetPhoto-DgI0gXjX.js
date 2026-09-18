import { r as e, t } from "./trash-2-J8IpCBHX.js";
import { useCallback as n, useEffect as r, useRef as i, useState as a } from "react";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
import { api as c, assetUrl as l } from "@pos/platform";
//#region node_modules/lucide-react/dist/esm/icons/camera.js
var u = e("Camera", [["path", {
	d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
	key: "1tc9qg"
}], ["circle", {
	cx: "12",
	cy: "13",
	r: "3",
	key: "1vg3eu"
}]]), d = e("ImagePlus", [
	["path", {
		d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7",
		key: "31hg93"
	}],
	["line", {
		x1: "16",
		x2: "22",
		y1: "5",
		y2: "5",
		key: "ez7e4s"
	}],
	["line", {
		x1: "19",
		x2: "19",
		y1: "2",
		y2: "8",
		key: "1gkr8c"
	}],
	["circle", {
		cx: "9",
		cy: "9",
		r: "2",
		key: "af1f0g"
	}],
	["path", {
		d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21",
		key: "1xmnt7"
	}]
]), f = 1280, p = .8;
async function m(e) {
	let t = await createImageBitmap(e);
	try {
		let n = Math.min(1, f / Math.max(t.width, t.height));
		if (n === 1 && e.type === "image/jpeg") return e;
		let r = document.createElement("canvas");
		r.width = Math.round(t.width * n), r.height = Math.round(t.height * n);
		let i = r.getContext("2d");
		if (!i) return e;
		i.drawImage(t, 0, 0, r.width, r.height);
		let a = await new Promise((e) => r.toBlob(e, "image/jpeg", p));
		return a ? new File([a], "bouquet.jpg", { type: "image/jpeg" }) : e;
	} finally {
		t.close();
	}
}
function h({ value: e, onChange: f, disabled: h }) {
	let g = i(null), [_, v] = a(!1), [y, b] = a(null), [x, S] = a(null), C = i(null), w = n(() => {
		S((e) => (e?.getTracks().forEach((e) => e.stop()), null));
	}, []);
	r(() => w, [w]), r(() => {
		x && C.current && (C.current.srcObject = x);
	}, [x]);
	let T = n(async (e) => {
		v(!0), b(null);
		try {
			let { url: t } = await c.uploadBouquetPhoto(await m(e));
			f(t);
		} catch (e) {
			let t = e.response?.data?.error;
			b(t || "Не вдалося завантажити фото");
		} finally {
			v(!1), g.current && (g.current.value = "");
		}
	}, [f]);
	async function E() {
		b(null);
		try {
			let e = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
			S(e);
		} catch {
			g.current?.click();
		}
	}
	async function D() {
		let e = C.current;
		if (!e) return;
		let t = document.createElement("canvas");
		t.width = e.videoWidth, t.height = e.videoHeight, t.getContext("2d")?.drawImage(e, 0, 0), w();
		let n = await new Promise((e) => t.toBlob(e, "image/jpeg", p));
		n && await T(new File([n], "bouquet.jpg", { type: "image/jpeg" }));
	}
	return /* @__PURE__ */ s("div", {
		className: "space-y-2",
		"data-testid": "bouquet-photo",
		children: [
			/* @__PURE__ */ s("div", {
				className: "flex items-start gap-3",
				children: [/* @__PURE__ */ o("div", {
					className: "w-20 h-20 rounded-sq border border-sq-divider bg-sq-bg overflow-hidden grid place-items-center shrink-0",
					children: e ? /* @__PURE__ */ o("img", {
						src: l(e) ?? void 0,
						alt: "",
						className: "w-full h-full object-cover"
					}) : /* @__PURE__ */ o(d, {
						size: 24,
						className: "text-sq-muted",
						strokeWidth: 1.5
					})
				}), /* @__PURE__ */ s("div", {
					className: "flex flex-col gap-1.5 min-w-0",
					children: [
						/* @__PURE__ */ o("input", {
							ref: g,
							type: "file",
							accept: "image/jpeg,image/png,image/webp",
							capture: "environment",
							className: "hidden",
							onChange: (e) => {
								let t = e.target.files?.[0];
								t && T(t);
							},
							"data-testid": "bouquet-photo-input"
						}),
						/* @__PURE__ */ s("button", {
							type: "button",
							disabled: h || _,
							onClick: () => void E(),
							className: "min-h-11 px-3 rounded-sq border border-sq-divider text-sm flex items-center gap-2 disabled:opacity-50",
							"data-testid": "bouquet-photo-shoot",
							children: [/* @__PURE__ */ o(u, { size: 16 }), _ ? "Завантаження…" : e ? "Зняти ще раз" : "Зняти букет"]
						}),
						e && /* @__PURE__ */ s("button", {
							type: "button",
							disabled: h || _,
							onClick: () => f(null),
							className: "inline-flex items-center gap-1.5 text-sm text-red-600 disabled:opacity-50",
							children: [/* @__PURE__ */ o(t, { size: 14 }), "Прибрати"]
						})
					]
				})]
			}),
			y && /* @__PURE__ */ o("p", {
				className: "text-xs text-red-600",
				"data-testid": "bouquet-photo-error",
				children: y
			}),
			x && /* @__PURE__ */ s("div", {
				className: "fixed inset-0 z-[60] bg-black flex flex-col",
				children: [/* @__PURE__ */ o("video", {
					ref: C,
					autoPlay: !0,
					playsInline: !0,
					muted: !0,
					className: "flex-1 min-h-0 w-full object-contain"
				}), /* @__PURE__ */ s("div", {
					className: "p-4 flex items-center gap-3 bg-black",
					children: [/* @__PURE__ */ o("button", {
						type: "button",
						onClick: w,
						className: "min-h-12 px-4 rounded-sq border border-white/30 text-white",
						children: "Скасувати"
					}), /* @__PURE__ */ o("button", {
						type: "button",
						onClick: () => void D(),
						className: "sq-btn-primary min-h-12 flex-1",
						"data-testid": "bouquet-photo-capture",
						children: "Зняти"
					})]
				})]
			})
		]
	});
}
//#endregion
export { u as n, h as t };
