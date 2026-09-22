import { d as e, g as t, h as n, l as r, n as i, r as a, t as o, u as s } from "./useFiscalStatus-ByHRzVE7.js";
import { useCallback as c, useEffect as l, useState as u } from "react";
import { Fragment as d, jsx as f, jsxs as p } from "react/jsx-runtime";
//#region src/modules/fiscal-core/components/SecretsForm.tsx
function m({ specs: e, secretsSet: t, saving: n, onSave: r }) {
	let [i, a] = u({}), o = (e, t) => a((n) => ({
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
	return /* @__PURE__ */ p("div", {
		className: "space-y-3",
		children: [e.map((e) => {
			let n = t.includes(e.key);
			return /* @__PURE__ */ p("div", {
				className: "space-y-1",
				children: [
					/* @__PURE__ */ p("label", {
						className: "block text-sm",
						children: [/* @__PURE__ */ p("span", {
							className: "text-sq-secondary",
							children: [e.label, e.required && /* @__PURE__ */ f("span", {
								className: "text-red-600",
								children: " *"
							})]
						}), /* @__PURE__ */ p("div", {
							className: "mt-1 flex items-center gap-2",
							children: [/* @__PURE__ */ f("input", {
								type: e.kind === "password" ? "password" : "text",
								className: "pos-input flex-1",
								value: i[e.key] ?? "",
								onChange: (t) => o(e.key, t.target.value),
								placeholder: n ? "••••••••" : e.hint,
								autoComplete: "off"
							}), n && /* @__PURE__ */ f("button", {
								type: "button",
								className: "shrink-0 rounded-sq border border-sq-divider px-2 py-1.5 text-xs text-sq-secondary hover:bg-sq-bg",
								onClick: () => c(e.key),
								children: "Очистити"
							})]
						})]
					}),
					n && !i[e.key] && /* @__PURE__ */ f("p", {
						className: "text-xs text-sq-muted",
						children: "Значення збережено — залиште порожнім, щоб не змінювати."
					}),
					e.hint && /* @__PURE__ */ f("p", {
						className: "text-xs text-sq-muted",
						children: e.hint
					})
				]
			}, e.key);
		}), /* @__PURE__ */ f("button", {
			type: "button",
			className: "pos-btn-primary px-4 py-2",
			disabled: n,
			onClick: s,
			children: n ? "Збереження…" : "Зберегти дані доступу"
		})]
	});
}
//#endregion
//#region src/modules/fiscal-checkbox/secretSpecs.ts
var h = [{
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
function g(e) {
	return (e / 100).toFixed(2) + " ₴";
}
function _() {
	let [t, n] = u(null), [r, i] = u([]), [o, s] = u(null);
	return l(() => {
		e().then((e) => {
			n(e.documents), i(e.sessions ?? []);
		}).catch(s);
	}, []), o ? /* @__PURE__ */ f(a, { error: o }) : t ? t.length === 0 && r.length === 0 ? /* @__PURE__ */ f("p", {
		className: "text-sm text-sq-secondary",
		children: "Немає документів, що потребують уваги."
	}) : /* @__PURE__ */ p("div", {
		className: "space-y-3",
		children: [r.map((e) => /* @__PURE__ */ p("div", {
			role: "alert",
			className: "rounded-sq bg-red-50 px-3 py-2 text-sm text-red-700",
			children: [
				/* @__PURE__ */ p("p", {
					className: "font-semibold",
					children: [
						"Офлайн-сесія #",
						e.id,
						" зупинена"
					]
				}),
				/* @__PURE__ */ f("p", {
					className: "mt-1",
					children: e.error_message ?? e.error_code ?? "Причина невідома"
				}),
				/* @__PURE__ */ p("p", {
					className: "mt-0.5 text-xs",
					children: [
						"Чеків: ",
						e.documents.pending + e.documents.done + e.documents.abandoned,
						" · не надіслано: ",
						e.documents.pending,
						" · з ",
						new Date(e.started_at).toLocaleString("uk-UA")
					]
				}),
				/* @__PURE__ */ f("p", {
					className: "mt-1 text-xs",
					children: "Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть."
				})
			]
		}, `session-${e.id}`)), t.length > 0 && /* @__PURE__ */ f("ul", {
			className: "divide-y divide-sq-divider rounded-sq border border-sq-divider",
			children: t.map((e) => /* @__PURE__ */ p("li", {
				className: "p-3 text-sm",
				children: [
					/* @__PURE__ */ p("div", {
						className: "flex justify-between",
						children: [/* @__PURE__ */ f("span", {
							className: "font-medium",
							children: e.receipt_number ?? `#${e.id}`
						}), /* @__PURE__ */ f("span", { children: g(e.total_cents) })]
					}),
					/* @__PURE__ */ f("p", {
						className: "mt-1 text-xs text-red-600",
						children: e.error_message ?? e.error_code ?? "Помилка ПРРО"
					}),
					/* @__PURE__ */ p("p", {
						className: "mt-0.5 text-xs text-sq-muted",
						children: [
							"Спроб: ",
							e.attempts,
							" · ",
							new Date(e.created_at).toLocaleString("uk-UA")
						]
					})
				]
			}, e.id))
		})]
	}) : /* @__PURE__ */ f("p", {
		className: "text-sm text-sq-secondary",
		children: "Завантаження…"
	});
}
function v({ status: e, onChanged: t }) {
	let [n, o] = u(!1), [s, c] = u(null), [l, m] = u(null);
	if (!e.offline?.enabled) return null;
	let h = e.holder, g = h?.handover_request ?? null;
	async function _() {
		o(!0), c(null), m(null);
		try {
			let e = await r();
			m(`Касу передано. Зупинено сесій: ${e.stuck_sessions}, згорілих кодів: ${e.burned_codes}.`), t();
		} catch (e) {
			c(e);
		} finally {
			o(!1);
		}
	}
	return /* @__PURE__ */ p("section", {
		className: "space-y-2",
		children: [
			/* @__PURE__ */ f("p", {
				className: "sq-section-label",
				children: "Каса ПРРО"
			}),
			h ? /* @__PURE__ */ p("p", {
				className: "text-sm text-sq-secondary",
				children: [
					"Каса зайнята пристроєм ",
					i(h.name, h.device_id),
					h.since && ` з ${new Date(h.since).toLocaleString("uk-UA")}`,
					h.stale && " · каса не відповідає, можливо продає офлайн"
				]
			}) : /* @__PURE__ */ f("p", {
				className: "text-sm text-sq-secondary",
				children: "Вільна"
			}),
			g ? /* @__PURE__ */ p(d, { children: [
				/* @__PURE__ */ p("p", {
					className: "text-sm",
					children: [
						"Пристрій ",
						i(g.name, g.device_id),
						" просить передати касу"
					]
				}),
				/* @__PURE__ */ f("button", {
					type: "button",
					className: "rounded-sq border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700",
					disabled: n,
					onClick: () => void _(),
					children: "Забрати касу примусово"
				}),
				/* @__PURE__ */ f("p", {
					className: "text-xs text-sq-muted",
					children: "Тільки якщо попередня каса не може підтвердити передачу сама: її незавершена офлайн-сесія зупиниться, а видані їй коди згорять."
				})
			] }) : h && /* @__PURE__ */ f("p", {
				className: "text-xs text-sq-muted",
				children: "Щоб передати касу, надішліть запит із тієї каси, якій вона потрібна."
			}),
			l && /* @__PURE__ */ f("p", {
				className: "text-sm text-sq-secondary",
				children: l
			}),
			!!s && /* @__PURE__ */ f(a, { error: s })
		]
	});
}
function y() {
	let { status: e, refresh: r } = o(), [i, g] = u(null), [y, b] = u(null), [x, S] = u(!1), [C, w] = u(null), [T, E] = u(null), [D, O] = u(!1), [k, A] = u(null), j = c(() => {
		s().then(g).catch(b);
	}, []);
	l(j, [j]);
	async function M(e) {
		S(!0), w(null);
		try {
			let t = await n(e);
			g(t);
		} catch (e) {
			w(e);
		} finally {
			S(!1);
		}
	}
	async function N() {
		O(!0), A(null), E(null);
		try {
			E(await t());
		} catch (e) {
			A(e);
		} finally {
			O(!1);
		}
	}
	return /* @__PURE__ */ p("div", {
		className: "p-5 space-y-6 max-w-lg",
		children: [
			/* @__PURE__ */ f("h1", {
				className: "text-lg font-semibold",
				children: "Фіскалізація — Checkbox"
			}),
			!!y && /* @__PURE__ */ f(a, { error: y }),
			i && /* @__PURE__ */ p(d, { children: [
				/* @__PURE__ */ p("section", {
					className: "space-y-2",
					children: [
						/* @__PURE__ */ f("p", {
							className: "sq-section-label",
							children: "Дані доступу"
						}),
						/* @__PURE__ */ f(m, {
							specs: h,
							secretsSet: i.secrets_set,
							saving: x,
							onSave: (e) => void M(e)
						}),
						!!C && /* @__PURE__ */ f(a, { error: C })
					]
				}),
				/* @__PURE__ */ p("section", {
					className: "space-y-2",
					children: [
						/* @__PURE__ */ f("p", {
							className: "sq-section-label",
							children: "Зʼєднання"
						}),
						/* @__PURE__ */ f("button", {
							type: "button",
							className: "rounded-sq border border-sq-divider px-4 py-2 text-sm font-medium",
							disabled: D,
							onClick: () => void N(),
							children: D ? "Перевірка…" : "Перевірити з'єднання"
						}),
						!!k && /* @__PURE__ */ f(a, { error: k }),
						T && /* @__PURE__ */ f("div", {
							className: `rounded-sq px-3 py-2 text-sm ${T.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-900"}`,
							children: T.ok ? /* @__PURE__ */ p(d, { children: [
								/* @__PURE__ */ f("p", {
									className: "font-semibold",
									children: "З'єднання успішне"
								}),
								T.cashierName && /* @__PURE__ */ p("p", { children: ["Касир: ", T.cashierName] }),
								T.cashRegister && /* @__PURE__ */ p("p", { children: ["Каса: ", T.cashRegister] })
							] }) : /* @__PURE__ */ f("p", { children: T.message ?? "Перевірка не пройдена" })
						})
					]
				}),
				e && /* @__PURE__ */ f(v, {
					status: e,
					onChanged: () => void r()
				}),
				/* @__PURE__ */ p("section", {
					className: "space-y-2",
					children: [/* @__PURE__ */ f("p", {
						className: "sq-section-label",
						children: "Потребують уваги"
					}), /* @__PURE__ */ f(_, {})]
				})
			] })
		]
	});
}
//#endregion
export { y as CheckboxAdminPage };
