import { b as e, c as t, d as n, p as r, s as i, t as a, v as o } from "./useHallMap-DwoGctYl.js";
import { useCallback as s, useEffect as c, useMemo as l, useRef as u, useState as d } from "react";
import { Fragment as f, jsx as p, jsxs as m } from "react/jsx-runtime";
function h(e, t, n = 72) {
	return {
		dx: Math.round(e / n),
		dy: Math.round(t / n)
	};
}
function g(e, t) {
	return {
		pos_x: Math.min(Math.max(0, e.pos_x + t.dx), 200 - e.width),
		pos_y: Math.min(Math.max(0, e.pos_y + t.dy), 200 - e.height)
	};
}
function _(e, t = 2) {
	let n = 4, r = 3;
	for (let t of e) n = Math.max(n, t.pos_x + t.width), r = Math.max(r, t.pos_y + t.height);
	return {
		cols: Math.min(n + t, 200),
		rows: Math.min(r + t, 200)
	};
}
function v(e, t) {
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
function y(e, t, n) {
	return e.map((e) => e.id === t ? {
		...e,
		...n
	} : e);
}
//#endregion
//#region src/modules/tables/lib/useTableDrag.ts
var b = 6;
function x(e) {
	let [t, n] = d({
		id: null,
		dx: 0,
		dy: 0
	}), r = u(!1);
	return {
		drag: t,
		start: s((t, i) => {
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
				if (!r.current && Math.hypot(t, l) > b) {
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
		suppressClick: s(() => r.current ? (r.current = !1, !0) : !1, [])
	};
}
//#endregion
//#region src/modules/tables/pages/HallEditorPage.tsx
var S = {
	name: "",
	seats: 2,
	width: 2,
	height: 2,
	shape: "rect"
};
function C() {
	let [u, b] = d([]), [C, w] = d(null), [T, E] = d(!0), [D, O] = d(null), [k, A] = d(!1), [j, M] = d(null), [N, P] = d(S), [F, I] = d(""), L = s(async () => {
		try {
			let { halls: e } = await n();
			b(e);
		} catch (e) {
			O(a(e, "Не вдалося прочитати зали"));
		} finally {
			E(!1);
		}
	}, []);
	c(() => {
		L();
	}, [L]);
	let R = u.find((e) => e.id === C) ?? u[0] ?? null, z = l(() => R?.tables ?? [], [R]), B = l(() => _(z), [z]);
	async function V(e) {
		if (k) return !1;
		A(!0), O(null);
		try {
			return await e(), await L(), !0;
		} catch (e) {
			return await L(), O(a(e, "Не вдалося зберегти")), !1;
		} finally {
			A(!1);
		}
	}
	let { drag: H, start: U, suppressClick: W } = x(s((e, t, n) => {
		if (!R) return;
		let i = R.tables.find((t) => t.id === e);
		if (!i) return;
		let a = g(i, h(t, n)), o = y(R.tables, e, a), s = v(R.tables, o);
		s.length !== 0 && (b((e) => e.map((e) => e.id === R.id ? {
			...e,
			tables: o
		} : e)), V(() => r(s)));
	}, [R, k]));
	function G(e) {
		M(e.id), P({
			name: e.name,
			seats: e.seats,
			width: e.width,
			height: e.height,
			shape: e.shape
		});
	}
	async function K() {
		R && await V(() => j === "new" ? t({
			...N,
			hall_id: R.id,
			pos_x: 0,
			pos_y: 0
		}) : e(j, N)) && M(null);
	}
	return T ? /* @__PURE__ */ p("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	}) : /* @__PURE__ */ m("div", {
		className: "p-4",
		"data-testid": "hall-editor",
		children: [
			/* @__PURE__ */ m("div", {
				className: "mb-3 flex flex-wrap items-center gap-2",
				children: [
					u.map((e) => /* @__PURE__ */ m("button", {
						type: "button",
						"data-testid": `editor-hall-${e.id}`,
						onClick: () => w(e.id),
						className: `rounded-full border px-3 py-1.5 text-sm ${R?.id === e.id ? "border-sq-blue bg-sq-blue text-white" : "border-sq-divider bg-sq-surface text-sq-text"}`,
						children: [e.name, e.is_active ? "" : " · прибрано"]
					}, e.id)),
					/* @__PURE__ */ p("input", {
						className: "sq-field w-40",
						"data-testid": "editor-hall-name",
						placeholder: "Нова зала",
						value: F,
						onChange: (e) => I(e.target.value)
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						className: "sq-btn-primary",
						"data-testid": "editor-hall-add",
						disabled: k || F.trim().length === 0,
						onClick: () => {
							let e = F.trim();
							I(""), V(() => i(e));
						},
						children: "Додати залу"
					})
				]
			}),
			D && /* @__PURE__ */ p("p", {
				className: "mb-3 rounded-lg bg-rose-500/15 p-2 text-sm",
				"data-testid": "editor-banner",
				children: D
			}),
			!R && /* @__PURE__ */ m("div", {
				className: "sq-card p-6 text-center",
				"data-testid": "editor-empty",
				children: [/* @__PURE__ */ p("p", {
					className: "text-lg font-semibold",
					children: "Залів ще немає"
				}), /* @__PURE__ */ p("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Додайте залу — і перетягніть у неї столи так, як вони стоять насправді."
				})]
			}),
			R && /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("div", {
				className: "mb-2 flex flex-wrap items-center gap-2",
				children: [
					/* @__PURE__ */ p("button", {
						type: "button",
						className: "sq-btn-primary",
						"data-testid": "editor-table-add",
						disabled: k,
						onClick: () => {
							M("new"), P(S);
						},
						children: "+ Стіл"
					}),
					/* @__PURE__ */ p("button", {
						type: "button",
						className: "sq-link",
						"data-testid": "editor-hall-retire",
						disabled: k,
						onClick: () => void V(() => o(R.id, { is_active: !R.is_active })),
						children: R.is_active ? "Прибрати залу" : "Повернути залу"
					}),
					/* @__PURE__ */ p("span", {
						className: "text-xs text-sq-muted",
						children: "Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити."
					})
				]
			}), /* @__PURE__ */ p("div", {
				className: "relative overflow-auto rounded-sq border border-sq-divider bg-sq-surface p-2",
				"data-testid": "editor-grid",
				style: {
					display: "grid",
					gridTemplateColumns: `repeat(${B.cols}, 72px)`,
					gridAutoRows: "72px",
					gap: "4px"
				},
				children: z.map((e) => {
					let t = H.id === e.id;
					return /* @__PURE__ */ m("button", {
						type: "button",
						"data-testid": `editor-table-${e.id}`,
						"data-dragging": t ? "yes" : "no",
						onPointerDown: (t) => U(t, e.id),
						onClick: (t) => {
							if (W()) {
								t.preventDefault();
								return;
							}
							G(e);
						},
						className: `flex flex-col items-center justify-center border-2 text-center ${e.shape === "round" ? "rounded-full" : "rounded-sq"} ${e.is_active ? "border-sq-blue bg-sq-blue/10" : "border-sq-divider opacity-60"}`,
						style: {
							gridColumn: `${e.pos_x + 1} / span ${e.width}`,
							gridRow: `${e.pos_y + 1} / span ${e.height}`,
							touchAction: "none",
							transform: t ? `translate(${H.dx}px, ${H.dy}px)` : void 0,
							zIndex: t ? 10 : void 0
						},
						children: [/* @__PURE__ */ p("span", {
							className: "text-lg font-bold",
							children: e.name
						}), /* @__PURE__ */ m("span", {
							className: "text-xs text-sq-muted",
							children: [e.seats, " місць"]
						})]
					}, e.id);
				})
			})] }),
			j != null && /* @__PURE__ */ p("div", {
				className: "sq-card mt-3 p-3",
				"data-testid": "editor-form",
				children: /* @__PURE__ */ m("div", {
					className: "flex flex-wrap items-end gap-2",
					children: [
						/* @__PURE__ */ m("label", {
							className: "text-xs text-sq-muted",
							children: ["Назва", /* @__PURE__ */ p("input", {
								className: "sq-field mt-1 block w-24",
								"data-testid": "editor-form-name",
								value: N.name,
								onChange: (e) => P({
									...N,
									name: e.target.value
								})
							})]
						}),
						/* @__PURE__ */ m("label", {
							className: "text-xs text-sq-muted",
							children: ["Місць", /* @__PURE__ */ p("input", {
								className: "sq-field mt-1 block w-20",
								type: "number",
								min: 1,
								"data-testid": "editor-form-seats",
								value: N.seats,
								onChange: (e) => P({
									...N,
									seats: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ m("label", {
							className: "text-xs text-sq-muted",
							children: ["Ширина", /* @__PURE__ */ p("input", {
								className: "sq-field mt-1 block w-20",
								type: "number",
								min: 1,
								"data-testid": "editor-form-width",
								value: N.width,
								onChange: (e) => P({
									...N,
									width: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ m("label", {
							className: "text-xs text-sq-muted",
							children: ["Висота", /* @__PURE__ */ p("input", {
								className: "sq-field mt-1 block w-20",
								type: "number",
								min: 1,
								"data-testid": "editor-form-height",
								value: N.height,
								onChange: (e) => P({
									...N,
									height: Number(e.target.value)
								})
							})]
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							"data-testid": "editor-form-shape",
							className: "rounded-lg border border-sq-divider px-3 py-2 text-sm",
							onClick: () => P({
								...N,
								shape: N.shape === "rect" ? "round" : "rect"
							}),
							children: N.shape === "rect" ? "Прямокутний" : "Круглий"
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							className: "sq-btn-primary",
							"data-testid": "editor-form-save",
							disabled: k || N.name.trim().length === 0,
							onClick: () => void K(),
							children: "Зберегти"
						}),
						j !== "new" && /* @__PURE__ */ p("button", {
							type: "button",
							className: "sq-link",
							"data-testid": "editor-form-retire",
							disabled: k,
							onClick: async () => {
								await V(() => e(j, { is_active: !1 })) && M(null);
							},
							children: "Прибрати із зали"
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							className: "sq-link",
							onClick: () => M(null),
							children: "Скасувати"
						})
					]
				})
			})
		]
	});
}
//#endregion
export { C as HallEditorPage };
