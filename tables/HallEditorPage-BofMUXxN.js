import { A as e, C as t, F as n, Z as r, c as i, h as a, l as o, p as s, q as c, t as l, w as u, x as d } from "./useHallMap-CcjEe5nT.js";
import { useCallback as f, useEffect as p, useMemo as m, useRef as h, useState as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import { Link as b } from "react-router-dom";
//#region src/components/ui/Page.tsx
function x({ title: e, glyph: t, subtitle: r, actions: i, back: a }) {
	return /* @__PURE__ */ y("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			a && /* @__PURE__ */ y(b, {
				to: a.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ v(n, { size: 20 }), a.label]
			}),
			/* @__PURE__ */ y("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					t && /* @__PURE__ */ v(t, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ v("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					i && /* @__PURE__ */ v("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: i
					})
				]
			}),
			r && /* @__PURE__ */ v("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: r
			})
		]
	});
}
function S({ value: e, options: t, onChange: n, ariaLabel: r, className: i = "" }) {
	let a = i.includes("w-full");
	return /* @__PURE__ */ v("div", {
		className: `inline-flex max-w-full overflow-x-auto gap-1 p-[3px] rounded-xl bg-sq-empty ${i}`,
		role: "group",
		"aria-label": r,
		children: t.map((t) => {
			let r = t.value === e;
			return /* @__PURE__ */ v("button", {
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
function C(e, t, n = 72) {
	return {
		dx: Math.round(e / n),
		dy: Math.round(t / n)
	};
}
function w(e, t) {
	return {
		pos_x: Math.min(Math.max(0, e.pos_x + t.dx), 200 - e.width),
		pos_y: Math.min(Math.max(0, e.pos_y + t.dy), 200 - e.height)
	};
}
function T(e, t = 2) {
	let n = 4, r = 3;
	for (let t of e) n = Math.max(n, t.pos_x + t.width), r = Math.max(r, t.pos_y + t.height);
	return {
		cols: Math.min(n + t, 200),
		rows: Math.min(r + t, 200)
	};
}
function E(e, t) {
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
function D(e, t, n) {
	return e.map((e) => e.id === t ? {
		...e,
		...n
	} : e);
}
//#endregion
//#region src/modules/tables/lib/useTableDrag.ts
var O = 6;
function k(e) {
	let [t, n] = g({
		id: null,
		dx: 0,
		dy: 0
	}), r = h(!1);
	return {
		drag: t,
		start: f((t, i) => {
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
				if (!r.current && Math.hypot(t, l) > O) {
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
		suppressClick: f(() => r.current ? (r.current = !1, !0) : !1, [])
	};
}
//#endregion
//#region src/modules/tables/lib/publicMenu.ts
var A = /^\d{9,12}\.[A-Za-z0-9_-]{43}$/;
function j(e) {
	return typeof e == "string" && /^https?:\/\//i.test(e);
}
async function M() {
	try {
		let e = await u("get", "/store/public-menu");
		if (e?.available === !1) return { kind: "none" };
		if (e?.enabled === !0 && j(e.url)) {
			let t = typeof e.print == "string" && A.test(e.print) ? e.print : null;
			return {
				kind: "on",
				url: e.url.replace(/\/+$/, ""),
				print: t
			};
		}
		return e?.available === !0 ? { kind: "off" } : { kind: "none" };
	} catch {
		return { kind: "none" };
	}
}
function ee(e, t, n = null) {
	return `${e}/qr?t=${t}${n ? `&p=${n}` : ""}`;
}
function N(e, t = null) {
	return `${e}/tables${t ? `?p=${t}` : ""}`;
}
//#endregion
//#region src/modules/tables/pages/HallEditorPage.tsx
var P = {
	name: "",
	seats: 2,
	width: 2,
	height: 2,
	shape: "rect"
};
function F() {
	let [n, u] = g([]), [h, b] = g(null), [O, A] = g(!0), [j, F] = g(null), [I, L] = g(!1), [R, z] = g(null), [B, V] = g(P), [H, U] = g(""), [W, G] = g({ kind: "none" });
	p(() => {
		let e = !0;
		return M().then((t) => {
			e && G(t);
		}), () => {
			e = !1;
		};
	}, []);
	let K = f(async () => {
		try {
			let { halls: e } = await s();
			u(e);
		} catch (e) {
			F(l(e, "Не вдалося прочитати зали"));
		} finally {
			A(!1);
		}
	}, []);
	p(() => {
		K();
	}, [K]);
	let q = n.find((e) => e.id === h) ?? n[0] ?? null, J = m(() => q?.tables ?? [], [q]), Y = m(() => T(J), [J]), X = !!((typeof R == "number" ? J.find((e) => e.id === R) : void 0)?.is_active && q?.is_active), Z = n.some((e) => e.is_active && e.tables.some((e) => e.is_active));
	async function Q(e) {
		if (I) return !1;
		L(!0), F(null);
		try {
			return await e(), await K(), !0;
		} catch (e) {
			return await K(), F(l(e, "Не вдалося зберегти")), !1;
		} finally {
			L(!1);
		}
	}
	let { drag: $, start: te, suppressClick: ne } = k(f((e, t, n) => {
		if (!q) return;
		let r = q.tables.find((t) => t.id === e);
		if (!r) return;
		let i = w(r, C(t, n)), o = D(q.tables, e, i), s = E(q.tables, o);
		s.length !== 0 && (u((e) => e.map((e) => e.id === q.id ? {
			...e,
			tables: o
		} : e)), Q(() => a(s)));
	}, [q, I]));
	function re(e) {
		z(e.id), V({
			name: e.name,
			seats: e.seats,
			width: e.width,
			height: e.height,
			shape: e.shape
		});
	}
	async function ie() {
		q && await Q(() => R === "new" ? o({
			...B,
			hall_id: q.id,
			pos_x: 0,
			pos_y: 0
		}) : t(R, B)) && z(null);
	}
	return O ? /* @__PURE__ */ v("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	}) : /* @__PURE__ */ y("div", {
		className: "animate-fade-up text-sq-text",
		"data-testid": "hall-editor",
		children: [
			/* @__PURE__ */ v(x, {
				glyph: r,
				title: "Зали і столи",
				subtitle: q ? "Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити." : void 0,
				actions: q && /* @__PURE__ */ y(_, { children: [W.kind === "on" && Z && /* @__PURE__ */ v("a", {
					className: "sq-btn-quiet whitespace-nowrap",
					"data-testid": "editor-qr-sheet",
					href: N(W.url, W.print),
					target: "_blank",
					rel: "noopener noreferrer",
					children: "QR для всіх столів"
				}), /* @__PURE__ */ y("button", {
					type: "button",
					className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5",
					"data-testid": "editor-table-add",
					disabled: I,
					onClick: () => {
						z("new"), V(P);
					},
					children: [/* @__PURE__ */ v(c, { size: 20 }), "Стіл"]
				})] })
			}),
			/* @__PURE__ */ y("div", {
				className: "mb-4 flex flex-wrap items-center gap-3",
				children: [
					n.length > 0 && /* @__PURE__ */ v(S, {
						value: String(q?.id ?? ""),
						options: n.map((e) => ({
							value: String(e.id),
							label: `${e.name}${e.is_active ? "" : " · прибрано"}`,
							testId: `editor-hall-${e.id}`
						})),
						onChange: (e) => b(Number(e))
					}),
					q && /* @__PURE__ */ v("button", {
						type: "button",
						className: "min-h-11 text-[15px] font-semibold text-sq-blue disabled:opacity-50",
						"data-testid": "editor-hall-retire",
						disabled: I,
						onClick: () => void Q(() => d(q.id, { is_active: !q.is_active })),
						children: q.is_active ? "Прибрати залу" : "Повернути залу"
					}),
					/* @__PURE__ */ y("div", {
						className: "ml-auto flex items-center gap-2",
						children: [/* @__PURE__ */ v("input", {
							className: "sq-input w-44",
							"data-testid": "editor-hall-name",
							placeholder: "Нова зала",
							value: H,
							onChange: (e) => U(e.target.value)
						}), /* @__PURE__ */ v("button", {
							type: "button",
							className: "sq-btn-quiet whitespace-nowrap",
							"data-testid": "editor-hall-add",
							disabled: I || H.trim().length === 0,
							onClick: () => {
								let e = H.trim();
								U(""), Q(() => i(e));
							},
							children: "Додати залу"
						})]
					})
				]
			}),
			j && /* @__PURE__ */ v("p", {
				className: "mb-4 rounded-sq bg-red-50 text-red-700 px-3.5 py-2.5 text-sm",
				"data-testid": "editor-banner",
				children: j
			}),
			!q && /* @__PURE__ */ y("div", {
				className: "py-14 text-center",
				"data-testid": "editor-empty",
				children: [
					/* @__PURE__ */ v(r, {
						size: 48,
						className: "mx-auto"
					}),
					/* @__PURE__ */ v("p", {
						className: "mt-3 text-[17px] font-semibold text-sq-heading",
						children: "Залів ще немає"
					}),
					/* @__PURE__ */ v("p", {
						className: "mt-1 text-[15px] text-sq-secondary",
						children: "Додайте залу — і перетягніть у неї столи так, як вони стоять насправді."
					})
				]
			}),
			q && /* @__PURE__ */ v("div", {
				className: "relative overflow-auto rounded-card bg-sq-sidebar p-3",
				"data-testid": "editor-grid",
				style: {
					display: "grid",
					gridTemplateColumns: `repeat(${Y.cols}, 72px)`,
					gridAutoRows: "72px",
					gap: "4px"
				},
				children: J.map((t) => {
					let n = $.id === t.id;
					return /* @__PURE__ */ y("button", {
						type: "button",
						"data-testid": `editor-table-${t.id}`,
						"data-dragging": n ? "yes" : "no",
						onPointerDown: (e) => te(e, t.id),
						onClick: (e) => {
							if (ne()) {
								e.preventDefault();
								return;
							}
							re(t);
						},
						className: `flex flex-col items-center justify-center gap-0.5 p-2 text-center transition-shadow ${t.shape === "round" ? "rounded-full" : "rounded-card"} ${t.is_active ? n || R === t.id ? "bg-white ring-2 ring-sq-blue shadow-card-hover" : "bg-white ring-1 ring-sq-divider shadow-card" : "bg-sq-empty opacity-60"}`,
						style: {
							gridColumn: `${t.pos_x + 1} / span ${t.width}`,
							gridRow: `${t.pos_y + 1} / span ${t.height}`,
							touchAction: "none",
							transform: n ? `translate(${$.dx}px, ${$.dy}px)` : void 0,
							zIndex: n ? 10 : void 0
						},
						children: [/* @__PURE__ */ v("span", {
							className: "text-[26px] font-bold leading-none text-sq-heading tabular-nums",
							children: t.name
						}), /* @__PURE__ */ v("span", {
							className: "text-[13px] text-sq-muted",
							children: e(t.seats)
						})]
					}, t.id);
				})
			}),
			R != null && /* @__PURE__ */ y("div", {
				className: "sq-card mt-5 p-5",
				"data-testid": "editor-form",
				children: [
					/* @__PURE__ */ y("div", {
						className: "flex flex-wrap items-end gap-3",
						children: [
							/* @__PURE__ */ y("label", {
								className: "flex flex-col gap-1.5",
								children: [/* @__PURE__ */ v("span", {
									className: "text-[13px] font-semibold text-sq-secondary",
									children: "Назва"
								}), /* @__PURE__ */ v("input", {
									className: "sq-input w-28",
									"data-testid": "editor-form-name",
									value: B.name,
									onChange: (e) => V({
										...B,
										name: e.target.value
									})
								})]
							}),
							/* @__PURE__ */ y("label", {
								className: "flex flex-col gap-1.5",
								children: [/* @__PURE__ */ v("span", {
									className: "text-[13px] font-semibold text-sq-secondary",
									children: "Місць"
								}), /* @__PURE__ */ v("input", {
									className: "sq-input w-24 tabular-nums",
									type: "number",
									min: 1,
									"data-testid": "editor-form-seats",
									value: B.seats,
									onChange: (e) => V({
										...B,
										seats: Number(e.target.value)
									})
								})]
							}),
							/* @__PURE__ */ y("label", {
								className: "flex flex-col gap-1.5",
								children: [/* @__PURE__ */ v("span", {
									className: "text-[13px] font-semibold text-sq-secondary",
									children: "Ширина"
								}), /* @__PURE__ */ v("input", {
									className: "sq-input w-24 tabular-nums",
									type: "number",
									min: 1,
									"data-testid": "editor-form-width",
									value: B.width,
									onChange: (e) => V({
										...B,
										width: Number(e.target.value)
									})
								})]
							}),
							/* @__PURE__ */ y("label", {
								className: "flex flex-col gap-1.5",
								children: [/* @__PURE__ */ v("span", {
									className: "text-[13px] font-semibold text-sq-secondary",
									children: "Висота"
								}), /* @__PURE__ */ v("input", {
									className: "sq-input w-24 tabular-nums",
									type: "number",
									min: 1,
									"data-testid": "editor-form-height",
									value: B.height,
									onChange: (e) => V({
										...B,
										height: Number(e.target.value)
									})
								})]
							}),
							/* @__PURE__ */ v("button", {
								type: "button",
								"data-testid": "editor-form-shape",
								className: "sq-btn-quiet",
								onClick: () => V({
									...B,
									shape: B.shape === "rect" ? "round" : "rect"
								}),
								children: B.shape === "rect" ? "Прямокутний" : "Круглий"
							})
						]
					}),
					/* @__PURE__ */ y("div", {
						className: "mt-5 flex flex-wrap items-center gap-3",
						children: [
							/* @__PURE__ */ v("button", {
								type: "button",
								className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]",
								"data-testid": "editor-form-save",
								disabled: I || B.name.trim().length === 0,
								onClick: () => void ie(),
								children: "Зберегти"
							}),
							/* @__PURE__ */ v("button", {
								type: "button",
								className: "sq-btn-quiet",
								onClick: () => z(null),
								children: "Скасувати"
							}),
							X && W.kind === "on" && /* @__PURE__ */ v("a", {
								className: "sq-btn-quiet whitespace-nowrap",
								"data-testid": "editor-form-qr",
								href: ee(W.url, R, W.print),
								target: "_blank",
								rel: "noopener noreferrer",
								children: "QR цього столу"
							}),
							R !== "new" && /* @__PURE__ */ v("button", {
								type: "button",
								className: "ml-auto min-h-11 text-[15px] text-red-600 font-semibold disabled:opacity-50",
								"data-testid": "editor-form-retire",
								disabled: I,
								onClick: async () => {
									await Q(() => t(R, { is_active: !1 })) && z(null);
								},
								children: "Прибрати із зали"
							})
						]
					}),
					X && W.kind === "off" && /* @__PURE__ */ v("p", {
						className: "mt-3 text-[13px] text-sq-muted",
						"data-testid": "editor-form-qr-hint",
						children: "QR для столу з’явиться, коли ви ввімкнете меню для гостей у «Налаштуваннях»."
					})
				]
			})
		]
	});
}
//#endregion
export { F as HallEditorPage };
