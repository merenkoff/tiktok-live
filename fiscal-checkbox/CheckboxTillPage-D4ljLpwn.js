import { S as e, a as t, b as n, c as r, f as i, i as a, m as o, n as s, o as c, p as l, r as u, s as d, t as f, v as p, x as m, y as h } from "./useFiscalStatus-BmaNbdzp.js";
import { useState as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
import { useOfflineStatus as b, usePosShell as x } from "@pos/platform";
//#region src/modules/fiscal-core/components/ShiftPanel.tsx
function S({ status: e, onChanged: n }) {
	let [a, o] = g(!1), [s, c] = g(null), [l, d] = g(null), [f, p] = g(null);
	async function m(e) {
		o(!0), c(null);
		try {
			await e();
		} catch (e) {
			c(e);
		} finally {
			o(!1);
		}
	}
	let h = () => m(async () => {
		await i(), n();
	}), b = () => m(async () => {
		let e = await t();
		d(e.z_report_text), n();
	}), x = () => m(async () => {
		let e = await r();
		p(e.text);
	});
	if (!e.configured) return /* @__PURE__ */ y("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [/* @__PURE__ */ v("p", {
			className: "font-semibold",
			children: "ПРРО не налаштовано"
		}), e.error?.message && /* @__PURE__ */ v("p", {
			className: "mt-1",
			children: e.error.message
		})]
	});
	let S = e.shift?.status === "open";
	return /* @__PURE__ */ y("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ y("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [
					/* @__PURE__ */ v("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Зміна"
					}),
					/* @__PURE__ */ v("p", {
						className: `mt-1 text-[26px] font-bold leading-tight ${S ? "text-sq-success-ink" : "text-sq-heading"}`,
						children: S ? "Відкрита" : "Закрита"
					}),
					e.shift?.opened_at && /* @__PURE__ */ y("p", {
						className: "mt-1 text-[13px] text-sq-muted tabular-nums",
						children: ["Відкрита: ", new Date(e.shift.opened_at).toLocaleString("uk-UA")]
					}),
					e.error && /* @__PURE__ */ v("p", {
						className: "mt-2 text-[15px] text-red-600",
						children: e.error.message
					}),
					/* @__PURE__ */ v("div", {
						className: "mt-5 flex flex-wrap gap-3",
						children: S ? /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50",
							disabled: a,
							onClick: () => void x(),
							children: "X-звіт"
						}), /* @__PURE__ */ v("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-red-50 px-4 text-[17px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50",
							disabled: a,
							onClick: () => void b(),
							children: "Закрити зміну"
						})] }) : /* @__PURE__ */ v("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
							disabled: a,
							onClick: () => void h(),
							children: "Відкрити зміну"
						})
					})
				]
			}),
			!!s && /* @__PURE__ */ v(u, { error: s }),
			f && /* @__PURE__ */ v("pre", {
				className: "max-h-64 overflow-auto rounded-card bg-sq-surface shadow-card p-4 font-mono text-[13px] whitespace-pre-wrap",
				children: f
			}),
			l && /* @__PURE__ */ y("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [/* @__PURE__ */ v("p", {
					className: "text-[13px] font-semibold text-sq-secondary",
					children: "Z-звіт"
				}), /* @__PURE__ */ v("pre", {
					className: "mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap",
					children: l
				})]
			})
		]
	});
}
//#endregion
//#region src/modules/fiscal-core/components/HolderPanel.tsx
function C(e) {
	return e ? ` з ${new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	})}` : "";
}
function w({ status: e, onChanged: t }) {
	let n = x(), r = b((e) => e.pending), [i, d] = g(!1), [f, p] = g(null), [h, S] = g(null), [w, T] = g(!1), [E, D] = g(null);
	if (!e.offline?.enabled) return null;
	let O = e.holder, k = n === "cashier";
	async function A(e) {
		d(!0), p(null), S(null);
		try {
			S(await e()), t();
		} catch (e) {
			p(e), t();
		} finally {
			d(!1);
		}
	}
	let j = () => A(async () => (await a(), null)), M = () => A(async () => (await l(), null)), N = () => A(async () => (await o()).status === "claimed" ? "Касу зайнято — вона була вільна" : "Запит надіслано. Підтвердіть його на іншій касі"), P = () => A(async () => {
		let e = await c(r, w);
		return D(e.z_report_text ?? null), w ? "Зміну закрито, касу передано" : "Касу передано";
	});
	return /* @__PURE__ */ y("section", {
		className: "rounded-card bg-sq-surface shadow-card p-5 space-y-3",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3 pb-1",
				children: [/* @__PURE__ */ v(m, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h2", {
					className: "text-[17px] font-semibold text-sq-heading",
					children: "Каса ПРРО"
				})]
			}),
			!O && /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v("p", {
				className: "text-[15px] text-sq-secondary",
				children: "Вільна"
			}), k ? /* @__PURE__ */ v("button", {
				type: "button",
				className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
				disabled: i,
				onClick: () => void j(),
				children: "Зайняти касу"
			}) : /* @__PURE__ */ v("p", {
				className: "text-[13px] text-sq-muted",
				children: "Касу займе перший пристрій, який проведе продаж."
			})] }),
			O?.is_me && /* @__PURE__ */ y(_, { children: [
				/* @__PURE__ */ y("p", {
					className: "text-[15px] font-semibold text-sq-success-ink",
					children: ["Ця каса", C(O.since)]
				}),
				O.handover_request && /* @__PURE__ */ y("div", {
					className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800 space-y-2",
					children: [
						/* @__PURE__ */ y("p", {
							className: "font-semibold",
							children: [
								"Пристрій ",
								s(O.handover_request.name, O.handover_request.device_id),
								" ",
								"просить передати касу"
							]
						}),
						r > 0 && /* @__PURE__ */ y("p", { children: [
							"Спершу синхронізуйте чеки, що очікують: ",
							r,
							"."
						] }),
						/* @__PURE__ */ y("label", {
							className: "min-h-11 flex items-center gap-3 text-[15px]",
							children: [/* @__PURE__ */ v("input", {
								type: "checkbox",
								className: "w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]",
								checked: w,
								disabled: i,
								onChange: (e) => T(e.target.checked)
							}), "Закрити зміну (Z-звіт) перед передачею"]
						}),
						/* @__PURE__ */ v("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
							disabled: i,
							onClick: () => void P(),
							children: "Передати касу"
						})
					]
				}),
				/* @__PURE__ */ v("button", {
					type: "button",
					className: "w-full min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50",
					disabled: i,
					onClick: () => void M(),
					children: "Звільнити касу"
				})
			] }),
			O && !O.is_me && /* @__PURE__ */ y(_, { children: [
				/* @__PURE__ */ y("p", {
					className: "text-[15px] text-sq-text",
					children: [
						"Каса зайнята пристроєм ",
						s(O.name, O.device_id),
						C(O.since)
					]
				}),
				O.stale && /* @__PURE__ */ v("p", {
					className: "text-[13px] text-amber-700",
					children: "Каса не відповідає, можливо продає офлайн. Якщо вона не повернеться, власник може забрати касу примусово в налаштуваннях ПРРО."
				}),
				k && /* @__PURE__ */ v("button", {
					type: "button",
					className: "w-full min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50",
					disabled: i,
					onClick: () => void N(),
					children: "Запросити передачу"
				})
			] }),
			h && /* @__PURE__ */ v("p", {
				className: "text-[15px] text-sq-secondary",
				children: h
			}),
			E && /* @__PURE__ */ y("div", { children: [/* @__PURE__ */ v("p", {
				className: "text-[13px] font-semibold text-sq-secondary",
				children: "Z-звіт"
			}), /* @__PURE__ */ v("pre", {
				className: "mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap",
				children: E
			})] }),
			!!f && /* @__PURE__ */ v(u, { error: f })
		]
	});
}
//#endregion
//#region src/modules/fiscal-core/components/OfflinePanel.tsx
function T(e) {
	return `${Math.floor(e / 36e5)} год`;
}
function E(e) {
	return e ? new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	}) : "";
}
function D(e) {
	return e.pending + e.done + e.abandoned;
}
function O({ session: e }) {
	let t = e.documents, n = D(t);
	return e.status === "stuck" ? /* @__PURE__ */ y("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [
			/* @__PURE__ */ v("p", {
				className: "font-semibold",
				children: "Офлайн-чеки не надіслані в ДПС"
			}),
			e.error_message && /* @__PURE__ */ v("p", {
				className: "mt-1",
				children: e.error_message
			}),
			/* @__PURE__ */ y("p", {
				className: "mt-1",
				children: [
					"Чеків у сесії: ",
					n,
					". Зверніться до власника магазину — потрібен ручний розбір."
				]
			})
		]
	}) : e.status === "replaying" ? /* @__PURE__ */ y("div", {
		className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800",
		children: [/* @__PURE__ */ v("p", {
			className: "font-semibold",
			children: "Надсилаємо чеки в ДПС…"
		}), /* @__PURE__ */ y("p", {
			className: "mt-1",
			children: [
				t.done,
				" з ",
				n,
				!e.go_offline_sent && " · готуємо касу"
			]
		})]
	}) : /* @__PURE__ */ y("div", {
		className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800",
		children: [/* @__PURE__ */ y("p", {
			className: "font-semibold",
			children: ["Працюємо офлайн з ", E(e.started_at)]
		}), /* @__PURE__ */ y("p", {
			className: "mt-1",
			children: [
				"Чеків у сесії: ",
				n,
				". Зв’язок із ПРРО відновиться автоматично — чеки підуть у ДПС самі."
			]
		})]
	});
}
function k({ status: e }) {
	let t = e.offline;
	if (!t?.enabled) return null;
	let r = t.codes?.free ?? 0, i = t.codes?.leased_to_me ?? 0, a = r < Math.max(1, Math.floor(t.codes_target / 4)), o = t.month ?? null, s = o ? o.limit_ms - o.used_ms <= 432e5 : !1;
	return /* @__PURE__ */ y("section", {
		className: "rounded-card bg-sq-surface shadow-card p-5 space-y-2",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3 pb-1",
				children: [/* @__PURE__ */ v(n, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h2", {
					className: "text-[17px] font-semibold text-sq-heading",
					children: "Офлайн-режим ПРРО"
				})]
			}),
			/* @__PURE__ */ y("p", {
				className: `text-[15px] font-semibold tabular-nums ${a ? "text-amber-700" : "text-sq-text"}`,
				children: ["Запас фіскальних кодів: ", r]
			}),
			i > 0 && /* @__PURE__ */ y("p", {
				className: "text-[15px] text-sq-secondary tabular-nums",
				children: ["Із них на цій касі: ", i]
			}),
			a && /* @__PURE__ */ v("p", {
				className: "text-[13px] text-amber-700",
				children: "Запас майже вичерпано. Поки ПРРО доступне, він поповнюється автоматично."
			}),
			o && /* @__PURE__ */ y("p", {
				className: `text-[15px] tabular-nums ${s ? "text-amber-700 font-semibold" : "text-sq-secondary"}`,
				children: [
					"Офлайн цього місяця: ",
					T(o.used_ms),
					" із ",
					T(o.limit_ms),
					s && " — залишок малий"
				]
			}),
			t.session && /* @__PURE__ */ v("div", {
				className: "pt-1",
				children: /* @__PURE__ */ v(O, { session: t.session })
			})
		]
	});
}
//#endregion
//#region src/modules/fiscal-checkbox/pages/CheckboxTillPage.tsx
function A() {
	let [e, t] = g(""), [n, r] = g("in"), [i, a] = g(!1), [o, s] = g(null), [c, l] = g(!1);
	async function f() {
		let r = Number(e.replace(",", "."));
		if (!Number.isFinite(r) || r <= 0) return;
		let i = Math.round(r * 100) * (n === "in" ? 1 : -1);
		a(!0), s(null), l(!1);
		try {
			await d(i), l(!0), t("");
		} catch (e) {
			s(e);
		} finally {
			a(!1);
		}
	}
	return /* @__PURE__ */ y("section", {
		className: "rounded-card bg-sq-surface shadow-card p-5 space-y-4",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ v(p, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h2", {
					className: "text-[17px] font-semibold text-sq-heading",
					children: "Внесення / видача готівки"
				})]
			}),
			/* @__PURE__ */ v("div", {
				className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty",
				children: [["in", "Внесення"], ["out", "Видача"]].map(([e, t]) => /* @__PURE__ */ v("button", {
					type: "button",
					className: `flex-1 min-h-[42px] rounded-[9px] text-[15px] transition-colors ${n === e ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary hover:text-sq-text"}`,
					onClick: () => r(e),
					children: t
				}, e))
			}),
			/* @__PURE__ */ v("input", {
				className: "pos-field tabular-nums",
				inputMode: "decimal",
				placeholder: "Сума, ₴",
				value: e,
				onChange: (e) => t(e.target.value)
			}),
			!!o && /* @__PURE__ */ v(u, { error: o }),
			c && /* @__PURE__ */ y("p", {
				className: "flex items-center gap-2 text-[15px] font-medium text-sq-success-ink",
				children: [/* @__PURE__ */ v(h, {
					size: 20,
					className: "shrink-0"
				}), "Чек проведено"]
			}),
			/* @__PURE__ */ v("button", {
				type: "button",
				className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
				disabled: i || !e,
				onClick: () => void f(),
				children: i ? "Проведення…" : "Провести чек"
			})
		]
	});
}
function j() {
	let { status: t, isLoading: n, error: r, refresh: i } = f();
	return /* @__PURE__ */ y("div", {
		className: "flex-1 overflow-auto px-4 py-5 md:px-7 max-w-xl mx-auto w-full space-y-4 text-sq-text",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3 pb-1",
				children: [/* @__PURE__ */ v(e, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h1", {
					className: "text-2xl font-bold text-sq-heading",
					children: "Зміна ПРРО"
				})]
			}),
			n && /* @__PURE__ */ v("p", {
				className: "text-[15px] text-sq-muted",
				children: "Завантаження…"
			}),
			!!r && /* @__PURE__ */ v(u, { error: r }),
			t && /* @__PURE__ */ y(_, { children: [
				/* @__PURE__ */ v(S, {
					status: t,
					onChanged: () => void i()
				}),
				/* @__PURE__ */ v(k, { status: t }),
				/* @__PURE__ */ v(w, {
					status: t,
					onChanged: () => void i()
				}),
				t.shift?.status === "open" && /* @__PURE__ */ v(A, {})
			] })
		]
	});
}
//#endregion
export { j as CheckboxTillPage };
