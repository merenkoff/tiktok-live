import { D as e, E as t, _ as n, a as r, b as i, c as a, d as o, f as s, g as c, h as l, i as u, l as d, m as f, n as p, o as m, p as h, s as g, t as _, u as v, v as y, y as b } from "./SupportCode-fA_XWixe.js";
import { useCallback as x, useEffect as S, useRef as C, useState as w } from "react";
import { Fragment as T, jsx as E, jsxs as D } from "react/jsx-runtime";
//#region src/modules/tiktok-live/hooks/useLiveAuth.ts
function O() {
	let [e, t] = w("loading"), [r, i] = w(null), [a, o] = w(null), [s, u] = w(0);
	return S(() => {
		let e = !0;
		return t("loading"), n().then(() => {
			e && (i(b()), o(null), t("ready"));
		}).catch((n) => {
			if (!e) return;
			let r = l(n);
			c(r), o(r), t(r.reason === "not_configured" ? "not-configured" : "error");
		}), () => {
			e = !1;
		};
	}, [s]), {
		status: e,
		username: r,
		diagnostic: a,
		refresh: x(() => u((e) => e + 1), [])
	};
}
//#endregion
//#region src/modules/tiktok-live/lib/liveSocket.ts
var k = class {
	constructor(t) {
		e(this, "ws", null), e(this, "url", void 0), e(this, "logHandlers", /* @__PURE__ */ new Set()), e(this, "eventHandlers", /* @__PURE__ */ new Map()), this.url = t;
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
}, A = 5e3;
function j(e) {
	let [t, n] = w([]), [r, a] = w(!1), o = C(null), s = C(null), c = C(!0), l = C(!1), u = x(() => {
		if (!c.current) return;
		o.current?.disconnect(), o.current = null;
		let e = () => {
			c.current && (a(!1), l.current = !0, s.current = setTimeout(() => u(), A));
		};
		(async () => {
			let t;
			try {
				t = await y.bridgeToken({ force: l.current }), l.current = !1;
			} catch {
				e();
				return;
			}
			if (!c.current) return;
			let r = new k(i(t));
			o.current = r, r.connect().then(() => {
				c.current && (a(!0), y.getSessionLogs(100).then((e) => {
					c.current && n(e ?? []);
				}).catch(() => {}), r.onLog((e) => {
					c.current && n((t) => [...t, e].slice(-1e3));
				}), r.onDisconnect(e));
			}).catch(e);
		})();
	}, []), d = x(() => {
		s.current && (clearTimeout(s.current), s.current = null), a(!1), u();
	}, [u]);
	return S(() => {
		if (e) return c.current = !0, u(), () => {
			c.current = !1, s.current && clearTimeout(s.current), o.current?.disconnect(), o.current = null;
		};
	}, [e, u]), {
		logs: t,
		isConnected: r,
		reconnect: d,
		addLog: (e) => n((t) => [...t, e].slice(-1e3)),
		clear: () => n([])
	};
}
//#endregion
//#region src/modules/tiktok-live/components/LiveLogs.tsx
var M = {
	tiktok_comment: "text-sq-secondary",
	telegram_message: "text-sq-secondary",
	order: "text-sq-success-ink",
	error: "text-sq-danger",
	info: "text-sq-secondary"
}, N = {
	tiktok_comment: o,
	telegram_message: g,
	order: a,
	error: p,
	info: m
}, P = {
	tiktok_comment: "TikTok",
	telegram_message: "Telegram",
	order: "Замовлення",
	error: "Помилка",
	info: "Інфо"
};
function F(e) {
	return new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
}
function I({ logs: e, isConnected: t, onReconnect: n }) {
	let r = C(null);
	return S(() => {
		r.current && (r.current.scrollTop = r.current.scrollHeight);
	}, [e]), /* @__PURE__ */ D("div", {
		className: "flex h-[600px] flex-col overflow-hidden rounded-card bg-white shadow-card",
		"data-testid": "live-logs",
		children: [/* @__PURE__ */ D("div", {
			className: "flex flex-shrink-0 items-center justify-between gap-3 px-5 py-3.5 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
			children: [/* @__PURE__ */ D("div", { children: [/* @__PURE__ */ E("div", {
				className: "text-[15px] font-bold text-sq-heading",
				children: "Стрічка ефіру"
			}), /* @__PURE__ */ D("div", {
				className: "text-[13px] text-sq-muted tabular-nums",
				children: [e.length, " повідомлень · автоскрол увімкнено"]
			})] }), /* @__PURE__ */ D("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ D("span", {
					className: "flex items-center gap-1.5 text-[13px] font-semibold",
					children: [/* @__PURE__ */ E("span", { className: `h-2 w-2 flex-shrink-0 rounded-full ${t ? "bg-sq-success" : "bg-sq-danger"}` }), /* @__PURE__ */ E("span", {
						className: t ? "text-sq-success-ink" : "text-sq-danger",
						children: t ? "Підключено" : "Відключено"
					})]
				}), !t && n && /* @__PURE__ */ D("button", {
					type: "button",
					onClick: n,
					title: "Перепідключити без перезавантаження сторінки",
					className: "inline-flex items-center gap-1.5 min-h-9 px-3 rounded-sq bg-white ring-1 ring-sq-divider text-[13px] font-semibold text-sq-text hover:bg-sq-sidebar",
					children: [/* @__PURE__ */ E(d, { size: 16 }), "Перепідключити"]
				})]
			})]
		}), /* @__PURE__ */ E("div", {
			ref: r,
			className: "flex flex-1 flex-col overflow-y-auto px-5",
			children: e.length === 0 ? /* @__PURE__ */ D("div", {
				className: "flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center",
				children: [
					/* @__PURE__ */ E(o, {
						size: 48,
						className: "mb-2"
					}),
					/* @__PURE__ */ E("div", {
						className: "text-[15px] font-semibold text-sq-text",
						children: "Повідомлень поки немає"
					}),
					/* @__PURE__ */ E("div", {
						className: "text-[15px] text-sq-secondary",
						children: "Почніть ефір — коментарі та замовлення з TikTok LIVE з’являться тут"
					})
				]
			}) : e.map((e) => /* @__PURE__ */ D("div", {
				"data-testid": "live-log-row",
				className: "sq-row flex gap-3 py-3",
				children: [/* @__PURE__ */ E(L, { type: e.log_type }), /* @__PURE__ */ D("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ D("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ E("span", {
								className: `text-[13px] font-semibold ${M[e.log_type] ?? "text-sq-secondary"}`,
								children: P[e.log_type] ?? e.log_type
							}), /* @__PURE__ */ E("span", {
								className: "ml-auto text-[13px] text-sq-muted tabular-nums",
								children: F(e.created_at)
							})]
						}),
						/* @__PURE__ */ E("p", {
							className: "mt-0.5 break-words text-[15px] leading-snug text-sq-text",
							children: e.message
						}),
						e.data && Object.keys(e.data).length > 0 && /* @__PURE__ */ E("div", {
							className: "mt-1 flex flex-wrap gap-x-3 gap-y-0.5",
							children: Object.entries(e.data).map(([e, t]) => /* @__PURE__ */ D("span", {
								className: "font-mono text-[11px] text-sq-muted",
								children: [
									/* @__PURE__ */ D("span", {
										className: "text-sq-secondary",
										children: [e, ":"]
									}),
									" ",
									JSON.stringify(t)
								]
							}, e))
						})
					]
				})]
			}, e.id))
		})]
	});
}
function L({ type: e }) {
	let t = N[e] ?? r;
	return /* @__PURE__ */ E(t, {
		size: 24,
		className: "shrink-0"
	});
}
//#endregion
//#region src/modules/tiktok-live/components/SessionControl.tsx
var R = "bg-[#FF3D7A] hover:bg-[#D8215F]";
function z({ isActive: e, onStart: t, onStop: n, isStarting: r, isStopping: i }) {
	return e ? /* @__PURE__ */ E("button", {
		type: "button",
		onClick: n,
		disabled: i,
		"data-testid": "session-stop",
		className: "inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-xl bg-white ring-1 ring-sq-divider text-[17px] font-semibold text-red-600 transition-colors hover:bg-sq-sidebar disabled:cursor-not-allowed disabled:opacity-50",
		children: i ? "Зупиняємо…" : /* @__PURE__ */ D(T, { children: [/* @__PURE__ */ E("span", {
			"aria-hidden": !0,
			className: "w-3 h-3 rounded-[3px] bg-current"
		}), "Зупинити ефір"] })
	}) : /* @__PURE__ */ E("button", {
		type: "button",
		onClick: t,
		disabled: r,
		"data-testid": "session-start",
		className: `inline-flex items-center justify-center gap-2.5 min-h-[52px] px-6 rounded-xl text-[17px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${R}`,
		children: r ? "Запускаємо…" : /* @__PURE__ */ D(T, { children: [/* @__PURE__ */ E("span", {
			"aria-hidden": !0,
			className: "w-2.5 h-2.5 rounded-full bg-white"
		}), "Почати ефір"] })
	});
}
//#endregion
//#region src/modules/tiktok-live/pages/LiveDeskPage.tsx
var B = {
	host_too_old: {
		icon: u,
		title: "Застосунок каси застарів для модуля ефіру",
		body: "Оновіть застосунок до останньої версії. Якщо після оновлення нічого не змінилось — передайте код нижче в підтримку."
	},
	server_missing_bridge: {
		icon: h,
		title: "Сервер не підтримує модуль ефіру",
		body: "Схоже, сервер магазину ще не оновлено. Передайте код нижче в підтримку — оновлення на нашому боці."
	},
	server_error: {
		icon: p,
		title: "Сервер відповів помилкою",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
	},
	network: {
		icon: s,
		title: "Немає зʼєднання з сервером",
		body: "Модуль ефіру працює лише онлайн. Перевірте інтернет і спробуйте ще раз."
	},
	unknown: {
		icon: p,
		title: "Не вдалося підключитися до TikTok LIVE",
		body: "Спробуйте ще раз. Якщо помилка повторюється — передайте код нижче в підтримку."
	}
};
function V(e) {
	let t = Math.max(0, Math.floor((Date.now() - new Date(e).getTime()) / 1e3));
	return [
		Math.floor(t / 3600),
		Math.floor(t % 3600 / 60),
		t % 60
	].map((e) => String(e).padStart(2, "0")).join(":");
}
function H() {
	let e = t(), { status: n, username: r, diagnostic: i, refresh: a } = O(), s = n === "ready", { session: c, isActive: l, isError: u, diagnostic: d, isStarting: m, isStopping: h, actionError: _, start: y, stop: b } = f(s), { logs: x, isConnected: C, reconnect: k } = j(s), [A, M] = w("00:00:00"), N = c?.started_at ?? null;
	if (S(() => {
		if (!l || !N) {
			M("00:00:00");
			return;
		}
		M(V(N));
		let e = setInterval(() => M(V(N)), 1e3);
		return () => clearInterval(e);
	}, [l, N]), n === "loading") return /* @__PURE__ */ E(W, { title: "Підключення до TikTok LIVE…" });
	if (n === "not-configured") return /* @__PURE__ */ E(W, {
		icon: o,
		title: "Магазин не під’єднано до TikTok LIVE",
		body: e === "web" ? "Вкажіть нікнейм TikTok-акаунта в Налаштуваннях магазину — після цього ефір буде доступний і в касі, і в адмінці." : "Власник має вказати нікнейм TikTok-акаунта в Налаштуваннях магазину у веб-адмінці.",
		action: {
			label: "Спробувати ще раз",
			onClick: a
		},
		diagnostic: i
	});
	if (n === "error") {
		let e = B[i?.reason ?? "unknown"] ?? B.unknown;
		return /* @__PURE__ */ E(W, {
			icon: e.icon,
			title: e.title,
			body: e.body,
			action: {
				label: "Спробувати ще раз",
				onClick: a
			},
			diagnostic: i
		});
	}
	let P = x.filter((e) => e.log_type === "order").length, F = x.filter((e) => e.log_type === "tiktok_comment").length, L = x.filter((e) => e.log_type === "error").length;
	return /* @__PURE__ */ D("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text",
		children: [/* @__PURE__ */ D("div", {
			className: "flex flex-wrap items-center gap-3 px-4 md:px-7 py-4 md:min-h-[72px]",
			children: [
				/* @__PURE__ */ E(o, {
					size: 24,
					className: "shrink-0"
				}),
				/* @__PURE__ */ E("h1", {
					className: "text-2xl font-bold text-sq-heading",
					children: "Прямий ефір"
				}),
				/* @__PURE__ */ D("span", {
					className: `inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-xs font-medium ${l ? "bg-sq-success/10 text-sq-success-ink" : "ring-1 ring-inset ring-sq-divider text-sq-secondary"}`,
					"data-testid": "session-status",
					children: [/* @__PURE__ */ E("span", {
						"aria-hidden": !0,
						className: `h-2 w-2 flex-shrink-0 rounded-full ${l ? "bg-sq-success" : "bg-sq-muted"}`
					}), l ? "Активна" : "Зупинена"]
				})
			]
		}), /* @__PURE__ */ D("div", {
			className: "animate-fade-up space-y-5 px-4 md:px-7 pb-6",
			children: [/* @__PURE__ */ D("section", {
				className: "rounded-card bg-white shadow-card p-5",
				children: [/* @__PURE__ */ D("div", {
					className: "flex flex-wrap items-center justify-between gap-5",
					children: [/* @__PURE__ */ D("p", {
						className: "text-[15px] text-sq-secondary",
						children: [
							r ? `Акаунт @${r} · ` : "",
							"WebSocket:",
							" ",
							/* @__PURE__ */ E("span", {
								className: C ? "text-sq-success-ink" : "text-sq-danger",
								children: C ? "підключено" : "відключено"
							})
						]
					}), l && /* @__PURE__ */ D("div", {
						className: "rounded-xl bg-sq-sidebar px-[18px] py-3 text-center",
						children: [/* @__PURE__ */ E("div", {
							className: "text-[13px] font-medium text-sq-secondary",
							children: "Тривалість"
						}), /* @__PURE__ */ E("div", {
							className: "mt-0.5 text-[26px] font-bold leading-tight text-sq-success-ink tabular-nums",
							children: A
						})]
					})]
				}), /* @__PURE__ */ D("div", {
					className: "mt-5 flex flex-wrap items-center gap-4 pt-5 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]",
					children: [
						/* @__PURE__ */ E(z, {
							isActive: l,
							onStart: () => void y(),
							onStop: () => void b(),
							isStarting: m,
							isStopping: h
						}),
						_ && /* @__PURE__ */ E("span", {
							className: "text-sm text-red-600",
							children: _
						}),
						u && /* @__PURE__ */ D("span", {
							className: "text-sm text-sq-secondary",
							children: ["Статус ефіру недоступний — повторюємо спробу…", d && /* @__PURE__ */ D(T, { children: [" ", /* @__PURE__ */ E("code", {
								"data-testid": "live-poll-support-code",
								className: "select-all font-mono text-xs text-sq-muted",
								children: d.code
							})] })]
						})
					]
				})]
			}), /* @__PURE__ */ D("div", {
				className: "grid gap-5 lg:grid-cols-[260px_1fr]",
				children: [/* @__PURE__ */ D("div", {
					className: "flex flex-col gap-3",
					children: [
						/* @__PURE__ */ E("span", {
							className: "sq-section-label",
							children: "Статистика ефіру"
						}),
						/* @__PURE__ */ E(U, {
							label: "Замовлень",
							value: P,
							icon: v
						}),
						/* @__PURE__ */ E(U, {
							label: "Коментарів",
							value: F,
							icon: g
						}),
						/* @__PURE__ */ E(U, {
							label: "Помилок",
							value: L,
							icon: p,
							alert: L > 0
						})
					]
				}), /* @__PURE__ */ D("div", {
					className: "flex flex-col gap-3",
					children: [/* @__PURE__ */ E("span", {
						className: "sq-section-label",
						children: "Лайв-лог"
					}), /* @__PURE__ */ E(I, {
						logs: x,
						isConnected: C,
						onReconnect: k
					})]
				})]
			})]
		})]
	});
}
function U({ label: e, value: t, icon: n, alert: r }) {
	return /* @__PURE__ */ D("div", {
		className: "flex items-center gap-3.5 rounded-card bg-white shadow-card px-[18px] py-4",
		children: [/* @__PURE__ */ E(n, {
			size: 24,
			className: "shrink-0"
		}), /* @__PURE__ */ D("div", { children: [/* @__PURE__ */ E("div", {
			className: "text-[13px] font-medium text-sq-secondary",
			children: e
		}), /* @__PURE__ */ E("div", {
			className: `text-[26px] font-bold leading-tight tabular-nums ${r ? "text-sq-danger" : "text-sq-heading"}`,
			children: t
		})] })]
	});
}
function W({ icon: e, title: t, body: n, action: r, diagnostic: i }) {
	let a = e;
	return /* @__PURE__ */ E("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg grid place-items-center px-4 py-8",
		children: /* @__PURE__ */ D("div", {
			className: "animate-fade-up w-full max-w-md rounded-card bg-white shadow-card p-8 text-center",
			children: [
				a && /* @__PURE__ */ E("div", {
					className: "mb-4 flex justify-center",
					children: /* @__PURE__ */ E(a, { size: 48 })
				}),
				/* @__PURE__ */ E("h2", {
					className: "text-[19px] font-bold text-sq-heading",
					children: t
				}),
				n && /* @__PURE__ */ E("p", {
					className: "mt-2 text-[15px] leading-relaxed text-sq-secondary",
					children: n
				}),
				r && /* @__PURE__ */ E("button", {
					type: "button",
					onClick: r.onClick,
					className: "pos-btn-primary mt-6 min-h-11 px-5 rounded-xl text-[15px]",
					children: r.label
				}),
				i && /* @__PURE__ */ E(_, { diagnostic: i })
			]
		})
	});
}
//#endregion
export { H as LiveDeskPage };
