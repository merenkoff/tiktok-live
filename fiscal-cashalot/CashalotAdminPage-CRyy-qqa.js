import { useCallback as e, useEffect as t, useState as n } from "react";
import { Fragment as r, jsx as i, jsxs as a } from "react/jsx-runtime";
import * as o from "@pos/platform";
import { api as s } from "@pos/platform";
import { Link as c } from "react-router-dom";
// src/platform/glyphs.tsx
function l({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Banknote",
		...t,
		children: [
			/* @__PURE__ */ i("rect", {
				x: "2",
				y: "6",
				width: "20",
				height: "12",
				rx: "2.5",
				fill: "#43AE59"
			}),
			/* @__PURE__ */ i("circle", {
				cx: "12",
				cy: "12",
				r: "3",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
				x: "5",
				y: "9",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			}),
			/* @__PURE__ */ i("rect", {
				x: "17",
				y: "13",
				width: "2",
				height: "2",
				rx: "1",
				fill: "#FFFFFF",
				fillOpacity: ".6"
			})
		]
	});
}
function u({ size: e = 24, ...t }) {
	return /* @__PURE__ */ a("svg", {
		width: e,
		height: e,
		viewBox: "0 0 24 24",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ShieldCheck",
		...t,
		children: [/* @__PURE__ */ i("path", {
			d: "M12 3 19 5.5V11.25C19 15.75 16 19.25 12 21 8 19.25 5 15.75 5 11.25V5.5Z",
			fill: "#6C7D93",
			stroke: "#6C7D93",
			strokeWidth: "2",
			strokeLinejoin: "round"
		}), /* @__PURE__ */ i("path", {
			d: "M8.5 12 11 14.5 15.5 9.5",
			fill: "none",
			stroke: "#FFFFFF",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})]
	});
}
function d({ size: e = 20, ...t }) {
	return /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "ArrowLeft",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M16 10H4M9 5 4 10l5 5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
function f({ size: e = 20, ...t }) {
	return e <= 16 ? /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 16 16",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M3 8.5 6.5 12 13 4.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	}) : /* @__PURE__ */ i("svg", {
		width: e,
		height: e,
		viewBox: "0 0 20 20",
		fill: "none",
		"aria-hidden": "true",
		focusable: "false",
		"data-glyph": "Check",
		...t,
		children: /* @__PURE__ */ i("path", {
			d: "M4 10.5 8 14.5 16 5.5",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	});
}
// src/components/ui/Page.tsx
function p({ title: e, glyph: t, subtitle: n, actions: r, back: o }) {
	return /* @__PURE__ */ a("header", {
		className: "mb-7 space-y-1.5",
		"data-testid": "page-header",
		children: [
			o && /* @__PURE__ */ a(c, {
				to: o.to,
				className: "inline-flex items-center gap-1 min-h-9 text-[15px] font-semibold text-sq-blue",
				children: [/* @__PURE__ */ i(d, { size: 20 }), o.label]
			}),
			/* @__PURE__ */ a("div", {
				className: "flex flex-wrap items-center gap-x-3 gap-y-2",
				children: [
					t && /* @__PURE__ */ i(t, {
						size: 32,
						className: "shrink-0"
					}),
					/* @__PURE__ */ i("h2", {
						className: "text-[30px] font-bold text-sq-heading leading-tight",
						children: e
					}),
					r && /* @__PURE__ */ i("div", {
						className: "ml-auto flex flex-wrap items-center gap-2",
						children: r
					})
				]
			}),
			n && /* @__PURE__ */ i("div", {
				className: "text-[15px] text-sq-secondary max-w-3xl leading-relaxed",
				children: n
			})
		]
	});
}
function m({ title: e, count: t, action: n }) {
	return /* @__PURE__ */ a("div", {
		className: "flex items-center justify-between gap-3 pb-1.5 mb-1 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]",
		children: [/* @__PURE__ */ a("h3", {
			className: "flex items-baseline gap-2 text-[15px] font-bold text-sq-blue",
			children: [e, t != null && /* @__PURE__ */ i("span", {
				className: "text-[13px] font-normal text-sq-muted tabular-nums",
				children: t
			})]
		}), n && /* @__PURE__ */ i("div", {
			className: "text-[15px] font-semibold text-sq-blue",
			children: n
		})]
	});
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/typeof.js
function h(e) {
	"@babel/helpers - typeof";
	return h = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, h(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPrimitive.js
function g(e, t) {
	if (h(e) != "object" || !e) return e;
	var n = e[Symbol.toPrimitive];
	if (n !== void 0) {
		var r = n.call(e, t || "default");
		if (h(r) != "object") return r;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (t === "string" ? String : Number)(e);
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/toPropertyKey.js
function _(e) {
	var t = g(e, "string");
	return h(t) == "symbol" ? t : t + "";
}
// \0@oxc-project+runtime@0.155.0/helpers/esm/defineProperty.js
function v(e, t, n) {
	return (t = _(t)) in e ? Object.defineProperty(e, t, {
		value: n,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = n, e;
}
// src/modules/fiscal-core/lib/hostPlatform.ts
var y = class extends Error {
	constructor(e) {
		super(`host is missing: ${e.join(", ")}`), v(this, "missing", void 0), this.missing = e, this.name = "HostTooOldError";
	}
};
function b(e) {
	return typeof e == "function";
}
function x() {
	let e = [];
	return b(o.api?.posRequest) || e.push("api.posRequest"), e;
}
function S() {
	return typeof o.POS_APP_VERSION == "string" ? o.POS_APP_VERSION : "unknown";
}
function C() {
	return b(o.apiOrigin) ? o.apiOrigin() : "";
}
b(o.usePosShell) && o.usePosShell;
function w(e, t, n) {
	let r = x();
	return r.length > 0 ? Promise.reject(new y(r)) : o.api.posRequest(e, t, n);
}
// src/modules/fiscal-core/data/fiscalApi.ts
function T(e = 1) {
	return e === 1 ? s.fiscalSettings() : w("get", `/fiscal/settings${E(e)}`);
}
function E(e) {
	return e === 1 ? "" : `?register=${e}`;
}
function D(e) {
	return e === 1 ? {} : { register: e };
}
function ee(e, t) {
	return w("patch", "/fiscal/settings", {
		...t,
		register: e
	});
}
function O(e, t = 1) {
	return w("patch", "/fiscal/settings", {
		secrets: e,
		...D(t)
	});
}
function te(e, t, n = 1) {
	return w("patch", "/fiscal/settings", {
		config: e,
		...t === void 0 ? {} : { default_tax_code: t },
		...D(n)
	});
}
function ne(e = 1) {
	return w("get", `/fiscal/status${E(e)}`);
}
function k(e, t) {
	return t === 1 ? w("post", e) : w("post", e, D(t));
}
function A(e = 1) {
	return k("/fiscal/test-connection", e);
}
function j(e = 1) {
	return k("/fiscal/shift/open", e);
}
function re(e = 1) {
	return k("/fiscal/shift/close", e);
}
function ie(e = 1) {
	return k("/fiscal/x-report", e);
}
function M(e, t = 1) {
	return w("post", "/fiscal/service", {
		amount_cents: e,
		...D(t)
	});
}
function ae(e) {
	return w("get", `/fiscal/attention${e ? `?register=${e}` : ""}`);
}
// src/modules/fiscal-core/components/SecretsForm.tsx
function oe({ specs: e, secretsSet: t, saving: r, onSave: o }) {
	let [s, c] = n({}), l = (e, t) => c((n) => ({
		...n,
		[e]: t
	}));
	function u() {
		let t = {};
		for (let n of e) s[n.key] !== void 0 && s[n.key] !== "" && (t[n.key] = s[n.key]);
		Object.keys(t).length !== 0 && (o(t), c({}));
	}
	function d(e) {
		o({ [e]: null });
	}
	return /* @__PURE__ */ a("div", {
		className: "space-y-4",
		children: [e.map((e) => {
			let n = t.includes(e.key);
			return /* @__PURE__ */ a("div", {
				className: "space-y-1.5",
				children: [
					/* @__PURE__ */ a("label", {
						className: "flex flex-col gap-1.5",
						children: [/* @__PURE__ */ a("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: [e.label, e.required && /* @__PURE__ */ i("span", {
								className: "text-red-600",
								children: " *"
							})]
						}), /* @__PURE__ */ a("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ i("input", {
								type: e.kind === "password" ? "password" : "text",
								className: "sq-input flex-1",
								value: s[e.key] ?? "",
								onChange: (t) => l(e.key, t.target.value),
								placeholder: n ? "••••••••" : e.hint,
								autoComplete: "off"
							}), n && /* @__PURE__ */ i("button", {
								type: "button",
								className: "shrink-0 min-h-9 text-[15px] font-semibold text-red-600",
								onClick: () => d(e.key),
								children: "Очистити"
							})]
						})]
					}),
					n && !s[e.key] && /* @__PURE__ */ i("p", {
						className: "text-[13px] text-sq-muted",
						children: "Значення збережено — залиште порожнім, щоб не змінювати."
					}),
					e.hint && /* @__PURE__ */ i("p", {
						className: "text-[13px] text-sq-muted",
						children: e.hint
					})
				]
			}, e.key);
		}), /* @__PURE__ */ i("button", {
			type: "button",
			className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]",
			disabled: r,
			onClick: u,
			children: r ? "Збереження…" : "Зберегти дані доступу"
		})]
	});
}
// src/modules/fiscal-core/types.ts
function se(e) {
	return !!e && typeof e == "object" && typeof e.error == "string";
}
// src/modules/fiscal-core/lib/diagnostics.ts
var N = "2.7.0", ce = "fiscal-cashalot", P = {
	host_too_old: "HOST",
	server: "SRV",
	network: "NET",
	unknown: "UNK"
};
function F(e) {
	let t = e?.response?.data;
	return se(t) ? t : null;
}
function le(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function ue(e, t) {
	return e instanceof y ? "host_too_old" : t === null ? e instanceof Error ? "network" : "unknown" : "server";
}
function I(e) {
	let t = le(e), n = F(e), r = {
		reason: ue(e, t),
		status: t,
		serverError: n?.error ?? null,
		missingHostApi: x(),
		moduleVersion: N,
		hostVersion: S(),
		apiBase: C(),
		at: (/* @__PURE__ */ new Date()).toISOString()
	}, i = n?.support_code ?? `FC-${r.reason === "server" && t !== null ? `${P.server}${t}` : P[r.reason]}-${r.moduleVersion}-${r.hostVersion}`;
	return {
		...r,
		code: i
	};
}
function de(e, t) {
	let n = F(e);
	if (n?.message) return n.message;
	switch (t.reason) {
		case "host_too_old": return "Оновіть застосунок каси, щоб продовжити";
		case "network": return "Немає звʼязку з сервером";
		default: return "Помилка ПРРО";
	}
}
function L(e) {
	return JSON.stringify({
		module: ce,
		...e
	}, null, 2);
}
var R = /* @__PURE__ */ new Set();
function z(e) {
	typeof window < "u" && (window.__POS_FISCAL_DIAG__ = e), !R.has(e.code) && (R.add(e.code), console.error(`[fiscal] ${e.code}`, e));
}
// src/modules/fiscal-core/components/FiscalErrorCard.tsx
function B({ error: e }) {
	let [t, r] = n(!1), o = I(e), s = de(e, o);
	async function c() {
		try {
			await navigator.clipboard.writeText(L(o)), r(!0), setTimeout(() => r(!1), 2e3);
		} catch {
			r(!1);
		}
	}
	return /* @__PURE__ */ a("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [/* @__PURE__ */ i("p", {
			className: "font-semibold",
			children: s
		}), /* @__PURE__ */ a("div", {
			className: "mt-2 flex flex-wrap items-center gap-2",
			children: [/* @__PURE__ */ i("code", {
				"data-testid": "fiscal-support-code",
				className: "select-all rounded-md bg-white/70 px-2 py-1 font-mono text-[13px] text-red-800",
				children: o.code
			}), /* @__PURE__ */ i("button", {
				type: "button",
				onClick: () => void c(),
				className: "min-h-9 rounded-sq px-3 text-[13px] font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-white/60",
				children: t ? "Скопійовано" : "Копіювати деталі"
			})]
		})]
	});
}
// src/modules/fiscal-core/components/AttentionList.tsx
function V(e) {
	return (e / 100).toFixed(2) + " ₴";
}
function fe({ registerNo: e } = {}) {
	let [r, o] = n(null), [s, c] = n([]), [l, u] = n(null);
	return t(() => {
		ae(e).then((e) => {
			o(e.documents), c(e.sessions ?? []);
		}).catch(u);
	}, [e]), l ? /* @__PURE__ */ i(B, { error: l }) : r ? r.length === 0 && s.length === 0 ? /* @__PURE__ */ a("p", {
		className: "py-3 flex items-center gap-2 text-[15px] text-sq-secondary",
		children: [/* @__PURE__ */ i(f, {
			size: 20,
			className: "shrink-0 text-sq-success"
		}), "Немає документів, що потребують уваги."]
	}) : /* @__PURE__ */ a("div", {
		className: "space-y-3 pt-2",
		children: [s.map((e) => /* @__PURE__ */ a("div", {
			role: "alert",
			className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
			children: [
				/* @__PURE__ */ a("p", {
					className: "font-semibold",
					children: [
						"Офлайн-сесія #",
						e.id,
						" зупинена"
					]
				}),
				/* @__PURE__ */ i("p", {
					className: "mt-1",
					children: e.error_message ?? e.error_code ?? "Причина невідома"
				}),
				/* @__PURE__ */ a("p", {
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
				/* @__PURE__ */ i("p", {
					className: "mt-1 text-[13px]",
					children: "Ці чеки треба звірити в кабінеті провайдера — автоматично вони вже не підуть."
				})
			]
		}, `session-${e.id}`)), r.length > 0 && /* @__PURE__ */ i("ul", { children: r.map((e) => /* @__PURE__ */ a("li", {
			className: "sq-row py-2.5",
			children: [
				/* @__PURE__ */ a("div", {
					className: "flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ i("span", {
						className: "text-base font-medium text-sq-text tabular-nums",
						children: e.receipt_number ?? `#${e.id}`
					}), /* @__PURE__ */ i("span", {
						className: "text-[15px] text-sq-text tabular-nums",
						children: V(e.total_cents)
					})]
				}),
				/* @__PURE__ */ i("p", {
					className: "mt-0.5 text-[13px] text-red-600",
					children: e.error_message ?? e.error_code ?? "Помилка ПРРО"
				}),
				/* @__PURE__ */ a("p", {
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
	}) : /* @__PURE__ */ i("p", {
		className: "py-3 text-[15px] text-sq-muted",
		children: "Завантаження…"
	});
}
// src/modules/fiscal-core/components/ProbeSection.tsx
function pe({ onProbed: e, registerNo: t = 1 } = {}) {
	let [o, s] = n(null), [c, l] = n(!1), [u, d] = n(null);
	async function f() {
		l(!0), d(null), s(null);
		try {
			let n = await A(t);
			s(n), e?.(n);
		} catch (e) {
			d(e);
		} finally {
			l(!1);
		}
	}
	return /* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Зʼєднання" }), /* @__PURE__ */ a("div", {
		className: "pt-4 space-y-3",
		children: [
			/* @__PURE__ */ i("button", {
				type: "button",
				className: "sq-btn-quiet",
				disabled: c,
				onClick: () => void f(),
				children: c ? "Перевірка…" : "Перевірити з'єднання"
			}),
			!!u && /* @__PURE__ */ i(B, { error: u }),
			o && /* @__PURE__ */ i("div", {
				className: `rounded-xl px-4 py-3 text-[15px] ${o.ok ? "bg-sq-success/10 text-sq-success-ink" : "bg-amber-50 text-amber-800"}`,
				children: o.ok ? /* @__PURE__ */ a(r, { children: [
					/* @__PURE__ */ i("p", {
						className: "font-semibold",
						children: "З'єднання успішне"
					}),
					o.cashierName && /* @__PURE__ */ a("p", { children: ["Касир: ", o.cashierName] }),
					o.cashRegister && /* @__PURE__ */ a("p", { children: ["Каса: ", o.cashRegister] }),
					o.message && /* @__PURE__ */ i("p", { children: o.message })
				] }) : /* @__PURE__ */ i("p", { children: o.message ?? "Перевірка не пройдена" })
			})
		]
	})] });
}
// src/modules/fiscal-cashalot/lib/taxTable.ts
var H = {
	А: "A",
	Б: "B",
	В: "V",
	Г: "G",
	Д: "D",
	Е: "E",
	Є: "YE",
	Ж: "ZH",
	З: "Z",
	И: "Y",
	І: "I",
	Ї: "YI",
	Й: "J",
	К: "K"
}, me = Object.keys(H);
function he(e = "", t = 0) {
	return t === 1 ? {
		letter: e,
		name: "Акциз",
		rate: "5",
		type: 1
	} : {
		letter: e,
		name: "",
		rate: ""
	};
}
function U(e) {
	return e.filter((e) => e.type !== 1);
}
function W(e) {
	return {
		taxes: (Array.isArray(e?.taxes) ? e.taxes : []).map((e) => {
			let t = e && typeof e == "object" ? e : {};
			return {
				letter: typeof t.letter == "string" ? t.letter : "",
				name: typeof t.name == "string" ? t.name : "",
				rate: t.rate === void 0 || t.rate === null ? "" : String(t.rate),
				...t.type === 1 ? { type: 1 } : {}
			};
		}),
		testing: e?.testing === !0
	};
}
function ge(e) {
	return {
		taxes: e.taxes.map((e) => ({
			letter: e.letter.trim(),
			name: e.name.trim(),
			rate: _e(e.rate),
			...e.type === 1 ? { type: 1 } : {}
		})),
		testing: e.testing
	};
}
function _e(e) {
	let t = e.trim().replace(",", ".");
	if (t === "") return e;
	let n = Number(t);
	return Number.isFinite(n) ? n : e;
}
function G(e) {
	return H[e.trim().toUpperCase()] ?? null;
}
function K(e, t) {
	let n = e?.trim().toUpperCase();
	if (!n) return null;
	let r = U(t).find((e) => {
		let t = e.letter.trim().toUpperCase();
		return t === n || G(t) === n;
	});
	return r ? r.letter.trim().toUpperCase() : null;
}
function q(e, t) {
	let n = new Set(e.filter((e, n) => n !== t).map((e) => e.letter.trim().toUpperCase()));
	return me.filter((e) => !n.has(e));
}
// src/modules/fiscal-cashalot/components/TaxTableForm.tsx
var J = "text-[13px] font-semibold text-sq-secondary", Y = "w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]";
function ve({ settings: e, saving: r, onSave: o }) {
	let [s, c] = n(() => W(e.config)), [l, u] = n(() => K(e.default_tax_code, W(e.config).taxes));
	t(() => {
		let t = W(e.config);
		c(t), u(K(e.default_tax_code, t.taxes));
	}, [e.config, e.default_tax_code]);
	let d = e.requisites?.organization.is_vat === !0, f = W(e.config).taxes, p = !!e.default_tax_code && f.length > 0 && K(e.default_tax_code, f) === null, m = (e, t) => c((n) => ({
		...n,
		taxes: n.taxes.map((n, r) => r === e ? {
			...n,
			...t
		} : n)
	})), h = (e = 0) => c((t) => ({
		...t,
		taxes: [...t.taxes, he(q(t.taxes, t.taxes.length)[0] ?? "", e)]
	})), g = s.taxes.some((e) => e.type === 1), _ = (e) => c((t) => ({
		...t,
		taxes: t.taxes.filter((t, n) => n !== e)
	}));
	function v() {
		let e = U(s.taxes).map((e) => e.letter.trim().toUpperCase()), t = l && e.includes(l) ? l : e[0];
		o(ge(s), t ? G(t) : null);
	}
	return /* @__PURE__ */ a("div", {
		className: "space-y-4",
		children: [
			p && /* @__PURE__ */ a("p", {
				role: "alert",
				className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800",
				children: [
					"Збережений код ставки «",
					e.default_tax_code,
					"» не з цієї таблиці — кожен чек буде відхилено ще до відправки. Оберіть ставку за замовчуванням і збережіть."
				]
			}),
			d && s.taxes.length === 0 && /* @__PURE__ */ i("p", {
				role: "alert",
				className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800",
				children: "За реквізитами ПРРО ви платник ПДВ, а таблиця ставок порожня — чеки підуть без літер податку. Додайте ставки з кабінету Cashalot."
			}),
			s.taxes.length === 0 ? /* @__PURE__ */ i("p", {
				className: "text-[15px] text-sq-secondary",
				children: "Таблиця порожня: чек іде без літер податку — так продає ФОП без ПДВ."
			}) : /* @__PURE__ */ a("div", {
				className: "space-y-2",
				children: [/* @__PURE__ */ a("div", {
					className: "hidden sm:grid grid-cols-[4rem_5.5rem_1fr_5rem_5.5rem_2.5rem] gap-2 px-1",
					children: [
						/* @__PURE__ */ i("span", {
							className: J,
							children: "Літера"
						}),
						/* @__PURE__ */ i("span", {
							className: J,
							children: "Вид"
						}),
						/* @__PURE__ */ i("span", {
							className: J,
							children: "Назва"
						}),
						/* @__PURE__ */ i("span", {
							className: J,
							children: "%"
						}),
						/* @__PURE__ */ i("span", {
							className: J,
							children: "За замовч."
						}),
						/* @__PURE__ */ i("span", {})
					]
				}), s.taxes.map((e, t) => {
					let n = e.letter.trim().toUpperCase();
					return /* @__PURE__ */ a("div", {
						className: "grid grid-cols-[4rem_5.5rem_1fr_5rem_5.5rem_2.5rem] gap-2 items-center",
						"data-testid": `tax-row-${t}`,
						children: [
							/* @__PURE__ */ a("select", {
								"aria-label": `Літера ставки ${t + 1}`,
								className: "sq-input",
								value: n,
								onChange: (e) => m(t, { letter: e.target.value }),
								children: [n === "" && /* @__PURE__ */ i("option", {
									value: "",
									children: "—"
								}), q(s.taxes, t).map((e) => /* @__PURE__ */ i("option", {
									value: e,
									children: e
								}, e))]
							}),
							/* @__PURE__ */ a("select", {
								"aria-label": `Вид ставки ${t + 1}`,
								className: "sq-input",
								value: e.type === 1 ? "1" : "0",
								onChange: (e) => m(t, { type: +(e.target.value === "1") }),
								children: [/* @__PURE__ */ i("option", {
									value: "0",
									children: "ПДВ"
								}), /* @__PURE__ */ i("option", {
									value: "1",
									disabled: g && e.type !== 1,
									children: "Акциз"
								})]
							}),
							/* @__PURE__ */ i("input", {
								"aria-label": `Назва ставки ${t + 1}`,
								className: "sq-input",
								value: e.name,
								placeholder: "ПДВ",
								onChange: (e) => m(t, { name: e.target.value })
							}),
							/* @__PURE__ */ i("input", {
								"aria-label": `Відсоток ставки ${t + 1}`,
								className: "sq-input tabular-nums",
								inputMode: "decimal",
								value: e.rate,
								placeholder: "20",
								onChange: (e) => m(t, { rate: e.target.value })
							}),
							/* @__PURE__ */ i("label", {
								className: "min-h-11 flex items-center justify-center gap-2 text-[13px] text-sq-secondary",
								children: /* @__PURE__ */ i("input", {
									type: "radio",
									name: "cashalot-default-tax",
									"aria-label": `Ставка ${t + 1} за замовчуванням`,
									className: Y,
									checked: n !== "" && e.type !== 1 && l === n,
									disabled: n === "" || e.type === 1,
									onChange: () => u(n)
								})
							}),
							/* @__PURE__ */ i("button", {
								type: "button",
								"aria-label": `Прибрати ставку ${t + 1}`,
								className: "min-h-11 text-[20px] leading-none text-sq-muted hover:text-red-600",
								onClick: () => _(t),
								children: "×"
							})
						]
					}, t);
				})]
			}),
			s.taxes.length < 10 && /* @__PURE__ */ a("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ i("button", {
					type: "button",
					className: "sq-btn-quiet",
					onClick: () => h(0),
					children: "+ Додати ставку"
				}), !g && /* @__PURE__ */ i("button", {
					type: "button",
					className: "sq-btn-quiet",
					onClick: () => h(1),
					"data-testid": "tax-add-excise",
					children: "+ Акциз 5 %"
				})]
			}),
			/* @__PURE__ */ i("p", {
				className: "text-[13px] text-sq-muted",
				children: "Літери й назви — як у кабінеті Cashalot (Налаштування → Податки). Ставка за замовчуванням друкується на кожному рядку чека. Змінюються лише при закритій зміні."
			}),
			/* @__PURE__ */ i("p", {
				className: "text-[13px] text-sq-muted",
				children: "Акциз — для пива й алкоголю: його літера додається до ставки ПДВ підакцизного товару («АГ»). ФОП без ПДВ, що продає алкоголь, лишає в таблиці тільки рядок акцизу."
			}),
			/* @__PURE__ */ a("label", {
				className: "min-h-11 flex items-center gap-3 text-[15px] text-sq-text",
				children: [/* @__PURE__ */ i("input", {
					type: "checkbox",
					className: Y,
					checked: s.testing,
					onChange: (e) => c((t) => ({
						...t,
						testing: e.target.checked
					}))
				}), /* @__PURE__ */ i("span", { children: "Тестовий режим" })]
			}),
			/* @__PURE__ */ i("p", {
				className: "-mt-2 pl-8 text-[13px] text-sq-muted",
				children: "Чеки й зміни йдуть у Cashalot як тестові — без фіскальної сили, для перевірки налаштувань. Вимкніть перед першим справжнім продажем; змінюється лише при закритій зміні й без чеків у черзі."
			}),
			/* @__PURE__ */ i("button", {
				type: "button",
				className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]",
				disabled: r,
				onClick: v,
				children: r ? "Збереження…" : "Зберегти ставки й режим"
			})
		]
	});
}
// src/modules/fiscal-cashalot/secretSpecs.ts
var X = "Кабінет Cashalot → Налаштування → Інтеграція з WEB API → Управління касирами", ye = [
	{
		key: "keyGuid",
		label: "Ідентифікатор ключа (KeyGuid)",
		required: !0,
		kind: "password",
		hint: X
	},
	{
		key: "keyPin",
		label: "PIN касира",
		required: !0,
		kind: "password",
		hint: X
	},
	{
		key: "numFiscal",
		label: "Фіскальний номер ПРРО",
		required: !0,
		kind: "text",
		hint: "Кабінет Cashalot → Каси → обраний ПРРО"
	}
];
// src/modules/fiscal-cashalot/lib/registerTitle.ts
function Z(e, t) {
	let n = t?.trim();
	return n ? `Каса ${e} · ${n}` : `Каса ${e}`;
}
// src/modules/fiscal-cashalot/pages/CashalotAdminPage.tsx
function be(e) {
	let t = e?.response;
	return t?.status === 400 && typeof t.data?.error == "string" ? t.data.error : null;
}
function Q({ error: e }) {
	let t = be(e);
	return t ? /* @__PURE__ */ i("p", {
		role: "alert",
		className: "text-[15px] text-red-600",
		children: t
	}) : /* @__PURE__ */ i(B, { error: e });
}
function $({ where: e }) {
	return /* @__PURE__ */ a("p", {
		role: "status",
		className: "rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-800",
		children: [
			/* @__PURE__ */ i("span", {
				className: "font-semibold",
				children: "Тестовий режим."
			}),
			" ",
			e === "till" ? "Тестова зміна — чеки без фіскальної сили." : "Чеки реєструються як тестові, без фіскальної сили. Вимкніть його нижче перед першим справжнім продажем."
		]
	});
}
function xe({ registerNo: e, initial: r, onSaved: o }) {
	let [s, c] = n(r ?? null), [l, u] = n(null), [d, f] = n(!1), [p, h] = n(null), [g, _] = n(!1), [v, y] = n(null), [b, x] = n(null), S = r != null;
	t(() => {
		S || T(e).then(c).catch(u);
	}, [e, S]);
	function C(e) {
		c(e), o(e);
	}
	async function w(t) {
		f(!0), h(null);
		try {
			C(await O(t, e));
		} catch (e) {
			h(e);
		} finally {
			f(!1);
		}
	}
	async function E(t, n) {
		_(!0), y(null), x(null);
		try {
			let r = await te(t, n, e);
			if (C(r), x("Збережено"), r.enabled) try {
				await A(e), c(await T(e));
			} catch {}
		} catch (e) {
			y(e);
		} finally {
			_(!1);
		}
	}
	return l ? /* @__PURE__ */ i(B, { error: l }) : s ? /* @__PURE__ */ a("div", {
		className: "space-y-8",
		children: [
			s.config.testing === !0 && /* @__PURE__ */ i($, { where: "admin" }),
			e !== 1 && /* @__PURE__ */ i(Se, {
				registerNo: e,
				settings: s,
				onSaved: C
			}),
			/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Дані доступу" }), /* @__PURE__ */ a("div", {
				className: "pt-4 space-y-3",
				children: [/* @__PURE__ */ i(oe, {
					specs: ye,
					secretsSet: s.secrets_set,
					saving: d,
					onSave: (e) => void w(e)
				}), !!p && /* @__PURE__ */ i(Q, { error: p })]
			})] }),
			/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Ставки податку й режим" }), /* @__PURE__ */ a("div", {
				className: "pt-4 space-y-3",
				children: [
					/* @__PURE__ */ i(ve, {
						settings: s,
						saving: g,
						onSave: (e, t) => void E(e, t)
					}),
					b && /* @__PURE__ */ i("p", {
						className: "text-[15px] font-medium text-sq-success-ink",
						children: b
					}),
					!!v && /* @__PURE__ */ i(Q, { error: v })
				]
			})] }),
			/* @__PURE__ */ i(pe, { registerNo: e }),
			/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Потребують уваги" }), /* @__PURE__ */ i(fe, { registerNo: e })] })
		]
	}) : /* @__PURE__ */ i("p", {
		className: "text-[15px] text-sq-muted",
		children: "Завантаження…"
	});
}
function Se({ registerNo: e, settings: t, onSaved: r }) {
	let [o, s] = n(t.label ?? ""), [c, l] = n(t.enabled), [u, d] = n(!1), [f, p] = n(null), [h, g] = n(null), _ = o.trim() !== (t.label ?? "").trim() || c !== t.enabled;
	async function v() {
		d(!0), p(null), g(null);
		try {
			r(await ee(e, {
				label: o.trim() || null,
				enabled: c
			})), g("Збережено");
		} catch (e) {
			p(e);
		} finally {
			d(!1);
		}
	}
	return /* @__PURE__ */ a("section", {
		"data-testid": "register-basics",
		children: [/* @__PURE__ */ i(m, { title: "Друга каса" }), /* @__PURE__ */ a("div", {
			className: "pt-4 space-y-3",
			children: [
				/* @__PURE__ */ i("p", {
					className: "text-[15px] text-sq-secondary",
					children: "Інший ФОП: свої ключі Cashalot і своя таблиця ставок. Які товари йдуть на цю касу, вибирається в картці товару («Каса») або для кількох одразу в списку товарів."
				}),
				/* @__PURE__ */ a("label", {
					className: "block",
					children: [/* @__PURE__ */ i("span", {
						className: "text-[13px] text-sq-secondary",
						children: "Назва"
					}), /* @__PURE__ */ i("input", {
						className: "mt-1 w-full min-h-11 rounded-[10px] bg-sq-surface ring-1 ring-inset ring-sq-divider px-3 text-[15px]",
						value: o,
						maxLength: 60,
						placeholder: "Наприклад: Бар",
						onChange: (e) => s(e.target.value),
						"data-testid": "register-label"
					})]
				}),
				/* @__PURE__ */ a("label", {
					className: "flex items-center gap-2.5 text-[15px] cursor-pointer",
					children: [/* @__PURE__ */ i("input", {
						type: "checkbox",
						className: "w-5 h-5",
						checked: c,
						onChange: (e) => l(e.target.checked),
						"data-testid": "register-enabled"
					}), "Каса працює — товари, призначені на неї, пробиваються її чеком"]
				}),
				/* @__PURE__ */ i("button", {
					type: "button",
					className: "pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] disabled:opacity-50",
					disabled: !_ || u,
					onClick: () => void v(),
					"data-testid": "register-basics-save",
					children: u ? "Збереження…" : "Зберегти"
				}),
				h && /* @__PURE__ */ i("p", {
					className: "text-[15px] font-medium text-sq-success-ink",
					children: h
				}),
				!!f && /* @__PURE__ */ i(Q, { error: f })
			]
		})]
	});
}
function Ce() {
	let [r, o] = n(null), [s, c] = n(null), [l, d] = n(1), [f, h] = n(!1), g = e(() => {
		T(1).then(o).catch(c);
	}, []);
	t(g, [g]);
	let _ = r?.extra_registers ?? [], v = [
		{
			registerNo: 1,
			title: Z(1)
		},
		..._.map((e) => ({
			registerNo: e.register_no,
			title: Z(e.register_no, e.label)
		})),
		...f && !_.some((e) => e.register_no === 2) ? [{
			registerNo: 2,
			title: Z(2)
		}] : []
	], y = _.length === 0 && !f && r?.provider === "cashalot" && r.enabled;
	return /* @__PURE__ */ a("div", {
		className: "space-y-8 animate-fade-up max-w-2xl text-sq-text",
		children: [
			/* @__PURE__ */ i(p, {
				glyph: u,
				title: "Фіскалізація — Cashalot"
			}),
			!!s && /* @__PURE__ */ i(B, { error: s }),
			v.length > 1 && /* @__PURE__ */ i("div", {
				role: "tablist",
				"aria-label": "Каси",
				className: "flex flex-wrap gap-2",
				"data-testid": "register-tabs",
				children: v.map((e) => /* @__PURE__ */ i("button", {
					type: "button",
					role: "tab",
					"aria-selected": l === e.registerNo,
					onClick: () => d(e.registerNo),
					className: `min-h-11 px-4 rounded-[10px] text-[15px] font-semibold ${l === e.registerNo ? "bg-sq-blue text-white" : "bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text"}`,
					children: e.title
				}, e.registerNo))
			}),
			r && /* @__PURE__ */ i(xe, {
				registerNo: l,
				initial: l === 1 ? r : null,
				onSaved: (e) => l === 1 ? o(e) : g()
			}, l),
			l === 1 && y && /* @__PURE__ */ a("section", {
				"data-testid": "register-add",
				children: [/* @__PURE__ */ i(m, { title: "Друга каса" }), /* @__PURE__ */ a("div", {
					className: "pt-4 space-y-3",
					children: [/* @__PURE__ */ i("p", {
						className: "text-[15px] text-sq-secondary",
						children: "Якщо частину товарів продає інший ФОП (наприклад, алкоголь — ФОП із ліцензією), підключіть його касу Cashalot тут. Тоді замовлення з товарами обох ФОП пробивається двома чеками."
					}), /* @__PURE__ */ i("button", {
						type: "button",
						className: "sq-btn-quiet",
						onClick: () => {
							h(!0), d(2);
						},
						children: "Додати другу касу"
					})]
				})]
			})
		]
	});
}
export { Ce as CashalotAdminPage, $ as TestingBanner, re as a, ne as c, f as d, u as f, z as i, j as l, B as n, M as o, I as r, ie as s, Z as t, l as u };
