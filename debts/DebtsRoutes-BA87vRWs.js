import { t as e } from "./debtsApi-Dr25ayLn.js";
import { a as t, c as n, f as r, g as i, h as a, i as o, s, t as c } from "./queue-B9HzuKEV.js";
import { n as l } from "./sync-CWOssSK3.js";
import { A as u, B as d, C as f, D as p, E as m, F as h, G as g, H as _, I as v, J as y, K as b, L as x, M as S, N as C, O as w, P as T, R as E, S as D, T as O, U as ee, V as te, W as ne, _ as re, a as ie, b as ae, c as oe, d as se, g as k, h as A, i as ce, j as le, k as j, l as ue, n as M, o as de, q as fe, r as N, s as pe, u as me, v as he, w as ge, x as P, y as _e, z as ve } from "./debt-B208o_Xv.js";
import { i as ye, n as be, r as F, t as I } from "./LimitEditor-C42kRKgJ.js";
import { n as xe, t as L } from "./errors-CVpu3Q0y.js";
import { c as Se, d as Ce, f as we, i as Te, o as Ee, p as De, r as Oe, s as R, t as z, u as ke } from "./Sheet-BB1dZFr-.js";
import { useCallback as B, useEffect as V, useMemo as H, useRef as Ae, useState as U } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as je, api as Me, buildReceiptPayload as Ne, buildRefundReceiptPayload as W, cashierApi as Pe, formatSignedUah as Fe, formatUah as G, getMeta as Ie, isOfflinePosEnabled as K, printReceipt as Le, storeCashRounding as Re, useAuthStore as q, useOfflineStatus as J, usePrintableReceipt as Y } from "@pos/platform";
import { Fragment as X, jsx as Z, jsxs as Q } from "react/jsx-runtime";
import { Link as ze, Route as Be, Routes as Ve, useParams as He } from "react-router-dom";
// src/modules/debts/lib/useQueue.ts
var Ue = [];
function We(e) {
	let t = q((e) => e.auth?.store.id ?? null), n = K(), [r, i] = U(Ue);
	return V(() => {
		if (!n || t == null) {
			i(Ue);
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
function Ge(e, t) {
	let n = Ae(new Set(e.map((e) => e.id)));
	V(() => {
		let r = new Set(e.map((e) => e.id)), i = [...n.current].some((e) => !r.has(e));
		n.current = r, i && t();
	}, [e, t]);
}
// src/modules/debts/components/Frame.tsx
function $({ frame: e, children: t }) {
	return e === "admin" ? /* @__PURE__ */ Z("div", {
		className: "max-w-4xl text-sq-text",
		children: t
	}) : /* @__PURE__ */ Z("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text",
		children: /* @__PURE__ */ Z("div", {
			className: "mx-auto max-w-3xl px-4 md:px-7 py-5 pb-10",
			children: t
		})
	});
}
// src/modules/debts/lib/queueText.ts
function Ke(e) {
	if (e.status === "queued") return "Чекає мережі";
	let t = e.lastError?.trim() || "невідома помилка";
	return e.status === "error" ? `Не вдалося надіслати: ${t}. Каса спробує ще раз сама.` : e.deadReason === "attempts_exhausted" ? `Не вдалося надіслати після ${e.attempts} ${j(e.attempts, "спроби", "спроб", "спроб")}: ${t}` : `Сервер не прийняв: ${t}`;
}
function qe(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
// src/modules/debts/components/QueuePanel.tsx
function Je({ rows: e, showCustomer: t = !0 }) {
	let r = J((e) => e.online), [i, a] = U(!1), [o, s] = U(null);
	if (e.length === 0) return null;
	let u = e.filter((e) => e.status !== "dead").length;
	async function d() {
		a(!0);
		try {
			await l();
		} finally {
			a(!1), J.getState().refreshPending();
		}
	}
	async function f(e) {
		await n(e), r && d();
	}
	async function p(e) {
		s(null), await c(e), J.getState().refreshPending();
	}
	return /* @__PURE__ */ Q("section", {
		className: "rounded-card bg-white ring-1 ring-amber-200 p-4 mb-5",
		"data-testid": "debts-queue",
		children: [
			/* @__PURE__ */ Z(F, {
				title: "Записано без мережі",
				count: e.length,
				action: r && u > 0 ? /* @__PURE__ */ Z("button", {
					type: "button",
					className: "font-semibold text-sq-blue disabled:opacity-50",
					disabled: i,
					onClick: () => void d(),
					children: i ? "Надсилаю…" : "Надіслати зараз"
				}) : void 0
			}),
			/* @__PURE__ */ Z("p", {
				className: "mt-1 text-[13px] text-sq-muted",
				children: "Товар уже в покупця. Ці записи підуть на сервер, щойно буде звʼязок, — до того їх видно лише на цій касі."
			}),
			/* @__PURE__ */ Z("ul", {
				className: "mt-2",
				children: e.map((e) => /* @__PURE__ */ Q("li", {
					className: "sq-row",
					"data-testid": "debts-queue-row",
					children: [/* @__PURE__ */ Q("div", {
						className: "flex items-start gap-3 w-full py-2",
						children: [/* @__PURE__ */ Q("span", {
							className: "min-w-0 flex-1",
							children: [
								t && /* @__PURE__ */ Z("span", {
									className: "block text-[15px] font-semibold truncate",
									children: e.customerName
								}),
								/* @__PURE__ */ Q("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										qe(e.createdAt),
										" · ",
										me(e.lines.length),
										e.note ? ` · ${e.note}` : ""
									]
								}),
								/* @__PURE__ */ Z("span", {
									className: `block text-[13px] ${e.status === "dead" ? "text-red-600" : "text-sq-muted"}`,
									children: Ke(e)
								})
							]
						}), /* @__PURE__ */ Z("span", {
							className: "text-[15px] font-semibold tabular-nums shrink-0",
							children: G(e.totalCents)
						})]
					}), e.status === "dead" && /* @__PURE__ */ Z("div", {
						className: "flex flex-wrap items-center gap-2 pb-3",
						children: o === e.id ? /* @__PURE__ */ Q(X, { children: [
							/* @__PURE__ */ Z("span", {
								className: "w-full text-[13px] text-red-700",
								children: "Запис зникне з каси й не потрапить на сервер, а товар уже в покупця. Прибрати?"
							}),
							/* @__PURE__ */ Z("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px] text-red-600",
								onClick: () => void p(e.id),
								children: "Так, прибрати"
							}),
							/* @__PURE__ */ Z("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px]",
								onClick: () => s(null),
								children: "Ні"
							})
						] }) : /* @__PURE__ */ Q(X, { children: [/* @__PURE__ */ Z("button", {
							type: "button",
							className: "sq-btn-quiet min-h-[40px]",
							onClick: () => void f(e.id),
							children: "Надіслати ще раз"
						}), /* @__PURE__ */ Z("button", {
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
function Ye(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function Xe({ frame: n }) {
	let r = J((e) => e.online), s = q((e) => e.auth?.store.id ?? null), c = K(), l = r && (!c || Me.hasLiveJwt()), u = We(), [d, f] = U("owing"), [p, m] = U(null), [h, g] = U(null), [_, v] = U(null), [b, x] = U(""), [S, C] = U(0);
	Ge(u, B(() => C((e) => e + 1), [])), V(() => {
		if (!l) return;
		let t = !0;
		return v(null), e.debtors(d === "all").then((e) => {
			t && m(e.debtors);
		}).catch((e) => {
			t && v(L(e, "Не вдалося прочитати борги").text);
		}), () => {
			t = !1;
		};
	}, [
		d,
		l,
		S
	]), V(() => {
		if (l || !c || s == null) {
			g(null);
			return;
		}
		let e = !0, n = async () => {
			let [n, r, o] = await Promise.all([
				a(s),
				t(s),
				i(s)
			]);
			e && g({
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
	let w = !l && c, T = w ? h?.rows ?? null : p, E = H(() => (T ?? []).filter((e) => (!w || d === "all" || e.balance_cents > 0) && re(e, b)), [
		T,
		w,
		d,
		b
	]), D = (T ?? []).filter((e) => e.balance_cents > 0), O = D.reduce((e, t) => e + t.balance_cents, 0);
	return /* @__PURE__ */ Q($, {
		frame: n,
		children: [
			/* @__PURE__ */ Z(be, {
				glyph: y,
				title: "Борги",
				subtitle: "Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
			}),
			/* @__PURE__ */ Z(Je, { rows: u }),
			!l && !c ? /* @__PURE__ */ Q("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Z("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Z("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			}) : w && h && h.filledAt == null ? /* @__PURE__ */ Q("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Z("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Z("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Каса ще жодного разу не отримала список боргів — він зʼявиться після першого сеансу з мережею."
				})]
			}) : /* @__PURE__ */ Q("div", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ Q("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ Z(ye, {
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
						}), /* @__PURE__ */ Z("input", {
							className: `${n === "admin" ? "sq-input" : "pos-field"} min-w-[12rem] flex-1`,
							value: b,
							placeholder: "Імʼя або телефон",
							"aria-label": "Пошук покупця",
							onChange: (e) => x(e.target.value)
						})]
					}),
					w && h?.filledAt != null && /* @__PURE__ */ Q("p", {
						className: "text-[13px] text-amber-800",
						"data-testid": "debts-mirror-note",
						children: [
							"Без мережі — за даними каси на ",
							Ye(h.filledAt),
							", разом із записаним без мережі. Виписку відкриє мережа."
						]
					}),
					T && D.length > 0 && /* @__PURE__ */ Q("p", {
						className: "text-[15px] text-sq-secondary tabular-nums",
						"data-testid": "debts-total",
						children: [
							"Разом винні ",
							/* @__PURE__ */ Z("span", {
								className: "font-semibold text-sq-heading",
								children: G(O)
							}),
							" ·",
							" ",
							D.length,
							" ",
							j(D.length, "покупець", "покупці", "покупців")
						]
					}),
					_ && !w && /* @__PURE__ */ Z("p", {
						className: "text-sm text-red-600",
						children: _
					}),
					!T && !(_ && !w) && /* @__PURE__ */ Z("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					T && E.length === 0 && /* @__PURE__ */ Z("div", {
						className: "sq-card p-6 text-center text-[15px] text-sq-secondary",
						children: b ? "Нікого не знайдено" : d === "owing" ? "Ніхто нічого не винен." : "Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця."
					}),
					E.length > 0 && /* @__PURE__ */ Z("ul", {
						className: "rounded-card bg-white shadow-card overflow-hidden",
						"data-testid": "debtors",
						children: E.map((e) => /* @__PURE__ */ Z("li", {
							className: "sq-row last:shadow-none",
							children: w ? /* @__PURE__ */ Z("div", {
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5",
								children: /* @__PURE__ */ Z(Ze, { row: e })
							}) : /* @__PURE__ */ Z(ze, {
								to: String(e.customer_id),
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60",
								children: /* @__PURE__ */ Z(Ze, { row: e })
							})
						}, e.customer_id))
					})
				]
			})
		]
	});
}
function Ze({ row: e }) {
	let t = se(e);
	return /* @__PURE__ */ Q(X, { children: [/* @__PURE__ */ Q("span", {
		className: "min-w-0 flex-1",
		children: [/* @__PURE__ */ Z("span", {
			className: "block text-[16px] font-semibold truncate",
			children: e.name
		}), /* @__PURE__ */ Q("span", {
			className: "block text-[13px] text-sq-muted truncate",
			children: [[e.phone, e.locked ? "записи заблоковано" : null].filter(Boolean).join(" · "), t && /* @__PURE__ */ Q("span", {
				className: "text-amber-800",
				"data-testid": "debtor-over-limit",
				children: [e.phone || e.locked ? " · " : "", "понад ліміт"]
			})]
		})]
	}), /* @__PURE__ */ Q("span", {
		className: "text-right shrink-0",
		children: [/* @__PURE__ */ Z("span", {
			className: "block text-[16px] font-semibold tabular-nums",
			children: G(e.balance_cents)
		}), /* @__PURE__ */ Z("span", {
			className: "block text-[13px] text-sq-muted",
			children: e.oldest_open_at ? `${me(e.open_lines)} · ${M(e.oldest_open_at)}` : e.limit_cents == null ? "" : `ліміт ${G(e.limit_cents)}`
		})]
	})] });
}
// src/modules/debts/lib/useReceiptPrint.tsx
function Qe(e, t) {
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
function $e(e, t) {
	let n = t, r = n.debt_prepayment;
	if (!r || e.provider_text || e.items.length > 0) return e;
	let i = r.variant_label ? `${r.product_name} · ${r.variant_label}` : r.product_name;
	return {
		...e,
		items: [{
			name: `Передплата за «${i}»`,
			variant_label: "",
			quantity: 1,
			unit_price_cents: t.total_cents,
			line_total_cents: t.total_cents,
			...n.fiscal_chain_id ? { note: `Замовлення № ${n.fiscal_chain_id}` } : {}
		}]
	};
}
function et(e, t, n, r) {
	let i = e.refunds.find((e) => e.id === t);
	if (!i) return null;
	let a = r ?? i.fiscal ?? null;
	return $e({
		...W(e, i, (i.items ?? []).map((e) => ({
			sale_item_id: e.sale_item_id,
			quantity: e.quantity
		})), n, a ? {
			status: a.status === "done" || a.status === "pending" ? a.status : "failed",
			mode: a.mode,
			fiscal_code: a.fiscal_code,
			fiscal_date: a.fiscal_date,
			control_number: a.control_number ?? null,
			tax_url: a.tax_url,
			qr_payload: a.qr_payload,
			receipt_text: a.receipt_text,
			error_code: a.error_code,
			message: a.message ?? a.error_message ?? null
		} : null),
		total_cents: i.total_cents
	}, {
		...e,
		total_cents: i.total_cents
	});
}
function tt() {
	let e = q((e) => e.auth), { printToPdf: t, printablePortal: n } = Y(), [r, i] = U(!1), [a, o] = U(null), s = B(() => ({
		name: e?.store.name ?? "",
		fiscal: e?.store.fiscal ?? null,
		vertical: e?.store.vertical?.id ?? null
	}), [e]), c = B(async (e) => {
		let [n, r] = await Promise.all([Ie("receiptPrinterName"), Ie("receiptPaperWidthMm")]);
		if (!n) t(e);
		else {
			i(!0), o(null);
			try {
				await Le(n, e, r === 58 || r === 80 ? r : je), o("Чек надіслано на друк");
			} catch (e) {
				o(`Не вдалося надрукувати: ${typeof e == "string" ? e : String(e)}`);
			} finally {
				i(!1);
			}
		}
	}, [t]), l = B((e) => c($e(Qe(Ne(e, s()), e), e)), [c, s]), u = B(async (e) => {
		if (e.length === 0) return;
		let t = await Ie("receiptPrinterName");
		for (let n of t ? e : e.slice(0, 1)) await c(n);
	}, [c]);
	return {
		print: l,
		printMany: B((e) => u(e.map((e) => $e(Qe(Ne(e, s()), e), e))), [u, s]),
		printRefunds: B((e) => u(e.map(({ sale: e, refundId: t, fiscal: n }) => et(e, t, s(), n)).filter((e) => e != null)), [u, s]),
		printing: r,
		status: a,
		printablePortal: n
	};
}
// src/modules/debts/lib/useWriteKey.ts
function nt(e) {
	let [t] = U(() => {
		let t = De(e);
		return {
			key: t ?? crypto.randomUUID(),
			replaying: t != null,
			body: we(e)
		};
	}), n = Ae(t.key);
	return {
		current: () => n.current,
		replaying: t.replaying,
		replayBody: t.body,
		unanswered: (t) => ke(e, n.current, Date.now(), t),
		answered: () => {
			Ce(e), n.current = crypto.randomUUID();
		}
	};
}
// src/modules/debts/components/ChainReturnSheet.tsx
var rt = "Немає відповіді від сервера — повернення могло пройти. «Перевірити ще раз» не поверне гроші вдруге.", it = "Попереднє повернення цього товару не отримало відповіді — спершу перевірте його: «Перевірити ще раз» не поверне гроші вдруге.";
function at(e) {
	return e.sale.refunds.find((t) => t.id === e.refund_id) ?? null;
}
function ot(e) {
	let t = at(e)?.refund_number, n = e.kind === "prepayment" ? `внесок № ${e.sale.receipt_number}` : `чек ${e.sale.receipt_number}`;
	return `Чек повернення${t ? ` ${t}` : ""} · ${n}`;
}
function st(e) {
	let t = at(e);
	return (t?.total_cents ?? 0) + (t?.rounding_cents ?? 0);
}
function ct(e) {
	return (e.fiscal?.status ?? at(e)?.fiscal_status) === "done";
}
function lt({ mode: t, customerId: n, lineId: i, title: a, count: o, cents: s, onClose: c, onChanged: l }) {
	let u = q((e) => e.auth?.store.auto_print_receipt ?? !1), d = nt(R(t, n, i)), [f, p] = U(!1), [m, h] = U(!1), [g, _] = U(() => d.replaying ? xe(it) : null), [v, y] = U(null), { printRefunds: b, printing: x, status: C, printablePortal: w } = tt(), T = (e) => b(e.map((e) => ({
		sale: e.sale,
		refundId: e.refund_id,
		fiscal: e.fiscal
	})));
	async function E() {
		if (m) return;
		h(!0), _(null);
		let a = {
			line_id: i,
			client_uuid: d.current()
		};
		try {
			let i = t === "cancel" ? await e.cancelPrepayments(n, a) : await e.returnChain(n, f ? {
				...a,
				reason_code: "defect"
			} : a);
			d.answered(), r(i.credit), y(i), l();
			let o = i.parts.filter(ct);
			u && o.length > 0 && T(o);
		} catch (e) {
			let n = L(e, t === "cancel" ? "Не вдалося скасувати внески" : "Не вдалося повернути товар");
			n.unknown ? (d.unanswered(), _({
				...n,
				text: rt
			})) : (d.answered(), _(n), l()), n.credit && r(n.credit);
		} finally {
			h(!1);
		}
	}
	if (v) {
		let e = v.parts.length;
		return /* @__PURE__ */ Q(z, {
			title: t === "cancel" ? "Внески повернуто" : "Товар повернуто",
			onClose: c,
			testId: "debts-chain-done",
			children: [/* @__PURE__ */ Q("div", {
				className: "space-y-3 text-center",
				children: [
					/* @__PURE__ */ Z("div", {
						className: "mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center",
						children: /* @__PURE__ */ Z(ee, { size: 40 })
					}),
					/* @__PURE__ */ Q("p", {
						className: "text-[15px]",
						"data-testid": "debts-chain-done-text",
						children: [
							"Покупцеві — ",
							/* @__PURE__ */ Z("span", {
								className: "font-semibold tabular-nums whitespace-nowrap",
								children: G(v.back_cents)
							}),
							":",
							" ",
							e,
							" ",
							j(e, "чек", "чеки", "чеків"),
							" повернення.",
							t === "cancel" ? " Сума знову в борг." : ""
						]
					}),
					/* @__PURE__ */ Z("ul", {
						className: "rounded-xl ring-1 ring-sq-divider overflow-hidden text-left",
						"data-testid": "debts-chain-returns",
						children: v.parts.map((e) => /* @__PURE__ */ Q("li", {
							className: "flex items-center gap-3 px-3 min-h-[52px] py-2 border-b border-sq-divider/70 last:border-b-0",
							children: [
								/* @__PURE__ */ Z("span", {
									className: "min-w-0 flex-1 text-[15px]",
									children: ot(e)
								}),
								/* @__PURE__ */ Z("span", {
									className: "text-[15px] font-semibold tabular-nums shrink-0",
									children: G(st(e))
								}),
								/* @__PURE__ */ Z("button", {
									type: "button",
									className: "shrink-0 min-h-11 px-2 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
									disabled: x,
									onClick: () => void T([e]),
									"aria-label": `Друкувати: ${ot(e)}`,
									children: /* @__PURE__ */ Z(fe, { size: 20 })
								})
							]
						}, e.refund_id))
					}),
					v.warning && /* @__PURE__ */ Z("p", {
						role: "alert",
						className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left",
						"data-testid": "debts-chain-warning",
						children: v.warning
					}),
					C && /* @__PURE__ */ Z("p", {
						className: "text-sm text-sq-secondary",
						children: C
					}),
					/* @__PURE__ */ Z("button", {
						type: "button",
						className: "pos-btn-primary w-full min-h-[48px] rounded-xl",
						onClick: c,
						children: "Готово"
					})
				]
			}), w]
		});
	}
	return /* @__PURE__ */ Q(z, {
		title: t === "cancel" ? "Скасувати внески?" : "Повернути товар?",
		onClose: c,
		testId: t === "cancel" ? "debts-cancel-prepayments" : "debts-chain-return",
		children: [/* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				t === "cancel" ? /* @__PURE__ */ Q("p", {
					className: "text-[15px]",
					"data-testid": "debts-chain-words",
					children: [
						"Поверніть покупцеві ",
						/* @__PURE__ */ Z("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: G(s)
						}),
						" —",
						" ",
						S(o, s),
						" за «",
						a,
						"». Ця сума знову стане боргом. ПРРО поверне всі внески за цей товар разом — окремо один внесок не повертається."
					]
				}) : /* @__PURE__ */ Q("p", {
					className: "text-[15px]",
					"data-testid": "debts-chain-words",
					children: [
						"«",
						a,
						"» — на полицю, покупцеві —",
						" ",
						/* @__PURE__ */ Z("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: G(s)
						}),
						": чек погашення і всі внески за цей товар. ПРРО поверне їх разом — ",
						o,
						" ",
						j(o, "чек", "чеки", "чеків"),
						" повернення."
					]
				}),
				t === "goods" && /* @__PURE__ */ Q("label", {
					className: "flex items-center gap-3 min-h-11 text-[15px]",
					children: [/* @__PURE__ */ Z("input", {
						type: "checkbox",
						className: "h-5 w-5",
						checked: f,
						onChange: (e) => p(e.target.checked),
						"data-testid": "debts-chain-defect"
					}), "Брак — списати, а не на полицю"]
				}),
				g && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-chain-error",
					children: g.text
				}),
				/* @__PURE__ */ Q("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ Z("button", {
						type: "button",
						className: "sq-btn-quiet flex-1 justify-center min-h-[48px]",
						onClick: c,
						children: "Ні"
					}), /* @__PURE__ */ Z("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
						disabled: m,
						onClick: () => void E(),
						children: m ? "Повертаю…" : g?.unknown ? "Перевірити ще раз" : `Повернути ${G(s)}`
					})]
				})
			]
		}), w]
	});
}
// src/modules/debts/components/PaySheet.tsx
var ut = "Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.", dt = "Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.";
function ft(e) {
	let t = e.debt_prepayment;
	return t ? t.variant_label ? `${t.product_name} · ${t.variant_label}` : t.product_name : "";
}
function pt(e) {
	let t = e.replace(/\s/g, "").replace(",", "."), n = Number(t);
	return t && Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}
function mt(e) {
	return e && typeof e == "object" && Array.isArray(e.payments) ? e : null;
}
function ht({ parts: e, printing: t, onPrint: n, testId: r }) {
	return /* @__PURE__ */ Z("ul", {
		className: "rounded-xl ring-1 ring-sq-divider overflow-hidden text-left",
		"data-testid": r,
		children: e.map((e) => /* @__PURE__ */ Q("li", {
			className: "flex items-center gap-3 px-3 min-h-[52px] py-2 border-b border-sq-divider/70 last:border-b-0",
			children: [
				/* @__PURE__ */ Z("span", {
					className: "min-w-0 flex-1 text-[15px]",
					children: P(e)
				}),
				/* @__PURE__ */ Z("span", {
					className: "text-[15px] font-semibold tabular-nums shrink-0",
					children: G(ae(e))
				}),
				C(e) && /* @__PURE__ */ Z("button", {
					type: "button",
					className: "shrink-0 min-h-11 px-2 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue",
					disabled: t,
					onClick: () => n(e.sale),
					"aria-label": `Друкувати: ${P(e)}`,
					children: /* @__PURE__ */ Z(fe, { size: 20 })
				})
			]
		}, e.sale.id))
	});
}
function gt({ customerId: t, customerName: n, customerPhone: i, openLines: a, fiscal: o, onClose: s, onChanged: c }) {
	let l = q((e) => e.auth), h = Re(l?.store.cash_rounding), g = o ? o.on : l?.store.fiscal?.enabled ?? !1, [v, y] = U(a.length), [b, x] = U("cash"), [S, te] = U(""), [re, ie] = U(!1), [se, ue] = U(!1), M = nt(Se("pay", t)), N = Ae(mt(M.replayBody)), [P, ve] = U(() => M.replaying ? xe(dt) : null), [be, F] = U([]), [I, Ce] = U(null), [we, De] = U(null), R = Ae(null), { print: ke, printMany: B, printing: je, status: Me, printablePortal: Ne } = tt();
	V(() => {
		y((e) => Math.min(Math.max(e, 1), a.length));
	}, [a.length]);
	let W = H(() => de(o), [o]), Pe = le(o, l?.store.fiscal?.enabled ?? !1) && !se, Ie = H(() => u(a), [a]), Le = E(a), J = pt(S), Y = H(() => J == null ? null : ge(a, J, {
		method: b,
		step: h,
		partial: Le,
		prepayAllowed: Pe,
		closesAlone: W
	}), [
		a,
		J,
		b,
		h,
		Le,
		Pe,
		W
	]), ze = H(() => D(a.slice(0, v), null, W), [
		a,
		v,
		W
	]), Be = v > 0 ? Ie[v - 1] : 0, Ve = Y ? Y.roundingCents : b === "cash" ? oe(ze, h) : 0, He = Y ? p(Y) : Be + Ve, Ue = P?.unknown === !0 ? N.current : null, We = Ue != null || (Y ? m(Y) : v > 0);
	function Ge(e) {
		te(""), y((t) => Y ? e + 1 : he(t, e));
	}
	async function $(e) {
		R.current = e, De(await Te(Oe(e)));
	}
	async function Ke(t) {
		let n = await Promise.all(t.map((t) => e.sale(t).catch(() => null)));
		F(n.filter((e) => e != null).map((e) => ({
			kind: e.debt_prepayment ? "prepayment" : e.fiscal_chain_id ? "chain_close" : "receipt",
			sale: e,
			fiscal: null
		})));
	}
	async function qe() {
		if (re || !We) return;
		ie(!0), ve(null), F([]);
		let o = Ue ?? {
			...Y ? O(a, Y, b) : {
				line_ids: a.slice(0, v).map((e) => e.id),
				payments: [{
					method: b,
					amount_cents: He
				}]
			},
			cash_rounding: b === "cash" ? h : 0
		};
		N.current = o;
		try {
			let s = await e.pay(t, {
				...o,
				client_uuid: M.current()
			});
			M.answered(), N.current = null, r(s.credit), Ce(s), c();
			let u = f(s), d = u.filter((e) => C(e) && (!g || _e(e)));
			d.length > 0 && (l?.store.auto_print_receipt ?? !1) && B(d.map((e) => e.sale));
			let p = u.find((e) => e.kind === "prepayment")?.sale ?? null;
			if (p?.debt_prepayment && K() && (p.fiscal_status ?? "none") === "none") {
				let e = p.debt_prepayment.line_id, t = a.find((t) => t.id === e), r = s.open_lines.find((t) => t.id === e);
				t && $({
					storeName: l?.store.name ?? "",
					customer: {
						name: n,
						phone: i ?? null
					},
					staffName: l?.staff.display_name ?? "",
					number: p.receipt_number ?? null,
					at: new Date(p.created_at),
					line: r ?? t,
					amountCents: p.total_cents,
					leftCents: r?.owed_cents ?? Math.max(0, t.owed_cents - p.total_cents),
					balanceAfterCents: s.credit.balance_cents
				});
			}
		} catch (e) {
			let t = L(e, "Не вдалося прийняти оплату");
			t.unknown ? (M.unanswered(o), ve({
				...t,
				text: ut
			})) : (M.answered(), N.current = null, ve(t), t.saleIds.length > 0 && (te(""), Ke(t.saleIds))), t.code === "prepay_needs_chain" && ue(!0), t.credit && r(t.credit), t.status != null && t.status !== 400 && c();
		} finally {
			ie(!1);
		}
	}
	if (I) {
		let e = f(I), t = e.find((e) => e.kind === "prepayment")?.sale ?? null, r = e.filter((e) => e.kind !== "prepayment"), i = r.length === 1 ? r[0].sale : null, a = i ? ae(r[0]) : 0, o = e.reduce((e, t) => e + ae(t), 0), c = e.filter(C), l = r.length > 1 || c.length > 1, u = Ee(we);
		return /* @__PURE__ */ Q(z, {
			title: "Оплату прийнято",
			onClose: s,
			testId: "debts-pay-done",
			children: [/* @__PURE__ */ Q("div", {
				className: "space-y-3 text-center",
				children: [
					/* @__PURE__ */ Z("div", {
						className: "mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center",
						children: /* @__PURE__ */ Z(ee, { size: 40 })
					}),
					/* @__PURE__ */ Q("p", {
						className: "text-[15px]",
						"data-testid": "debts-pay-done-text",
						children: [
							/* @__PURE__ */ Z("span", {
								className: "font-semibold",
								children: n
							}),
							" — прийнято",
							" ",
							/* @__PURE__ */ Z("span", {
								className: "font-semibold tabular-nums whitespace-nowrap",
								children: G(o)
							}),
							l && /* @__PURE__ */ Q(X, { children: [
								": ",
								e.length,
								" ",
								j(e.length, "документ", "документи", "документів")
							] }),
							!l && i && !t && i.receipt_number && /* @__PURE__ */ Q(X, { children: [", ", /* @__PURE__ */ Q("span", {
								className: "whitespace-nowrap",
								children: ["чек ", i.receipt_number]
							})] }),
							!l && i && t && /* @__PURE__ */ Q(X, { children: [
								": ",
								/* @__PURE__ */ Q("span", {
									className: "whitespace-nowrap",
									children: ["чек ", i.receipt_number]
								}),
								" на",
								" ",
								/* @__PURE__ */ Z("span", {
									className: "tabular-nums whitespace-nowrap",
									children: G(a)
								}),
								" і внесок",
								" ",
								/* @__PURE__ */ Z("span", {
									className: "tabular-nums whitespace-nowrap",
									children: G(t.total_cents)
								}),
								" на «",
								ft(t),
								"»"
							] }),
							!l && !i && t && /* @__PURE__ */ Q(X, { children: [
								" як внесок на «",
								ft(t),
								"»"
							] }),
							"."
						]
					}),
					l && /* @__PURE__ */ Z(ht, {
						parts: e,
						printing: je,
						onPrint: (e) => void ke(e),
						testId: "debts-pay-parts"
					}),
					/* @__PURE__ */ Z("p", {
						className: "text-[15px] tabular-nums",
						children: pe(I.credit)
					}),
					I.warning && /* @__PURE__ */ Z("p", {
						role: "alert",
						className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left",
						children: I.warning
					}),
					Me && /* @__PURE__ */ Z("p", {
						className: "text-sm text-sq-secondary",
						children: Me
					}),
					u && /* @__PURE__ */ Z("p", {
						className: "text-sm text-sq-secondary",
						"data-testid": "debts-pay-slip",
						children: u
					}),
					/* @__PURE__ */ Q("div", {
						className: "flex flex-wrap gap-2 pt-1",
						children: [
							!l && c.length === 1 && /* @__PURE__ */ Q("button", {
								type: "button",
								className: "sq-btn-quiet flex-1 justify-center",
								disabled: je,
								onClick: () => void ke(c[0].sale),
								children: [/* @__PURE__ */ Z(fe, { size: 20 }), "Друкувати чек"]
							}),
							we && we.kind !== "none" && R.current && /* @__PURE__ */ Q("button", {
								type: "button",
								className: "sq-btn-quiet flex-1 justify-center",
								onClick: () => R.current && void $(R.current),
								children: [/* @__PURE__ */ Z(fe, { size: 20 }), "Квитанція ще раз"]
							}),
							/* @__PURE__ */ Z("button", {
								type: "button",
								className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
								onClick: s,
								children: "Готово"
							})
						]
					})
				]
			}), Ne]
		});
	}
	let Je = Y && (Y.units || Y.prepay) ? Y.wholeCount : -1;
	return /* @__PURE__ */ Z(z, {
		title: "Прийняти оплату",
		onClose: s,
		wide: !0,
		testId: "debts-pay-sheet",
		children: /* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Z("p", {
					className: "text-[13px] text-sq-muted",
					children: Le ? Pe ? "Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари, а решта піде внеском на наступний." : "Торкніться товару, до якого гасити, або впишіть суму від покупця: вона закриє найстаріші товари — цілими або кількома штуками." : "Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити."
				}),
				/* @__PURE__ */ Z("ol", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					"data-testid": "debts-pay-lines",
					children: a.map((e, t) => {
						let n = Y ? t < Y.wholeCount : t < v, r = t === Je, i = A(e), a = ce(e);
						return /* @__PURE__ */ Z("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ Q("button", {
								type: "button",
								"aria-pressed": n ? !0 : r ? "mixed" : !1,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${n || r ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => Ge(t),
								children: [
									/* @__PURE__ */ Q("span", {
										className: `h-6 w-6 shrink-0 rounded-full grid place-items-center ${n ? "bg-sq-blue text-white" : r ? "ring-2 ring-sq-blue text-sq-blue" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: [n && /* @__PURE__ */ Z(ee, { size: 16 }), r && /* @__PURE__ */ Z("span", { className: "h-2.5 w-2.5 rounded-full bg-sq-blue" })]
									}),
									/* @__PURE__ */ Q("span", {
										className: "min-w-0 flex-1",
										children: [
											/* @__PURE__ */ Z("span", {
												className: "block text-[15px] truncate",
												children: k(e)
											}),
											/* @__PURE__ */ Q("span", {
												className: "block text-[13px] text-sq-muted",
												children: [
													new Date(e.created_at).toLocaleDateString("uk-UA"),
													" ·",
													" ",
													T(e.remaining_quantity, e.unit, e.price_per),
													i ? ` · ${i}` : "",
													W(e) ? " · окремим чеком" : ""
												]
											}),
											a && /* @__PURE__ */ Z("span", {
												className: "block text-[13px] text-amber-800",
												"data-testid": "debts-pay-chain-note",
												children: a
											}),
											r && Y && /* @__PURE__ */ Z("span", {
												className: "block text-[13px] font-semibold text-sq-blue tabular-nums",
												"data-testid": "debts-pay-part",
												children: [Y.units ? `зараз ${d(Y.units.quantity, e)}` : null, Y.prepay ? `внесок ${G(Y.prepay.cents)}` : null].filter(Boolean).join(" · ")
											})
										]
									}),
									/* @__PURE__ */ Z("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: G(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ Q("label", {
					className: "block",
					children: [
						/* @__PURE__ */ Z("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Покупець дає, ₴ (необовʼязково)"
						}),
						/* @__PURE__ */ Z("input", {
							className: "pos-field mt-1 w-full",
							inputMode: "decimal",
							value: S,
							placeholder: "Наприклад: 500",
							onChange: (e) => te(e.target.value)
						}),
						Y && /* @__PURE__ */ Z("span", {
							className: "mt-1 block space-y-0.5 text-[13px] text-sq-secondary tabular-nums",
							"data-testid": "debts-pay-offer",
							children: w(Y, a, o).map((e) => /* @__PURE__ */ Z("span", {
								className: "block",
								children: e
							}, e))
						})
					]
				}),
				/* @__PURE__ */ Z(ye, {
					value: b,
					onChange: x,
					ariaLabel: "Чим платить",
					className: "w-full",
					options: [{
						value: "cash",
						label: /* @__PURE__ */ Q("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Z(_, { size: 20 }), "Готівка"]
						})
					}, {
						value: "card",
						label: /* @__PURE__ */ Q("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Z(ne, { size: 20 }), "Картка"]
						})
					}]
				}),
				/* @__PURE__ */ Q("dl", {
					className: "space-y-1 text-[15px] tabular-nums",
					children: [
						Y ? /* @__PURE__ */ Q(X, { children: [Y.wholeCount > 0 && /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Z("dt", {
								className: "text-sq-secondary",
								children: me(Y.wholeCount)
							}), /* @__PURE__ */ Z("dd", { children: G(Y.wholeCents) })]
						}), Y.units && /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Q("dt", {
								className: "text-sq-secondary min-w-0 truncate",
								children: [
									k(Y.units.line),
									" — ",
									d(Y.units.quantity, Y.units.line)
								]
							}), /* @__PURE__ */ Z("dd", { children: G(Y.units.cents) })]
						})] }) : /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Z("dt", {
								className: "text-sq-secondary",
								children: me(v)
							}), /* @__PURE__ */ Z("dd", { children: G(Be) })]
						}),
						Ve !== 0 && /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3 text-sq-secondary",
							children: [/* @__PURE__ */ Z("dt", { children: "Заокруглення готівки" }), /* @__PURE__ */ Z("dd", { children: Fe(Ve) })]
						}),
						Y?.prepay && /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Q("dt", {
								className: "text-sq-secondary min-w-0 truncate",
								children: [
									"Внесок на «",
									k(Y.prepay.line),
									"»"
								]
							}), /* @__PURE__ */ Z("dd", { children: G(Y.prepay.cents) })]
						}),
						/* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3 text-[17px] font-bold text-sq-heading",
							children: [/* @__PURE__ */ Z("dt", { children: "До сплати" }), /* @__PURE__ */ Z("dd", {
								"data-testid": "debts-pay-due",
								children: G(He)
							})]
						})
					]
				}),
				P && /* @__PURE__ */ Q("div", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm space-y-2",
					"data-testid": "debts-pay-error",
					children: [/* @__PURE__ */ Z("p", { children: P.text }), be.length > 0 && /* @__PURE__ */ Z(ht, {
						parts: be,
						printing: je,
						onPrint: (e) => void ke(e),
						testId: "debts-pay-through"
					})]
				}),
				/* @__PURE__ */ Z("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: re || !We,
					onClick: () => void qe(),
					children: re ? "Проводжу…" : P?.unknown ? "Перевірити ще раз" : `Прийняти ${G(He)}`
				}),
				Ne
			]
		})
	});
}
// src/modules/debts/components/ReturnSheet.tsx
var _t = "Немає відповіді від сервера — повернення могло пройти. Натисніть ще раз: удруге воно не запишеться.", vt = "Попереднє повернення лишилося без відповіді — воно могло пройти. Оберіть товар і натисніть ще раз: удруге воно не запишеться.", yt = "Це повернення вже було записано — удруге не записано. Виписку оновлено.";
function bt({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = U({}), [c, l] = U(""), [u, d] = U(!1), f = nt(Se("return", t)), [p, m] = U(() => f.replaying ? vt : null), _ = n.filter((e) => (o[e.id] ?? 0) > 0 && !v(e)), y = H(() => n.reduce((e, t) => e + h(t, o[t.id] ?? 0), 0), [n, o]);
	function S(e, t) {
		let n = Math.max(0, Math.min(e.remaining_quantity, Math.round(t)));
		s((t) => ({
			...t,
			[e.id]: n
		}));
	}
	async function C() {
		if (!(u || _.length === 0)) {
			d(!0), m(null);
			try {
				let n = await e.returnGoods(t, {
					lines: _.map((e) => ({
						line_id: e.id,
						quantity: o[e.id]
					})),
					client_uuid: f.current(),
					...c.trim() ? { reason: c.trim() } : {}
				});
				f.answered(), r(n.credit), K() && Pe.refreshCatalog().catch(() => void 0), a(), n.replay ? (s({}), m(yt)) : i();
			} catch (e) {
				let t = L(e, "Не вдалося повернути товар");
				t.unknown ? (f.unanswered(), m(_t)) : (f.answered(), m(t.text)), t.code === "stale_statement" && a();
			} finally {
				d(!1);
			}
		}
	}
	return /* @__PURE__ */ Z(z, {
		title: "Повернути товар",
		onClose: i,
		wide: !0,
		testId: "debts-return-sheet",
		children: /* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Z("p", {
					className: "text-[13px] text-sq-muted",
					children: "Товар, за який ще не заплатили, повертається на полицю, а борг зменшується на його вартість."
				}),
				/* @__PURE__ */ Z("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o[e.id] ?? 0, n = e.unit === "" || e.unit === "шт";
						return /* @__PURE__ */ Q("li", {
							className: "border-b border-sq-divider/70 last:border-b-0 px-3 py-2.5 space-y-2",
							children: [/* @__PURE__ */ Q("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ Q("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ Z("span", {
										className: "block text-[15px]",
										children: k(e)
									}), /* @__PURE__ */ Q("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											"винно за ",
											T(e.remaining_quantity, e.unit, e.price_per),
											" · ",
											G(e.owed_cents),
											A(e) ? ` (${A(e)})` : ""
										]
									})]
								}), t > 0 && /* @__PURE__ */ Q("span", {
									className: "text-[15px] font-semibold tabular-nums shrink-0",
									children: ["−", G(h(e, t))]
								})]
							}), v(e) ? /* @__PURE__ */ Q("p", {
								className: "text-[13px] text-sq-muted",
								"data-testid": "debts-return-prepaid",
								children: [
									"На цей товар уже внесено ",
									G(e.prepaid_cents ?? 0),
									" — щоб його повернути, спершу скасуйте внески в журналі виписки (гроші — покупцеві) або прийміть решту оплати"
								]
							}) : /* @__PURE__ */ Q("div", {
								className: "flex items-center gap-2",
								children: [x(e) ? /* @__PURE__ */ Z("span", {
									className: "text-[13px] text-sq-muted",
									"data-testid": "debts-return-whole",
									children: "Ваговий товар повертається цілим рядком"
								}) : n ? /* @__PURE__ */ Q(X, { children: [
									/* @__PURE__ */ Z("button", {
										type: "button",
										"aria-label": "Менше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => S(e, t - 1),
										children: /* @__PURE__ */ Z(g, { size: 20 })
									}),
									/* @__PURE__ */ Z("span", {
										className: "w-10 text-center text-[17px] font-semibold tabular-nums",
										children: t
									}),
									/* @__PURE__ */ Z("button", {
										type: "button",
										"aria-label": "Більше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => S(e, t + 1),
										children: /* @__PURE__ */ Z(b, { size: 20 })
									})
								] }) : /* @__PURE__ */ Z("input", {
									className: "pos-field w-32",
									inputMode: "numeric",
									"aria-label": `Скільки повернути, ${e.unit}`,
									value: t === 0 ? "" : String(t),
									placeholder: `0 ${e.unit}`,
									onChange: (t) => S(e, Number(t.target.value.replace(/\D/g, "")) || 0)
								}), /* @__PURE__ */ Z("button", {
									type: "button",
									className: "ml-auto text-[15px] font-semibold text-sq-blue",
									onClick: () => S(e, t === e.remaining_quantity ? 0 : e.remaining_quantity),
									children: t === e.remaining_quantity ? "Скинути" : "Усе"
								})]
							})]
						}, e.id);
					})
				}),
				/* @__PURE__ */ Q("label", {
					className: "block",
					children: [/* @__PURE__ */ Z("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Причина (необовʼязково)"
					}), /* @__PURE__ */ Z("input", {
						className: "pos-field mt-1 w-full",
						value: c,
						maxLength: 200,
						placeholder: "Наприклад: не підійшов розмір",
						onChange: (e) => l(e.target.value)
					})]
				}),
				p && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: p
				}),
				/* @__PURE__ */ Z("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: u || _.length === 0,
					onClick: () => void C(),
					children: u ? "Повертаю…" : _.length === 0 ? "Оберіть, що повертається" : `Повернути на ${G(y)}`
				})
			]
		})
	});
}
// src/modules/debts/components/UndoPrepaySheet.tsx
function xt({ entry: t, line: n, onClose: r, onChanged: i }) {
	let [a, o] = U(!1), [s, c] = U(null), l = Math.abs(t.amount_cents);
	async function u() {
		if (!(a || t.sale_id == null)) {
			o(!0), c(null);
			try {
				await e.voidPrepayment(t.sale_id), i(), r();
			} catch (e) {
				c(L(e, "Не вдалося скасувати внесок").text), i();
			} finally {
				o(!1);
			}
		}
	}
	return /* @__PURE__ */ Z(z, {
		title: "Скасувати внесок?",
		onClose: r,
		testId: "debts-undo-prepay",
		children: /* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Q("p", {
					className: "text-[15px]",
					children: [
						"Поверніть покупцеві ",
						/* @__PURE__ */ Z("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: G(l)
						}),
						t.receipt_number ? ` (внесок № ${t.receipt_number})` : "",
						". Ця сума знову стане боргом за «",
						k(n),
						"»."
					]
				}),
				t.fiscal_status === "failed" && /* @__PURE__ */ Z("p", {
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-undo-unregistered",
					children: "Цей внесок не вдалося зареєструвати в ПРРО. Скасовуйте його, лише якщо в кабінеті Checkbox такого чека передплати немає — інакше чек залишиться в податковій, а гроші підуть покупцеві."
				}),
				s && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: s
				}),
				/* @__PURE__ */ Q("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ Z("button", {
						type: "button",
						className: "sq-btn-quiet flex-1 justify-center min-h-[48px]",
						onClick: r,
						children: "Ні"
					}), /* @__PURE__ */ Z("button", {
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
var St = 3, Ct = "Немає відповіді від сервера — списання могло пройти. Натисніть ще раз: удруге воно не запишеться.", wt = "Попереднє списання лишилося без відповіді — воно могло пройти. Натисніть ще раз: удруге воно не запишеться.", Tt = "Це списання вже було записано — удруге не записано. Виписку оновлено.";
function Et({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = U(() => new Set(n.map((e) => e.id))), [c, l] = U(""), [u, d] = U(!1), f = nt(Se("writeoff", t)), [p, m] = U(() => f.replaying ? wt : null), h = H(() => n.filter((e) => o.has(e.id)).reduce((e, t) => e + t.owed_cents, 0), [n, o]), g = c.trim().length >= St;
	function _(e) {
		s((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	async function v() {
		if (!u && o.size !== 0 && g) {
			d(!0), m(null);
			try {
				let s = await e.writeOff(t, {
					line_ids: n.filter((e) => o.has(e.id)).map((e) => e.id),
					reason: c.trim(),
					client_uuid: f.current()
				});
				f.answered(), r(s.credit), a(), s.replay ? m(Tt) : i();
			} catch (e) {
				let t = L(e, "Не вдалося списати борг");
				t.unknown ? (f.unanswered(), m(Ct)) : (f.answered(), m(t.text)), t.code === "stale_statement" && a();
			} finally {
				d(!1);
			}
		}
	}
	return /* @__PURE__ */ Z(z, {
		title: "Списати борг",
		onClose: i,
		wide: !0,
		testId: "debts-writeoff-sheet",
		children: /* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Z("p", {
					className: "text-[13px] text-sq-muted",
					children: "Борг за обраними товарами закривається без грошей і без чека. Товар не повертається на полицю."
				}),
				/* @__PURE__ */ Z("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o.has(e.id);
						return /* @__PURE__ */ Z("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ Q("button", {
								type: "button",
								"aria-pressed": t,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${t ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => _(e.id),
								children: [
									/* @__PURE__ */ Z("span", {
										className: `h-6 w-6 shrink-0 rounded-md grid place-items-center ${t ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: t && /* @__PURE__ */ Z(ee, { size: 16 })
									}),
									/* @__PURE__ */ Q("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ Z("span", {
											className: "block text-[15px] truncate",
											children: k(e)
										}), /* @__PURE__ */ Z("span", {
											className: "block text-[13px] text-sq-muted",
											children: T(e.remaining_quantity, e.unit, e.price_per)
										})]
									}),
									/* @__PURE__ */ Z("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: G(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ Q("label", {
					className: "block",
					children: [
						/* @__PURE__ */ Z("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Причина"
						}),
						/* @__PURE__ */ Z("input", {
							className: "pos-field mt-1 w-full",
							value: c,
							maxLength: 200,
							placeholder: "Наприклад: покупець виїхав, борг безнадійний",
							onChange: (e) => l(e.target.value)
						}),
						!g && c.length > 0 && /* @__PURE__ */ Q("span", {
							className: "mt-1 block text-[13px] text-sq-muted",
							children: [
								"Щонайменше ",
								St,
								" символи"
							]
						})
					]
				}),
				p && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: p
				}),
				/* @__PURE__ */ Z("button", {
					type: "button",
					className: "w-full min-h-[52px] rounded-xl text-[17px] font-semibold tabular-nums bg-red-600 text-white disabled:opacity-50",
					disabled: u || o.size === 0 || !g,
					onClick: () => void v(),
					children: u ? "Списую…" : `Списати ${G(h)}`
				})
			]
		})
	});
}
// src/modules/debts/pages/StatementPage.tsx
function Dt({ frame: t }) {
	let { customerId: n } = He(), i = Number(n), a = J((e) => e.online), o = K(), s = a && (!o || Me.hasLiveJwt()), c = q((e) => e.auth?.staff.role ?? null) === "owner", l = We(Number.isInteger(i) ? i : void 0), [u, d] = U(null), [f, p] = U(null), [m, h] = U(0), [g, _] = U(null), [v, y] = U(null), [b, x] = U(null), S = B(() => h((e) => e + 1), []);
	Ge(l, S), V(() => {
		if (!s || !Number.isInteger(i) || i <= 0) return;
		let t = !0;
		return e.statement(i).then((e) => {
			t && (d(e), p(null), r(e.credit, e.customer));
		}).catch((e) => {
			t && p(L(e, "Не вдалося прочитати виписку").text);
		}), () => {
			t = !1;
		};
	}, [
		i,
		s,
		m
	]);
	let C = /* @__PURE__ */ Q(ze, {
		to: "..",
		relative: "path",
		className: "-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue",
		children: [/* @__PURE__ */ Z(te, {
			size: 20,
			"aria-hidden": !0
		}), "Борги"]
	});
	if (!s) return /* @__PURE__ */ Q($, {
		frame: t,
		children: [
			C,
			/* @__PURE__ */ Z("div", {
				className: "mt-3",
				children: /* @__PURE__ */ Z(Je, {
					rows: l,
					showCustomer: !1
				})
			}),
			/* @__PURE__ */ Q("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Z("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Z("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			})
		]
	});
	if (!u) return /* @__PURE__ */ Q($, {
		frame: t,
		children: [C, /* @__PURE__ */ Z("p", {
			className: `mt-3 text-sm ${f ? "text-red-600" : "text-sq-muted"}`,
			children: f ?? "Завантаження…"
		})]
	});
	let { customer: w, credit: E, open_lines: D, entries: O } = u, ee = D.reduce((e, t) => e + t.owed_cents, 0), ne = ve(O, D, { owner: c });
	return /* @__PURE__ */ Q($, {
		frame: t,
		children: [
			C,
			/* @__PURE__ */ Q("header", {
				className: "mt-2 mb-5 space-y-1",
				children: [
					/* @__PURE__ */ Z("h2", {
						className: "text-[28px] font-bold text-sq-heading leading-tight",
						children: w.name
					}),
					w.phone && /* @__PURE__ */ Z("p", {
						className: "text-[15px] text-sq-muted",
						children: w.phone
					}),
					/* @__PURE__ */ Z("p", {
						className: "text-[17px] tabular-nums",
						"data-testid": "debts-statement-credit",
						children: E.limit_cents == null && E.balance_cents === 0 ? "Під запис не дозволено" : pe(E)
					}),
					u.oldest_open_at && /* @__PURE__ */ Q("p", {
						className: "text-[13px] text-sq-muted",
						children: ["Найстаріший борг — ", M(u.oldest_open_at)]
					})
				]
			}),
			f && /* @__PURE__ */ Z("p", {
				className: "mb-3 text-sm text-red-600",
				children: f
			}),
			/* @__PURE__ */ Z(Je, {
				rows: l,
				showCustomer: !1
			}),
			D.length > 0 && /* @__PURE__ */ Q("div", {
				className: "flex flex-wrap gap-2 mb-6",
				children: [
					/* @__PURE__ */ Z("button", {
						type: "button",
						className: "pos-btn-primary min-h-[48px] px-5 rounded-xl text-[16px]",
						onClick: () => _("pay"),
						children: "Прийняти оплату"
					}),
					/* @__PURE__ */ Z("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px]",
						onClick: () => _("return"),
						children: "Повернути товар"
					}),
					c && /* @__PURE__ */ Z("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px] text-red-600",
						onClick: () => _("writeoff"),
						children: "Списати"
					})
				]
			}),
			/* @__PURE__ */ Q("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ Z(F, {
					title: "Винно",
					count: D.length,
					action: D.length > 0 ? /* @__PURE__ */ Z("span", {
						className: "tabular-nums",
						children: G(ee)
					}) : void 0
				}), D.length === 0 ? /* @__PURE__ */ Z("p", {
					className: "py-4 text-[15px] text-sq-secondary",
					children: "Нічого не винно."
				}) : /* @__PURE__ */ Z("ul", {
					"data-testid": "debts-open-lines",
					children: D.map((e) => /* @__PURE__ */ Q("li", {
						className: "sq-row",
						children: [/* @__PURE__ */ Q("div", {
							className: "flex items-center gap-3 w-full min-h-[52px] py-2",
							children: [/* @__PURE__ */ Q("span", {
								className: "min-w-0 flex-1",
								children: [
									/* @__PURE__ */ Z("span", {
										className: "block text-[15px] truncate",
										children: k(e)
									}),
									/* @__PURE__ */ Q("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											new Date(e.created_at).toLocaleDateString("uk-UA"),
											" ·",
											" ",
											T(e.remaining_quantity, e.unit, e.price_per),
											A(e) ? ` (${A(e)})` : "",
											e.note ? ` · ${e.note}` : ""
										]
									}),
									ce(e) && /* @__PURE__ */ Z("span", {
										className: "block text-[13px] text-amber-800",
										children: ce(e)
									})
								]
							}), /* @__PURE__ */ Z("span", {
								className: "text-[15px] font-semibold tabular-nums shrink-0",
								children: G(e.owed_cents)
							})]
						}), (() => {
							let t = N(e, u.fiscal);
							return t ? /* @__PURE__ */ Q("button", {
								type: "button",
								className: "-mt-1 mb-1 min-h-11 text-[15px] font-semibold text-sq-blue",
								"data-testid": `debts-cancel-prepayments-${e.id}`,
								onClick: () => x({
									mode: "cancel",
									lineId: e.id,
									title: k(e),
									count: t.count,
									cents: t.cents
								}),
								children: [
									"Скасувати внески (",
									t.count,
									")"
								]
							}) : null;
						})()]
					}, e.id))
				})]
			}),
			c && /* @__PURE__ */ Q("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ Z(F, { title: "Ліміт" }), /* @__PURE__ */ Z("div", {
					className: "pt-3",
					children: /* @__PURE__ */ Z(I, {
						credit: E,
						touch: t === "till"
					})
				})]
			}),
			/* @__PURE__ */ Q("section", { children: [/* @__PURE__ */ Z(F, {
				title: "Журнал",
				count: O.length
			}), O.length === 0 ? /* @__PURE__ */ Z("p", {
				className: "py-4 text-[15px] text-sq-secondary",
				children: "Ще нічого не записано."
			}) : /* @__PURE__ */ Z("ul", {
				"data-testid": "debts-journal",
				children: O.map((e) => /* @__PURE__ */ Z("li", {
					className: "sq-row",
					children: /* @__PURE__ */ Q("div", {
						className: "flex items-center gap-3 w-full min-h-[52px] py-2",
						children: [
							/* @__PURE__ */ Q("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ Q("span", {
									className: "block text-[15px]",
									children: [ue(e), e.receipt_number ? ` · ${e.prepayment ? "№" : "чек"} ${e.receipt_number}` : ""]
								}), /* @__PURE__ */ Q("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										new Date(e.created_at).toLocaleString("uk-UA"),
										e.staff_name ? ` · ${e.staff_name}` : "",
										e.offline ? " · без мережі" : "",
										e.reason ? ` · ${e.reason}` : ""
									]
								})]
							}),
							/* @__PURE__ */ Z("span", {
								className: `text-[15px] font-semibold tabular-nums shrink-0 ${e.amount_cents > 0 ? "text-sq-heading" : "text-sq-success-ink"}`,
								children: Fe(e.amount_cents)
							}),
							ie(e, u.fiscal) && /* @__PURE__ */ Z("button", {
								type: "button",
								className: "shrink-0 min-h-11 px-2 text-[15px] font-semibold text-sq-blue",
								"data-testid": `debts-chain-return-${e.id}`,
								onClick: () => {
									let t = ie(e, u.fiscal);
									t && x({
										mode: "goods",
										lineId: t.line_id,
										title: k(t),
										count: t.documents,
										cents: t.back_cents
									});
								},
								children: "Повернути товар"
							}),
							ne.has(e.id) && /* @__PURE__ */ Z("button", {
								type: "button",
								className: "shrink-0 min-h-11 px-2 text-[15px] font-semibold text-sq-blue",
								onClick: () => {
									let t = D.find((t) => t.id === e.prepay_line_id);
									t && y({
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
			g === "pay" && /* @__PURE__ */ Z(gt, {
				customerId: w.id,
				customerName: w.name,
				customerPhone: w.phone,
				openLines: D,
				fiscal: u.fiscal,
				onClose: () => _(null),
				onChanged: S
			}),
			g === "return" && /* @__PURE__ */ Z(bt, {
				customerId: w.id,
				openLines: D,
				onClose: () => _(null),
				onChanged: S
			}),
			v && /* @__PURE__ */ Z(xt, {
				entry: v.entry,
				line: v.line,
				onClose: () => y(null),
				onChanged: S
			}),
			b && /* @__PURE__ */ Z(lt, {
				mode: b.mode,
				customerId: w.id,
				lineId: b.lineId,
				title: b.title,
				count: b.count,
				cents: b.cents,
				onClose: () => x(null),
				onChanged: S
			}),
			g === "writeoff" && c && /* @__PURE__ */ Z(Et, {
				customerId: w.id,
				openLines: D,
				onClose: () => _(null),
				onChanged: S
			})
		]
	});
}
// src/modules/debts/pages/DebtsRoutes.tsx
function Ot({ frame: e = "till" }) {
	return /* @__PURE__ */ Q(Ve, { children: [/* @__PURE__ */ Z(Be, {
		index: !0,
		element: /* @__PURE__ */ Z(Xe, { frame: e })
	}), /* @__PURE__ */ Z(Be, {
		path: ":customerId",
		element: /* @__PURE__ */ Z(Dt, { frame: e })
	})] });
}
export { Ot as DebtsRoutes };
