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
function T() {
	return s.fiscalSettings();
}
function ee(e) {
	return w("patch", "/fiscal/settings", { secrets: e });
}
function te(e, t) {
	return w("patch", "/fiscal/settings", {
		config: e,
		...t === void 0 ? {} : { default_tax_code: t }
	});
}
function E() {
	return w("get", "/fiscal/status");
}
function D() {
	return w("post", "/fiscal/test-connection");
}
function ne() {
	return w("post", "/fiscal/shift/open");
}
function O() {
	return w("post", "/fiscal/shift/close");
}
function k() {
	return w("post", "/fiscal/x-report");
}
function A(e) {
	return w("post", "/fiscal/service", { amount_cents: e });
}
function re() {
	return w("get", "/fiscal/attention");
}
// src/modules/fiscal-core/components/SecretsForm.tsx
function ie({ specs: e, secretsSet: t, saving: r, onSave: o }) {
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
function ae(e) {
	return !!e && typeof e == "object" && typeof e.error == "string";
}
// src/modules/fiscal-core/lib/diagnostics.ts
var oe = "2.6.6", se = "fiscal-cashalot", j = {
	host_too_old: "HOST",
	server: "SRV",
	network: "NET",
	unknown: "UNK"
};
function M(e) {
	let t = e?.response?.data;
	return ae(t) ? t : null;
}
function ce(e) {
	let t = e?.response?.status;
	return typeof t == "number" ? t : null;
}
function le(e, t) {
	return e instanceof y ? "host_too_old" : t === null ? e instanceof Error ? "network" : "unknown" : "server";
}
function N(e) {
	let t = ce(e), n = M(e), r = {
		reason: le(e, t),
		status: t,
		serverError: n?.error ?? null,
		missingHostApi: x(),
		moduleVersion: oe,
		hostVersion: S(),
		apiBase: C(),
		at: (/* @__PURE__ */ new Date()).toISOString()
	}, i = n?.support_code ?? `FC-${r.reason === "server" && t !== null ? `${j.server}${t}` : j[r.reason]}-${r.moduleVersion}-${r.hostVersion}`;
	return {
		...r,
		code: i
	};
}
function P(e, t) {
	let n = M(e);
	if (n?.message) return n.message;
	switch (t.reason) {
		case "host_too_old": return "Оновіть застосунок каси, щоб продовжити";
		case "network": return "Немає звʼязку з сервером";
		default: return "Помилка ПРРО";
	}
}
function F(e) {
	return JSON.stringify({
		module: se,
		...e
	}, null, 2);
}
var I = /* @__PURE__ */ new Set();
function L(e) {
	typeof window < "u" && (window.__POS_FISCAL_DIAG__ = e), !I.has(e.code) && (I.add(e.code), console.error(`[fiscal] ${e.code}`, e));
}
// src/modules/fiscal-core/components/FiscalErrorCard.tsx
function R({ error: e }) {
	let [t, r] = n(!1), o = N(e), s = P(e, o);
	async function c() {
		try {
			await navigator.clipboard.writeText(F(o)), r(!0), setTimeout(() => r(!1), 2e3);
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
function z(e) {
	return (e / 100).toFixed(2) + " ₴";
}
function B() {
	let [e, r] = n(null), [o, s] = n([]), [c, l] = n(null);
	return t(() => {
		re().then((e) => {
			r(e.documents), s(e.sessions ?? []);
		}).catch(l);
	}, []), c ? /* @__PURE__ */ i(R, { error: c }) : e ? e.length === 0 && o.length === 0 ? /* @__PURE__ */ a("p", {
		className: "py-3 flex items-center gap-2 text-[15px] text-sq-secondary",
		children: [/* @__PURE__ */ i(f, {
			size: 20,
			className: "shrink-0 text-sq-success"
		}), "Немає документів, що потребують уваги."]
	}) : /* @__PURE__ */ a("div", {
		className: "space-y-3 pt-2",
		children: [o.map((e) => /* @__PURE__ */ a("div", {
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
		}, `session-${e.id}`)), e.length > 0 && /* @__PURE__ */ i("ul", { children: e.map((e) => /* @__PURE__ */ a("li", {
			className: "sq-row py-2.5",
			children: [
				/* @__PURE__ */ a("div", {
					className: "flex items-baseline justify-between gap-3",
					children: [/* @__PURE__ */ i("span", {
						className: "text-base font-medium text-sq-text tabular-nums",
						children: e.receipt_number ?? `#${e.id}`
					}), /* @__PURE__ */ i("span", {
						className: "text-[15px] text-sq-text tabular-nums",
						children: z(e.total_cents)
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
function V({ onProbed: e } = {}) {
	let [t, o] = n(null), [s, c] = n(!1), [l, u] = n(null);
	async function d() {
		c(!0), u(null), o(null);
		try {
			let t = await D();
			o(t), e?.(t);
		} catch (e) {
			u(e);
		} finally {
			c(!1);
		}
	}
	return /* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Зʼєднання" }), /* @__PURE__ */ a("div", {
		className: "pt-4 space-y-3",
		children: [
			/* @__PURE__ */ i("button", {
				type: "button",
				className: "sq-btn-quiet",
				disabled: s,
				onClick: () => void d(),
				children: s ? "Перевірка…" : "Перевірити з'єднання"
			}),
			!!l && /* @__PURE__ */ i(R, { error: l }),
			t && /* @__PURE__ */ i("div", {
				className: `rounded-xl px-4 py-3 text-[15px] ${t.ok ? "bg-sq-success/10 text-sq-success-ink" : "bg-amber-50 text-amber-800"}`,
				children: t.ok ? /* @__PURE__ */ a(r, { children: [
					/* @__PURE__ */ i("p", {
						className: "font-semibold",
						children: "З'єднання успішне"
					}),
					t.cashierName && /* @__PURE__ */ a("p", { children: ["Касир: ", t.cashierName] }),
					t.cashRegister && /* @__PURE__ */ a("p", { children: ["Каса: ", t.cashRegister] }),
					t.message && /* @__PURE__ */ i("p", { children: t.message })
				] }) : /* @__PURE__ */ i("p", { children: t.message ?? "Перевірка не пройдена" })
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
}, U = Object.keys(H);
function ue(e = "") {
	return {
		letter: e,
		name: "",
		rate: ""
	};
}
function W(e) {
	return {
		taxes: (Array.isArray(e?.taxes) ? e.taxes : []).map((e) => {
			let t = e && typeof e == "object" ? e : {};
			return {
				letter: typeof t.letter == "string" ? t.letter : "",
				name: typeof t.name == "string" ? t.name : "",
				rate: t.rate === void 0 || t.rate === null ? "" : String(t.rate)
			};
		}),
		testing: e?.testing === !0
	};
}
function de(e) {
	return {
		taxes: e.taxes.map((e) => ({
			letter: e.letter.trim(),
			name: e.name.trim(),
			rate: fe(e.rate)
		})),
		testing: e.testing
	};
}
function fe(e) {
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
	let r = t.find((e) => {
		let t = e.letter.trim().toUpperCase();
		return t === n || G(t) === n;
	});
	return r ? r.letter.trim().toUpperCase() : null;
}
function q(e, t) {
	let n = new Set(e.filter((e, n) => n !== t).map((e) => e.letter.trim().toUpperCase()));
	return U.filter((e) => !n.has(e));
}
// src/modules/fiscal-cashalot/components/TaxTableForm.tsx
var J = "text-[13px] font-semibold text-sq-secondary", Y = "w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]";
function X({ settings: e, saving: r, onSave: o }) {
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
	})), h = () => c((e) => ({
		...e,
		taxes: [...e.taxes, ue(q(e.taxes, e.taxes.length)[0] ?? "")]
	})), g = (e) => c((t) => ({
		...t,
		taxes: t.taxes.filter((t, n) => n !== e)
	}));
	function _() {
		let e = s.taxes.map((e) => e.letter.trim().toUpperCase()), t = l && e.includes(l) ? l : e[0];
		o(de(s), t ? G(t) : null);
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
					className: "hidden sm:grid grid-cols-[4rem_1fr_6rem_6.5rem_2.5rem] gap-2 px-1",
					children: [
						/* @__PURE__ */ i("span", {
							className: J,
							children: "Літера"
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
						className: "grid grid-cols-[4rem_1fr_6rem_6.5rem_2.5rem] gap-2 items-center",
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
									checked: n !== "" && l === n,
									disabled: n === "",
									onChange: () => u(n)
								})
							}),
							/* @__PURE__ */ i("button", {
								type: "button",
								"aria-label": `Прибрати ставку ${t + 1}`,
								className: "min-h-11 text-[20px] leading-none text-sq-muted hover:text-red-600",
								onClick: () => g(t),
								children: "×"
							})
						]
					}, t);
				})]
			}),
			s.taxes.length < 10 && /* @__PURE__ */ i("button", {
				type: "button",
				className: "sq-btn-quiet",
				onClick: h,
				children: "+ Додати ставку"
			}),
			/* @__PURE__ */ i("p", {
				className: "text-[13px] text-sq-muted",
				children: "Літери й назви — як у кабінеті Cashalot (Налаштування → Податки). Ставка за замовчуванням друкується на кожному рядку чека. Змінюються лише при закритій зміні."
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
				onClick: _,
				children: r ? "Збереження…" : "Зберегти ставки й режим"
			})
		]
	});
}
// src/modules/fiscal-cashalot/secretSpecs.ts
var Z = "Кабінет Cashalot → Налаштування → Інтеграція з WEB API → Управління касирами", pe = [
	{
		key: "keyGuid",
		label: "Ідентифікатор ключа (KeyGuid)",
		required: !0,
		kind: "password",
		hint: Z
	},
	{
		key: "keyPin",
		label: "PIN касира",
		required: !0,
		kind: "password",
		hint: Z
	},
	{
		key: "numFiscal",
		label: "Фіскальний номер ПРРО",
		required: !0,
		kind: "text",
		hint: "Кабінет Cashalot → Каси → обраний ПРРО"
	}
];
// src/modules/fiscal-cashalot/pages/CashalotAdminPage.tsx
function me(e) {
	let t = e?.response;
	return t?.status === 400 && typeof t.data?.error == "string" ? t.data.error : null;
}
function Q({ error: e }) {
	let t = me(e);
	return t ? /* @__PURE__ */ i("p", {
		role: "alert",
		className: "text-[15px] text-red-600",
		children: t
	}) : /* @__PURE__ */ i(R, { error: e });
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
function he() {
	let [o, s] = n(null), [c, l] = n(null), [d, f] = n(!1), [h, g] = n(null), [_, v] = n(!1), [y, b] = n(null), [x, S] = n(null), C = e(() => {
		T().then(s).catch(l);
	}, []);
	t(C, [C]);
	async function w(e) {
		f(!0), g(null);
		try {
			s(await ee(e));
		} catch (e) {
			g(e);
		} finally {
			f(!1);
		}
	}
	async function E(e, t) {
		v(!0), b(null), S(null);
		try {
			let n = await te(e, t);
			if (s(n), S("Збережено"), n.enabled) try {
				await D(), s(await T());
			} catch {}
		} catch (e) {
			b(e);
		} finally {
			v(!1);
		}
	}
	return /* @__PURE__ */ a("div", {
		className: "space-y-8 animate-fade-up max-w-2xl text-sq-text",
		children: [
			/* @__PURE__ */ i(p, {
				glyph: u,
				title: "Фіскалізація — Cashalot"
			}),
			!!c && /* @__PURE__ */ i(R, { error: c }),
			o && /* @__PURE__ */ a(r, { children: [
				o.config.testing === !0 && /* @__PURE__ */ i($, { where: "admin" }),
				/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Дані доступу" }), /* @__PURE__ */ a("div", {
					className: "pt-4 space-y-3",
					children: [/* @__PURE__ */ i(ie, {
						specs: pe,
						secretsSet: o.secrets_set,
						saving: d,
						onSave: (e) => void w(e)
					}), !!h && /* @__PURE__ */ i(Q, { error: h })]
				})] }),
				/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Ставки податку й режим" }), /* @__PURE__ */ a("div", {
					className: "pt-4 space-y-3",
					children: [
						/* @__PURE__ */ i(X, {
							settings: o,
							saving: _,
							onSave: (e, t) => void E(e, t)
						}),
						x && /* @__PURE__ */ i("p", {
							className: "text-[15px] font-medium text-sq-success-ink",
							children: x
						}),
						!!y && /* @__PURE__ */ i(Q, { error: y })
					]
				})] }),
				/* @__PURE__ */ i(V, {}),
				/* @__PURE__ */ a("section", { children: [/* @__PURE__ */ i(m, { title: "Потребують уваги" }), /* @__PURE__ */ i(B, {})] })
			] })
		]
	});
}
export { he as CashalotAdminPage, $ as TestingBanner, A as a, ne as c, u as d, O as i, l, N as n, k as o, L as r, E as s, R as t, f as u };
