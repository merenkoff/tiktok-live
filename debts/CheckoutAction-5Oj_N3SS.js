import { t as e } from "./debtsApi-Dr25ayLn.js";
import { f as t, n, p as r } from "./queue-B9HzuKEV.js";
import { J as i, f as a, g as ee, k as o, p as te, s as ne } from "./debt-B208o_Xv.js";
import { n as s, t as re } from "./errors-CVpu3Q0y.js";
import { a as ie, d as c, i as l, l as ae, n as u, o as d, p as f, t as oe, u as p } from "./Sheet-BB1dZFr-.js";
import { t as se } from "./useCredit-B3BBlpxx.js";
import { useCallback as ce, useMemo as le, useRef as m, useState as h } from "react";
import { api as ue, cartLineCents as de, cashierApi as fe, computeCartDiscountCents as pe, formatUah as g, isOfflinePosEnabled as me, useAuthStore as he, useOfflineStatus as _ } from "@pos/platform";
import { Fragment as ge, jsx as v, jsxs as y } from "react/jsx-runtime";
// src/modules/debts/components/CheckoutAction.tsx
var _e = 200, ve = /* @__PURE__ */ new Set([
	"no_customer",
	"offline",
	"no_mirror",
	"assembled"
]), b = "Немає відповіді від сервера — запис міг пройти. «Перевірити ще раз» не запише борг удруге.", ye = "Попередній запис цього кошика лишився без відповіді — він міг пройти. «Перевірити ще раз» не запише борг удруге.";
function be(e) {
	return new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	});
}
function x({ lines: x, customer: S, cartDiscount: C, totalCents: w, onCompleted: T }) {
	let xe = _((e) => e.online), E = he((e) => e.auth), D = me(), O = xe && (!D || ue.hasLiveJwt()), k = S?.id ?? null, { credit: A, local: Se, unknown: Ce, pending: j, reload: M } = se(k), N = le(() => te(x), [x]), P = k == null ? null : ae(k, N, C), [F, I] = h(!1), [L, R] = h(null), [z, B] = h(""), [V, H] = h(!1), [U, W] = h(null), [G, K] = h(null), [q, J] = h(null), Y = m(0), X = m(null), Z = ce(() => {
		let e = G != null;
		Y.current += 1, X.current = null, I(!1), R(null), B(""), W(null), K(null), J(null), e && T();
	}, [G, T]);
	if (x.length === 0 && !F) return null;
	let we = P == null ? null : f(P), Q = a({
		customerId: k,
		credit: A,
		totalCents: w,
		lines: x,
		online: O,
		queue: D,
		noMirror: D && !O && Ce
	}), $ = Q && we != null && !ve.has(Q.code) ? null : Q, Te = !O && D && A == null && $ == null;
	function Ee() {
		let e = P == null ? null : f(P);
		Y.current += 1, R(e ?? crypto.randomUUID()), W(e ? s(ye) : null), K(null), J(null), I(!0), M();
	}
	async function De(e) {
		if (!D || !S) return;
		let t = {
			...e,
			storeName: E?.store.name ?? "",
			staffName: E?.staff.display_name ?? "",
			customer: {
				name: S.name,
				phone: S.phone
			},
			note: z.trim() || null
		};
		X.current = t;
		let n = Y.current, r = await l(u(t));
		Y.current === n && J(r);
	}
	async function Oe() {
		let e = X.current;
		if (!e) return;
		let t = Y.current, n = await l(u(e));
		Y.current === t && J(n);
	}
	async function ke(e) {
		if (!S || k == null || P == null || L == null || !E) return;
		let t = pe(x, C), i = x.map((e) => ({
			title: ee(e),
			quantity: e.quantity,
			unit: e.unit,
			unitPriceCents: e.unit_price_cents,
			totalCents: de(e),
			pricePer: e.price_per ?? 1
		})), a;
		try {
			a = await n({
				id: L,
				storeId: E.store.id,
				staff: {
					id: E.staff.id,
					name: E.staff.display_name
				},
				customer: {
					id: k,
					name: S.name,
					phone: S.phone
				},
				items: N,
				cartDiscount: C,
				note: z.trim() || null,
				totalCents: w,
				discountCents: t,
				lines: i
			});
		} catch (t) {
			let n = t instanceof Error ? t.message : String(t);
			e ? (p(P, L), W(s(`${b} Записати на касі теж не вдалося: ${n}`))) : W({
				...s(`Не вдалося записати на касі: ${n}`),
				unknown: !1
			});
			return;
		}
		c(P);
		let o = A ? r(A, a.totalCents) : null;
		_.getState().refreshPending(), K({
			kind: "queued",
			row: a,
			after: o
		}), De({
			entryId: null,
			at: new Date(a.createdAt),
			lines: i,
			discountCents: t,
			totalCents: a.totalCents,
			balanceAfterCents: o?.balance_cents ?? null
		});
	}
	async function Ae() {
		if (!(k == null || P == null || L == null || V || Te)) {
			H(!0), W(null);
			try {
				if (D && !O) {
					await ke(!1);
					return;
				}
				try {
					let n = await e.issue({
						customer_id: k,
						items: N,
						cart_discount: C,
						client_uuid: L,
						...z.trim() ? { note: z.trim() } : {}
					});
					c(P), t(n.credit, S ?? void 0), D && fe.refreshCatalog().catch(() => void 0), K({
						kind: "server",
						result: n
					}), De({
						entryId: n.entry.id,
						at: new Date(n.entry.created_at || Date.now()),
						lines: ie(n.lines),
						discountCents: 0,
						totalCents: n.entry.amount_cents,
						balanceAfterCents: r(n.credit, j.cents).balance_cents
					});
				} catch (e) {
					let t = re(e, "Не вдалося записати під запис");
					if (t.unknown && D) {
						await ke(!0);
						return;
					}
					t.unknown ? (p(P, L), W({
						...t,
						text: b
					})) : (c(P), W(t), R(crypto.randomUUID())), (t.code === "over_limit" || t.code === "no_credit" || t.code === "credit_locked") && M();
				}
			} finally {
				H(!1);
			}
		}
	}
	let je = A?.balance_cents ?? 0, Me = je + w, Ne = $?.text ?? (we == null ? !O && D && A ? "Без мережі: запишеться на касі й піде на сервер, щойно зʼявиться звʼязок" : null : "Попередній запис цього кошика лишився без відповіді — відкрийте й перевірте");
	return /* @__PURE__ */ y(ge, { children: [/* @__PURE__ */ y("div", {
		"data-testid": "debts-checkout-action",
		children: [/* @__PURE__ */ y("button", {
			type: "button",
			className: "w-full min-h-[48px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50",
			disabled: $ != null,
			onClick: Ee,
			children: [/* @__PURE__ */ v(i, { size: 20 }), "Під запис"]
		}), Ne && /* @__PURE__ */ v("p", {
			className: `mt-1 text-[13px] leading-snug ${$?.code === "over_limit" ? "text-amber-800" : "text-sq-muted"}`,
			"data-testid": "debts-checkout-hint",
			children: Ne
		})]
	}), F && S && /* @__PURE__ */ v(oe, {
		title: G ? "Записано під запис" : "Під запис",
		onClose: Z,
		testId: "debts-issue-sheet",
		children: G ? /* @__PURE__ */ y("div", {
			className: "space-y-3",
			children: [
				/* @__PURE__ */ y("p", {
					className: "text-[15px]",
					children: [
						/* @__PURE__ */ v("span", {
							className: "font-semibold",
							children: S.name
						}),
						" забирає товари на",
						" ",
						/* @__PURE__ */ v("span", {
							className: "font-semibold tabular-nums",
							children: g(G.kind === "server" ? G.result.entry.amount_cents : G.row.totalCents)
						}),
						"."
					]
				}),
				G.kind === "server" && G.result.replay && /* @__PURE__ */ y("p", {
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-replay",
					children: [
						"Цей запис уже був зроблений о ",
						be(G.result.entry.created_at),
						" — удруге борг не записано."
					]
				}),
				G.kind === "queued" && /* @__PURE__ */ v("p", {
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-queued",
					children: "Записано на касі без мережі. На сервер піде, щойно зʼявиться звʼязок, — там ціни звірять ще раз."
				}),
				(G.kind === "server" || G.after) && /* @__PURE__ */ v("p", {
					className: "text-[15px] tabular-nums",
					"data-testid": "debts-issue-after",
					children: ne(G.kind === "server" ? r(G.result.credit, j.cents) : G.after)
				}),
				/* @__PURE__ */ v("p", {
					className: "text-[13px] text-sq-muted",
					children: "Фіскальний чек буде, коли покупець погасить борг."
				}),
				d(q) && /* @__PURE__ */ y("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ v("p", {
						className: `flex-1 text-[13px] ${q?.kind === "failed" ? "text-amber-800" : "text-sq-muted"}`,
						"data-testid": "debts-issue-slip",
						children: d(q)
					}), /* @__PURE__ */ v("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[40px] shrink-0",
						onClick: () => void Oe(),
						children: "Ще раз"
					})]
				}),
				/* @__PURE__ */ v("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
					onClick: Z,
					children: "Готово"
				})
			]
		}) : /* @__PURE__ */ y("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ y("div", { children: [/* @__PURE__ */ v("p", {
					className: "text-[17px] font-semibold",
					children: S.name
				}), S.phone && /* @__PURE__ */ v("p", {
					className: "text-[13px] text-sq-muted",
					children: S.phone
				})] }),
				/* @__PURE__ */ y("dl", {
					className: "space-y-1.5 text-[15px] tabular-nums",
					children: [
						/* @__PURE__ */ y("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ v("dt", {
								className: "text-sq-secondary",
								children: "У кошику"
							}), /* @__PURE__ */ v("dd", {
								className: "font-semibold",
								children: g(w)
							})]
						}),
						/* @__PURE__ */ y("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ v("dt", {
								className: "text-sq-secondary",
								children: "Борг зараз"
							}), /* @__PURE__ */ v("dd", { children: A ? g(je) : "…" })]
						}),
						/* @__PURE__ */ y("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ v("dt", {
								className: "text-sq-secondary",
								children: "Борг стане"
							}), /* @__PURE__ */ y("dd", {
								className: "font-semibold",
								children: [A ? g(Me) : "…", A?.limit_cents != null && /* @__PURE__ */ y("span", {
									className: "font-normal text-sq-muted",
									children: [" з ", g(A.limit_cents)]
								})]
							})]
						})
					]
				}),
				Se && A && /* @__PURE__ */ y("p", {
					className: "text-[13px] text-sq-muted",
					"data-testid": "debts-issue-local",
					children: [
						"Без мережі — за даними каси",
						j.count > 0 ? `, разом із ${j.count} ${o(j.count, "записом", "записами", "записами")}, що ще не на сервері` : "",
						"."
					]
				}),
				/* @__PURE__ */ y("label", {
					className: "block",
					children: [/* @__PURE__ */ v("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Примітка (необовʼязково)"
					}), /* @__PURE__ */ v("input", {
						className: "pos-field mt-1 w-full",
						value: z,
						maxLength: _e,
						placeholder: "Наприклад: до зарплати",
						onChange: (e) => B(e.target.value)
					})]
				}),
				($ || U) && /* @__PURE__ */ v("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-error",
					children: U?.text ?? $?.text
				}),
				/* @__PURE__ */ v("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: V || $ != null || Te,
					onClick: () => void Ae(),
					children: V ? "Записую…" : U?.unknown ? "Перевірити ще раз" : `Записати ${g(w)} у борг`
				})
			]
		})
	})] });
}
export { x as default };
