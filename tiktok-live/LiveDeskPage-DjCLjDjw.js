import { a as e, c as t, h as n, i as r, m as i, n as a, o, r as s, s as c, t as l } from "./SupportCode-NWrbULoy.js";
import { useCallback as u, useEffect as d, useRef as f, useState as p } from "react";
import { Fragment as m, jsx as h, jsxs as g } from "react/jsx-runtime";
//#region src/modules/tiktok-live/hooks/useLiveAuth.ts
function _() {
	let [t, n] = p("loading"), [i, a] = p(null), [o, l] = p(null), [f, m] = p(0);
	return d(() => {
		let t = !0;
		return n("loading"), e().then(() => {
			t && (a(c()), l(null), n("ready"));
		}).catch((e) => {
			if (!t) return;
			let i = s(e);
			r(i), l(i), n(i.reason === "not_configured" ? "not-configured" : "error");
		}), () => {
			t = !1;
		};
	}, [f]), {
		status: t,
		username: i,
		diagnostic: o,
		refresh: u(() => m((e) => e + 1), [])
	};
}
//#endregion
//#region src/modules/tiktok-live/lib/liveSocket.ts
var v = class {
	constructor(e) {
		n(this, "ws", null), n(this, "url", void 0), n(this, "logHandlers", /* @__PURE__ */ new Set()), n(this, "eventHandlers", /* @__PURE__ */ new Map()), this.url = e;
	}
	connect() {
		return new Promise((e, t) => {
			try {
				this.ws = new WebSocket(this.url), this.ws.onopen = () => e(), this.ws.onmessage = (e) => {
					try {
						this.handleMessage(JSON.parse(String(e.data)));
					} catch (e) {
						console.error("[tiktok-live] bad WebSocket frame", e);
					}
				}, this.ws.onclose = () => this.dispatch("disconnect", {}), this.ws.onerror = (e) => t(e);
			} catch (e) {
				t(e);
			}
		});
	}
	handleMessage(e) {
		if (e.type === "log" && e.log) {
			this.logHandlers.forEach((t) => t(e.log));
			return;
		}
		e.type && this.dispatch(e.type, e);
	}
	dispatch(e, t) {
		this.eventHandlers.get(e)?.forEach((e) => e(t));
	}
	onLog(e) {
		return this.logHandlers.add(e), () => {
			this.logHandlers.delete(e);
		};
	}
	on(e, t) {
		let n = this.eventHandlers.get(e);
		return n || (n = /* @__PURE__ */ new Set(), this.eventHandlers.set(e, n)), n.add(t), () => {
			n?.delete(t);
		};
	}
	onDisconnect(e) {
		return this.on("disconnect", e);
	}
	disconnect() {
		this.ws && (this.ws.onclose = null, this.ws.close(), this.ws = null);
	}
	isConnected() {
		return this.ws?.readyState === WebSocket.OPEN;
	}
}, y = 5e3;
function b(e) {
	let [n, r] = p([]), [i, a] = p(!1), s = f(null), c = f(null), l = f(!0), m = f(!1), h = u(() => {
		if (!l.current) return;
		s.current?.disconnect(), s.current = null;
		let e = () => {
			l.current && (a(!1), m.current = !0, c.current = setTimeout(() => h(), y));
		};
		(async () => {
			let n;
			try {
				n = await o.bridgeToken({ force: m.current }), m.current = !1;
			} catch {
				e();
				return;
			}
			if (!l.current) return;
			let i = new v(t(n));
			s.current = i, i.connect().then(() => {
				l.current && (a(!0), o.getSessionLogs(100).then((e) => {
					l.current && r(e ?? []);
				}).catch(() => {}), i.onLog((e) => {
					l.current && r((t) => [...t, e].slice(-1e3));
				}), i.onDisconnect(e));
			}).catch(e);
		})();
	}, []), g = u(() => {
		c.current && (clearTimeout(c.current), c.current = null), a(!1), h();
	}, [h]);
	return d(() => {
		if (e) return l.current = !0, h(), () => {
			l.current = !1, c.current && clearTimeout(c.current), s.current?.disconnect(), s.current = null;
		};
	}, [e, h]), {
		logs: n,
		isConnected: i,
		reconnect: g,
		addLog: (e) => r((t) => [...t, e].slice(-1e3)),
		clear: () => r([])
	};
}
//#endregion
//#region src/modules/tiktok-live/components/LiveLogs.tsx
var x = {
	tiktok_comment: "border-l-blue-500 bg-blue-50",
	telegram_message: "border-l-violet-500 bg-violet-50",
	order: "border-l-emerald-500 bg-emerald-50",
	error: "border-l-rose-500 bg-rose-50",
	info: "border-l-amber-500 bg-amber-50"
}, S = {
	tiktok_comment: "text-blue-700",
	telegram_message: "text-violet-700",
	order: "text-emerald-700",
	error: "text-rose-700",
	info: "text-amber-700"
}, C = {
	tiktok_comment: "🎬",
	telegram_message: "💬",
	order: "✅",
	error: "❌",
	info: "ℹ️"
}, w = {
	tiktok_comment: "TikTok",
	telegram_message: "Telegram",
	order: "Замовлення",
	error: "Помилка",
	info: "Інфо"
}, T = "border-l-sq-divider bg-sq-bg";
function E(e) {
	return new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
}
function D({ logs: e, isConnected: t, onReconnect: n }) {
	let r = f(null);
	return d(() => {
		r.current && (r.current.scrollTop = r.current.scrollHeight);
	}, [e]), /* @__PURE__ */ g("div", {
		className: "sq-card flex h-[600px] flex-col overflow-hidden",
		"data-testid": "live-logs",
		children: [/* @__PURE__ */ g("div", {
			className: "flex flex-shrink-0 items-center justify-between border-b border-sq-divider px-5 py-4",
			children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("div", {
				className: "text-sm font-semibold text-sq-text",
				children: "Стрічка ефіру"
			}), /* @__PURE__ */ g("div", {
				className: "text-xs text-sq-muted",
				children: [e.length, " повідомлень · автоскрол увімкнено"]
			})] }), /* @__PURE__ */ g("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ g("span", {
					className: "flex items-center gap-1.5 text-xs font-semibold",
					children: [/* @__PURE__ */ h("span", { className: `h-2 w-2 flex-shrink-0 rounded-full ${t ? "bg-emerald-500" : "bg-rose-500"}` }), /* @__PURE__ */ h("span", {
						className: t ? "text-emerald-700" : "text-rose-700",
						children: t ? "Підключено" : "Відключено"
					})]
				}), !t && n && /* @__PURE__ */ h("button", {
					type: "button",
					onClick: n,
					title: "Перепідключити без перезавантаження сторінки",
					className: "rounded-sq border border-sq-divider px-3 py-1.5 text-xs font-medium text-sq-secondary hover:bg-sq-bg",
					children: "↺ Перепідключити"
				})]
			})]
		}), /* @__PURE__ */ h("div", {
			ref: r,
			className: "flex flex-1 flex-col gap-2 overflow-y-auto p-4",
			children: e.length === 0 ? /* @__PURE__ */ g("div", {
				className: "flex flex-1 flex-col items-center justify-center gap-2 text-center text-sq-muted",
				children: [
					/* @__PURE__ */ h("span", {
						className: "text-3xl opacity-40",
						children: "📭"
					}),
					/* @__PURE__ */ h("div", {
						className: "text-sm font-semibold text-sq-secondary",
						children: "Повідомлень поки немає"
					}),
					/* @__PURE__ */ h("div", {
						className: "text-sm",
						children: "Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут"
					})
				]
			}) : e.map((e) => /* @__PURE__ */ g("div", {
				"data-testid": "live-log-row",
				className: `rounded-sq border-l-[3px] px-3.5 py-2.5 ${x[e.log_type] ?? T}`,
				children: [
					/* @__PURE__ */ g("div", {
						className: "mb-1.5 flex items-center gap-1.5",
						children: [
							/* @__PURE__ */ h("span", {
								className: "text-sm leading-none",
								children: C[e.log_type] ?? "📝"
							}),
							/* @__PURE__ */ h("span", {
								className: `text-[11px] font-bold uppercase tracking-wider ${S[e.log_type] ?? "text-sq-secondary"}`,
								children: w[e.log_type] ?? e.log_type
							}),
							/* @__PURE__ */ h("span", {
								className: "ml-auto font-mono text-[11px] text-sq-muted",
								children: E(e.created_at)
							})
						]
					}),
					/* @__PURE__ */ h("p", {
						className: "break-words text-[13px] leading-relaxed text-sq-text",
						children: e.message
					}),
					e.data && Object.keys(e.data).length > 0 && /* @__PURE__ */ h("div", {
						className: "mt-1.5 flex flex-wrap gap-2 border-t border-black/5 pt-1.5",
						children: Object.entries(e.data).map(([e, t]) => /* @__PURE__ */ g("span", {
							className: "font-mono text-[11px] text-sq-muted",
							children: [
								/* @__PURE__ */ g("span", {
									className: "text-sq-secondary",
									children: [e, ":"]
								}),
								" ",
								JSON.stringify(t)
							]
						}, e))
					})
				]
			}, e.id))
		})]
	});
}
//#endregion
//#region src/modules/tiktok-live/components/SessionControl.tsx
function O({ isActive: e, onStart: t, onStop: n, isStarting: r, isStopping: i }) {
	return e ? /* @__PURE__ */ h("button", {
		type: "button",
		onClick: n,
		disabled: i,
		"data-testid": "session-stop",
		className: "rounded-sq bg-rose-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50",
		children: i ? "Зупиняємо…" : "■ Зупинити ефір"
	}) : /* @__PURE__ */ h("button", {
		type: "button",
		onClick: t,
		disabled: r,
		"data-testid": "session-start",
		className: "sq-btn-primary px-6 py-3 text-base disabled:cursor-not-allowed",
		children: r ? "Запускаємо…" : "▶ Почати ефір"
	});
}
//#endregion
//#region src/modules/tiktok-live/pages/LiveDeskPage.tsx
var k = {
	host_too_old: {
		icon: "⬆️",
		title: "Застосунок каси застарів для модуля ефіру",
		body: "Оновіть застосунок до останньої версії. Якщо після оновлення нічого не змінилось — передайте код нижче в підтримку."
	},
	server_missing_bridge: {
		icon: "🛠",
		title: "Сервер не підтримує модуль ефіру",
		body: "Схоже, сервер магазину ще не оновлено. Передайте код нижче в підтримку — оновлення на нашому боці."
	},
	server_error: {
		icon: "⚠️",
		title: "Сервер відповів помилкою",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
	},
	network: {
		icon: "📡",
		title: "Немає зʼєднання з сервером",
		body: "Модуль ефіру працює лише онлайн. Перевірте інтернет і спробуйте ще раз."
	},
	unknown: {
		icon: "⚠️",
		title: "Не вдалося підключитися до TikTok LIVE",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
	}
};
function A(e) {
	let t = Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 1e3));
	return [
		Math.floor(t / 3600),
		Math.floor(t % 3600 / 60),
		t % 60
	].map((e) => String(e).padStart(2, "0")).join(":");
}
function j() {
	let e = i(), { status: t, username: n, diagnostic: r, refresh: o } = _(), s = t === "ready", { session: c, isActive: l, isError: u, diagnostic: f, isStarting: v, isStopping: y, actionError: x, start: S, stop: C } = a(s), { logs: w, isConnected: T, reconnect: E } = b(s), [j, P] = p("00:00:00"), F = c?.started_at ?? null;
	if (d(() => {
		if (!l || !F) {
			P("00:00:00");
			return;
		}
		P(A(F));
		let e = setInterval(() => P(A(F)), 1e3);
		return () => clearInterval(e);
	}, [l, F]), t === "loading") return /* @__PURE__ */ h(N, { title: "Підключення до TikTok LIVE…" });
	if (t === "not-configured") return /* @__PURE__ */ h(N, {
		icon: "🔌",
		title: "Магазин не під’єднано до TikTok LIVE",
		body: e === "web" ? "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього ефір буде доступний і в касі, і в адмінці." : "Власник має вказати нікнейм TikTok-акаунта в Налаштуваннях магазину у веб-адмінці.",
		action: {
			label: "Спробувати ще раз",
			onClick: o
		},
		diagnostic: r
	});
	if (t === "error") {
		let e = k[r?.reason ?? "unknown"] ?? k.unknown;
		return /* @__PURE__ */ h(N, {
			icon: e.icon,
			title: e.title,
			body: e.body,
			action: {
				label: "Спробувати ще раз",
				onClick: o
			},
			diagnostic: r
		});
	}
	let I = w.filter((e) => e.log_type === "order").length, L = w.filter((e) => e.log_type === "tiktok_comment").length, R = w.filter((e) => e.log_type === "error").length;
	return /* @__PURE__ */ g("div", {
		className: "animate-fade-up space-y-6 text-sq-text",
		children: [/* @__PURE__ */ g("div", {
			className: "sq-card p-6 shadow-sm",
			children: [/* @__PURE__ */ g("div", {
				className: "flex flex-wrap items-start justify-between gap-6",
				children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ g("div", {
					className: "flex items-center gap-3",
					children: [
						/* @__PURE__ */ h("span", { className: `h-3 w-3 flex-shrink-0 rounded-full ${l ? "bg-emerald-500" : "bg-sq-muted"}` }),
						/* @__PURE__ */ h("h2", {
							className: "text-2xl font-semibold",
							children: "Прямий ефір"
						}),
						/* @__PURE__ */ h("span", {
							className: `rounded-sq px-2 py-0.5 text-xs font-semibold ${l ? "bg-emerald-100 text-emerald-800" : "bg-sq-empty text-sq-secondary"}`,
							"data-testid": "session-status",
							children: l ? "Активна" : "Зупинена"
						})
					]
				}), /* @__PURE__ */ g("p", {
					className: "mt-2 text-sm text-sq-secondary",
					children: [
						n ? `Акаунт @${n} · ` : "",
						"WebSocket:",
						" ",
						/* @__PURE__ */ h("span", {
							className: T ? "text-emerald-700" : "text-rose-700",
							children: T ? "підключено" : "відключено"
						})
					]
				})] }), l && /* @__PURE__ */ g("div", {
					className: "rounded-sq border border-sq-divider bg-sq-bg px-6 py-3 text-center",
					children: [/* @__PURE__ */ h("div", {
						className: "sq-section-label",
						children: "Тривалість"
					}), /* @__PURE__ */ h("div", {
						className: "mt-1 font-mono text-3xl font-semibold text-emerald-700",
						children: j
					})]
				})]
			}), /* @__PURE__ */ g("div", {
				className: "mt-6 flex flex-wrap items-center gap-4 border-t border-sq-divider pt-6",
				children: [
					/* @__PURE__ */ h(O, {
						isActive: l,
						onStart: () => void S(),
						onStop: () => void C(),
						isStarting: v,
						isStopping: y
					}),
					x && /* @__PURE__ */ h("span", {
						className: "text-sm text-rose-700",
						children: x
					}),
					u && /* @__PURE__ */ g("span", {
						className: "text-sm text-sq-secondary",
						children: ["Статус ефіру недоступний — повторюємо спробу…", f && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ h("code", {
							"data-testid": "live-poll-support-code",
							className: "select-all font-mono text-xs text-sq-muted",
							children: f.code
						})] })]
					})
				]
			})]
		}), /* @__PURE__ */ g("div", {
			className: "grid gap-6 lg:grid-cols-[260px_1fr]",
			children: [/* @__PURE__ */ g("div", {
				className: "flex flex-col gap-4",
				children: [
					/* @__PURE__ */ h("span", {
						className: "sq-section-label",
						children: "Статистика ефіру"
					}),
					/* @__PURE__ */ h(M, {
						label: "Замовлень",
						value: I,
						icon: "🛍",
						tone: "text-emerald-700"
					}),
					/* @__PURE__ */ h(M, {
						label: "Коментарів",
						value: L,
						icon: "💬",
						tone: "text-blue-700"
					}),
					/* @__PURE__ */ h(M, {
						label: "Помилок",
						value: R,
						icon: "⚠",
						tone: R > 0 ? "text-rose-700" : "text-sq-muted"
					})
				]
			}), /* @__PURE__ */ g("div", {
				className: "space-y-2",
				children: [/* @__PURE__ */ h("span", {
					className: "sq-section-label",
					children: "Лайв-лог"
				}), /* @__PURE__ */ h(D, {
					logs: w,
					isConnected: T,
					onReconnect: E
				})]
			})]
		})]
	});
}
function M({ label: e, value: t, icon: n, tone: r }) {
	return /* @__PURE__ */ g("div", {
		className: "sq-card flex items-center gap-4 p-4",
		children: [/* @__PURE__ */ h("div", {
			className: "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sq bg-sq-bg text-xl",
			children: n
		}), /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("div", {
			className: "sq-section-label",
			children: e
		}), /* @__PURE__ */ h("div", {
			className: `font-mono text-2xl font-bold ${r}`,
			children: t
		})] })]
	});
}
function N({ icon: e, title: t, body: n, action: r, diagnostic: i }) {
	return /* @__PURE__ */ h("div", {
		className: "grid min-h-[60vh] place-items-center px-6",
		children: /* @__PURE__ */ g("div", {
			className: "sq-card animate-fade-up max-w-md p-8 text-center",
			children: [
				e && /* @__PURE__ */ h("div", {
					className: "mb-4 text-4xl",
					children: e
				}),
				/* @__PURE__ */ h("h2", {
					className: "text-lg font-semibold text-sq-text",
					children: t
				}),
				n && /* @__PURE__ */ h("p", {
					className: "mt-3 text-sm leading-relaxed text-sq-secondary",
					children: n
				}),
				r && /* @__PURE__ */ h("button", {
					type: "button",
					onClick: r.onClick,
					className: "sq-btn-primary mt-6 px-4 py-2.5",
					children: r.label
				}),
				i && /* @__PURE__ */ h(l, { diagnostic: i })
			]
		})
	});
}
//#endregion
export { j as LiveDeskPage };
