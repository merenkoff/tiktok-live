import { t as e } from "./debtsApi-DhkvGjzT.js";
import { f as t, n, p as r } from "./queue-B9HzuKEV.js";
import { n as i, t as a } from "./ids-DKpT3dMP.js";
import { E as o, c as s, g as c, i as l, m as ee, s as te, u } from "./debt-GvG7YbfE.js";
import { n as d, t as ne } from "./errors-CLut7Fii.js";
import { a as f, i as p, o as re, r as ie, t as ae } from "./Sheet-Bm236lA5.js";
import { t as oe } from "./useCredit-D_STDTTT.js";
import { useCallback as se, useMemo as ce, useRef as m, useState as h } from "react";
import { api as le, cartLineCents as ue, cashierApi as de, computeCartDiscountCents as fe, formatUah as g, getMeta as _, isOfflinePosEnabled as pe, printSlip as v, resolveModuleStationPrinter as y, useAuthStore as me, useOfflineStatus as b } from "@pos/platform";
import { Fragment as he, jsx as x, jsxs as S } from "react/jsx-runtime";
// src/modules/debts/lib/slip.ts
function C(e) {
	return e.toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function ge(e) {
	return e.map((e) => ({
		title: u(e),
		quantity: e.quantity,
		unit: e.unit,
		unitPriceCents: e.unit_price_cents,
		totalCents: e.line_total_cents,
		pricePer: e.price_per ?? 1
	}));
}
function _e(e) {
	let t = e.entryId == null;
	return {
		title: "ПІД ЗАПИС",
		store_name: e.storeName,
		lines: [
			`Покупець: ${e.customer.name}`,
			...e.customer.phone ? [`Телефон: ${e.customer.phone}`] : [],
			`Касир: ${e.staffName}`,
			t ? "Записано на касі без мережі" : `Запис № ${e.entryId}`,
			C(e.at),
			...e.note ? [`Примітка: ${e.note}`] : []
		],
		items: e.lines.map((e) => ({
			name: e.title,
			quantity: c(e.quantity, e.unit, e.pricePer),
			unit_price_cents: e.unitPriceCents,
			line_total_cents: e.totalCents
		})),
		totals: [
			...e.discountCents > 0 ? [{
				label: "Знижка",
				amount_cents: e.discountCents
			}] : [],
			{
				label: "Під запис",
				amount_cents: e.totalCents
			},
			...e.balanceAfterCents == null ? [] : [{
				label: t ? "Борг після, за даними каси" : "Борг після",
				amount_cents: e.balanceAfterCents
			}]
		],
		footer: ["Фіскальний чек — коли борг буде оплачено.", "Підпис покупця ________________"],
		printed_at: C(/* @__PURE__ */ new Date())
	};
}
async function w(e) {
	let t = null;
	try {
		t = await y(_, a, i);
	} catch {
		return { kind: "none" };
	}
	if (!t) return { kind: "none" };
	try {
		return await v(t.name, e, t.paperWidth), {
			kind: "printed",
			printer: t.name
		};
	} catch (e) {
		return {
			kind: "failed",
			printer: t.name,
			error: e instanceof Error ? e.message : String(e)
		};
	}
}
// src/modules/debts/components/CheckoutAction.tsx
var ve = 200, ye = /* @__PURE__ */ new Set([
	"no_customer",
	"offline",
	"no_mirror",
	"assembled"
]), T = "Немає відповіді від сервера — запис міг пройти. «Перевірити ще раз» не запише борг удруге.", be = "Попередній запис цього кошика лишився без відповіді — він міг пройти. «Перевірити ще раз» не запише борг удруге.";
function xe(e) {
	return new Date(e).toLocaleTimeString("uk-UA", {
		hour: "2-digit",
		minute: "2-digit"
	});
}
function E(e) {
	return !e || e.kind === "none" ? null : e.kind === "printed" ? `Квитанцію надруковано (${e.printer})` : `Квитанцію не надруковано: ${e.error}`;
}
function D({ lines: i, customer: a, cartDiscount: c, totalCents: _, onCompleted: v }) {
	let y = b((e) => e.online), C = me((e) => e.auth), D = pe(), O = y && (!D || le.hasLiveJwt()), k = a?.id ?? null, { credit: A, local: Se, unknown: Ce, pending: j, reload: M } = oe(k), N = ce(() => s(i), [i]), P = k == null ? null : ie(k, N, c), [F, I] = h(!1), [L, R] = h(null), [z, B] = h(""), [V, H] = h(!1), [U, W] = h(null), [G, K] = h(null), [q, J] = h(null), Y = m(0), X = m(null), we = se(() => {
		let e = G != null;
		Y.current += 1, X.current = null, I(!1), R(null), B(""), W(null), K(null), J(null), e && v();
	}, [G, v]);
	if (i.length === 0 && !F) return null;
	let Te = P == null ? null : re(P), Z = te({
		customerId: k,
		credit: A,
		totalCents: _,
		lines: i,
		online: O,
		queue: D,
		noMirror: D && !O && Ce
	}), Q = Z && Te != null && !ye.has(Z.code) ? null : Z, Ee = !O && D && A == null && Q == null;
	function De() {
		let e = P == null ? null : re(P);
		Y.current += 1, R(e ?? crypto.randomUUID()), W(e ? d(be) : null), K(null), J(null), I(!0), M();
	}
	async function $(e) {
		if (!D || !a) return;
		let t = {
			...e,
			storeName: C?.store.name ?? "",
			staffName: C?.staff.display_name ?? "",
			customer: {
				name: a.name,
				phone: a.phone
			},
			note: z.trim() || null
		};
		X.current = t;
		let n = Y.current, r = await w(_e(t));
		Y.current === n && J(r);
	}
	async function Oe() {
		let e = X.current;
		if (!e) return;
		let t = Y.current, n = await w(_e(e));
		Y.current === t && J(n);
	}
	async function ke(e) {
		if (!a || k == null || P == null || L == null || !C) return;
		let t = fe(i, c), o = i.map((e) => ({
			title: u(e),
			quantity: e.quantity,
			unit: e.unit,
			unitPriceCents: e.unit_price_cents,
			totalCents: ue(e),
			pricePer: e.price_per ?? 1
		})), s;
		try {
			s = await n({
				id: L,
				storeId: C.store.id,
				staff: {
					id: C.staff.id,
					name: C.staff.display_name
				},
				customer: {
					id: k,
					name: a.name,
					phone: a.phone
				},
				items: N,
				cartDiscount: c,
				note: z.trim() || null,
				totalCents: _,
				discountCents: t,
				lines: o
			});
		} catch (t) {
			let n = t instanceof Error ? t.message : String(t);
			e ? (p(P, L), W(d(`${T} Записати на касі теж не вдалося: ${n}`))) : W({
				...d(`Не вдалося записати на касі: ${n}`),
				unknown: !1
			});
			return;
		}
		f(P);
		let l = A ? r(A, s.totalCents) : null;
		b.getState().refreshPending(), K({
			kind: "queued",
			row: s,
			after: l
		}), $({
			entryId: null,
			at: new Date(s.createdAt),
			lines: o,
			discountCents: t,
			totalCents: s.totalCents,
			balanceAfterCents: l?.balance_cents ?? null
		});
	}
	async function Ae() {
		if (!(k == null || P == null || L == null || V || Ee)) {
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
						cart_discount: c,
						client_uuid: L,
						...z.trim() ? { note: z.trim() } : {}
					});
					f(P), t(n.credit, a ?? void 0), D && de.refreshCatalog().catch(() => void 0), K({
						kind: "server",
						result: n
					}), $({
						entryId: n.entry.id,
						at: new Date(n.entry.created_at || Date.now()),
						lines: ge(n.lines),
						discountCents: 0,
						totalCents: n.entry.amount_cents,
						balanceAfterCents: r(n.credit, j.cents).balance_cents
					});
				} catch (e) {
					let t = ne(e, "Не вдалося записати під запис");
					if (t.unknown && D) {
						await ke(!0);
						return;
					}
					t.unknown ? (p(P, L), W({
						...t,
						text: T
					})) : (f(P), W(t), R(crypto.randomUUID())), (t.code === "over_limit" || t.code === "no_credit" || t.code === "credit_locked") && M();
				}
			} finally {
				H(!1);
			}
		}
	}
	let je = A?.balance_cents ?? 0, Me = je + _, Ne = Q?.text ?? (Te == null ? !O && D && A ? "Без мережі: запишеться на касі й піде на сервер, щойно зʼявиться звʼязок" : null : "Попередній запис цього кошика лишився без відповіді — відкрийте й перевірте");
	return /* @__PURE__ */ S(he, { children: [/* @__PURE__ */ S("div", {
		"data-testid": "debts-checkout-action",
		children: [/* @__PURE__ */ S("button", {
			type: "button",
			className: "w-full min-h-[48px] px-4 rounded-xl bg-white ring-1 ring-sq-divider text-sq-text font-semibold text-[16px] inline-flex items-center justify-center gap-2 disabled:opacity-50",
			disabled: Q != null,
			onClick: De,
			children: [/* @__PURE__ */ x(o, { size: 20 }), "Під запис"]
		}), Ne && /* @__PURE__ */ x("p", {
			className: `mt-1 text-[13px] leading-snug ${Q?.code === "over_limit" ? "text-amber-800" : "text-sq-muted"}`,
			"data-testid": "debts-checkout-hint",
			children: Ne
		})]
	}), F && a && /* @__PURE__ */ x(ae, {
		title: G ? "Записано під запис" : "Під запис",
		onClose: we,
		testId: "debts-issue-sheet",
		children: G ? /* @__PURE__ */ S("div", {
			className: "space-y-3",
			children: [
				/* @__PURE__ */ S("p", {
					className: "text-[15px]",
					children: [
						/* @__PURE__ */ x("span", {
							className: "font-semibold",
							children: a.name
						}),
						" забирає товари на",
						" ",
						/* @__PURE__ */ x("span", {
							className: "font-semibold tabular-nums",
							children: g(G.kind === "server" ? G.result.entry.amount_cents : G.row.totalCents)
						}),
						"."
					]
				}),
				G.kind === "server" && G.result.replay && /* @__PURE__ */ S("p", {
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-replay",
					children: [
						"Цей запис уже був зроблений о ",
						xe(G.result.entry.created_at),
						" — удруге борг не записано."
					]
				}),
				G.kind === "queued" && /* @__PURE__ */ x("p", {
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-queued",
					children: "Записано на касі без мережі. На сервер піде, щойно зʼявиться звʼязок, — там ціни звірять ще раз."
				}),
				(G.kind === "server" || G.after) && /* @__PURE__ */ x("p", {
					className: "text-[15px] tabular-nums",
					"data-testid": "debts-issue-after",
					children: l(G.kind === "server" ? r(G.result.credit, j.cents) : G.after)
				}),
				/* @__PURE__ */ x("p", {
					className: "text-[13px] text-sq-muted",
					children: "Фіскальний чек буде, коли покупець погасить борг."
				}),
				E(q) && /* @__PURE__ */ S("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ x("p", {
						className: `flex-1 text-[13px] ${q?.kind === "failed" ? "text-amber-800" : "text-sq-muted"}`,
						"data-testid": "debts-issue-slip",
						children: E(q)
					}), /* @__PURE__ */ x("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[40px] shrink-0",
						onClick: () => void Oe(),
						children: "Ще раз"
					})]
				}),
				/* @__PURE__ */ x("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px]",
					onClick: we,
					children: "Готово"
				})
			]
		}) : /* @__PURE__ */ S("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ S("div", { children: [/* @__PURE__ */ x("p", {
					className: "text-[17px] font-semibold",
					children: a.name
				}), a.phone && /* @__PURE__ */ x("p", {
					className: "text-[13px] text-sq-muted",
					children: a.phone
				})] }),
				/* @__PURE__ */ S("dl", {
					className: "space-y-1.5 text-[15px] tabular-nums",
					children: [
						/* @__PURE__ */ S("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ x("dt", {
								className: "text-sq-secondary",
								children: "У кошику"
							}), /* @__PURE__ */ x("dd", {
								className: "font-semibold",
								children: g(_)
							})]
						}),
						/* @__PURE__ */ S("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ x("dt", {
								className: "text-sq-secondary",
								children: "Борг зараз"
							}), /* @__PURE__ */ x("dd", { children: A ? g(je) : "…" })]
						}),
						/* @__PURE__ */ S("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ x("dt", {
								className: "text-sq-secondary",
								children: "Борг стане"
							}), /* @__PURE__ */ S("dd", {
								className: "font-semibold",
								children: [A ? g(Me) : "…", A?.limit_cents != null && /* @__PURE__ */ S("span", {
									className: "font-normal text-sq-muted",
									children: [" з ", g(A.limit_cents)]
								})]
							})]
						})
					]
				}),
				Se && A && /* @__PURE__ */ S("p", {
					className: "text-[13px] text-sq-muted",
					"data-testid": "debts-issue-local",
					children: [
						"Без мережі — за даними каси",
						j.count > 0 ? `, разом із ${j.count} ${ee(j.count, "записом", "записами", "записами")}, що ще не на сервері` : "",
						"."
					]
				}),
				/* @__PURE__ */ S("label", {
					className: "block",
					children: [/* @__PURE__ */ x("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Примітка (необовʼязково)"
					}), /* @__PURE__ */ x("input", {
						className: "pos-field mt-1 w-full",
						value: z,
						maxLength: ve,
						placeholder: "Наприклад: до зарплати",
						onChange: (e) => B(e.target.value)
					})]
				}),
				(Q || U) && /* @__PURE__ */ x("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-issue-error",
					children: U?.text ?? Q?.text
				}),
				/* @__PURE__ */ x("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: V || Q != null || Ee,
					onClick: () => void Ae(),
					children: V ? "Записую…" : U?.unknown ? "Перевірити ще раз" : `Записати ${g(_)} у борг`
				})
			]
		})
	})] });
}
export { D as default };
