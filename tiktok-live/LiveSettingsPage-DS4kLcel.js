import { C as e, S as t, T as n, d as r, g as i, h as a, i as o, m as s, n as c, r as l, t as u, w as d, x as f } from "./SupportCode-fA_XWixe.js";
import { useCallback as p, useEffect as m, useState as h } from "react";
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
				children: [/* @__PURE__ */ g(l, { size: 20 }), i.label]
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
function b({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ _("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ _("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ g("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ g("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
//#endregion
//#region src/modules/tiktok-live/hooks/useLiveSettings.ts
function x() {
	let [r, o] = h("loading"), [s, c] = h(null), [l, u] = h(null), [g, _] = h(0), [v, y] = h(!1), [b, x] = h(null), [S, C] = h(!1), [w, T] = h(!1), [E, D] = h(null);
	m(() => {
		if (!f()) {
			o("host-too-old");
			return;
		}
		let e = !0;
		return o("loading"), t().then((t) => {
			e && (c(t), u(null), o("ready"));
		}).catch((t) => {
			if (!e) return;
			let n = a(t);
			i(n), u(n), o(n.reason === "not_configured" ? "not-configured" : "error");
		}), () => {
			e = !1;
		};
	}, [g]);
	let O = p(() => _((e) => e + 1), []), k = p(async (e) => {
		y(!0), x(null), C(!1);
		try {
			return c(await n(e)), C(!0), !0;
		} catch (e) {
			let t = e?.response?.data?.error;
			return x(t || "Не вдалося зберегти. Спробуйте ще раз."), !1;
		} finally {
			y(!1);
		}
	}, []), A = p(async () => {
		T(!0), D(null);
		try {
			let e = await d();
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
		status: r,
		settings: s,
		diagnostic: l,
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
var S = [
	3,
	5,
	10,
	15,
	30
];
function C() {
	let { status: e, settings: t, diagnostic: n, reload: i, save: a, saving: l, saveError: u, saved: d, clearSaved: f, testTelegram: p, testing: C, testResult: D } = x(), { isActive: O } = s(e === "ready"), [k, A] = h(""), [j, M] = h(!1), [N, P] = h(""), [F, I] = h(!1), [L, R] = h(""), [z, B] = h(""), [V, H] = h(5);
	if (m(() => {
		t && (R(t.telegram_channel_id ?? ""), B(t.novaposhta_merchant_name ?? ""), H(t.reservation_timeout_minutes || 5), A(""), P(""), M(!1), I(!1));
	}, [t]), e === "loading") return /* @__PURE__ */ g(E, { title: "Завантаження налаштувань…" });
	if (e === "host-too-old") return /* @__PURE__ */ g(E, {
		icon: o,
		title: "Застосунок каси застарів для цього екрана",
		body: "Екран ефіру працює, а його налаштування зʼявляться після оновлення застосунку. Поки що змінюйте їх у старій адмінці.",
		diagnostic: n
	});
	if (e === "not-configured") return /* @__PURE__ */ g(E, {
		icon: r,
		title: "Магазин не підʼєднано до TikTok LIVE",
		body: "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього тут зʼявляться налаштування ефіру.",
		link: {
			to: "/admin/settings",
			label: "Перейти до Налаштувань"
		}
	});
	if (e === "error" || !t) return /* @__PURE__ */ g(E, {
		icon: c,
		title: "Не вдалося завантажити налаштування",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку.",
		action: {
			label: "Спробувати ще раз",
			onClick: i
		},
		diagnostic: n
	});
	let U = t.telegram_bot_token_set && !j, W = t.novaposhta_api_key_set && !F;
	function G() {
		let e = {
			telegram_channel_id: L.trim() || null,
			novaposhta_merchant_name: z.trim() || null,
			reservation_timeout_minutes: V
		};
		return j ? e.telegram_bot_token = null : k.trim() && (e.telegram_bot_token = k.trim()), F ? e.novaposhta_api_key = null : N.trim() && (e.novaposhta_api_key = N.trim()), e;
	}
	function K(e) {
		e.preventDefault(), a(G());
	}
	return /* @__PURE__ */ _("form", {
		onSubmit: K,
		className: "w-full max-w-2xl space-y-7 pb-10 text-sq-text animate-fade-up",
		children: [
			/* @__PURE__ */ g(y, {
				glyph: r,
				title: "Прямий ефір",
				subtitle: "Інтеграції та таймер бронювання для трансляцій.",
				actions: /* @__PURE__ */ g(v, {
					to: "/live",
					className: "sq-btn-quiet",
					children: "Відкрити екран ефіру"
				})
			}),
			d && /* @__PURE__ */ _("div", {
				role: "status",
				className: "rounded-xl bg-sq-success/10 px-4 py-3 text-[15px] font-medium text-sq-success-ink",
				children: ["Збережено", O && " — зміни застосуються після перезапуску ефіру."]
			}),
			u && /* @__PURE__ */ g("div", {
				role: "alert",
				className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
				children: u
			}),
			/* @__PURE__ */ _("section", { children: [/* @__PURE__ */ g(b, { title: "Акаунт" }), /* @__PURE__ */ _("div", {
				className: "pt-2 space-y-3",
				children: [/* @__PURE__ */ _("div", { children: [/* @__PURE__ */ g("p", {
					className: "text-base font-semibold text-sq-text",
					children: t.tiktok_username ? `@${t.tiktok_username}` : "—"
				}), /* @__PURE__ */ _("p", {
					className: "mt-0.5 text-[13px] text-sq-muted",
					children: [
						"Нікнейм змінюється в",
						" ",
						/* @__PURE__ */ g(v, {
							to: "/admin/settings",
							className: "font-semibold text-sq-blue",
							children: "Налаштуваннях магазину"
						}),
						"."
					]
				})] }), O && /* @__PURE__ */ g("p", {
					className: "rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800",
					children: "Зараз іде ефір. Він працює зі знімком налаштувань, зробленим на старті — щоб зміни подіяли, зупиніть і запустіть ефір знову."
				})]
			})] }),
			/* @__PURE__ */ _("section", { children: [/* @__PURE__ */ g(b, { title: "Telegram" }), /* @__PURE__ */ _("div", {
				className: "pt-2 space-y-4",
				children: [
					/* @__PURE__ */ g("p", {
						className: "text-[13px] text-sq-muted",
						children: "Бот, який приймає замовлення з коментарів ефіру."
					}),
					/* @__PURE__ */ g(T, {
						label: "Токен бота",
						name: "telegram_bot_token",
						value: k,
						stored: U,
						clearing: j,
						hint: "Отримайте у @BotFather.",
						placeholder: "123456:ABC-DEF1234ghIkl",
						onChange: (e) => {
							A(e), M(!1), f();
						},
						onClear: () => {
							M(!0), A("");
						},
						onCancelClear: () => M(!1)
					}),
					/* @__PURE__ */ g(w, {
						label: "ID каналу",
						hint: "Через @userinfobot. Порожнє поле — прибрати.",
						children: /* @__PURE__ */ g("input", {
							name: "telegram_channel_id",
							type: "text",
							inputMode: "numeric",
							className: "sq-input tabular-nums",
							placeholder: "-1001234567890",
							value: L,
							onChange: (e) => {
								R(e.target.value), f();
							}
						})
					}),
					/* @__PURE__ */ _("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ g("button", {
							type: "button",
							onClick: () => void p(),
							disabled: C || !U,
							className: "sq-btn-quiet",
							children: C ? "Перевірка…" : "Перевірити зʼєднання"
						}), D && /* @__PURE__ */ g("span", {
							role: "status",
							className: `text-sm ${D.ok ? "text-sq-success-ink" : "text-red-600"}`,
							children: D.ok ? `Бот працює${D.username ? ` — @${D.username}` : ""}` : D.error
						})]
					})
				]
			})] }),
			/* @__PURE__ */ _("section", { children: [/* @__PURE__ */ g(b, { title: "Нова Пошта" }), /* @__PURE__ */ _("div", {
				className: "pt-2 space-y-4",
				children: [
					/* @__PURE__ */ g("p", {
						className: "text-[13px] text-sq-muted",
						children: "Необовʼязково — для ТТН та відстеження посилок."
					}),
					/* @__PURE__ */ g(T, {
						label: "API-ключ",
						name: "novaposhta_api_key",
						value: N,
						stored: W,
						clearing: F,
						hint: "developers.novaposhta.ua",
						placeholder: "Ваш API-ключ",
						onChange: (e) => {
							P(e), I(!1), f();
						},
						onClear: () => {
							I(!0), P("");
						},
						onCancelClear: () => I(!1)
					}),
					/* @__PURE__ */ g(w, {
						label: "Назва відправника",
						hint: "Показується в замовленнях і ТТН.",
						children: /* @__PURE__ */ g("input", {
							name: "novaposhta_merchant_name",
							type: "text",
							className: "sq-input",
							placeholder: "Назва вашого магазину",
							value: z,
							onChange: (e) => {
								B(e.target.value), f();
							}
						})
					})
				]
			})] }),
			/* @__PURE__ */ _("section", { children: [/* @__PURE__ */ g(b, { title: "Бронювання" }), /* @__PURE__ */ _("div", {
				className: "pt-2 space-y-4",
				children: [/* @__PURE__ */ g("p", {
					className: "text-[13px] text-sq-muted",
					children: "Скільки часу товар утримується за глядачем після коментаря."
				}), /* @__PURE__ */ g(w, {
					label: "Таймер броні",
					children: /* @__PURE__ */ g("select", {
						name: "reservation_timeout_minutes",
						className: "sq-input",
						value: V,
						onChange: (e) => {
							H(parseInt(e.target.value, 10)), f();
						},
						children: S.map((e) => /* @__PURE__ */ _("option", {
							value: e,
							children: [e, " хвилин"]
						}, e))
					})
				})]
			})] }),
			/* @__PURE__ */ g("div", {
				className: "flex",
				children: /* @__PURE__ */ g("button", {
					type: "submit",
					disabled: l,
					className: "pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]",
					children: l ? "Збереження…" : "Зберегти"
				})
			})
		]
	});
}
function w({ label: e, hint: t, children: n }) {
	return /* @__PURE__ */ _("label", {
		className: "flex flex-col gap-1.5",
		children: [
			/* @__PURE__ */ g("span", {
				className: "text-[13px] font-semibold text-sq-secondary",
				children: e
			}),
			n,
			t && /* @__PURE__ */ g("span", {
				className: "text-[13px] text-sq-muted",
				children: t
			})
		]
	});
}
function T({ label: e, name: t, value: n, stored: r, clearing: i, hint: a, placeholder: o, onChange: s, onClear: c, onCancelClear: l }) {
	return /* @__PURE__ */ _(w, {
		label: e,
		hint: r ? "Збережено. Введіть новий, щоб замінити — порожнє поле лишає поточний." : a,
		children: [/* @__PURE__ */ g("input", {
			name: t,
			type: "password",
			autoComplete: "off",
			className: "sq-input",
			placeholder: r ? "•••••••• збережено" : o,
			value: n,
			onChange: (e) => s(e.target.value)
		}), i ? /* @__PURE__ */ _("span", {
			className: "text-[13px] text-red-600",
			children: [
				"Буде видалено при збереженні.",
				" ",
				/* @__PURE__ */ g("button", {
					type: "button",
					className: "font-semibold text-sq-blue",
					onClick: l,
					children: "Скасувати"
				})
			]
		}) : r && /* @__PURE__ */ g("button", {
			type: "button",
			className: "self-start text-[13px] font-semibold text-red-600",
			onClick: c,
			children: "Видалити збережене значення"
		})]
	});
}
function E({ icon: e, title: t, body: n, action: r, link: i, diagnostic: a }) {
	let o = e;
	return /* @__PURE__ */ g("div", {
		className: "grid min-h-[60vh] place-items-center px-6",
		children: /* @__PURE__ */ _("div", {
			className: "sq-card animate-fade-up w-full max-w-md p-8 text-center",
			children: [
				o && /* @__PURE__ */ g("div", {
					className: "mb-4 flex justify-center",
					children: /* @__PURE__ */ g(o, { size: 48 })
				}),
				/* @__PURE__ */ g("h2", {
					className: "text-[19px] font-bold text-sq-heading",
					children: t
				}),
				n && /* @__PURE__ */ g("p", {
					className: "mt-2 text-[15px] leading-relaxed text-sq-secondary",
					children: n
				}),
				r && /* @__PURE__ */ g("button", {
					type: "button",
					onClick: r.onClick,
					className: "pos-btn-primary mt-6 min-h-11 px-5 rounded-sq text-[15px]",
					children: r.label
				}),
				i && /* @__PURE__ */ g(v, {
					to: i.to,
					className: "pos-btn-primary mt-6 min-h-11 px-5 rounded-sq text-[15px]",
					children: i.label
				}),
				a && /* @__PURE__ */ g(u, { diagnostic: a })
			]
		})
	});
}
//#endregion
export { C as LiveSettingsPage };
