import { TestingBanner as e, a as t, c as n, d as r, f as i, i as a, l as o, n as s, o as c, r as l, s as u, t as d, u as f } from "./CashalotAdminPage-CRyy-qqa.js";
import { useCallback as p, useEffect as m, useRef as h, useState as g } from "react";
import { Fragment as _, jsx as v, jsxs as y } from "react/jsx-runtime";
// src/modules/fiscal-core/components/ShiftPanel.tsx
function b({ status: e, onChanged: n, registerNo: r = 1 }) {
	let [i, a] = g(!1), [c, l] = g(null), [d, f] = g(null), [p, m] = g(null);
	async function h(e) {
		a(!0), l(null);
		try {
			await e();
		} catch (e) {
			l(e);
		} finally {
			a(!1);
		}
	}
	let b = () => h(async () => {
		await o(r), n();
	}), x = () => h(async () => {
		let e = await t(r);
		f(e.z_report_text), n();
	}), S = () => h(async () => {
		let e = await u(r);
		m(e.text);
	});
	if (!e.configured) return /* @__PURE__ */ y("div", {
		role: "alert",
		className: "rounded-xl bg-red-50 px-4 py-3 text-[15px] text-red-700",
		children: [/* @__PURE__ */ v("p", {
			className: "font-semibold",
			children: "ПРРО не налаштовано"
		}), e.error?.message && /* @__PURE__ */ v("p", {
			className: "mt-1",
			children: e.error.message
		})]
	});
	let C = e.shift?.status === "open";
	return /* @__PURE__ */ y("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ y("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [
					/* @__PURE__ */ v("p", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Зміна"
					}),
					/* @__PURE__ */ v("p", {
						className: `mt-1 text-[26px] font-bold leading-tight ${C ? "text-sq-success-ink" : "text-sq-heading"}`,
						children: C ? "Відкрита" : "Закрита"
					}),
					e.shift?.opened_at && /* @__PURE__ */ y("p", {
						className: "mt-1 text-[13px] text-sq-muted tabular-nums",
						children: ["Відкрита: ", new Date(e.shift.opened_at).toLocaleString("uk-UA")]
					}),
					e.error && /* @__PURE__ */ v("p", {
						className: "mt-2 text-[15px] text-red-600",
						children: e.error.message
					}),
					/* @__PURE__ */ v("div", {
						className: "mt-5 flex flex-wrap gap-3",
						children: C ? /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-sq-surface px-4 ring-1 ring-inset ring-sq-divider text-[17px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-50",
							disabled: i,
							onClick: () => void S(),
							children: "X-звіт"
						}), /* @__PURE__ */ v("button", {
							type: "button",
							className: "flex-1 min-h-[52px] rounded-xl bg-red-50 px-4 text-[17px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50",
							disabled: i,
							onClick: () => void x(),
							children: "Закрити зміну"
						})] }) : /* @__PURE__ */ v("button", {
							type: "button",
							className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
							disabled: i,
							onClick: () => void b(),
							children: "Відкрити зміну"
						})
					})
				]
			}),
			!!c && /* @__PURE__ */ v(s, { error: c }),
			p && /* @__PURE__ */ v("pre", {
				className: "max-h-64 overflow-auto rounded-card bg-sq-surface shadow-card p-4 font-mono text-[13px] whitespace-pre-wrap",
				children: p
			}),
			d && /* @__PURE__ */ y("section", {
				className: "rounded-card bg-sq-surface shadow-card p-5",
				children: [/* @__PURE__ */ v("p", {
					className: "text-[13px] font-semibold text-sq-secondary",
					children: "Z-звіт"
				}), /* @__PURE__ */ v("pre", {
					className: "mt-2 max-h-64 overflow-auto rounded-xl bg-sq-sidebar p-3 font-mono text-[13px] whitespace-pre-wrap",
					children: d
				})]
			})
		]
	});
}
// src/modules/fiscal-core/components/ServiceReceiptForm.tsx
function x({ registerNo: e = 1 } = {}) {
	let [t, n] = g(""), [i, a] = g("in"), [o, l] = g(!1), [u, d] = g(null), [p, m] = g(!1);
	async function h() {
		let r = Number(t.replace(",", "."));
		if (!Number.isFinite(r) || r <= 0) return;
		let a = Math.round(r * 100) * (i === "in" ? 1 : -1);
		l(!0), d(null), m(!1);
		try {
			await c(a, e), m(!0), n("");
		} catch (e) {
			d(e);
		} finally {
			l(!1);
		}
	}
	return /* @__PURE__ */ y("section", {
		className: "rounded-card bg-sq-surface shadow-card p-5 space-y-4",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ v(f, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h2", {
					className: "text-[17px] font-semibold text-sq-heading",
					children: "Внесення / видача готівки"
				})]
			}),
			/* @__PURE__ */ v("div", {
				className: "flex gap-1 p-[3px] rounded-xl bg-sq-empty",
				children: [["in", "Внесення"], ["out", "Видача"]].map(([e, t]) => /* @__PURE__ */ v("button", {
					type: "button",
					className: `flex-1 min-h-[42px] rounded-[9px] text-[15px] transition-colors ${i === e ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text" : "font-medium text-sq-secondary hover:text-sq-text"}`,
					onClick: () => a(e),
					children: t
				}, e))
			}),
			/* @__PURE__ */ v("input", {
				className: "pos-field tabular-nums",
				inputMode: "decimal",
				placeholder: "Сума, ₴",
				value: t,
				onChange: (e) => n(e.target.value)
			}),
			!!u && /* @__PURE__ */ v(s, { error: u }),
			p && /* @__PURE__ */ y("p", {
				className: "flex items-center gap-2 text-[15px] font-medium text-sq-success-ink",
				children: [/* @__PURE__ */ v(r, {
					size: 20,
					className: "shrink-0"
				}), "Чек проведено"]
			}),
			/* @__PURE__ */ v("button", {
				type: "button",
				className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
				disabled: o || !t,
				onClick: () => void h(),
				children: o ? "Проведення…" : "Провести чек"
			})
		]
	});
}
// src/modules/fiscal-core/hooks/useFiscalStatus.ts
var S = 5e3;
function C(e = 1) {
	let [t, r] = g(null), [i, o] = g(!0), [s, c] = g(null), [u, d] = g(null), f = h(!0);
	m(() => (f.current = !0, () => {
		f.current = !1;
	}), []);
	let _ = p(async () => {
		try {
			let t = await n(e);
			if (!f.current) return;
			r(t), c(null), d(null);
		} catch (e) {
			let t = l(e);
			a(t), f.current && (c(t), d(e));
		} finally {
			f.current && o(!1);
		}
	}, [e]);
	return m(() => {
		_();
		let e = setInterval(() => void _(), S);
		return () => clearInterval(e);
	}, [_]), {
		status: t,
		isLoading: i,
		diagnostic: s,
		error: u,
		refresh: _
	};
}
// src/modules/fiscal-cashalot/pages/CashalotTillPage.tsx
function w({ status: t, registerNo: n, titled: r, onChanged: i }) {
	return /* @__PURE__ */ y("section", {
		className: "space-y-4",
		"data-testid": `fiscal-register-${n}`,
		children: [
			r && /* @__PURE__ */ v("h2", {
				className: "text-lg font-semibold text-sq-heading",
				children: d(n, t.label)
			}),
			t.testing === !0 && /* @__PURE__ */ v(e, { where: "till" }),
			/* @__PURE__ */ v(b, {
				status: t,
				onChanged: i,
				registerNo: n
			}),
			t.shift?.status === "open" && /* @__PURE__ */ v(x, { registerNo: n })
		]
	});
}
function T() {
	let { status: e, isLoading: t, error: n, refresh: r } = C(), a = e?.registers ?? [];
	return /* @__PURE__ */ y("div", {
		className: "flex-1 overflow-auto px-4 py-5 md:px-7 max-w-xl mx-auto w-full space-y-4 text-sq-text",
		children: [
			/* @__PURE__ */ y("div", {
				className: "flex items-center gap-3 pb-1",
				children: [/* @__PURE__ */ v(i, {
					size: 24,
					className: "shrink-0"
				}), /* @__PURE__ */ v("h1", {
					className: "text-2xl font-bold text-sq-heading",
					children: a.length > 0 ? "Зміни ПРРО" : "Зміна ПРРО"
				})]
			}),
			t && /* @__PURE__ */ v("p", {
				className: "text-[15px] text-sq-muted",
				children: "Завантаження…"
			}),
			!!n && /* @__PURE__ */ v(s, { error: n }),
			e && /* @__PURE__ */ y(_, { children: [/* @__PURE__ */ v(w, {
				status: e,
				registerNo: 1,
				titled: a.length > 0,
				onChanged: () => void r()
			}), a.map((e) => /* @__PURE__ */ v(w, {
				status: e,
				registerNo: e.register_no ?? 2,
				titled: !0,
				onChanged: () => void r()
			}, e.register_no))] })
		]
	});
}
export { T as CashalotTillPage };
