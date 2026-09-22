import { a as e, c as t, f as n, i as r, m as i, n as a, o, p as s, r as c, s as l, t as u } from "./useFiscalStatus-ByHRzVE7.js";
import { useState as d } from "react";
import { useOfflineStatus as f, usePosShell as p } from "@pos/platform";
import { Fragment as m, jsx as h, jsxs as g } from "react/jsx-runtime";
//#region src/modules/fiscal-core/components/ShiftPanel.tsx
function _({ status: r, onChanged: i }) {
	let [a, o] = d(!1), [s, l] = d(null), [u, f] = d(null), [p, _] = d(null);
	async function v(e) {
		o(!0), l(null);
		try {
			await e();
		} catch (e) {
			l(e);
		} finally {
			o(!1);
		}
	}
	let y = () => v(async () => {
		await n(), i();
	}), b = () => v(async () => {
		let t = await e();
		f(t.z_report_text), i();
	}), x = () => v(async () => {
		let e = await t();
		_(e.text);
	});
	if (!r.configured) return /* @__PURE__ */ g("div", {
		role: "alert",
		className: "rounded-sq bg-red-50 px-3 py-2.5 text-sm text-red-700",
		children: [/* @__PURE__ */ h("p", {
			className: "font-semibold",
			children: "ПРРО не налаштовано"
		}), r.error?.message && /* @__PURE__ */ h("p", {
			className: "mt-1",
			children: r.error.message
		})]
	});
	let S = r.shift?.status === "open";
	return /* @__PURE__ */ g("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ g("div", {
				className: "rounded-sq bg-sq-surface border border-sq-divider p-4",
				children: [
					/* @__PURE__ */ h("p", {
						className: "sq-section-label",
						children: "Зміна"
					}),
					/* @__PURE__ */ h("p", {
						className: `mt-1 text-lg font-semibold ${S ? "text-emerald-600" : "text-sq-secondary"}`,
						children: S ? "Відкрита" : "Закрита"
					}),
					r.shift?.opened_at && /* @__PURE__ */ g("p", {
						className: "mt-1 text-xs text-sq-muted",
						children: ["Відкрита: ", new Date(r.shift.opened_at).toLocaleString("uk-UA")]
					}),
					r.error && /* @__PURE__ */ h("p", {
						className: "mt-2 text-sm text-red-600",
						children: r.error.message
					})
				]
			}),
			!!s && /* @__PURE__ */ h(c, { error: s }),
			/* @__PURE__ */ h("div", {
				className: "flex flex-wrap gap-2",
				children: S ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("button", {
					type: "button",
					className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
					disabled: a,
					onClick: () => void x(),
					children: "X-звіт"
				}), /* @__PURE__ */ h("button", {
					type: "button",
					className: "rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700",
					disabled: a,
					onClick: () => void b(),
					children: "Закрити зміну"
				})] }) : /* @__PURE__ */ h("button", {
					type: "button",
					className: "pos-btn-primary px-4 py-2",
					disabled: a,
					onClick: () => void y(),
					children: "Відкрити зміну"
				})
			}),
			p && /* @__PURE__ */ h("pre", {
				className: "max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap",
				children: p
			}),
			u && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("p", {
				className: "sq-section-label",
				children: "Z-звіт"
			}), /* @__PURE__ */ h("pre", {
				className: "mt-1 max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap",
				children: u
			})] })
		]
	});
}
//#endregion
//#region src/modules/fiscal-core/components/HolderPanel.tsx
function v(e) {
	return e ? ` з ${new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	})}` : "";
}
function y({ status: e, onChanged: t }) {
	let n = p(), l = f((e) => e.pending), [u, _] = d(!1), [y, b] = d(null), [x, S] = d(null), [C, w] = d(!1), [T, E] = d(null);
	if (!e.offline?.enabled) return null;
	let D = e.holder, O = n === "cashier";
	async function k(e) {
		_(!0), b(null), S(null);
		try {
			S(await e()), t();
		} catch (e) {
			b(e), t();
		} finally {
			_(!1);
		}
	}
	let A = () => k(async () => (await r(), null)), j = () => k(async () => (await s(), null)), M = () => k(async () => (await i()).status === "claimed" ? "Касу зайнято — вона була вільна" : "Запит надіслано. Підтвердіть його на іншій касі"), N = () => k(async () => {
		let e = await o(l, C);
		return E(e.z_report_text ?? null), C ? "Зміну закрито, касу передано" : "Касу передано";
	});
	return /* @__PURE__ */ g("div", {
		className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3",
		children: [
			/* @__PURE__ */ h("p", {
				className: "sq-section-label",
				children: "Каса ПРРО"
			}),
			!D && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("p", {
				className: "text-sm text-sq-secondary",
				children: "Вільна"
			}), O ? /* @__PURE__ */ h("button", {
				type: "button",
				className: "pos-btn-primary px-4 py-2",
				disabled: u,
				onClick: () => void A(),
				children: "Зайняти касу"
			}) : /* @__PURE__ */ h("p", {
				className: "text-xs text-sq-muted",
				children: "Касу займе перший пристрій, який проведе продаж."
			})] }),
			D?.is_me && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("p", {
					className: "text-sm font-semibold text-emerald-600",
					children: ["Ця каса", v(D.since)]
				}),
				D.handover_request && /* @__PURE__ */ g("div", {
					className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900",
					children: [
						/* @__PURE__ */ g("p", {
							className: "font-semibold",
							children: [
								"Пристрій ",
								a(D.handover_request.name, D.handover_request.device_id),
								" ",
								"просить передати касу"
							]
						}),
						l > 0 && /* @__PURE__ */ g("p", {
							className: "mt-1",
							children: [
								"Спершу синхронізуйте чеки, що очікують: ",
								l,
								"."
							]
						}),
						/* @__PURE__ */ g("label", {
							className: "mt-2 flex items-center gap-2 text-sm",
							children: [/* @__PURE__ */ h("input", {
								type: "checkbox",
								checked: C,
								disabled: u,
								onChange: (e) => w(e.target.checked)
							}), "Закрити зміну (Z-звіт) перед передачею"]
						}),
						/* @__PURE__ */ h("button", {
							type: "button",
							className: "pos-btn-primary mt-2 px-4 py-2",
							disabled: u,
							onClick: () => void N(),
							children: "Передати касу"
						})
					]
				}),
				/* @__PURE__ */ h("button", {
					type: "button",
					className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
					disabled: u,
					onClick: () => void j(),
					children: "Звільнити касу"
				})
			] }),
			D && !D.is_me && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("p", {
					className: "text-sm text-sq-secondary",
					children: [
						"Каса зайнята пристроєм ",
						a(D.name, D.device_id),
						v(D.since)
					]
				}),
				D.stale && /* @__PURE__ */ h("p", {
					className: "text-xs text-amber-700",
					children: "Каса не відповідає, можливо продає офлайн. Якщо вона не повернеться, власник може забрати касу примусово в налаштуваннях ПРРО."
				}),
				O && /* @__PURE__ */ h("button", {
					type: "button",
					className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
					disabled: u,
					onClick: () => void M(),
					children: "Запросити передачу"
				})
			] }),
			x && /* @__PURE__ */ h("p", {
				className: "text-sm text-sq-secondary",
				children: x
			}),
			T && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("p", {
				className: "sq-section-label",
				children: "Z-звіт"
			}), /* @__PURE__ */ h("pre", {
				className: "mt-1 max-h-64 overflow-auto rounded-sq bg-sq-bg p-3 font-mono text-xs whitespace-pre-wrap",
				children: T
			})] }),
			!!y && /* @__PURE__ */ h(c, { error: y })
		]
	});
}
//#endregion
//#region src/modules/fiscal-core/components/OfflinePanel.tsx
function b(e) {
	return `${Math.floor(e / 36e5)} год`;
}
function x(e) {
	return e ? new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	}) : "";
}
function S(e) {
	return e.pending + e.done + e.abandoned;
}
function C({ session: e }) {
	let t = e.documents, n = S(t);
	return e.status === "stuck" ? /* @__PURE__ */ g("div", {
		role: "alert",
		className: "rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700",
		children: [
			/* @__PURE__ */ h("p", {
				className: "font-semibold",
				children: "Офлайн-чеки не надіслані в ДПС"
			}),
			e.error_message && /* @__PURE__ */ h("p", {
				className: "mt-1",
				children: e.error_message
			}),
			/* @__PURE__ */ g("p", {
				className: "mt-1",
				children: [
					"Чеків у сесії: ",
					n,
					". Зверніться до власника магазину — потрібен ручний розбір."
				]
			})
		]
	}) : e.status === "replaying" ? /* @__PURE__ */ g("div", {
		className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900",
		children: [/* @__PURE__ */ h("p", {
			className: "font-semibold",
			children: "Надсилаємо чеки в ДПС…"
		}), /* @__PURE__ */ g("p", {
			className: "mt-1",
			children: [
				t.done,
				" з ",
				n,
				!e.go_offline_sent && " · готуємо касу"
			]
		})]
	}) : /* @__PURE__ */ g("div", {
		className: "rounded-sq bg-amber-50 px-3 py-2 text-sm text-amber-900",
		children: [/* @__PURE__ */ g("p", {
			className: "font-semibold",
			children: ["Працюємо офлайн з ", x(e.started_at)]
		}), /* @__PURE__ */ g("p", {
			className: "mt-1",
			children: [
				"Чеків у сесії: ",
				n,
				". Зв’язок із ПРРО відновиться автоматично — чеки підуть у ДПС самі."
			]
		})]
	});
}
function w({ status: e }) {
	let t = e.offline;
	if (!t?.enabled) return null;
	let n = t.codes?.free ?? 0, r = t.codes?.leased_to_me ?? 0, i = n < Math.max(1, Math.floor(t.codes_target / 4)), a = t.month ?? null, o = a ? a.limit_ms - a.used_ms <= 432e5 : !1;
	return /* @__PURE__ */ g("div", {
		className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-2",
		children: [
			/* @__PURE__ */ h("p", {
				className: "sq-section-label",
				children: "Офлайн-режим ПРРО"
			}),
			/* @__PURE__ */ g("p", {
				className: `text-sm font-semibold ${i ? "text-amber-600" : "text-sq-secondary"}`,
				children: ["Запас фіскальних кодів: ", n]
			}),
			r > 0 && /* @__PURE__ */ g("p", {
				className: "text-sm text-sq-secondary",
				children: ["Із них на цій касі: ", r]
			}),
			i && /* @__PURE__ */ h("p", {
				className: "text-xs text-amber-700",
				children: "Запас майже вичерпано. Поки ПРРО доступне, він поповнюється автоматично."
			}),
			a && /* @__PURE__ */ g("p", {
				className: `text-sm ${o ? "text-amber-600 font-semibold" : "text-sq-secondary"}`,
				children: [
					"Офлайн цього місяця: ",
					b(a.used_ms),
					" із ",
					b(a.limit_ms),
					o && " — залишок малий"
				]
			}),
			t.session && /* @__PURE__ */ h(C, { session: t.session })
		]
	});
}
//#endregion
//#region src/modules/fiscal-checkbox/pages/CheckboxTillPage.tsx
function T() {
	let [e, t] = d(""), [n, r] = d("in"), [i, a] = d(!1), [o, s] = d(null), [u, f] = d(!1);
	async function p() {
		let r = Number(e.replace(",", "."));
		if (!Number.isFinite(r) || r <= 0) return;
		let i = Math.round(r * 100) * (n === "in" ? 1 : -1);
		a(!0), s(null), f(!1);
		try {
			await l(i), f(!0), t("");
		} catch (e) {
			s(e);
		} finally {
			a(!1);
		}
	}
	return /* @__PURE__ */ g("div", {
		className: "rounded-sq bg-sq-surface border border-sq-divider p-4 space-y-3",
		children: [
			/* @__PURE__ */ h("p", {
				className: "sq-section-label",
				children: "Внесення / видача готівки"
			}),
			/* @__PURE__ */ g("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ h("button", {
					type: "button",
					className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${n === "in" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
					onClick: () => r("in"),
					children: "Внесення"
				}), /* @__PURE__ */ h("button", {
					type: "button",
					className: `flex-1 rounded-sq border px-3 py-2 text-sm font-medium ${n === "out" ? "border-sq-blue bg-sq-blue/10 text-sq-blue" : "border-sq-divider"}`,
					onClick: () => r("out"),
					children: "Видача"
				})]
			}),
			/* @__PURE__ */ h("input", {
				className: "pos-input w-full",
				inputMode: "decimal",
				placeholder: "Сума, ₴",
				value: e,
				onChange: (e) => t(e.target.value)
			}),
			!!o && /* @__PURE__ */ h(c, { error: o }),
			u && /* @__PURE__ */ h("p", {
				className: "text-sm text-emerald-600",
				children: "Чек проведено"
			}),
			/* @__PURE__ */ h("button", {
				type: "button",
				className: "pos-btn-primary px-4 py-2",
				disabled: i || !e,
				onClick: () => void p(),
				children: i ? "Проведення…" : "Провести чек"
			})
		]
	});
}
function E() {
	let { status: e, isLoading: t, error: n, refresh: r } = u();
	return /* @__PURE__ */ g("div", {
		className: "p-4 space-y-4 max-w-md mx-auto",
		children: [
			/* @__PURE__ */ h("h1", {
				className: "text-lg font-semibold",
				children: "Зміна ПРРО"
			}),
			t && /* @__PURE__ */ h("p", {
				className: "text-sm text-sq-secondary",
				children: "Завантаження…"
			}),
			!!n && /* @__PURE__ */ h(c, { error: n }),
			e && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ h(_, {
					status: e,
					onChanged: () => void r()
				}),
				/* @__PURE__ */ h(w, { status: e }),
				/* @__PURE__ */ h(y, {
					status: e,
					onChanged: () => void r()
				}),
				e.shift?.status === "open" && /* @__PURE__ */ h(T, {})
			] })
		]
	});
}
//#endregion
export { E as CheckboxTillPage };
