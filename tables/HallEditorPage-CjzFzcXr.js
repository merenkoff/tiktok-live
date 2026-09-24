import { E as e, H as t, K as n, b as r, c as i, d as a, j as o, p as s, s as c, t as l, v as u } from "./useHallMap-CRa5TiH2.js";
import { useCallback as d, useEffect as f, useMemo as p, useRef as m, useState as h } from "react";
import { jsx as g, jsxs as _ } from "react/jsx-runtime";
import { Link as v } from "react-router-dom";
//#region src/components/ui/Page.tsx
function y({ title: e, glyph: t, subtitle: n, actions: r, back: i }) {
	return /* @__PURE__ */ _("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			i && /* @__PURE__ */ _(v, {
				to: i.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ g(o, { size: 20 }), i.label]
			}),
			/* @__PURE__ */ _("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					t && /* @__PURE__ */ g(t, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ g("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					r && /* @__PURE__ */ g("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: r
					})
				]
			}),
			n && /* @__PURE__ */ g("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: n
			})
		]
	});
}
function b({ value: e, options: t, onChange: n, ariaLabel: r, className: i = "" }) {
	let a = i.includes("w-full");
	return /* @__PURE__ */ g("div", {
		className: `inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${i}`,
		role: "group",
		"aria-label": r,
		children: t.map((t) => {
			let r = t.value === e;
			return /* @__PURE__ */ g("button", {
				type: "button",
				"aria-pressed": r,
				onClick: () => n(t.value),
				"data-testid": t.testId,
				className: `min-h-[34px] px-3.5 rounded-[9px] text-[15px] whitespace-nowrap transition-colors ${a ? "flex-1" : ""} ${r ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary hover:text-sq-text"}`,
				children: t.label
			}, t.value);
		})
	});
}
function x(e, t, n = 72) {
	return {
		dx: Math.round(e / n),
		dy: Math.round(t / n)
	};
}
function S(e, t) {
	return {
		pos_x: Math.min(Math.max(0, e.pos_x + t.dx), 200 - e.width),
		pos_y: Math.min(Math.max(0, e.pos_y + t.dy), 200 - e.height)
	};
}
function C(e, t = 2) {
	let n = 4, r = 3;
	for (let t of e) n = Math.max(n, t.pos_x + t.width), r = Math.max(r, t.pos_y + t.height);
	return {
		cols: Math.min(n + t, 200),
		rows: Math.min(r + t, 200)
	};
}
function w(e, t) {
	let n = new Map(e.map((e) => [e.id, e])), r = [];
	for (let e of t) {
		let t = n.get(e.id);
		t && t.pos_x === e.pos_x && t.pos_y === e.pos_y && t.width === e.width && t.height === e.height || r.push({
			id: e.id,
			pos_x: e.pos_x,
			pos_y: e.pos_y,
			width: e.width,
			height: e.height
		});
	}
	return r;
}
function T(e, t, n) {
	return e.map((e) => e.id === t ? {
		...e,
		...n
	} : e);
}
//#endregion
//#region src/modules/tables/lib/useTableDrag.ts
var E = 6;
function D(e) {
	let [t, n] = h({
		id: null,
		dx: 0,
		dy: 0
	}), r = m(!1);
	return {
		drag: t,
		start: d((t, i) => {
			if (t.button !== 0) return;
			let a = t.currentTarget, o = t.clientX, s = t.clientY, c = t.pointerId;
			r.current = !1, n({
				id: i,
				dx: 0,
				dy: 0
			});
			let l = (e) => {
				if (e.pointerId !== c) return;
				let t = e.clientX - o, l = e.clientY - s;
				if (!r.current && Math.hypot(t, l) > E) {
					r.current = !0;
					try {
						a.setPointerCapture(c);
					} catch {}
				}
				r.current && n({
					id: i,
					dx: t,
					dy: l
				});
			}, u = (t) => {
				if (t.pointerId !== c) return;
				window.removeEventListener("pointermove", l), window.removeEventListener("pointerup", u), window.removeEventListener("pointercancel", u);
				let a = t.clientX - o, d = t.clientY - s;
				n({
					id: null,
					dx: 0,
					dy: 0
				}), r.current && e(i, a, d);
			};
			window.addEventListener("pointermove", l), window.addEventListener("pointerup", u), window.addEventListener("pointercancel", u);
		}, [e]),
		suppressClick: d(() => r.current ? (r.current = !1, !0) : !1, [])
	};
}
//#endregion
//#region src/modules/tables/pages/HallEditorPage.tsx
var O = {
	name: "",
	seats: 2,
	width: 2,
	height: 2,
	shape: "rect"
};
function k() {
	let [o, m] = h([]), [v, E] = h(null), [k, A] = h(!0), [j, M] = h(null), [N, P] = h(!1), [F, I] = h(null), [L, R] = h(O), [z, B] = h(""), V = d(async () => {
		try {
			let { halls: e } = await a();
			m(e);
		} catch (e) {
			M(l(e, "Не вдалося прочитати зали"));
		} finally {
			A(!1);
		}
	}, []);
	f(() => {
		V();
	}, [V]);
	let H = o.find((e) => e.id === v) ?? o[0] ?? null, U = p(() => H?.tables ?? [], [H]), W = p(() => C(U), [U]);
	async function G(e) {
		if (N) return !1;
		P(!0), M(null);
		try {
			return await e(), await V(), !0;
		} catch (e) {
			return await V(), M(l(e, "Не вдалося зберегти")), !1;
		} finally {
			P(!1);
		}
	}
	let { drag: K, start: q, suppressClick: J } = D(d((e, t, n) => {
		if (!H) return;
		let r = H.tables.find((t) => t.id === e);
		if (!r) return;
		let i = S(r, x(t, n)), a = T(H.tables, e, i), o = w(H.tables, a);
		o.length !== 0 && (m((e) => e.map((e) => e.id === H.id ? {
			...e,
			tables: a
		} : e)), G(() => s(o)));
	}, [H, N]));
	function Y(e) {
		I(e.id), R({
			name: e.name,
			seats: e.seats,
			width: e.width,
			height: e.height,
			shape: e.shape
		});
	}
	async function X() {
		H && await G(() => F === "new" ? i({
			...L,
			hall_id: H.id,
			pos_x: 0,
			pos_y: 0
		}) : r(F, L)) && I(null);
	}
	return k ? /* @__PURE__ */ g("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	}) : /* @__PURE__ */ _("div", {
		className: "animate-fade-up text-sq-text",
		"data-testid": "hall-editor",
		children: [
			/* @__PURE__ */ g(y, {
				glyph: n,
				title: "Зали і столи",
				subtitle: H ? "Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити." : void 0,
				actions: H && /* @__PURE__ */ _("button", {
					type: "button",
					className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5",
					"data-testid": "editor-table-add",
					disabled: N,
					onClick: () => {
						I("new"), R(O);
					},
					children: [/* @__PURE__ */ g(t, { size: 20 }), "Стіл"]
				})
			}),
			/* @__PURE__ */ _("div", {
				className: "mb-4 flex flex-wrap items-center gap-3",
				children: [
					o.length > 0 && /* @__PURE__ */ g(b, {
						value: String(H?.id ?? ""),
						options: o.map((e) => ({
							value: String(e.id),
							label: `${e.name}${e.is_active ? "" : " · прибрано"}`,
							testId: `editor-hall-${e.id}`
						})),
						onChange: (e) => E(Number(e))
					}),
					H && /* @__PURE__ */ g("button", {
						type: "button",
						className: "min-h-11 text-[15px] font-semibold text-sq-blue disabled:opacity-50",
						"data-testid": "editor-hall-retire",
						disabled: N,
						onClick: () => void G(() => u(H.id, { is_active: !H.is_active })),
						children: H.is_active ? "Прибрати залу" : "Повернути залу"
					}),
					/* @__PURE__ */ _("div", {
						className: "ml-auto flex items-center gap-2",
						children: [/* @__PURE__ */ g("input", {
							className: "sq-input w-44",
							"data-testid": "editor-hall-name",
							placeholder: "Нова зала",
							value: z,
							onChange: (e) => B(e.target.value)
						}), /* @__PURE__ */ g("button", {
							type: "button",
							className: "sq-btn-quiet whitespace-nowrap",
							"data-testid": "editor-hall-add",
							disabled: N || z.trim().length === 0,
							onClick: () => {
								let e = z.trim();
								B(""), G(() => c(e));
							},
							children: "Додати залу"
						})]
					})
				]
			}),
			j && /* @__PURE__ */ g("p", {
				className: "mb-4 rounded-sq bg-red-50 text-red-700 px-3.5 py-2.5 text-sm",
				"data-testid": "editor-banner",
				children: j
			}),
			!H && /* @__PURE__ */ _("div", {
				className: "py-14 text-center",
				"data-testid": "editor-empty",
				children: [
					/* @__PURE__ */ g(n, {
						size: 48,
						className: "mx-auto"
					}),
					/* @__PURE__ */ g("p", {
						className: "mt-3 text-[17px] font-semibold text-sq-heading",
						children: "Залів ще немає"
					}),
					/* @__PURE__ */ g("p", {
						className: "mt-1 text-[15px] text-sq-secondary",
						children: "Додайте залу — і перетягніть у неї столи так, як вони стоять насправді."
					})
				]
			}),
			H && /* @__PURE__ */ g("div", {
				className: "relative overflow-auto rounded-card bg-sq-sidebar p-3",
				"data-testid": "editor-grid",
				style: {
					display: "grid",
					gridTemplateColumns: `repeat(${W.cols}, 72px)`,
					gridAutoRows: "72px",
					gap: "4px"
				},
				children: U.map((t) => {
					let n = K.id === t.id;
					return /* @__PURE__ */ _("button", {
						type: "button",
						"data-testid": `editor-table-${t.id}`,
						"data-dragging": n ? "yes" : "no",
						onPointerDown: (e) => q(e, t.id),
						onClick: (e) => {
							if (J()) {
								e.preventDefault();
								return;
							}
							Y(t);
						},
						className: `flex flex-col items-center justify-center gap-0.5 p-2 text-center transition-shadow ${t.shape === "round" ? "rounded-full" : "rounded-card"} ${t.is_active ? n || F === t.id ? "bg-white ring-2 ring-sq-blue shadow-card-hover" : "bg-white ring-1 ring-sq-divider shadow-card" : "bg-sq-empty opacity-60"}`,
						style: {
							gridColumn: `${t.pos_x + 1} / span ${t.width}`,
							gridRow: `${t.pos_y + 1} / span ${t.height}`,
							touchAction: "none",
							transform: n ? `translate(${K.dx}px, ${K.dy}px)` : void 0,
							zIndex: n ? 10 : void 0
						},
						children: [/* @__PURE__ */ g("span", {
							className: "text-[26px] font-bold leading-none text-sq-heading tabular-nums",
							children: t.name
						}), /* @__PURE__ */ g("span", {
							className: "text-[13px] text-sq-muted",
							children: e(t.seats)
						})]
					}, t.id);
				})
			}),
			F != null && /* @__PURE__ */ _("div", {
				className: "sq-card mt-5 p-5",
				"data-testid": "editor-form",
				children: [/* @__PURE__ */ _("div", {
					className: "flex flex-wrap items-end gap-3",
					children: [
						/* @__PURE__ */ _("label", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ g("span", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Назва"
							}), /* @__PURE__ */ g("input", {
								className: "sq-input w-28",
								"data-testid": "editor-form-name",
								value: L.name,
								onChange: (e) => R({
									...L,
									name: e.target.value
								})
							})]
						}),
						/* @__PURE__ */ _("label", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ g("span", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Місць"
							}), /* @__PURE__ */ g("input", {
								className: "sq-input w-24 tabular-nums",
								type: "number",
								min: 1,
								"data-testid": "editor-form-seats",
								value: L.seats,
								onChange: (e) => R({
									...L,
									seats: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ _("label", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ g("span", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Ширина"
							}), /* @__PURE__ */ g("input", {
								className: "sq-input w-24 tabular-nums",
								type: "number",
								min: 1,
								"data-testid": "editor-form-width",
								value: L.width,
								onChange: (e) => R({
									...L,
									width: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ _("label", {
							className: "flex flex-col gap-1.5",
							children: [/* @__PURE__ */ g("span", {
								className: "text-[13px] font-semibold text-sq-secondary",
								children: "Висота"
							}), /* @__PURE__ */ g("input", {
								className: "sq-input w-24 tabular-nums",
								type: "number",
								min: 1,
								"data-testid": "editor-form-height",
								value: L.height,
								onChange: (e) => R({
									...L,
									height: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							"data-testid": "editor-form-shape",
							className: "sq-btn-quiet",
							onClick: () => R({
								...L,
								shape: L.shape === "rect" ? "round" : "rect"
							}),
							children: L.shape === "rect" ? "Прямокутний" : "Круглий"
						})
					]
				}), /* @__PURE__ */ _("div", {
					className: "mt-5 flex flex-wrap items-center gap-3",
					children: [
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]",
							"data-testid": "editor-form-save",
							disabled: N || L.name.trim().length === 0,
							onClick: () => void X(),
							children: "Зберегти"
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "sq-btn-quiet",
							onClick: () => I(null),
							children: "Скасувати"
						}),
						F !== "new" && /* @__PURE__ */ g("button", {
							type: "button",
							className: "ml-auto min-h-11 text-[15px] text-red-600 font-semibold disabled:opacity-50",
							"data-testid": "editor-form-retire",
							disabled: N,
							onClick: async () => {
								await G(() => r(F, { is_active: !1 })) && I(null);
							},
							children: "Прибрати із зали"
						})
					]
				})]
			})
		]
	});
}
//#endregion
export { k as HallEditorPage };
