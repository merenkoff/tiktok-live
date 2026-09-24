import { S as e, _ as t, d as n, g as r, h as i, l as a, n as o, r as s, t as c, u as l, y as u } from "./useFiscalStatus-BmaNbdzp.js";
import { useCallback as d, useEffect as f, useState as p } from "react";
import { Fragment as m, jsx as h, jsxs as g } from "react/jsx-runtime";
import { Link as _ } from "react-router-dom";
//#region src/components/ui/Page.tsx
function v({ title: e, glyph: n, subtitle: r, actions: i, back: a }) {
	return /* @__PURE__ */ g("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			a && /* @__PURE__ */ g(_, {
				to: a.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ h(t, { size: 20 }), a.label]
			}),
			/* @__PURE__ */ g("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					n && /* @__PURE__ */ h(n, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ h("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					i && /* @__PURE__ */ h("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: i
					})
				]
			}),
			r && /* @__PURE__ */ h("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: r
			})
		]
	});
}
function y({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ g("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ g("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ h("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ h("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
//#endregion
//#region src/modules/fiscal-core/components/SecretsForm.tsx
function b({ specs: e, secretsSet: t, saving: n, onSave: r }) {
	let [i, a] = p({}), o = (e, t) => a((n) => ({
		...n,
		[e]: t
	}));
	function s() {
		let t = {};
		for (let n of e) i[n.key] !== void 0 && i[n.key] !== "" && (t[n.key] = i[n.key]);
		Object.keys(t).length !== 0 && (r(t), a({}));
	}
	function c(e) {
		r({ [e]: null });
	}
	return /* @__PURE__ */ g("div", {
		className: "space-y-4",
		children: [e.map((e) => {
			let n = t.includes(e.key);
			return /* @__PURE__ */ g("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ g("label", {
						className: "flex flex-col gap-1.5",
						children: [/* @__PURE__ */ g("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: [e.label, e.required && /* @__PURE__ */ h("span", {
								className: "text-red-600",
								children: " *"
							})]
						}), /* @__PURE__ */ g("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ h("input", {
								type: e.kind === "password" ? "password" : "text",
								className: "sq-input flex-1",
								value: i[e.key] ?? "",
								onChange: (t) => o(e.key, t.target.value),
								placeholder: n ? "••••••••" : e.hint,
								autoComplete: "off"
							}), n && /* @__PURE__ */ h("button", {
								type: "button",
								className: "shrink-0 min-h-9 text-[15px] font-semibold text-red-600",
								onClick: () => c(e.key),
								children: "Очистити"
							})]
						})]
					}),
					n && !i[e.key] && /* @__PURE__ */ h("p", {
						className: "text-[13px] text-sq-muted",
						children: "Значення збережено — залиште порожнім, щоб не змінювати."
					}),
					e.hint && /* @__PURE__ */ h("p", {
						className: "text-[13px] text-sq-muted",
						children: e.hint
					})
				]
			}, e.key);
		}), /* @__PURE__ */ h("button", {
			type: "button",
			className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]",
			disabled: n,
			onClick: s,
			children: n ? "Збереження…" : "Зберегти дані доступу"
		})]
	});
}
//#endregion
//#region src/modules/fiscal-checkbox/secretSpecs.ts
var x = [{
	key: "licenceKey",
	label: "Ліцензійний ключ",
	required: !0,
	kind: "password",
	hint: "Кабінет Checkbox → Каси → обраний реєстратор"
}, {
	key: "cashierPin",
	label: "PIN-код касира",
	required: !0,
	kind: "password",
	hint: "4–6 цифр, як у кабінеті Checkbox"
}];
//#endregion
//#region src/modules/fiscal-checkbox/pages/CheckboxAdminPage.tsx
function S(e) {
	return (e / 100).toFixed(2) + " ₴";
}
function C() {
	let [e, t] = p(null), [r, i] = p([]), [a, o] = p(null);
	return f(() => {
		n().then((e) => {
			t(e.documents), i(e.sessions ?? []);
		}).catch(o);
	}, []), a ? /* @__PURE__ */ h(s, { error: a }) : e ? e.length === 0 && r.length === 0 ? /* @__PURE__ */ g("p", {
		className: "py-3 flex items-center gap-2 text-[15px] text-sq-secondary",
		children: [/* @__PURE__ */ h(u, {
			size: 20,
			className: "shrink-0 text-sq-success"
		}), "Немає документів, що потребують уваги."]
	}) : /* @__PURE__ */ g("div", {
		className: "space-y-3 pt-2",
		children: [r.map((e) => /* @__PURE__ */ g("div", {
			role: "alert",
			className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
			children: [
				/* @__PURE__ */ g("p", {
					className: "font-semibold",
					children: [
						"Офлайн-сесія #",
						e.id,
						" зупинена"
					]
				}),
				/* @__PURE__ */ h("p", {
					className: "mt-1",
					children: e.error_message ?? e.error_code ?? "Причина невідома"
				}),
				/* @__PURE__ */ g("p", {
					className: "mt-1 text-[13px] tabular-nums",
					children: [
						"Чеків: ",
						e.documents.pending + e.documents.done + e.documents.abandoned,
						" · не надіслано: ",
						e.documents.pending,
						" · з ",
						new Date(e.started_at).toLocaleString("uk-UA")
					]
				}),
				/* @__PURE__ */ h("p", {
					className: "mt-1 text-[13px]",
					children: "Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть."
				})
			]
		}, `session-${e.id}`)), e.length > 0 && /* @__PURE__ */ h("ul", { children: e.map((e) => /* @__PURE__ */ g("li", {
			className: "sq-row py-2.5",
			children: [
				/* @__PURE__ */ g("div", {
					className: "flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ h("span", {
						className: "text-base font-medium text-sq-text tabular-nums",
						children: e.receipt_number ?? `#${e.id}`
					}), /* @__PURE__ */ h("span", {
						className: "text-[15px] text-sq-text tabular-nums",
						children: S(e.total_cents)
					})]
				}),
				/* @__PURE__ */ h("p", {
					className: "mt-0.5 text-[13px] text-red-600",
					children: e.error_message ?? e.error_code ?? "Помилка ПРРО"
				}),
				/* @__PURE__ */ g("p", {
					className: "mt-0.5 text-[13px] text-sq-muted tabular-nums",
					children: [
						"Спроб: ",
						e.attempts,
						" · ",
						new Date(e.created_at).toLocaleString("uk-UA")
					]
				})
			]
		}, e.id)) })]
	}) : /* @__PURE__ */ h("p", {
		className: "py-3 text-[15px] text-sq-muted",
		children: "Завантаження…"
	});
}
function w({ status: e, onChanged: t }) {
	let [n, r] = p(!1), [i, c] = p(null), [l, u] = p(null);
	if (!e.offline?.enabled) return null;
	let d = e.holder, f = d?.handover_request ?? null;
	async function _() {
		r(!0), c(null), u(null);
		try {
			let e = await a();
			u(`Касу передано. Зупинено сесій: ${e.stuck_sessions}, згорілих кодів: ${e.burned_codes}.`), t();
		} catch (e) {
			c(e);
		} finally {
			r(!1);
		}
	}
	return /* @__PURE__ */ g("section", { children: [/* @__PURE__ */ h(y, { title: "Каса ПРРО" }), /* @__PURE__ */ g("div", {
		className: "pt-3 space-y-3",
		children: [
			d ? /* @__PURE__ */ g("p", {
				className: "text-[15px] text-sq-text",
				children: [
					"Каса зайнята пристроєм ",
					o(d.name, d.device_id),
					d.since && ` з ${new Date(d.since).toLocaleString("uk-UA")}`,
					d.stale && " · каса не відповідає, можливо продає офлайн"
				]
			}) : /* @__PURE__ */ h("p", {
				className: "text-[15px] text-sq-secondary",
				children: "Вільна"
			}),
			f ? /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("p", {
					className: "text-[15px] font-semibold text-sq-text",
					children: [
						"Пристрій ",
						o(f.name, f.device_id),
						" просить передати касу"
					]
				}),
				/* @__PURE__ */ h("button", {
					type: "button",
					className: "min-h-11 px-4 rounded-sq bg-red-50 text-[15px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50",
					disabled: n,
					onClick: () => void _(),
					children: "Забрати касу примусово"
				}),
				/* @__PURE__ */ h("p", {
					className: "text-[13px] text-sq-muted",
					children: "Тільки якщо попередня каса не може підтвердити передачу сама: її незавершена офлайн-сесія зупиниться, а видані їй коди згорять."
				})
			] }) : d && /* @__PURE__ */ h("p", {
				className: "text-[13px] text-sq-muted",
				children: "Щоб передати касу, надішліть запит із тієї каси, якій вона потрібна."
			}),
			l && /* @__PURE__ */ h("p", {
				className: "text-[15px] text-sq-secondary",
				children: l
			}),
			!!i && /* @__PURE__ */ h(s, { error: i })
		]
	})] });
}
function T() {
	let { status: t, refresh: n } = c(), [a, o] = p(null), [u, _] = p(null), [S, T] = p(!1), [E, D] = p(null), [O, k] = p(null), [A, j] = p(!1), [M, N] = p(null), P = d(() => {
		l().then(o).catch(_);
	}, []);
	f(P, [P]);
	async function F(e) {
		T(!0), D(null);
		try {
			let t = await i(e);
			o(t);
		} catch (e) {
			D(e);
		} finally {
			T(!1);
		}
	}
	async function I() {
		j(!0), N(null), k(null);
		try {
			k(await r());
		} catch (e) {
			N(e);
		} finally {
			j(!1);
		}
	}
	return /* @__PURE__ */ g("div", {
		className: "space-y-8 animate-fade-up max-w-2xl text-sq-text",
		children: [
			/* @__PURE__ */ h(v, {
				glyph: e,
				title: "Фіскалізація — Checkbox"
			}),
			!!u && /* @__PURE__ */ h(s, { error: u }),
			a && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("section", { children: [/* @__PURE__ */ h(y, { title: "Дані доступу" }), /* @__PURE__ */ g("div", {
					className: "pt-4 space-y-3",
					children: [/* @__PURE__ */ h(b, {
						specs: x,
						secretsSet: a.secrets_set,
						saving: S,
						onSave: (e) => void F(e)
					}), !!E && /* @__PURE__ */ h(s, { error: E })]
				})] }),
				/* @__PURE__ */ g("section", { children: [/* @__PURE__ */ h(y, { title: "Зʼєднання" }), /* @__PURE__ */ g("div", {
					className: "pt-4 space-y-3",
					children: [
						/* @__PURE__ */ h("button", {
							type: "button",
							className: "sq-btn-quiet",
							disabled: A,
							onClick: () => void I(),
							children: A ? "Перевірка…" : "Перевірити з'єднання"
						}),
						!!M && /* @__PURE__ */ h(s, { error: M }),
						O && /* @__PURE__ */ h("div", {
							className: `rounded-xl px-4 py-3 text-[15px] ${O.ok ? "bg-sq-success/10 text-sq-success-ink" : "bg-amber-50 text-amber-800"}`,
							children: O.ok ? /* @__PURE__ */ g(m, { children: [
								/* @__PURE__ */ h("p", {
									className: "font-semibold",
									children: "З'єднання успішне"
								}),
								O.cashierName && /* @__PURE__ */ g("p", { children: ["Касир: ", O.cashierName] }),
								O.cashRegister && /* @__PURE__ */ g("p", { children: ["Каса: ", O.cashRegister] })
							] }) : /* @__PURE__ */ h("p", { children: O.message ?? "Перевірка не пройдена" })
						})
					]
				})] }),
				t && /* @__PURE__ */ h(w, {
					status: t,
					onChanged: () => void n()
				}),
				/* @__PURE__ */ g("section", { children: [/* @__PURE__ */ h(y, { title: "Потребують уваги" }), /* @__PURE__ */ h(C, {})] })
			] })
		]
	});
}
//#endregion
export { T as CheckboxAdminPage };
