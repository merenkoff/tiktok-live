import { TestingBanner as e, a as t, c as n, d as r, i, l as a, n as o, o as s, r as c, s as l, t as u, u as d } from "./CashalotAdminPage-CaD45DDb.js";
import { useCallback as f, useEffect as p, useRef as m, useState as h } from "react";
import { Fragment as g, jsx as _, jsxs as v } from "react/jsx-runtime";
// src/modules/fiscal-core/components/ShiftPanel.tsx
function y({ status: e, onChanged: t }) {
	let [r, a] = h(!1), [o, c] = h(null), [l, d] = h(null), [f, p] = h(null);
	async function m(e) {
		a(!0), c(null);
		try {
			await e();
		} catch (e) {
			c(e);
		} finally {
			a(!1);
		}
	}
	let y = () => m(async () => {
		await n(), t();
	}), b = () => m(async () => {
		let e = await i();
		d(e.z_report_text), t();
	}), x = () => m(async () => {
		let e = await s();
		p(e.text);
	});
	if (!e.configured) return /* @__PURE__ */ v("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [/* @__PURE__ */ _("p", {
			className: "font-semibold",
			children: "ПРРО не налаштовано"
		}), e.error?.message && /* @__PURE__ */ _("p", {
			className: "mt-1",
			children: e.error.message
		})]
	});
	let S = e.shift?.status === "open";
	return /* @__PURE__ */ v("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ v("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [
					/* @__PURE__ */ _("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Зміна"
					}),
					/* @__PURE__ */ _("p", {
						className: `mt-1 text-[26px] font-bold leading-tight ${S ? "text-sq-success-ink" : "text-sq-heading"}`,
						children: S ? "Відкрита" : "Закрита"
					}),
					e.shift?.opened_at && /* @__PURE__ */ v("p", {
						className: "mt-1 text-[13px] text-sq-muted tabular-nums",
						children: ["Відкрита: ", new Date(e.shift.opened_at).toLocaleString("uk-UA")]
					}),
					e.error && /* @__PURE__ */ _("p", {
						className: "mt-2 text-[15px] text-red-600",
						children: e.error.message
					}),
					/* @__PURE__ */ _("div", {
						className: "mt-5 flex flex-wrap gap-3",
						children: S ? /* @__PURE__ */ v(g, { children: [/* @__PURE__ */ _("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50",
							disabled: r,
							onClick: () => void x(),
							children: "X-звіт"
						}), /* @__PURE__ */ _("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-red-50 px-4 text-[17px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50",
							disabled: r,
							onClick: () => void b(),
							children: "Закрити зміну"
						})] }) : /* @__PURE__ */ _("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
							disabled: r,
							onClick: () => void y(),
							children: "Відкрити зміну"
						})
					})
				]
			}),
			!!o && /* @__PURE__ */ _(u, { error: o }),
			f && /* @__PURE__ */ _("pre", {
				className: "max-h-64 overflow-auto rounded-card bg-sq-surface shadow-card p-4 font-mono text-[13px] whitespace-pre-wrap",
				children: f
			}),
			l && /* @__PURE__ */ v("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [/* @__PURE__ */ _("p", {
					className: "text-[13px] font-semibold text-sq-secondary",
					children: "Z-звіт"
				}), /* @__PURE__ */ _("pre", {
					className: "mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap",
					children: l
				})]
			})
		]
	});
}
// src/modules/fiscal-core/components/ServiceReceiptForm.tsx
function b() {
	let [e, n] = h(""), [r, i] = h("in"), [o, s] = h(!1), [c, l] = h(null), [f, p] = h(!1);
	async function m() {
		let i = Number(e.replace(",", "."));
		if (!Number.isFinite(i) || i <= 0) return;
		let a = Math.round(i * 100) * (r === "in" ? 1 : -1);
		s(!0), l(null), p(!1);
		try {
			await t(a), p(!0), n("");
		} catch (e) {
			l(e);
		} finally {
			s(!1);
		}
	}
	return /* @__PURE__ */ v("section", {
		className: "rounded-card bg-sq-surface shadow-card p-5 space-y-4",
		children: [
			/* @__PURE__ */ v("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ _(a, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ _("h2", {
					className: "text-[17px] font-semibold text-sq-heading",
					children: "Внесення / видача готівки"
				})]
			}),
			/* @__PURE__ */ _("div", {
				className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty",
				children: [["in", "Внесення"], ["out", "Видача"]].map(([e, t]) => /* @__PURE__ */ _("button", {
					type: "button",
					className: `flex-1 min-h-[42px] rounded-[9px] text-[15px] transition-colors ${r === e ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary hover:text-sq-text"}`,
					onClick: () => i(e),
					children: t
				}, e))
			}),
			/* @__PURE__ */ _("input", {
				className: "pos-field tabular-nums",
				inputMode: "decimal",
				placeholder: "Сума, ₴",
				value: e,
				onChange: (e) => n(e.target.value)
			}),
			!!c && /* @__PURE__ */ _(u, { error: c }),
			f && /* @__PURE__ */ v("p", {
				className: "flex items-center gap-2 text-[15px] font-medium text-sq-success-ink",
				children: [/* @__PURE__ */ _(d, {
					size: 20,
					className: "shrink-0"
				}), "Чек проведено"]
			}),
			/* @__PURE__ */ _("button", {
				type: "button",
				className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
				disabled: o || !e,
				onClick: () => void m(),
				children: o ? "Проведення…" : "Провести чек"
			})
		]
	});
}
// src/modules/fiscal-core/hooks/useFiscalStatus.ts
var x = 5e3;
function S() {
	let [e, t] = h(null), [n, r] = h(!0), [i, a] = h(null), [s, u] = h(null), d = m(!0);
	p(() => (d.current = !0, () => {
		d.current = !1;
	}), []);
	let g = f(async () => {
		try {
			let e = await l();
			if (!d.current) return;
			t(e), a(null), u(null);
		} catch (e) {
			let t = o(e);
			c(t), d.current && (a(t), u(e));
		} finally {
			d.current && r(!1);
		}
	}, []);
	return p(() => {
		g();
		let e = setInterval(() => void g(), x);
		return () => clearInterval(e);
	}, [g]), {
		status: e,
		isLoading: n,
		diagnostic: i,
		error: s,
		refresh: g
	};
}
// src/modules/fiscal-cashalot/pages/CashalotTillPage.tsx
function C() {
	let { status: t, isLoading: n, error: i, refresh: a } = S();
	return /* @__PURE__ */ v("div", {
		className: "flex-1 overflow-auto px-4 py-5 md:px-7 max-w-xl mx-auto w-full space-y-4 text-sq-text",
		children: [
			/* @__PURE__ */ v("div", {
				className: "flex items-center gap-3 pb-1",
				children: [/* @__PURE__ */ _(r, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ _("h1", {
					className: "text-2xl font-bold text-sq-heading",
					children: "Зміна ПРРО"
				})]
			}),
			n && /* @__PURE__ */ _("p", {
				className: "text-[15px] text-sq-muted",
				children: "Завантаження…"
			}),
			!!i && /* @__PURE__ */ _(u, { error: i }),
			t && /* @__PURE__ */ v(g, { children: [
				t.testing === !0 && /* @__PURE__ */ _(e, { where: "till" }),
				/* @__PURE__ */ _(y, {
					status: t,
					onChanged: () => void a()
				}),
				t.shift?.status === "open" && /* @__PURE__ */ _(b, {})
			] })
		]
	});
}
export { C as CashalotTillPage };
