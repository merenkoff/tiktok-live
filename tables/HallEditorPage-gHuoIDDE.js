import { E as e, O as t, P as n, Z as r, l as i, m as a, rt as o, t as s, u as c, v as l, w as u, z as d } from "./useHallMap-D3r3NK5N.js";
import { useCallback as f, useEffect as p, useMemo as m, useRef as h, useState as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import { Link as b } from "react-router-dom";
// src/components/ui/Page.tsx
function x({ title: e, glyph: t, subtitle: n, actions: r, back: i }) {
	return /* @__PURE__ */ y("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			i && /* @__PURE__ */ y(b, {
				to: i.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ v(d, { size: 20 }), i.label]
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
					r && /* @__PURE__ */ v("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: r
					})
				]
			}),
			n && /* @__PURE__ */ v("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: n
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
// src/modules/tables/lib/useTableDrag.ts
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
// src/modules/tables/lib/publicMenu.ts
var A = /^\d{9,12}\.[A-Za-z0-9_-]{43}$/;
function j(e) {
	return typeof e == "string" && /^https?:\/\//i.test(e);
}
async function M() {
	try {
		let e = await t("get", "/store/public-menu");
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
function N(e, t, n = null) {
	return `${e}/qr?t=${t}${n ? `&p=${n}` : ""}`;
}
function P(e, t = null) {
	return `${e}/tables${t ? `?p=${t}` : ""}`;
}
// src/modules/tables/pages/HallEditorPage.tsx
var F = {
	name: "",
	seats: 2,
	width: 2,
	height: 2,
	shape: "rect"
};
function I() {
	let [t, d] = g([]), [h, b] = g(null), [O, A] = g(!0), [j, I] = g(null), [L, R] = g(!1), [z, B] = g(null), [V, H] = g(F), [U, W] = g(""), [G, K] = g({ kind: "none" });
	p(() => {
		let e = !0;
		return M().then((t) => {
			e && K(t);
		}), () => {
			e = !1;
		};
	}, []);
	let q = f(async () => {
		try {
			let { halls: e } = await a();
			d(e);
		} catch (e) {
			I(s(e, "Не вдалося прочитати зали"));
		} finally {
			A(!1);
		}
	}, []);
	p(() => {
		q();
	}, [q]);
	let J = t.find((e) => e.id === h) ?? t[0] ?? null, Y = m(() => J?.tables ?? [], [J]), X = m(() => T(Y), [Y]), Z = !!((typeof z == "number" ? Y.find((e) => e.id === z) : void 0)?.is_active && J?.is_active), ee = t.some((e) => e.is_active && e.tables.some((e) => e.is_active));
	async function Q(e) {
		if (L) return !1;
		R(!0), I(null);
		try {
			return await e(), await q(), !0;
		} catch (e) {
			return await q(), I(s(e, "Не вдалося зберегти")), !1;
		} finally {
			R(!1);
		}
	}
	let { drag: $, start: te, suppressClick: ne } = k(f((e, t, n) => {
		if (!J) return;
		let r = J.tables.find((t) => t.id === e);
		if (!r) return;
		let i = w(r, C(t, n)), a = D(J.tables, e, i), o = E(J.tables, a);
		o.length !== 0 && (d((e) => e.map((e) => e.id === J.id ? {
			...e,
			tables: a
		} : e)), Q(() => l(o)));
	}, [J, L]));
	function re(e) {
		B(e.id), H({
			name: e.name,
			seats: e.seats,
			width: e.width,
			height: e.height,
			shape: e.shape
		});
	}
	async function ie() {
		J && await Q(() => z === "new" ? c({
			...V,
			hall_id: J.id,
			pos_x: 0,
			pos_y: 0
		}) : e(z, V)) && B(null);
	}
	return O ? /* @__PURE__ */ v("p", {
		className: "p-6 text-center text-sm text-sq-muted",
		children: "Завантаження…"
	}) : /* @__PURE__ */ y("div", {
		className: "animate-fade-up text-sq-text",
		"data-testid": "hall-editor",
		children: [
			/* @__PURE__ */ v(x, {
				glyph: o,
				title: "Зали і столи",
				subtitle: J ? "Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити." : void 0,
				actions: J && /* @__PURE__ */ y(_, { children: [G.kind === "on" && ee && /* @__PURE__ */ v("a", {
					className: "sq-btn-quiet whitespace-nowrap",
					"data-testid": "editor-qr-sheet",
					href: P(G.url, G.print),
					target: "_blank",
					rel: "noopener noreferrer",
					children: "QR для всіх столів"
				}), /* @__PURE__ */ y("button", {
					type: "button",
					className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5",
					"data-testid": "editor-table-add",
					disabled: L,
					onClick: () => {
						B("new"), H(F);
					},
					children: [/* @__PURE__ */ v(r, { size: 20 }), "Стіл"]
				})] })
			}),
			/* @__PURE__ */ y("div", {
				className: "mb-4 flex flex-wrap items-center gap-3",
				children: [
					t.length > 0 && /* @__PURE__ */ v(S, {
						value: String(J?.id ?? ""),
						options: t.map((e) => ({
							value: String(e.id),
							label: `${e.name}${e.is_active ? "" : " · прибрано"}`,
							testId: `editor-hall-${e.id}`
						})),
						onChange: (e) => b(Number(e))
					}),
					J && /* @__PURE__ */ v("button", {
						type: "button",
						className: "min-h-11 text-[15px] font-semibold text-sq-blue disabled:opacity-50",
						"data-testid": "editor-hall-retire",
						disabled: L,
						onClick: () => void Q(() => u(J.id, { is_active: !J.is_active })),
						children: J.is_active ? "Прибрати залу" : "Повернути залу"
					}),
					/* @__PURE__ */ y("div", {
						className: "ml-auto flex items-center gap-2",
						children: [/* @__PURE__ */ v("input", {
							className: "sq-input w-44",
							"data-testid": "editor-hall-name",
							placeholder: "Нова зала",
							value: U,
							onChange: (e) => W(e.target.value)
						}), /* @__PURE__ */ v("button", {
							type: "button",
							className: "sq-btn-quiet whitespace-nowrap",
							"data-testid": "editor-hall-add",
							disabled: L || U.trim().length === 0,
							onClick: () => {
								let e = U.trim();
								W(""), Q(() => i(e));
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
			!J && /* @__PURE__ */ y("div", {
				className: "py-14 text-center",
				"data-testid": "editor-empty",
				children: [
					/* @__PURE__ */ v(o, {
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
			J && /* @__PURE__ */ v("div", {
				className: "relative overflow-auto rounded-card bg-sq-sidebar p-3",
				"data-testid": "editor-grid",
				style: {
					display: "grid",
					gridTemplateColumns: `repeat(${X.cols}, 72px)`,
					gridAutoRows: "72px",
					gap: "4px"
				},
				children: Y.map((e) => {
					let t = $.id === e.id;
					return /* @__PURE__ */ y("button", {
						type: "button",
						"data-testid": `editor-table-${e.id}`,
						"data-dragging": t ? "yes" : "no",
						onPointerDown: (t) => te(t, e.id),
						onClick: (t) => {
							ne() ? t.preventDefault() : re(e);
						},
						className: `flex flex-col items-center justify-center gap-0.5 p-2 text-center transition-shadow ${e.shape === "round" ? "rounded-full" : "rounded-card"} ${e.is_active ? t || z === e.id ? "bg-white ring-2 ring-sq-blue shadow-card-hover" : "bg-white ring-1 ring-sq-divider shadow-card" : "bg-sq-empty opacity-60"}`,
						style: {
							gridColumn: `${e.pos_x + 1} / span ${e.width}`,
							gridRow: `${e.pos_y + 1} / span ${e.height}`,
							touchAction: "none",
							transform: t ? `translate(${$.dx}px, ${$.dy}px)` : void 0,
							zIndex: t ? 10 : void 0
						},
						children: [/* @__PURE__ */ v("span", {
							className: "text-[26px] font-bold leading-none text-sq-heading tabular-nums",
							children: e.name
						}), /* @__PURE__ */ v("span", {
							className: "text-[13px] text-sq-muted",
							children: n(e.seats)
						})]
					}, e.id);
				})
			}),
			z != null && /* @__PURE__ */ y("div", {
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
									value: V.name,
									onChange: (e) => H({
										...V,
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
									value: V.seats,
									onChange: (e) => H({
										...V,
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
									value: V.width,
									onChange: (e) => H({
										...V,
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
									value: V.height,
									onChange: (e) => H({
										...V,
										height: Number(e.target.value)
									})
								})]
							}),
							/* @__PURE__ */ v("button", {
								type: "button",
								"data-testid": "editor-form-shape",
								className: "sq-btn-quiet",
								onClick: () => H({
									...V,
									shape: V.shape === "rect" ? "round" : "rect"
								}),
								children: V.shape === "rect" ? "Прямокутний" : "Круглий"
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
								disabled: L || V.name.trim().length === 0,
								onClick: () => void ie(),
								children: "Зберегти"
							}),
							/* @__PURE__ */ v("button", {
								type: "button",
								className: "sq-btn-quiet",
								onClick: () => B(null),
								children: "Скасувати"
							}),
							Z && G.kind === "on" && /* @__PURE__ */ v("a", {
								className: "sq-btn-quiet whitespace-nowrap",
								"data-testid": "editor-form-qr",
								href: N(G.url, z, G.print),
								target: "_blank",
								rel: "noopener noreferrer",
								children: "QR цього столу"
							}),
							z !== "new" && /* @__PURE__ */ v("button", {
								type: "button",
								className: "ml-auto min-h-11 text-[15px] text-red-600 font-semibold disabled:opacity-50",
								"data-testid": "editor-form-retire",
								disabled: L,
								onClick: async () => {
									await Q(() => e(z, { is_active: !1 })) && B(null);
								},
								children: "Прибрати із зали"
							})
						]
					}),
					Z && G.kind === "off" && /* @__PURE__ */ v("p", {
						className: "mt-3 text-[13px] text-sq-muted",
						"data-testid": "editor-form-qr-hint",
						children: "QR для столу з’явиться, коли ви ввімкнете меню для гостей у «Налаштуваннях»."
					})
				]
			})
		]
	});
}
export { I as HallEditorPage };
