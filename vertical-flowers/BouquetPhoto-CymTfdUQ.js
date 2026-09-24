import { g as e, r as t } from "./glyphs-yCl9Zx5o.js";
import { useCallback as n, useEffect as r, useRef as i, useState as a } from "react";
import { jsx as o, jsxs as s } from "react/jsx-runtime";
import { api as c, assetUrl as l } from "@pos/platform";
//#region src/modules/vertical-flowers/bench/BouquetPhoto.tsx
var u = 1280, d = .8;
async function f(e) {
	let t = await createImageBitmap(e);
	try {
		let n = Math.min(1, u / Math.max(t.width, t.height));
		if (n === 1 && e.type === "image/jpeg") return e;
		let r = document.createElement("canvas");
		r.width = Math.round(t.width * n), r.height = Math.round(t.height * n);
		let i = r.getContext("2d");
		if (!i) return e;
		i.drawImage(t, 0, 0, r.width, r.height);
		let a = await new Promise((e) => r.toBlob(e, "image/jpeg", d));
		return a ? new File([a], "bouquet.jpg", { type: "image/jpeg" }) : e;
	} finally {
		t.close();
	}
}
function p({ value: u, onChange: p, disabled: m }) {
	let h = i(null), [g, _] = a(!1), [v, y] = a(null), [b, x] = a(null), S = i(null), C = n(() => {
		x((e) => (e?.getTracks().forEach((e) => e.stop()), null));
	}, []);
	r(() => C, [C]), r(() => {
		b && S.current && (S.current.srcObject = b);
	}, [b]);
	let w = n(async (e) => {
		_(!0), y(null);
		try {
			let { url: t } = await c.uploadBouquetPhoto(await f(e));
			p(t);
		} catch (e) {
			let t = e.response?.data?.error;
			y(t || "Не вдалося завантажити фото");
		} finally {
			_(!1), h.current && (h.current.value = "");
		}
	}, [p]);
	async function T() {
		y(null);
		try {
			let e = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
			x(e);
		} catch {
			h.current?.click();
		}
	}
	async function E() {
		let e = S.current;
		if (!e) return;
		let t = document.createElement("canvas");
		t.width = e.videoWidth, t.height = e.videoHeight, t.getContext("2d")?.drawImage(e, 0, 0), C();
		let n = await new Promise((e) => t.toBlob(e, "image/jpeg", d));
		n && await w(new File([n], "bouquet.jpg", { type: "image/jpeg" }));
	}
	return /* @__PURE__ */ s("div", {
		className: "space-y-2",
		"data-testid": "bouquet-photo",
		children: [
			/* @__PURE__ */ s("div", {
				className: "flex items-center gap-3.5",
				children: [/* @__PURE__ */ o("div", {
					className: "w-24 h-24 rounded-[14px] bg-sq-sidebar ring-1 ring-inset ring-sq-divider overflow-hidden grid place-items-center shrink-0",
					children: u ? /* @__PURE__ */ o("img", {
						src: l(u) ?? void 0,
						alt: "",
						className: "w-full h-full object-cover"
					}) : /* @__PURE__ */ o(t, {
						size: 20,
						className: "text-sq-muted"
					})
				}), /* @__PURE__ */ s("div", {
					className: "flex flex-col items-start gap-1.5 min-w-0",
					children: [
						/* @__PURE__ */ o("input", {
							ref: h,
							type: "file",
							accept: "image/jpeg,image/png,image/webp",
							capture: "environment",
							className: "hidden",
							onChange: (e) => {
								let t = e.target.files?.[0];
								t && w(t);
							},
							"data-testid": "bouquet-photo-input"
						}),
						/* @__PURE__ */ s("button", {
							type: "button",
							disabled: m || g,
							onClick: () => void T(),
							className: "min-h-10 px-3.5 rounded-[10px] bg-sq-empty text-[15px] font-semibold text-sq-text flex items-center gap-2 disabled:opacity-50 hover:bg-sq-selected",
							"data-testid": "bouquet-photo-shoot",
							children: [/* @__PURE__ */ o(t, { size: 20 }), g ? "Завантаження…" : u ? "Зняти ще раз" : "Зняти букет"]
						}),
						!u && /* @__PURE__ */ o("span", {
							className: "text-[13px] text-sq-muted",
							children: "Фото допоможе знайти його на вітрині"
						}),
						u && /* @__PURE__ */ s("button", {
							type: "button",
							disabled: m || g,
							onClick: () => p(null),
							className: "inline-flex items-center gap-1.5 text-sm text-red-600 disabled:opacity-50",
							children: [/* @__PURE__ */ o(e, { size: 16 }), "Прибрати"]
						})
					]
				})]
			}),
			v && /* @__PURE__ */ o("p", {
				className: "text-xs text-red-600",
				"data-testid": "bouquet-photo-error",
				children: v
			}),
			b && /* @__PURE__ */ s("div", {
				className: "fixed inset-0 z-[60] bg-black flex flex-col",
				children: [/* @__PURE__ */ o("video", {
					ref: S,
					autoPlay: !0,
					playsInline: !0,
					muted: !0,
					className: "flex-1 min-h-0 w-full object-contain"
				}), /* @__PURE__ */ s("div", {
					className: "p-4 flex items-center gap-3 bg-black",
					children: [/* @__PURE__ */ o("button", {
						type: "button",
						onClick: C,
						className: "min-h-12 px-4 rounded-xl ring-1 ring-white/30 text-white font-semibold",
						children: "Скасувати"
					}), /* @__PURE__ */ o("button", {
						type: "button",
						onClick: () => void E(),
						className: "pos-btn-primary min-h-12 rounded-xl flex-1",
						"data-testid": "bouquet-photo-capture",
						children: "Зняти"
					})]
				})]
			})
		]
	});
}
//#endregion
export { p as t };
