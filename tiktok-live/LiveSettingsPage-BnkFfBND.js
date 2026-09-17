import { d as e, f as t, i as n, l as r, n as i, p as a, r as o, t as s, u as c } from "./SupportCode-DM4FbOTP.js";
import { useCallback as l, useEffect as u, useState as d } from "react";
import { jsx as f, jsxs as p } from "react/jsx-runtime";
import { Link as m } from "react-router-dom";
//#region src/modules/tiktok-live/hooks/useLiveSettings.ts
function h() {
	let [i, s] = d("loading"), [f, p] = d(null), [m, h] = d(null), [g, _] = d(0), [v, y] = d(!1), [b, x] = d(null), [S, C] = d(!1), [w, T] = d(!1), [E, D] = d(null);
	u(() => {
		if (!r()) {
			s("host-too-old");
			return;
		}
		let e = !0;
		return s("loading"), c().then((t) => {
			e && (p(t), h(null), s("ready"));
		}).catch((t) => {
			if (!e) return;
			let r = o(t);
			n(r), h(r), s(r.reason === "not_configured" ? "not-configured" : "error");
		}), () => {
			e = !1;
		};
	}, [g]);
	let O = l(() => _((e) => e + 1), []), k = l(async (e) => {
		y(!0), x(null), C(!1);
		try {
			return p(await a(e)), C(!0), !0;
		} catch (e) {
			let t = e?.response?.data?.error;
			return x(t || "Не вдалося зберегти. Спробуйте ще раз."), !1;
		} finally {
			y(!1);
		}
	}, []), A = l(async () => {
		T(!0), D(null);
		try {
			let e = await t();
			D({
				ok: e.ok,
				username: e.username
			});
		} catch (e) {
			let t = e?.response?.data?.error;
			D({
				ok: !1,
				error: t === "telegram_token_not_set" ? "Токен бота не збережено." : t === "telegram_token_invalid" ? "Telegram відхилив цей токен." : "Не вдалося перевірити."
			});
		} finally {
			T(!1);
		}
	}, []);
	return {
		status: i,
		settings: f,
		diagnostic: m,
		missingHostApi: e(),
		reload: O,
		save: k,
		saving: v,
		saveError: b,
		saved: S,
		clearSaved: () => C(!1),
		testTelegram: A,
		testing: w,
		testResult: E
	};
}
//#endregion
//#region src/modules/tiktok-live/pages/LiveSettingsPage.tsx
var g = [
	3,
	5,
	10,
	15,
	30
];
function _() {
	let { status: e, settings: t, diagnostic: n, reload: r, save: a, saving: o, saveError: s, saved: c, clearSaved: l, testTelegram: _, testing: x, testResult: S } = h(), { isActive: C } = i(e === "ready"), [w, T] = d(""), [E, D] = d(!1), [O, k] = d(""), [A, j] = d(!1), [M, N] = d(""), [P, F] = d(""), [I, L] = d(5);
	if (u(() => {
		t && (N(t.telegram_channel_id ?? ""), F(t.novaposhta_merchant_name ?? ""), L(t.reservation_timeout_minutes || 5), T(""), k(""), D(!1), j(!1));
	}, [t]), e === "loading") return /* @__PURE__ */ f(b, { title: "Завантаження налаштувань…" });
	if (e === "host-too-old") return /* @__PURE__ */ f(b, {
		icon: "⬆️",
		title: "Застосунок каси застарів для цього екрана",
		body: "Екран ефіру працює, а його налаштування зʼявляться після оновлення застосунку. Поки що змінюйте їх у старій адмінці.",
		diagnostic: n
	});
	if (e === "not-configured") return /* @__PURE__ */ f(b, {
		icon: "🔌",
		title: "Магазин не підʼєднано до TikTok LIVE",
		body: "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього тут зʼявляться налаштування ефіру.",
		link: {
			to: "/admin/settings",
			label: "Перейти до Налаштувань"
		}
	});
	if (e === "error" || !t) return /* @__PURE__ */ f(b, {
		icon: "⚠️",
		title: "Не вдалося завантажити налаштування",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.",
		action: {
			label: "Спробувати ще раз",
			onClick: r
		},
		diagnostic: n
	});
	let R = t.telegram_bot_token_set && !E, z = t.novaposhta_api_key_set && !A;
	function B() {
		let e = {
			telegram_channel_id: M.trim() || null,
			novaposhta_merchant_name: P.trim() || null,
			reservation_timeout_minutes: I
		};
		return E ? e.telegram_bot_token = null : w.trim() && (e.telegram_bot_token = w.trim()), A ? e.novaposhta_api_key = null : O.trim() && (e.novaposhta_api_key = O.trim()), e;
	}
	function V(e) {
		e.preventDefault(), a(B());
	}
	return /* @__PURE__ */ p("form", {
		onSubmit: V,
		className: "mx-auto w-full max-w-2xl space-y-6 pb-10",
		children: [
			/* @__PURE__ */ p("div", { children: [/* @__PURE__ */ f("h1", {
				className: "text-lg font-semibold text-sq-text",
				children: "Прямий ефір"
			}), /* @__PURE__ */ f("p", {
				className: "mt-1 text-sm text-sq-secondary",
				children: "Інтеграції та таймер бронювання для трансляцій."
			})] }),
			c && /* @__PURE__ */ p("div", {
				role: "status",
				className: "rounded-sq border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800",
				children: ["Збережено", C && " — зміни застосуються після перезапуску ефіру."]
			}),
			s && /* @__PURE__ */ f("div", {
				role: "alert",
				className: "rounded-sq border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700",
				children: s
			}),
			/* @__PURE__ */ p("section", {
				className: "sq-card space-y-3 p-5",
				children: [
					/* @__PURE__ */ f("p", {
						className: "sq-section-label",
						children: "Акаунт"
					}),
					/* @__PURE__ */ p("div", {
						className: "flex flex-wrap items-center justify-between gap-3",
						children: [/* @__PURE__ */ p("div", { children: [/* @__PURE__ */ f("p", {
							className: "font-medium text-sq-text",
							children: t.tiktok_username ? `@${t.tiktok_username}` : "—"
						}), /* @__PURE__ */ p("p", {
							className: "mt-0.5 text-xs text-sq-muted",
							children: [
								"Нікнейм змінюється в",
								" ",
								/* @__PURE__ */ f(m, {
									to: "/admin/settings",
									className: "text-sq-blue underline",
									children: "Налаштуваннях магазину"
								}),
								"."
							]
						})] }), /* @__PURE__ */ f(m, {
							to: "/live",
							className: "rounded-sq border border-sq-divider px-3 py-2 text-sm font-medium",
							children: "Відкрити екран ефіру"
						})]
					}),
					C && /* @__PURE__ */ f("p", {
						className: "rounded-sq bg-amber-50 px-3 py-2 text-xs text-amber-800",
						children: "Зараз іде ефір. Він працює зі знімком налаштувань, зробленим на старті — щоб зміни подіяли, зупиніть і запустіть ефір знову."
					})
				]
			}),
			/* @__PURE__ */ p("section", {
				className: "sq-card space-y-4 p-5",
				children: [
					/* @__PURE__ */ p("div", { children: [/* @__PURE__ */ f("p", {
						className: "sq-section-label",
						children: "Telegram"
					}), /* @__PURE__ */ f("p", {
						className: "mt-1 text-xs text-sq-muted",
						children: "Бот, який приймає замовлення з коментарів ефіру."
					})] }),
					/* @__PURE__ */ f(y, {
						label: "Токен бота",
						name: "telegram_bot_token",
						value: w,
						stored: R,
						clearing: E,
						hint: "Отримайте у @BotFather.",
						placeholder: "123456:ABC-DEF1234ghIkl",
						onChange: (e) => {
							T(e), D(!1), l();
						},
						onClear: () => {
							D(!0), T("");
						},
						onCancelClear: () => D(!1)
					}),
					/* @__PURE__ */ f(v, {
						label: "ID каналу",
						hint: "Через @userinfobot. Порожнє поле — прибрати.",
						children: /* @__PURE__ */ f("input", {
							name: "telegram_channel_id",
							type: "text",
							inputMode: "numeric",
							className: "pos-field text-sm",
							placeholder: "-1001234567890",
							value: M,
							onChange: (e) => {
								N(e.target.value), l();
							}
						})
					}),
					/* @__PURE__ */ p("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ f("button", {
							type: "button",
							onClick: () => void _(),
							disabled: x || !R,
							className: "rounded-sq border border-sq-divider px-3 py-2 text-sm font-medium disabled:opacity-50",
							children: x ? "Перевірка…" : "Перевірити зʼєднання"
						}), S && /* @__PURE__ */ f("span", {
							role: "status",
							className: `text-sm ${S.ok ? "text-emerald-700" : "text-rose-600"}`,
							children: S.ok ? `Бот працює${S.username ? ` — @${S.username}` : ""}` : S.error
						})]
					})
				]
			}),
			/* @__PURE__ */ p("section", {
				className: "sq-card space-y-4 p-5",
				children: [
					/* @__PURE__ */ p("div", { children: [/* @__PURE__ */ f("p", {
						className: "sq-section-label",
						children: "Нова Пошта"
					}), /* @__PURE__ */ f("p", {
						className: "mt-1 text-xs text-sq-muted",
						children: "Необовʼязково — для ТТН та відстеження посилок."
					})] }),
					/* @__PURE__ */ f(y, {
						label: "API-ключ",
						name: "novaposhta_api_key",
						value: O,
						stored: z,
						clearing: A,
						hint: "developers.novaposhta.ua",
						placeholder: "Ваш API-ключ",
						onChange: (e) => {
							k(e), j(!1), l();
						},
						onClear: () => {
							j(!0), k("");
						},
						onCancelClear: () => j(!1)
					}),
					/* @__PURE__ */ f(v, {
						label: "Назва відправника",
						hint: "Показується в замовленнях і ТТН.",
						children: /* @__PURE__ */ f("input", {
							name: "novaposhta_merchant_name",
							type: "text",
							className: "pos-field text-sm",
							placeholder: "Назва вашого магазину",
							value: P,
							onChange: (e) => {
								F(e.target.value), l();
							}
						})
					})
				]
			}),
			/* @__PURE__ */ p("section", {
				className: "sq-card space-y-4 p-5",
				children: [/* @__PURE__ */ p("div", { children: [/* @__PURE__ */ f("p", {
					className: "sq-section-label",
					children: "Бронювання"
				}), /* @__PURE__ */ f("p", {
					className: "mt-1 text-xs text-sq-muted",
					children: "Скільки часу товар утримується за глядачем після коментаря."
				})] }), /* @__PURE__ */ f(v, {
					label: "Таймер броні",
					children: /* @__PURE__ */ f("select", {
						name: "reservation_timeout_minutes",
						className: "pos-field text-sm",
						value: I,
						onChange: (e) => {
							L(parseInt(e.target.value, 10)), l();
						},
						children: g.map((e) => /* @__PURE__ */ p("option", {
							value: e,
							children: [e, " хвилин"]
						}, e))
					})
				})]
			}),
			/* @__PURE__ */ f("div", {
				className: "flex justify-end",
				children: /* @__PURE__ */ f("button", {
					type: "submit",
					disabled: o,
					className: "sq-btn-primary px-5 py-2.5 text-sm",
					children: o ? "Збереження…" : "Зберегти"
				})
			})
		]
	});
}
function v({ label: e, hint: t, children: n }) {
	return /* @__PURE__ */ p("label", {
		className: "block",
		children: [
			/* @__PURE__ */ f("span", {
				className: "mb-1.5 block text-xs font-semibold text-sq-text",
				children: e
			}),
			n,
			t && /* @__PURE__ */ f("span", {
				className: "mt-1.5 block text-xs text-sq-muted",
				children: t
			})
		]
	});
}
function y({ label: e, name: t, value: n, stored: r, clearing: i, hint: a, placeholder: o, onChange: s, onClear: c, onCancelClear: l }) {
	return /* @__PURE__ */ p(v, {
		label: e,
		hint: r ? "Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний." : a,
		children: [/* @__PURE__ */ f("input", {
			name: t,
			type: "password",
			autoComplete: "off",
			className: "pos-field text-sm",
			placeholder: r ? "•••••••• збережено" : o,
			value: n,
			onChange: (e) => s(e.target.value)
		}), i ? /* @__PURE__ */ p("span", {
			className: "mt-1.5 block text-xs text-rose-600",
			children: [
				"Буде видалено при збереженні.",
				" ",
				/* @__PURE__ */ f("button", {
					type: "button",
					className: "underline",
					onClick: l,
					children: "Скасувати"
				})
			]
		}) : r && /* @__PURE__ */ f("button", {
			type: "button",
			className: "mt-1.5 text-xs text-sq-secondary underline",
			onClick: c,
			children: "Видалити збережене значення"
		})]
	});
}
function b({ icon: e, title: t, body: n, action: r, link: i, diagnostic: a }) {
	return /* @__PURE__ */ f("div", {
		className: "grid min-h-[60vh] place-items-center px-6",
		children: /* @__PURE__ */ p("div", {
			className: "sq-card animate-fade-up max-w-md p-8 text-center",
			children: [
				e && /* @__PURE__ */ f("div", {
					className: "mb-4 text-4xl",
					children: e
				}),
				/* @__PURE__ */ f("h2", {
					className: "text-lg font-semibold text-sq-text",
					children: t
				}),
				n && /* @__PURE__ */ f("p", {
					className: "mt-3 text-sm leading-relaxed text-sq-secondary",
					children: n
				}),
				r && /* @__PURE__ */ f("button", {
					type: "button",
					onClick: r.onClick,
					className: "sq-btn-primary mt-6 px-4 py-2.5",
					children: r.label
				}),
				i && /* @__PURE__ */ f(m, {
					to: i.to,
					className: "sq-btn-primary mt-6 inline-block px-4 py-2.5",
					children: i.label
				}),
				a && /* @__PURE__ */ f(s, { diagnostic: a })
			]
		})
	});
}
//#endregion
export { _ as LiveSettingsPage };
