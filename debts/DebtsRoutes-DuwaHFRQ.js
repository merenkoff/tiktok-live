import { t as e } from "./debtsApi-BOZMyvlE.js";
import { a as t, c as n, f as r, g as i, h as a, i as o, s, t as c } from "./queue-B9HzuKEV.js";
import { n as l } from "./sync-5Qhu5xAA.js";
import { A as u, C as d, D as f, E as p, F as m, M as h, N as g, O as _, P as v, S as y, T as b, _ as x, a as S, b as C, d as w, f as T, g as E, h as D, i as O, j as k, k as ee, m as te, n as A, o as ne, p as re, r as ie, u as j, v as ae, w as M, x as N, y as P } from "./debt-DM5F1FYd.js";
import { i as oe, n as se, r as F, t as ce } from "./LimitEditor-DNlAwKeu.js";
import { n as le, t as I } from "./errors-CLut7Fii.js";
import { d as ue, i as de, l as fe, o as pe, r as me, s as he, t as L, u as R } from "./Sheet-8uRyzX1y.js";
import { useCallback as z, useEffect as B, useMemo as V, useRef as ge, useState as H } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as _e, api as ve, buildReceiptPayload as ye, cashRoundingDelta as be, cashierApi as xe, formatSignedUah as Se, formatUah as U, getMeta as W, isOfflinePosEnabled as G, printReceipt as Ce, storeCashRounding as we, useAuthStore as K, useOfflineStatus as q, usePrintableReceipt as Te } from "@pos/platform";
import { Fragment as J, jsx as Y, jsxs as X } from "react/jsx-runtime";
import { Link as Z, Route as Q, Routes as Ee, useParams as De } from "react-router-dom";
// src/modules/debts/lib/useQueue.ts
var Oe = [];
function ke(e) {
	let t = K((e) => e.auth?.store.id ?? null), n = G(), [r, i] = H(Oe);
	return B(() => {
		if (!n || t == null) {
			i(Oe);
			return;
		}
		let r = !0, a = () => {
			s(t).then((t) => {
				r && i(e == null ? t : t.filter((t) => t.customerId === e));
			});
		};
		a();
		let c = o(a);
		return () => {
			r = !1, c();
		};
	}, [
		n,
		t,
		e
	]), r;
}
function Ae(e, t) {
	let n = ge(new Set(e.map((e) => e.id)));
	B(() => {
		let r = new Set(e.map((e) => e.id)), i = [...n.current].some((e) => !r.has(e));
		n.current = r, i && t();
	}, [e, t]);
}
// src/modules/debts/components/Frame.tsx
function $({ frame: e, children: t }) {
	return e === "admin" ? /* @__PURE__ */ Y("div", {
		className: "max-w-4xl text-sq-text",
		children: t
	}) : /* @__PURE__ */ Y("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text",
		children: /* @__PURE__ */ Y("div", {
			className: "mx-auto max-w-3xl px-4 md:px-7 py-5 pb-10",
			children: t
		})
	});
}
// src/modules/debts/lib/queueText.ts
function je(e) {
	if (e.status === "queued") return "Чекає мережі";
	let t = e.lastError?.trim() || "невідома помилка";
	return e.status === "error" ? `Не вдалося надіслати: ${t}. Каса спробує ще раз сама.` : e.deadReason === "attempts_exhausted" ? `Не вдалося надіслати після ${e.attempts} ${P(e.attempts, "спроби", "спроб", "спроб")}: ${t}` : `Сервер не прийняв: ${t}`;
}
function Me(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
// src/modules/debts/components/QueuePanel.tsx
function Ne({ rows: e, showCustomer: t = !0 }) {
	let r = q((e) => e.online), [i, a] = H(!1), [o, s] = H(null);
	if (e.length === 0) return null;
	let u = e.filter((e) => e.status !== "dead").length;
	async function d() {
		a(!0);
		try {
			await l();
		} finally {
			a(!1), q.getState().refreshPending();
		}
	}
	async function f(e) {
		await n(e), r && d();
	}
	async function p(e) {
		s(null), await c(e), q.getState().refreshPending();
	}
	return /* @__PURE__ */ X("section", {
		className: "rounded-card bg-white ring-1 ring-amber-200 p-4 mb-5",
		"data-testid": "debts-queue",
		children: [
			/* @__PURE__ */ Y(F, {
				title: "Записано без мережі",
				count: e.length,
				action: r && u > 0 ? /* @__PURE__ */ Y("button", {
					type: "button",
					className: "font-semibold text-sq-blue disabled:opacity-50",
					disabled: i,
					onClick: () => void d(),
					children: i ? "Надсилаю…" : "Надіслати зараз"
				}) : void 0
			}),
			/* @__PURE__ */ Y("p", {
				className: "mt-1 text-[13px] text-sq-muted",
				children: "Товар уже в покупця. Ці записи підуть на сервер, щойно буде звʼязок, — до того їх видно лише на цій касі."
			}),
			/* @__PURE__ */ Y("ul", {
				className: "mt-2",
				children: e.map((e) => /* @__PURE__ */ X("li", {
					className: "sq-row",
					"data-testid": "debts-queue-row",
					children: [/* @__PURE__ */ X("div", {
						className: "flex items-start gap-3 w-full py-2",
						children: [/* @__PURE__ */ X("span", {
							className: "min-w-0 flex-1",
							children: [
								t && /* @__PURE__ */ Y("span", {
									className: "block text-[15px] font-semibold truncate",
									children: e.customerName
								}),
								/* @__PURE__ */ X("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										Me(e.createdAt),
										" · ",
										S(e.lines.length),
										e.note ? ` · ${e.note}` : ""
									]
								}),
								/* @__PURE__ */ Y("span", {
									className: `block text-[13px] ${e.status === "dead" ? "text-red-600" : "text-sq-muted"}`,
									children: je(e)
								})
							]
						}), /* @__PURE__ */ Y("span", {
							className: "text-[15px] font-semibold tabular-nums shrink-0",
							children: U(e.totalCents)
						})]
					}), e.status === "dead" && /* @__PURE__ */ Y("div", {
						className: "flex flex-wrap items-center gap-2 pb-3",
						children: o === e.id ? /* @__PURE__ */ X(J, { children: [
							/* @__PURE__ */ Y("span", {
								className: "w-full text-[13px] text-red-700",
								children: "Запис зникне з каси й не потрапить на сервер, а товар уже в покупця. Прибрати?"
							}),
							/* @__PURE__ */ Y("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px] text-red-600",
								onClick: () => void p(e.id),
								children: "Так, прибрати"
							}),
							/* @__PURE__ */ Y("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px]",
								onClick: () => s(null),
								children: "Ні"
							})
						] }) : /* @__PURE__ */ X(J, { children: [/* @__PURE__ */ Y("button", {
							type: "button",
							className: "sq-btn-quiet min-h-[40px]",
							onClick: () => void f(e.id),
							children: "Надіслати ще раз"
						}), /* @__PURE__ */ Y("button", {
							type: "button",
							className: "sq-btn-quiet min-h-[40px] text-red-600",
							onClick: () => s(e.id),
							children: "Прибрати"
						})] })
					})]
				}, e.id))
			})
		]
	});
}
// src/modules/debts/pages/DebtorsPage.tsx
function Pe(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function Fe({ frame: n }) {
	let r = q((e) => e.online), s = K((e) => e.auth?.store.id ?? null), c = G(), l = r && (!c || ve.hasLiveJwt()), u = ke(), [d, f] = H("owing"), [p, h] = H(null), [g, _] = H(null), [v, y] = H(null), [b, x] = H(""), [S, C] = H(0);
	Ae(u, z(() => C((e) => e + 1), [])), B(() => {
		if (!l) return;
		let t = !0;
		return y(null), e.debtors(d === "all").then((e) => {
			t && h(e.debtors);
		}).catch((e) => {
			t && y(I(e, "Не вдалося прочитати борги").text);
		}), () => {
			t = !1;
		};
	}, [
		d,
		l,
		S
	]), B(() => {
		if (l || !c || s == null) {
			_(null);
			return;
		}
		let e = !0, n = async () => {
			let [n, r, o] = await Promise.all([
				a(s),
				t(s),
				i(s)
			]);
			e && _({
				filledAt: o,
				rows: n.map((e) => ({
					customer_id: e.customerId,
					name: e.name,
					phone: e.phone,
					balance_cents: e.balanceCents + (r.get(e.customerId) ?? 0),
					limit_cents: e.limitCents,
					locked: e.locked,
					open_lines: 0,
					oldest_open_at: null
				})).sort((e, t) => t.balance_cents - e.balance_cents || e.name.localeCompare(t.name, "uk"))
			});
		};
		n();
		let r = o(() => void n());
		return () => {
			e = !1, r();
		};
	}, [
		l,
		c,
		s
	]);
	let w = !l && c, E = w ? g?.rows ?? null : p, D = V(() => (E ?? []).filter((e) => (!w || d === "all" || e.balance_cents > 0) && T(e, b)), [
		E,
		w,
		d,
		b
	]), O = (E ?? []).filter((e) => e.balance_cents > 0), k = O.reduce((e, t) => e + t.balance_cents, 0);
	return /* @__PURE__ */ X($, {
		frame: n,
		children: [
			/* @__PURE__ */ Y(se, {
				glyph: m,
				title: "Борги",
				subtitle: "Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
			}),
			/* @__PURE__ */ Y(Ne, { rows: u }),
			!l && !c ? /* @__PURE__ */ X("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Y("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Y("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			}) : w && g && g.filledAt == null ? /* @__PURE__ */ X("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Y("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Y("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Каса ще жодного разу не отримала список боргів — він зʼявиться після першого сеансу з мережею."
				})]
			}) : /* @__PURE__ */ X("div", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ X("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ Y(oe, {
							value: d,
							onChange: f,
							ariaLabel: "Кого показати",
							options: [{
								value: "owing",
								label: "Винні"
							}, {
								value: "all",
								label: "Усі з лімітом"
							}]
						}), /* @__PURE__ */ Y("input", {
							className: `${n === "admin" ? "sq-input" : "pos-field"} min-w-[12rem] flex-1`,
							value: b,
							placeholder: "Імʼя або телефон",
							"aria-label": "Пошук покупця",
							onChange: (e) => x(e.target.value)
						})]
					}),
					w && g?.filledAt != null && /* @__PURE__ */ X("p", {
						className: "text-[13px] text-amber-800",
						"data-testid": "debts-mirror-note",
						children: [
							"Без мережі — за даними каси на ",
							Pe(g.filledAt),
							", разом із записаним без мережі. Виписку відкриє мережа."
						]
					}),
					E && O.length > 0 && /* @__PURE__ */ X("p", {
						className: "text-[15px] text-sq-secondary tabular-nums",
						"data-testid": "debts-total",
						children: [
							"Разом винні ",
							/* @__PURE__ */ Y("span", {
								className: "font-semibold text-sq-heading",
								children: U(k)
							}),
							" ·",
							" ",
							O.length,
							" ",
							P(O.length, "покупець", "покупці", "покупців")
						]
					}),
					v && !w && /* @__PURE__ */ Y("p", {
						className: "text-sm text-red-600",
						children: v
					}),
					!E && !(v && !w) && /* @__PURE__ */ Y("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					E && D.length === 0 && /* @__PURE__ */ Y("div", {
						className: "sq-card p-6 text-center text-[15px] text-sq-secondary",
						children: b ? "Нікого не знайдено" : d === "owing" ? "Ніхто нічого не винен." : "Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця."
					}),
					D.length > 0 && /* @__PURE__ */ Y("ul", {
						className: "rounded-card bg-white shadow-card overflow-hidden",
						"data-testid": "debtors",
						children: D.map((e) => /* @__PURE__ */ Y("li", {
							className: "sq-row last:shadow-none",
							children: w ? /* @__PURE__ */ Y("div", {
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5",
								children: /* @__PURE__ */ Y(Ie, { row: e })
							}) : /* @__PURE__ */ Y(Z, {
								to: String(e.customer_id),
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60",
								children: /* @__PURE__ */ Y(Ie, { row: e })
							})
						}, e.customer_id))
					})
				]
			})
		]
	});
}
function Ie({ row: e }) {
	let t = ne(e);
	return /* @__PURE__ */ X(J, { children: [/* @__PURE__ */ X("span", {
		className: "min-w-0 flex-1",
		children: [/* @__PURE__ */ Y("span", {
			className: "block text-[16px] font-semibold truncate",
			children: e.name
		}), /* @__PURE__ */ X("span", {
			className: "block text-[13px] text-sq-muted truncate",
			children: [[e.phone, e.locked ? "записи заблоковано" : null].filter(Boolean).join(" · "), t && /* @__PURE__ */ X("span", {
				className: "text-amber-800",
				"data-testid": "debtor-over-limit",
				children: [e.phone || e.locked ? " · " : "", "понад ліміт"]
			})]
		})]
	}), /* @__PURE__ */ X("span", {
		className: "text-right shrink-0",
		children: [/* @__PURE__ */ Y("span", {
			className: "block text-[16px] font-semibold tabular-nums",
			children: U(e.balance_cents)
		}), /* @__PURE__ */ Y("span", {
			className: "block text-[13px] text-sq-muted",
			children: e.oldest_open_at ? `${S(e.open_lines)} · ${A(e.oldest_open_at)}` : e.limit_cents == null ? "" : `ліміт ${U(e.limit_cents)}`
		})]
	})] });
}
// src/modules/debts/lib/useReceiptPrint.tsx
function Le(e, t) {
	let n = t.items;
	return n.some((e) => (e.debt_prepaid_cents ?? 0) > 0) ? {
		...e,
		items: e.items.map((e, t) => {
			let r = n[t]?.debt_prepaid_cents ?? 0;
			if (r <= 0) return e;
			let i = `Внесено раніше: ${(r / 100).toFixed(2)}`;
			return {
				...e,
				note: e.note ? `${e.note} · ${i}` : i
			};
		})
	} : e;
}
function Re() {
	let e = K((e) => e.auth), { printToPdf: t, printablePortal: n } = Te(), [r, i] = H(!1), [a, o] = H(null);
	return {
		print: z(async (n) => {
			let r = Le(ye(n, {
				name: e?.store.name ?? "",
				fiscal: e?.store.fiscal ?? null,
				vertical: e?.store.vertical?.id ?? null
			}), n), [a, s] = await Promise.all([W("receiptPrinterName"), W("receiptPaperWidthMm")]);
			if (!a) t(r);
			else {
				i(!0), o(null);
				try {
					await Ce(a, r, s === 58 || s === 80 ? s : _e), o("Чек надіслано на друк");
				} catch (e) {
					o(`Не вдалося надрукувати: ${typeof e == "string" ? e : String(e)}`);
				} finally {
					i(!1);
				}
			}
		}, [e, t]),
		printing: r,
		status: a,
		printablePortal: n
	};
}
// src/modules/debts/lib/useWriteKey.ts
function ze(e) {
	let [t] = H(() => {
		let t = ue(e);
		return {
			key: t ?? crypto.randomUUID(),
			replaying: t != null
		};
	}), n = ge(t.key);
	return {
		current: () => n.current,
		replaying: t.replaying,
		unanswered: () => fe(e, n.current),
		answered: () => {
			R(e), n.current = crypto.randomUUID();
		}
	};
}
// src/modules/debts/components/PaySheet.tsx
var Be = "Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.", Ve = "Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.";
function He(e) {
	let t = e.debt_prepayment;
	return t ? t.variant_label ? `${t.product_name} · ${t.variant_label}` : t.product_name : "";
}
function Ue(e) {
	let t = e.replace(/\s/g, "").replace(",", "."), n = Number(t);
	return t && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
function We({ customerId: t, customerName: n, customerPhone: i, openLines: a, onClose: o, onChanged: s }) {
	let c = K((e) => e.auth), l = we(c?.store.cash_rounding), d = c?.store.fiscal?.enabled ?? !1, [p, m] = H(a.length), [h, g] = H("cash"), [_, y] = H(""), [T, O] = H(!1), [A, ne] = H(!1), M = ze(he("pay", t)), [P, se] = H(() => M.replaying ? le(Ve) : null), [F, ce] = H(null), [ue, fe] = H(null), R = ge(null), { print: z, printing: _e, status: ve, printablePortal: ye } = Re();
	B(() => {
		m((e) => Math.min(Math.max(e, 1), a.length));
	}, [a.length]);
	let xe = V(() => C(a), [a]), W = b(a), Ce = Ue(_), q = V(() => Ce == null ? null : te(a, Ce, {
		method: h,
		step: l,
		partial: W,
		prepayAllowed: !d && !A
	}), [
		a,
		Ce,
		h,
		l,
		W,
		d,
		A
	]), Te = p > 0 ? xe[p - 1] : 0, Z = q ? q.roundingCents : h === "cash" ? be(Te, l) : 0, Q = q ? x(q) : Te + Z, Ee = q ? E(q) : p > 0;
	function De(e) {
		y(""), m((t) => q ? e + 1 : re(t, e));
	}
	async function Oe(e) {
		R.current = e, fe(await de(me(e)));
	}
	async function ke() {
		if (T || !Ee) return;
		O(!0), se(null);
		let o = q;
		try {
			let u = await e.pay(t, {
				...o ? D(a, o, h) : {
					line_ids: a.slice(0, p).map((e) => e.id),
					payments: [{
						method: h,
						amount_cents: Q
					}]
				},
				client_uuid: M.current(),
				cash_rounding: h === "cash" ? l : 0
			});
			M.answered(), r(u.credit), ce(u), s();
			let f = u.prepayment ?? null, m = f && f.id === u.sale.id ? null : u.sale, g = (u.fiscal ?? m?.fiscal)?.status === "done";
			if (m && (c?.store.auto_print_receipt ?? !1) && (!d || g) && z(m), f?.debt_prepayment && G()) {
				let e = f.debt_prepayment.line_id, t = a.find((t) => t.id === e), r = u.open_lines.find((t) => t.id === e);
				t && Oe({
					storeName: c?.store.name ?? "",
					customer: {
						name: n,
						phone: i ?? null
					},
					staffName: c?.staff.display_name ?? "",
					number: f.receipt_number ?? null,
					at: new Date(f.created_at),
					line: r ?? t,
					amountCents: f.total_cents,
					leftCents: r?.owed_cents ?? Math.max(0, t.owed_cents - f.total_cents),
					balanceAfterCents: u.credit.balance_cents
				});
			}
		} catch (e) {
			let t = I(e, "Не вдалося прийняти оплату");
			t.unknown ? (M.unanswered(), se({
				...t,
				text: Be
			})) : (M.answered(), se(t)), t.code === "prepay_needs_chain" && ne(!0), t.credit && r(t.credit), t.status != null && t.status !== 400 && s();
		} finally {
			O(!1);
		}
	}
	if (F) {
		let e = F.prepayment ?? null, t = e && e.id === F.sale.id ? null : F.sale, r = t ? t.total_cents + (t.rounding_cents ?? 0) : 0, i = r + (e?.total_cents ?? 0), a = pe(ue);
		return /* @__PURE__ */ X(L, {
			title: "Оплату прийнято",
			onClose: o,
			testId: "debts-pay-done",
			children: [/* @__PURE__ */ X("div", {
				className: "space-y-3 text-center",
				children: [
					/* @__PURE__ */ Y("div", {
						className: "mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center",
						children: /* @__PURE__ */ Y(u, { size: 40 })
					}),
					/* @__PURE__ */ X("p", {
						className: "text-[15px]",
						"data-testid": "debts-pay-done-text",
						children: [
							/* @__PURE__ */ Y("span", {
								className: "font-semibold",
								children: n
							}),
							" — прийнято",
							" ",
							/* @__PURE__ */ Y("span", {
								className: "font-semibold tabular-nums whitespace-nowrap",
								children: U(i)
							}),
							t && !e && t.receipt_number && /* @__PURE__ */ X(J, { children: [", ", /* @__PURE__ */ X("span", {
								className: "whitespace-nowrap",
								children: ["чек ", t.receipt_number]
							})] }),
							t && e && /* @__PURE__ */ X(J, { children: [
								": ",
								/* @__PURE__ */ X("span", {
									className: "whitespace-nowrap",
									children: ["чек ", t.receipt_number]
								}),
								" на",
								" ",
								/* @__PURE__ */ Y("span", {
									className: "tabular-nums whitespace-nowrap",
									children: U(r)
								}),
								" і внесок",
								" ",
								/* @__PURE__ */ Y("span", {
									className: "tabular-nums whitespace-nowrap",
									children: U(e.total_cents)
								}),
								" на «",
								He(e),
								"»"
							] }),
							!t && e && /* @__PURE__ */ X(J, { children: [
								" як внесок на «",
								He(e),
								"»"
							] }),
							"."
						]
					}),
					/* @__PURE__ */ Y("p", {
						className: "text-[15px] tabular-nums",
						children: ie(F.credit)
					}),
					F.warning && /* @__PURE__ */ Y("p", {
						role: "alert",
						className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left",
						children: F.warning
					}),
					ve && /* @__PURE__ */ Y("p", {
						className: "text-sm text-sq-secondary",
						children: ve
					}),
					a && /* @__PURE__ */ Y("p", {
						className: "text-sm text-sq-secondary",
						"data-testid": "debts-pay-slip",
						children: a
					}),
					/* @__PURE__ */ X("div", {
						className: "flex flex-wrap gap-2 pt-1",
						children: [
							t && /* @__PURE__ */ X("button", {
								type: "button",
								className: "sq-btn-quiet flex-1 justify-center",
								disabled: _e,
								onClick: () => void z(t),
								children: [/* @__PURE__ */ Y(v, { size: 20 }), "Друкувати чек"]
							}),
							ue && ue.kind !== "none" && R.current && /* @__PURE__ */ X("button", {
								type: "button",
								className: "sq-btn-quiet flex-1 justify-center",
								onClick: () => R.current && void Oe(R.current),
								children: [/* @__PURE__ */ Y(v, { size: 20 }), "Квитанція ще раз"]
							}),
							/* @__PURE__ */ Y("button", {
								type: "button",
								className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
								onClick: o,
								children: "Готово"
							})
						]
					})
				]
			}), ye]
		});
	}
	let Ae = q && (q.units || q.prepay) ? q.wholeCount : -1;
	return /* @__PURE__ */ Y(L, {
		title: "Прийняти оплату",
		onClose: o,
		wide: !0,
		testId: "debts-pay-sheet",
		children: /* @__PURE__ */ X("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Y("p", {
					className: "text-[13px] text-sq-muted",
					children: W ? !d && !A ? "Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари, а решта піде внеском на наступний." : "Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари — цілими або кількома штуками." : "Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити."
				}),
				/* @__PURE__ */ Y("ol", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					"data-testid": "debts-pay-lines",
					children: a.map((e, t) => {
						let n = q ? t < q.wholeCount : t < p, r = t === Ae, i = j(e);
						return /* @__PURE__ */ Y("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ X("button", {
								type: "button",
								"aria-pressed": n ? !0 : r ? "mixed" : !1,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${n || r ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => De(t),
								children: [
									/* @__PURE__ */ X("span", {
										className: `h-6 w-6 shrink-0 rounded-full grid place-items-center ${n ? "bg-sq-blue text-white" : r ? "ring-2 ring-sq-blue text-sq-blue" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: [n && /* @__PURE__ */ Y(u, { size: 16 }), r && /* @__PURE__ */ Y("span", { className: "h-2.5 w-2.5 rounded-full bg-sq-blue" })]
									}),
									/* @__PURE__ */ X("span", {
										className: "min-w-0 flex-1",
										children: [
											/* @__PURE__ */ Y("span", {
												className: "block text-[15px] truncate",
												children: w(e)
											}),
											/* @__PURE__ */ X("span", {
												className: "block text-[13px] text-sq-muted",
												children: [
													new Date(e.created_at).toLocaleDateString("uk-UA"),
													" ·",
													" ",
													N(e.remaining_quantity, e.unit, e.price_per),
													i ? ` · ${i}` : ""
												]
											}),
											r && q && /* @__PURE__ */ Y("span", {
												className: "block text-[13px] font-semibold text-sq-blue tabular-nums",
												"data-testid": "debts-pay-part",
												children: [q.units ? `зараз ${f(q.units.quantity, e)}` : null, q.prepay ? `внесок ${U(q.prepay.cents)}` : null].filter(Boolean).join(" · ")
											})
										]
									}),
									/* @__PURE__ */ Y("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: U(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ X("label", {
					className: "block",
					children: [
						/* @__PURE__ */ Y("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Покупець дає, ₴ (необовʼязково)"
						}),
						/* @__PURE__ */ Y("input", {
							className: "pos-field mt-1 w-full",
							inputMode: "decimal",
							value: _,
							placeholder: "Наприклад: 500",
							onChange: (e) => y(e.target.value)
						}),
						q && /* @__PURE__ */ Y("span", {
							className: "mt-1 block space-y-0.5 text-[13px] text-sq-secondary tabular-nums",
							"data-testid": "debts-pay-offer",
							children: ae(q, a).map((e) => /* @__PURE__ */ Y("span", {
								className: "block",
								children: e
							}, e))
						})
					]
				}),
				/* @__PURE__ */ Y(oe, {
					value: h,
					onChange: g,
					ariaLabel: "Чим платить",
					className: "w-full",
					options: [{
						value: "cash",
						label: /* @__PURE__ */ X("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Y(ee, { size: 20 }), "Готівка"]
						})
					}, {
						value: "card",
						label: /* @__PURE__ */ X("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Y(k, { size: 20 }), "Картка"]
						})
					}]
				}),
				/* @__PURE__ */ X("dl", {
					className: "space-y-1 text-[15px] tabular-nums",
					children: [
						q ? /* @__PURE__ */ X(J, { children: [q.wholeCount > 0 && /* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Y("dt", {
								className: "text-sq-secondary",
								children: S(q.wholeCount)
							}), /* @__PURE__ */ Y("dd", { children: U(q.wholeCents) })]
						}), q.units && /* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ X("dt", {
								className: "text-sq-secondary min-w-0 truncate",
								children: [
									w(q.units.line),
									" — ",
									f(q.units.quantity, q.units.line)
								]
							}), /* @__PURE__ */ Y("dd", { children: U(q.units.cents) })]
						})] }) : /* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Y("dt", {
								className: "text-sq-secondary",
								children: S(p)
							}), /* @__PURE__ */ Y("dd", { children: U(Te) })]
						}),
						Z !== 0 && /* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3 text-sq-secondary",
							children: [/* @__PURE__ */ Y("dt", { children: "Заокруглення готівки" }), /* @__PURE__ */ Y("dd", { children: Se(Z) })]
						}),
						q?.prepay && /* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ X("dt", {
								className: "text-sq-secondary min-w-0 truncate",
								children: [
									"Внесок на «",
									w(q.prepay.line),
									"»"
								]
							}), /* @__PURE__ */ Y("dd", { children: U(q.prepay.cents) })]
						}),
						/* @__PURE__ */ X("div", {
							className: "flex justify-between gap-3 text-[17px] font-bold text-sq-heading",
							children: [/* @__PURE__ */ Y("dt", { children: "До сплати" }), /* @__PURE__ */ Y("dd", {
								"data-testid": "debts-pay-due",
								children: U(Q)
							})]
						})
					]
				}),
				P && /* @__PURE__ */ Y("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-pay-error",
					children: P.text
				}),
				/* @__PURE__ */ Y("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: T || !Ee,
					onClick: () => void ke(),
					children: T ? "Проводжу…" : P?.unknown ? "Перевірити ще раз" : `Прийняти ${U(Q)}`
				})
			]
		})
	});
}
// src/modules/debts/components/ReturnSheet.tsx
var Ge = "Немає відповіді від сервера — повернення могло пройти. Натисніть ще раз: удруге воно не запишеться.", Ke = "Попереднє повернення лишилося без відповіді — воно могло пройти. Оберіть товар і натисніть ще раз: удруге воно не запишеться.", qe = "Це повернення вже було записано — удруге не записано. Виписку оновлено.";
function Je({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = H({}), [c, l] = H(""), [u, f] = H(!1), p = ze(he("return", t)), [m, _] = H(() => p.replaying ? Ke : null), v = n.filter((e) => (o[e.id] ?? 0) > 0 && !d(e)), b = V(() => n.reduce((e, t) => e + y(t, o[t.id] ?? 0), 0), [n, o]);
	function x(e, t) {
		let n = Math.max(0, Math.min(e.remaining_quantity, Math.round(t)));
		s((t) => ({
			...t,
			[e.id]: n
		}));
	}
	async function S() {
		if (!(u || v.length === 0)) {
			f(!0), _(null);
			try {
				let n = await e.returnGoods(t, {
					lines: v.map((e) => ({
						line_id: e.id,
						quantity: o[e.id]
					})),
					client_uuid: p.current(),
					...c.trim() ? { reason: c.trim() } : {}
				});
				p.answered(), r(n.credit), G() && xe.refreshCatalog().catch(() => void 0), a(), n.replay ? (s({}), _(qe)) : i();
			} catch (e) {
				let t = I(e, "Не вдалося повернути товар");
				t.unknown ? (p.unanswered(), _(Ge)) : (p.answered(), _(t.text)), t.code === "stale_statement" && a();
			} finally {
				f(!1);
			}
		}
	}
	return /* @__PURE__ */ Y(L, {
		title: "Повернути товар",
		onClose: i,
		wide: !0,
		testId: "debts-return-sheet",
		children: /* @__PURE__ */ X("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Y("p", {
					className: "text-[13px] text-sq-muted",
					children: "Товар, за який ще не заплатили, повертається на полицю, а борг зменшується на його вартість."
				}),
				/* @__PURE__ */ Y("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o[e.id] ?? 0, n = e.unit === "" || e.unit === "шт";
						return /* @__PURE__ */ X("li", {
							className: "border-b border-sq-divider/70 last:border-b-0 px-3 py-2.5 space-y-2",
							children: [/* @__PURE__ */ X("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ X("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ Y("span", {
										className: "block text-[15px]",
										children: w(e)
									}), /* @__PURE__ */ X("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											"винно за ",
											N(e.remaining_quantity, e.unit, e.price_per),
											" · ",
											U(e.owed_cents),
											j(e) ? ` (${j(e)})` : ""
										]
									})]
								}), t > 0 && /* @__PURE__ */ X("span", {
									className: "text-[15px] font-semibold tabular-nums shrink-0",
									children: ["−", U(y(e, t))]
								})]
							}), d(e) ? /* @__PURE__ */ X("p", {
								className: "text-[13px] text-sq-muted",
								"data-testid": "debts-return-prepaid",
								children: [
									"На цей товар уже внесено ",
									U(e.prepaid_cents ?? 0),
									" — щоб його повернути, спершу скасуйте внески в журналі виписки (гроші — покупцеві) або прийміть решту оплати"
								]
							}) : /* @__PURE__ */ X("div", {
								className: "flex items-center gap-2",
								children: [M(e) ? /* @__PURE__ */ Y("span", {
									className: "text-[13px] text-sq-muted",
									"data-testid": "debts-return-whole",
									children: "Ваговий товар повертається цілим рядком"
								}) : n ? /* @__PURE__ */ X(J, { children: [
									/* @__PURE__ */ Y("button", {
										type: "button",
										"aria-label": "Менше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => x(e, t - 1),
										children: /* @__PURE__ */ Y(h, { size: 20 })
									}),
									/* @__PURE__ */ Y("span", {
										className: "w-10 text-center text-[17px] font-semibold tabular-nums",
										children: t
									}),
									/* @__PURE__ */ Y("button", {
										type: "button",
										"aria-label": "Більше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => x(e, t + 1),
										children: /* @__PURE__ */ Y(g, { size: 20 })
									})
								] }) : /* @__PURE__ */ Y("input", {
									className: "pos-field w-32",
									inputMode: "numeric",
									"aria-label": `Скільки повернути, ${e.unit}`,
									value: t === 0 ? "" : String(t),
									placeholder: `0 ${e.unit}`,
									onChange: (t) => x(e, Number(t.target.value.replace(/\D/g, "")) || 0)
								}), /* @__PURE__ */ Y("button", {
									type: "button",
									className: "ml-auto text-[15px] font-semibold text-sq-blue",
									onClick: () => x(e, t === e.remaining_quantity ? 0 : e.remaining_quantity),
									children: t === e.remaining_quantity ? "Скинути" : "Усе"
								})]
							})]
						}, e.id);
					})
				}),
				/* @__PURE__ */ X("label", {
					className: "block",
					children: [/* @__PURE__ */ Y("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Причина (необовʼязково)"
					}), /* @__PURE__ */ Y("input", {
						className: "pos-field mt-1 w-full",
						value: c,
						maxLength: 200,
						placeholder: "Наприклад: не підійшов розмір",
						onChange: (e) => l(e.target.value)
					})]
				}),
				m && /* @__PURE__ */ Y("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: m
				}),
				/* @__PURE__ */ Y("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: u || v.length === 0,
					onClick: () => void S(),
					children: u ? "Повертаю…" : v.length === 0 ? "Оберіть, що повертається" : `Повернути на ${U(b)}`
				})
			]
		})
	});
}
// src/modules/debts/components/UndoPrepaySheet.tsx
function Ye({ entry: t, line: n, onClose: r, onChanged: i }) {
	let [a, o] = H(!1), [s, c] = H(null), l = Math.abs(t.amount_cents);
	async function u() {
		if (!(a || t.sale_id == null)) {
			o(!0), c(null);
			try {
				await e.voidPrepayment(t.sale_id), i(), r();
			} catch (e) {
				c(I(e, "Не вдалося скасувати внесок").text), i();
			} finally {
				o(!1);
			}
		}
	}
	return /* @__PURE__ */ Y(L, {
		title: "Скасувати внесок?",
		onClose: r,
		testId: "debts-undo-prepay",
		children: /* @__PURE__ */ X("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ X("p", {
					className: "text-[15px]",
					children: [
						"Поверніть покупцеві ",
						/* @__PURE__ */ Y("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: U(l)
						}),
						t.receipt_number ? ` (внесок № ${t.receipt_number})` : "",
						". Ця сума знову стане боргом за «",
						w(n),
						"»."
					]
				}),
				s && /* @__PURE__ */ Y("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: s
				}),
				/* @__PURE__ */ X("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ Y("button", {
						type: "button",
						className: "sq-btn-quiet flex-1 justify-center min-h-[48px]",
						onClick: r,
						children: "Ні"
					}), /* @__PURE__ */ Y("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
						disabled: a,
						onClick: () => void u(),
						children: a ? "Скасовую…" : "Скасувати внесок"
					})]
				})
			]
		})
	});
}
// src/modules/debts/components/WriteOffSheet.tsx
var Xe = 3, Ze = "Немає відповіді від сервера — списання могло пройти. Натисніть ще раз: удруге воно не запишеться.", Qe = "Попереднє списання лишилося без відповіді — воно могло пройти. Натисніть ще раз: удруге воно не запишеться.", $e = "Це списання вже було записано — удруге не записано. Виписку оновлено.";
function et({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = H(() => new Set(n.map((e) => e.id))), [c, l] = H(""), [d, f] = H(!1), p = ze(he("writeoff", t)), [m, h] = H(() => p.replaying ? Qe : null), g = V(() => n.filter((e) => o.has(e.id)).reduce((e, t) => e + t.owed_cents, 0), [n, o]), _ = c.trim().length >= Xe;
	function v(e) {
		s((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	async function y() {
		if (!d && o.size !== 0 && _) {
			f(!0), h(null);
			try {
				let s = await e.writeOff(t, {
					line_ids: n.filter((e) => o.has(e.id)).map((e) => e.id),
					reason: c.trim(),
					client_uuid: p.current()
				});
				p.answered(), r(s.credit), a(), s.replay ? h($e) : i();
			} catch (e) {
				let t = I(e, "Не вдалося списати борг");
				t.unknown ? (p.unanswered(), h(Ze)) : (p.answered(), h(t.text)), t.code === "stale_statement" && a();
			} finally {
				f(!1);
			}
		}
	}
	return /* @__PURE__ */ Y(L, {
		title: "Списати борг",
		onClose: i,
		wide: !0,
		testId: "debts-writeoff-sheet",
		children: /* @__PURE__ */ X("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Y("p", {
					className: "text-[13px] text-sq-muted",
					children: "Борг за обраними товарами закривається без грошей і без чека. Товар не повертається на полицю."
				}),
				/* @__PURE__ */ Y("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o.has(e.id);
						return /* @__PURE__ */ Y("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ X("button", {
								type: "button",
								"aria-pressed": t,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${t ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => v(e.id),
								children: [
									/* @__PURE__ */ Y("span", {
										className: `h-6 w-6 shrink-0 rounded-md grid place-items-center ${t ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: t && /* @__PURE__ */ Y(u, { size: 16 })
									}),
									/* @__PURE__ */ X("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ Y("span", {
											className: "block text-[15px] truncate",
											children: w(e)
										}), /* @__PURE__ */ Y("span", {
											className: "block text-[13px] text-sq-muted",
											children: N(e.remaining_quantity, e.unit, e.price_per)
										})]
									}),
									/* @__PURE__ */ Y("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: U(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ X("label", {
					className: "block",
					children: [
						/* @__PURE__ */ Y("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Причина"
						}),
						/* @__PURE__ */ Y("input", {
							className: "pos-field mt-1 w-full",
							value: c,
							maxLength: 200,
							placeholder: "Наприклад: покупець виїхав, борг безнадійний",
							onChange: (e) => l(e.target.value)
						}),
						!_ && c.length > 0 && /* @__PURE__ */ X("span", {
							className: "mt-1 block text-[13px] text-sq-muted",
							children: [
								"Щонайменше ",
								Xe,
								" символи"
							]
						})
					]
				}),
				m && /* @__PURE__ */ Y("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: m
				}),
				/* @__PURE__ */ Y("button", {
					type: "button",
					className: "w-full min-h-[52px] rounded-xl text-[17px] font-semibold tabular-nums bg-red-600 text-white disabled:opacity-50",
					disabled: d || o.size === 0 || !_,
					onClick: () => void y(),
					children: d ? "Списую…" : `Списати ${U(g)}`
				})
			]
		})
	});
}
// src/modules/debts/pages/StatementPage.tsx
function tt({ frame: t }) {
	let { customerId: n } = De(), i = Number(n), a = q((e) => e.online), o = G(), s = a && (!o || ve.hasLiveJwt()), c = K((e) => e.auth?.staff.role ?? null) === "owner", l = ke(Number.isInteger(i) ? i : void 0), [u, d] = H(null), [f, m] = H(null), [h, g] = H(0), [v, y] = H(null), [b, x] = H(null), S = z(() => g((e) => e + 1), []);
	Ae(l, S), B(() => {
		if (!s || !Number.isInteger(i) || i <= 0) return;
		let t = !0;
		return e.statement(i).then((e) => {
			t && (d(e), m(null), r(e.credit, e.customer));
		}).catch((e) => {
			t && m(I(e, "Не вдалося прочитати виписку").text);
		}), () => {
			t = !1;
		};
	}, [
		i,
		s,
		h
	]);
	let C = /* @__PURE__ */ X(Z, {
		to: "..",
		relative: "path",
		className: "-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue",
		children: [/* @__PURE__ */ Y(_, {
			size: 20,
			"aria-hidden": !0
		}), "Борги"]
	});
	if (!s) return /* @__PURE__ */ X($, {
		frame: t,
		children: [
			C,
			/* @__PURE__ */ Y("div", {
				className: "mt-3",
				children: /* @__PURE__ */ Y(Ne, {
					rows: l,
					showCustomer: !1
				})
			}),
			/* @__PURE__ */ X("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Y("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Y("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			})
		]
	});
	if (!u) return /* @__PURE__ */ X($, {
		frame: t,
		children: [C, /* @__PURE__ */ Y("p", {
			className: `mt-3 text-sm ${f ? "text-red-600" : "text-sq-muted"}`,
			children: f ?? "Завантаження…"
		})]
	});
	let { customer: T, credit: E, open_lines: D, entries: k } = u, ee = D.reduce((e, t) => e + t.owed_cents, 0), te = p(k, D);
	return /* @__PURE__ */ X($, {
		frame: t,
		children: [
			C,
			/* @__PURE__ */ X("header", {
				className: "mt-2 mb-5 space-y-1",
				children: [
					/* @__PURE__ */ Y("h2", {
						className: "text-[28px] font-bold text-sq-heading leading-tight",
						children: T.name
					}),
					T.phone && /* @__PURE__ */ Y("p", {
						className: "text-[15px] text-sq-muted",
						children: T.phone
					}),
					/* @__PURE__ */ Y("p", {
						className: "text-[17px] tabular-nums",
						"data-testid": "debts-statement-credit",
						children: E.limit_cents == null && E.balance_cents === 0 ? "Під запис не дозволено" : ie(E)
					}),
					u.oldest_open_at && /* @__PURE__ */ X("p", {
						className: "text-[13px] text-sq-muted",
						children: ["Найстаріший борг — ", A(u.oldest_open_at)]
					})
				]
			}),
			f && /* @__PURE__ */ Y("p", {
				className: "mb-3 text-sm text-red-600",
				children: f
			}),
			/* @__PURE__ */ Y(Ne, {
				rows: l,
				showCustomer: !1
			}),
			D.length > 0 && /* @__PURE__ */ X("div", {
				className: "flex flex-wrap gap-2 mb-6",
				children: [
					/* @__PURE__ */ Y("button", {
						type: "button",
						className: "pos-btn-primary min-h-[48px] px-5 rounded-xl text-[16px]",
						onClick: () => y("pay"),
						children: "Прийняти оплату"
					}),
					/* @__PURE__ */ Y("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px]",
						onClick: () => y("return"),
						children: "Повернути товар"
					}),
					c && /* @__PURE__ */ Y("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px] text-red-600",
						onClick: () => y("writeoff"),
						children: "Списати"
					})
				]
			}),
			/* @__PURE__ */ X("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ Y(F, {
					title: "Винно",
					count: D.length,
					action: D.length > 0 ? /* @__PURE__ */ Y("span", {
						className: "tabular-nums",
						children: U(ee)
					}) : void 0
				}), D.length === 0 ? /* @__PURE__ */ Y("p", {
					className: "py-4 text-[15px] text-sq-secondary",
					children: "Нічого не винно."
				}) : /* @__PURE__ */ Y("ul", {
					"data-testid": "debts-open-lines",
					children: D.map((e) => /* @__PURE__ */ Y("li", {
						className: "sq-row",
						children: /* @__PURE__ */ X("div", {
							className: "flex items-center gap-3 w-full min-h-[52px] py-2",
							children: [/* @__PURE__ */ X("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ Y("span", {
									className: "block text-[15px] truncate",
									children: w(e)
								}), /* @__PURE__ */ X("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										new Date(e.created_at).toLocaleDateString("uk-UA"),
										" ·",
										" ",
										N(e.remaining_quantity, e.unit, e.price_per),
										j(e) ? ` (${j(e)})` : "",
										e.note ? ` · ${e.note}` : ""
									]
								})]
							}), /* @__PURE__ */ Y("span", {
								className: "text-[15px] font-semibold tabular-nums shrink-0",
								children: U(e.owed_cents)
							})]
						})
					}, e.id))
				})]
			}),
			c && /* @__PURE__ */ X("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ Y(F, { title: "Ліміт" }), /* @__PURE__ */ Y("div", {
					className: "pt-3",
					children: /* @__PURE__ */ Y(ce, {
						credit: E,
						touch: t === "till"
					})
				})]
			}),
			/* @__PURE__ */ X("section", { children: [/* @__PURE__ */ Y(F, {
				title: "Журнал",
				count: k.length
			}), k.length === 0 ? /* @__PURE__ */ Y("p", {
				className: "py-4 text-[15px] text-sq-secondary",
				children: "Ще нічого не записано."
			}) : /* @__PURE__ */ Y("ul", {
				"data-testid": "debts-journal",
				children: k.map((e) => /* @__PURE__ */ Y("li", {
					className: "sq-row",
					children: /* @__PURE__ */ X("div", {
						className: "flex items-center gap-3 w-full min-h-[52px] py-2",
						children: [
							/* @__PURE__ */ X("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ X("span", {
									className: "block text-[15px]",
									children: [O(e), e.receipt_number ? ` · ${e.prepayment ? "№" : "чек"} ${e.receipt_number}` : ""]
								}), /* @__PURE__ */ X("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										new Date(e.created_at).toLocaleString("uk-UA"),
										e.staff_name ? ` · ${e.staff_name}` : "",
										e.offline ? " · без мережі" : "",
										e.reason ? ` · ${e.reason}` : ""
									]
								})]
							}),
							/* @__PURE__ */ Y("span", {
								className: `text-[15px] font-semibold tabular-nums shrink-0 ${e.amount_cents > 0 ? "text-sq-heading" : "text-sq-success-ink"}`,
								children: Se(e.amount_cents)
							}),
							te.has(e.id) && /* @__PURE__ */ Y("button", {
								type: "button",
								className: "shrink-0 min-h-11 px-2 text-[15px] font-semibold text-sq-blue",
								onClick: () => {
									let t = D.find((t) => t.id === e.prepay_line_id);
									t && x({
										entry: e,
										line: t
									});
								},
								children: "Скасувати"
							})
						]
					})
				}, e.id))
			})] }),
			v === "pay" && /* @__PURE__ */ Y(We, {
				customerId: T.id,
				customerName: T.name,
				customerPhone: T.phone,
				openLines: D,
				onClose: () => y(null),
				onChanged: S
			}),
			v === "return" && /* @__PURE__ */ Y(Je, {
				customerId: T.id,
				openLines: D,
				onClose: () => y(null),
				onChanged: S
			}),
			b && /* @__PURE__ */ Y(Ye, {
				entry: b.entry,
				line: b.line,
				onClose: () => x(null),
				onChanged: S
			}),
			v === "writeoff" && c && /* @__PURE__ */ Y(et, {
				customerId: T.id,
				openLines: D,
				onClose: () => y(null),
				onChanged: S
			})
		]
	});
}
// src/modules/debts/pages/DebtsRoutes.tsx
function nt({ frame: e = "till" }) {
	return /* @__PURE__ */ X(Ee, { children: [/* @__PURE__ */ Y(Q, {
		index: !0,
		element: /* @__PURE__ */ Y(Fe, { frame: e })
	}), /* @__PURE__ */ Y(Q, {
		path: ":customerId",
		element: /* @__PURE__ */ Y(tt, { frame: e })
	})] });
}
export { nt as DebtsRoutes };
