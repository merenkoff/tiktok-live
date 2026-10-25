import { t as e } from "./debtsApi-DhkvGjzT.js";
import { a as t, c as n, f as r, g as i, h as a, i as o, s, t as c } from "./queue-B9HzuKEV.js";
import { n as l } from "./sync-D_cQhPeR.js";
import { C as u, E as d, S as f, T as p, _ as m, a as h, b as g, d as _, f as v, g as y, h as b, i as x, m as S, o as C, p as w, r as T, t as E, u as D, v as O, w as k, x as A, y as j } from "./debt-GvG7YbfE.js";
import { i as ee, n as te, r as M, t as ne } from "./LimitEditor-DQT-ymu2.js";
import { n as re, t as N } from "./errors-CLut7Fii.js";
import { a as P, i as ie, n as F, o as ae, t as I } from "./Sheet-Bm236lA5.js";
import { useCallback as L, useEffect as R, useMemo as z, useRef as B, useState as V } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as H, api as U, buildReceiptPayload as W, cashRoundingDelta as oe, cashierApi as se, formatSignedUah as ce, formatUah as G, getMeta as le, isOfflinePosEnabled as K, printReceipt as ue, storeCashRounding as de, useAuthStore as q, useOfflineStatus as J, usePrintableReceipt as fe } from "@pos/platform";
import { Fragment as Y, jsx as X, jsxs as Z } from "react/jsx-runtime";
import { Link as pe, Route as me, Routes as he, useParams as ge } from "react-router-dom";
// src/modules/debts/lib/useQueue.ts
var _e = [];
function ve(e) {
	let t = q((e) => e.auth?.store.id ?? null), n = K(), [r, i] = V(_e);
	return R(() => {
		if (!n || t == null) {
			i(_e);
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
function ye(e, t) {
	let n = B(new Set(e.map((e) => e.id)));
	R(() => {
		let r = new Set(e.map((e) => e.id)), i = [...n.current].some((e) => !r.has(e));
		n.current = r, i && t();
	}, [e, t]);
}
// src/modules/debts/components/Frame.tsx
function Q({ frame: e, children: t }) {
	return e === "admin" ? /* @__PURE__ */ X("div", {
		className: "max-w-4xl text-sq-text",
		children: t
	}) : /* @__PURE__ */ X("div", {
		className: "flex-1 min-h-0 overflow-auto bg-sq-bg text-sq-text",
		children: /* @__PURE__ */ X("div", {
			className: "mx-auto max-w-3xl px-4 md:px-7 py-5 pb-10",
			children: t
		})
	});
}
// src/modules/debts/lib/queueText.ts
function be(e) {
	if (e.status === "queued") return "Чекає мережі";
	let t = e.lastError?.trim() || "невідома помилка";
	return e.status === "error" ? `Не вдалося надіслати: ${t}. Каса спробує ще раз сама.` : e.deadReason === "attempts_exhausted" ? `Не вдалося надіслати після ${e.attempts} ${S(e.attempts, "спроби", "спроб", "спроб")}: ${t}` : `Сервер не прийняв: ${t}`;
}
function xe(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
// src/modules/debts/components/QueuePanel.tsx
function Se({ rows: e, showCustomer: t = !0 }) {
	let r = J((e) => e.online), [i, a] = V(!1), [o, s] = V(null);
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
	return /* @__PURE__ */ Z("section", {
		className: "rounded-card bg-white ring-1 ring-amber-200 p-4 mb-5",
		"data-testid": "debts-queue",
		children: [
			/* @__PURE__ */ X(M, {
				title: "Записано без мережі",
				count: e.length,
				action: r && u > 0 ? /* @__PURE__ */ X("button", {
					type: "button",
					className: "font-semibold text-sq-blue disabled:opacity-50",
					disabled: i,
					onClick: () => void d(),
					children: i ? "Надсилаю…" : "Надіслати зараз"
				}) : void 0
			}),
			/* @__PURE__ */ X("p", {
				className: "mt-1 text-[13px] text-sq-muted",
				children: "Товар уже в покупця. Ці записи підуть на сервер, щойно буде звʼязок, — до того їх видно лише на цій касі."
			}),
			/* @__PURE__ */ X("ul", {
				className: "mt-2",
				children: e.map((e) => /* @__PURE__ */ Z("li", {
					className: "sq-row",
					"data-testid": "debts-queue-row",
					children: [/* @__PURE__ */ Z("div", {
						className: "flex items-start gap-3 w-full py-2",
						children: [/* @__PURE__ */ Z("span", {
							className: "min-w-0 flex-1",
							children: [
								t && /* @__PURE__ */ X("span", {
									className: "block text-[15px] font-semibold truncate",
									children: e.customerName
								}),
								/* @__PURE__ */ Z("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										xe(e.createdAt),
										" · ",
										h(e.lines.length),
										e.note ? ` · ${e.note}` : ""
									]
								}),
								/* @__PURE__ */ X("span", {
									className: `block text-[13px] ${e.status === "dead" ? "text-red-600" : "text-sq-muted"}`,
									children: be(e)
								})
							]
						}), /* @__PURE__ */ X("span", {
							className: "text-[15px] font-semibold tabular-nums shrink-0",
							children: G(e.totalCents)
						})]
					}), e.status === "dead" && /* @__PURE__ */ X("div", {
						className: "flex flex-wrap items-center gap-2 pb-3",
						children: o === e.id ? /* @__PURE__ */ Z(Y, { children: [
							/* @__PURE__ */ X("span", {
								className: "w-full text-[13px] text-red-700",
								children: "Запис зникне з каси й не потрапить на сервер, а товар уже в покупця. Прибрати?"
							}),
							/* @__PURE__ */ X("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px] text-red-600",
								onClick: () => void p(e.id),
								children: "Так, прибрати"
							}),
							/* @__PURE__ */ X("button", {
								type: "button",
								className: "sq-btn-quiet min-h-[40px]",
								onClick: () => s(null),
								children: "Ні"
							})
						] }) : /* @__PURE__ */ Z(Y, { children: [/* @__PURE__ */ X("button", {
							type: "button",
							className: "sq-btn-quiet min-h-[40px]",
							onClick: () => void f(e.id),
							children: "Надіслати ще раз"
						}), /* @__PURE__ */ X("button", {
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
function Ce(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function we({ frame: n }) {
	let r = J((e) => e.online), s = q((e) => e.auth?.store.id ?? null), c = K(), l = r && (!c || U.hasLiveJwt()), u = ve(), [f, p] = V("owing"), [m, h] = V(null), [g, _] = V(null), [y, b] = V(null), [x, C] = V(""), [w, T] = V(0);
	ye(u, L(() => T((e) => e + 1), [])), R(() => {
		if (!l) return;
		let t = !0;
		return b(null), e.debtors(f === "all").then((e) => {
			t && h(e.debtors);
		}).catch((e) => {
			t && b(N(e, "Не вдалося прочитати борги").text);
		}), () => {
			t = !1;
		};
	}, [
		f,
		l,
		w
	]), R(() => {
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
	let E = !l && c, D = E ? g?.rows ?? null : m, O = z(() => (D ?? []).filter((e) => (!E || f === "all" || e.balance_cents > 0) && v(e, x)), [
		D,
		E,
		f,
		x
	]), k = (D ?? []).filter((e) => e.balance_cents > 0), A = k.reduce((e, t) => e + t.balance_cents, 0);
	return /* @__PURE__ */ Z(Q, {
		frame: n,
		children: [
			/* @__PURE__ */ X(te, {
				glyph: d,
				title: "Борги",
				subtitle: "Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
			}),
			/* @__PURE__ */ X(Se, { rows: u }),
			!l && !c ? /* @__PURE__ */ Z("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ X("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ X("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			}) : E && g && g.filledAt == null ? /* @__PURE__ */ Z("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ X("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ X("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Каса ще жодного разу не отримала список боргів — він зʼявиться після першого сеансу з мережею."
				})]
			}) : /* @__PURE__ */ Z("div", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ Z("div", {
						className: "flex flex-wrap items-center gap-3",
						children: [/* @__PURE__ */ X(ee, {
							value: f,
							onChange: p,
							ariaLabel: "Кого показати",
							options: [{
								value: "owing",
								label: "Винні"
							}, {
								value: "all",
								label: "Усі з лімітом"
							}]
						}), /* @__PURE__ */ X("input", {
							className: `${n === "admin" ? "sq-input" : "pos-field"} min-w-[12rem] flex-1`,
							value: x,
							placeholder: "Імʼя або телефон",
							"aria-label": "Пошук покупця",
							onChange: (e) => C(e.target.value)
						})]
					}),
					E && g?.filledAt != null && /* @__PURE__ */ Z("p", {
						className: "text-[13px] text-amber-800",
						"data-testid": "debts-mirror-note",
						children: [
							"Без мережі — за даними каси на ",
							Ce(g.filledAt),
							", разом із записаним без мережі. Виписку відкриє мережа."
						]
					}),
					D && k.length > 0 && /* @__PURE__ */ Z("p", {
						className: "text-[15px] text-sq-secondary tabular-nums",
						"data-testid": "debts-total",
						children: [
							"Разом винні ",
							/* @__PURE__ */ X("span", {
								className: "font-semibold text-sq-heading",
								children: G(A)
							}),
							" ·",
							" ",
							k.length,
							" ",
							S(k.length, "покупець", "покупці", "покупців")
						]
					}),
					y && !E && /* @__PURE__ */ X("p", {
						className: "text-sm text-red-600",
						children: y
					}),
					!D && !(y && !E) && /* @__PURE__ */ X("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					D && O.length === 0 && /* @__PURE__ */ X("div", {
						className: "sq-card p-6 text-center text-[15px] text-sq-secondary",
						children: x ? "Нікого не знайдено" : f === "owing" ? "Ніхто нічого не винен." : "Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця."
					}),
					O.length > 0 && /* @__PURE__ */ X("ul", {
						className: "rounded-card bg-white shadow-card overflow-hidden",
						"data-testid": "debtors",
						children: O.map((e) => /* @__PURE__ */ X("li", {
							className: "sq-row last:shadow-none",
							children: E ? /* @__PURE__ */ X("div", {
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5",
								children: /* @__PURE__ */ X(Te, { row: e })
							}) : /* @__PURE__ */ X(pe, {
								to: String(e.customer_id),
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60",
								children: /* @__PURE__ */ X(Te, { row: e })
							})
						}, e.customer_id))
					})
				]
			})
		]
	});
}
function Te({ row: e }) {
	let t = C(e);
	return /* @__PURE__ */ Z(Y, { children: [/* @__PURE__ */ Z("span", {
		className: "min-w-0 flex-1",
		children: [/* @__PURE__ */ X("span", {
			className: "block text-[16px] font-semibold truncate",
			children: e.name
		}), /* @__PURE__ */ Z("span", {
			className: "block text-[13px] text-sq-muted truncate",
			children: [[e.phone, e.locked ? "записи заблоковано" : null].filter(Boolean).join(" · "), t && /* @__PURE__ */ Z("span", {
				className: "text-amber-800",
				"data-testid": "debtor-over-limit",
				children: [e.phone || e.locked ? " · " : "", "понад ліміт"]
			})]
		})]
	}), /* @__PURE__ */ Z("span", {
		className: "text-right shrink-0",
		children: [/* @__PURE__ */ X("span", {
			className: "block text-[16px] font-semibold tabular-nums",
			children: G(e.balance_cents)
		}), /* @__PURE__ */ X("span", {
			className: "block text-[13px] text-sq-muted",
			children: e.oldest_open_at ? `${h(e.open_lines)} · ${T(e.oldest_open_at)}` : e.limit_cents == null ? "" : `ліміт ${G(e.limit_cents)}`
		})]
	})] });
}
// src/modules/debts/lib/useReceiptPrint.tsx
function Ee() {
	let e = q((e) => e.auth), { printToPdf: t, printablePortal: n } = fe(), [r, i] = V(!1), [a, o] = V(null);
	return {
		print: L(async (n) => {
			let r = W(n, {
				name: e?.store.name ?? "",
				fiscal: e?.store.fiscal ?? null,
				vertical: e?.store.vertical?.id ?? null
			}), [a, s] = await Promise.all([le("receiptPrinterName"), le("receiptPaperWidthMm")]);
			if (!a) t(r);
			else {
				i(!0), o(null);
				try {
					await ue(a, r, s === 58 || s === 80 ? s : H), o("Чек надіслано на друк");
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
function $(e) {
	let [t] = V(() => {
		let t = ae(e);
		return {
			key: t ?? crypto.randomUUID(),
			replaying: t != null
		};
	}), n = B(t.key);
	return {
		current: () => n.current,
		replaying: t.replaying,
		unanswered: () => ie(e, n.current),
		answered: () => {
			P(e), n.current = crypto.randomUUID();
		}
	};
}
// src/modules/debts/components/PaySheet.tsx
var De = "Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.", Oe = "Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.";
function ke({ customerId: t, customerName: n, openLines: i, onClose: a, onChanged: o }) {
	let s = q((e) => e.auth), c = de(s?.store.cash_rounding), [l, u] = V(i.length), [d, m] = V("cash"), [v, S] = V(""), [C, T] = V(!1), E = $(F("pay", t)), [O, k] = V(() => E.replaying ? re(Oe) : null), [j, te] = V(null), { print: M, printing: ne, status: P, printablePortal: ie } = Ee();
	R(() => {
		u((e) => Math.min(Math.max(e, 1), i.length));
	}, [i.length]);
	let ae = z(() => b(i), [i]), L = l > 0 ? ae[l - 1] : 0, B = d === "cash" ? oe(L, c) : 0, H = L + B, U = (() => {
		let e = v.replace(/\s/g, "").replace(",", "."), t = Number(e);
		return e && Number.isFinite(t) && t > 0 ? Math.round(t * 100) : null;
	})(), W = U == null ? null : _(i, U);
	async function se() {
		if (!(C || l === 0)) {
			T(!0), k(null);
			try {
				let n = await e.pay(t, {
					line_ids: i.slice(0, l).map((e) => e.id),
					payments: [{
						method: d,
						amount_cents: H
					}],
					client_uuid: E.current(),
					cash_rounding: d === "cash" ? c : 0
				});
				E.answered(), r(n.credit), te(n), o();
				let a = s?.store.fiscal?.enabled ?? !1, u = (n.fiscal ?? n.sale.fiscal)?.status === "done";
				(s?.store.auto_print_receipt ?? !1) && (!a || u) && M(n.sale);
			} catch (e) {
				let t = N(e, "Не вдалося прийняти оплату");
				t.unknown ? (E.unanswered(), k({
					...t,
					text: De
				})) : (E.answered(), k(t)), t.credit && r(t.credit), t.status != null && t.status !== 400 && o();
			} finally {
				T(!1);
			}
		}
	}
	return j ? /* @__PURE__ */ Z(I, {
		title: "Оплату прийнято",
		onClose: a,
		testId: "debts-pay-done",
		children: [/* @__PURE__ */ Z("div", {
			className: "space-y-3 text-center",
			children: [
				/* @__PURE__ */ X("div", {
					className: "mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center",
					children: /* @__PURE__ */ X(A, { size: 40 })
				}),
				/* @__PURE__ */ Z("p", {
					className: "text-[15px]",
					children: [
						/* @__PURE__ */ X("span", {
							className: "font-semibold",
							children: n
						}),
						" — прийнято",
						" ",
						/* @__PURE__ */ X("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: G(j.sale.total_cents + (j.sale.rounding_cents ?? 0))
						}),
						j.sale.receipt_number && /* @__PURE__ */ Z(Y, { children: [", ", /* @__PURE__ */ Z("span", {
							className: "whitespace-nowrap",
							children: ["чек ", j.sale.receipt_number]
						})] }),
						"."
					]
				}),
				/* @__PURE__ */ X("p", {
					className: "text-[15px] tabular-nums",
					children: x(j.credit)
				}),
				j.warning && /* @__PURE__ */ X("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left",
					children: j.warning
				}),
				P && /* @__PURE__ */ X("p", {
					className: "text-sm text-sq-secondary",
					children: P
				}),
				/* @__PURE__ */ Z("div", {
					className: "flex gap-2 pt-1",
					children: [/* @__PURE__ */ Z("button", {
						type: "button",
						className: "sq-btn-quiet flex-1 justify-center",
						disabled: ne,
						onClick: () => void M(j.sale),
						children: [/* @__PURE__ */ X(p, { size: 20 }), "Друкувати чек"]
					}), /* @__PURE__ */ X("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
						onClick: a,
						children: "Готово"
					})]
				})
			]
		}), ie]
	}) : /* @__PURE__ */ X(I, {
		title: "Прийняти оплату",
		onClose: a,
		wide: !0,
		testId: "debts-pay-sheet",
		children: /* @__PURE__ */ Z("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ X("p", {
					className: "text-[13px] text-sq-muted",
					children: "Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити."
				}),
				/* @__PURE__ */ X("ol", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					"data-testid": "debts-pay-lines",
					children: i.map((e, t) => {
						let n = t < l;
						return /* @__PURE__ */ X("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ Z("button", {
								type: "button",
								"aria-pressed": n,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${n ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => u((e) => w(e, t)),
								children: [
									/* @__PURE__ */ X("span", {
										className: `h-6 w-6 shrink-0 rounded-full grid place-items-center ${n ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: n && /* @__PURE__ */ X(A, { size: 16 })
									}),
									/* @__PURE__ */ Z("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ X("span", {
											className: "block text-[15px] truncate",
											children: D(e)
										}), /* @__PURE__ */ Z("span", {
											className: "block text-[13px] text-sq-muted",
											children: [
												new Date(e.created_at).toLocaleDateString("uk-UA"),
												" ·",
												" ",
												y(e.remaining_quantity, e.unit, e.price_per)
											]
										})]
									}),
									/* @__PURE__ */ X("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: G(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ Z("label", {
					className: "block",
					children: [
						/* @__PURE__ */ X("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Покупець дає, ₴ (необовʼязково)"
						}),
						/* @__PURE__ */ Z("div", {
							className: "mt-1 flex gap-2",
							children: [/* @__PURE__ */ X("input", {
								className: "pos-field min-w-0 flex-1",
								inputMode: "decimal",
								value: v,
								placeholder: "Наприклад: 500",
								onChange: (e) => S(e.target.value)
							}), W && W.count > 0 && /* @__PURE__ */ X("button", {
								type: "button",
								className: "sq-btn-quiet shrink-0",
								onClick: () => u(W.count),
								children: "Взяти"
							})]
						}),
						W && /* @__PURE__ */ X("span", {
							className: "mt-1 block text-[13px] text-sq-secondary tabular-nums",
							"data-testid": "debts-pay-offer",
							children: W.count > 0 ? `Закриває ${h(W.count)} на ${G(W.total)}` : `Не вистачає навіть на найстаріший товар (${G(ae[0] ?? 0)})`
						})
					]
				}),
				/* @__PURE__ */ X(ee, {
					value: d,
					onChange: m,
					ariaLabel: "Чим платить",
					className: "w-full",
					options: [{
						value: "cash",
						label: /* @__PURE__ */ Z("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ X(g, { size: 20 }), "Готівка"]
						})
					}, {
						value: "card",
						label: /* @__PURE__ */ Z("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ X(f, { size: 20 }), "Картка"]
						})
					}]
				}),
				/* @__PURE__ */ Z("dl", {
					className: "space-y-1 text-[15px] tabular-nums",
					children: [
						/* @__PURE__ */ Z("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ X("dt", {
								className: "text-sq-secondary",
								children: h(l)
							}), /* @__PURE__ */ X("dd", { children: G(L) })]
						}),
						B !== 0 && /* @__PURE__ */ Z("div", {
							className: "flex justify-between gap-3 text-sq-secondary",
							children: [/* @__PURE__ */ X("dt", { children: "Заокруглення готівки" }), /* @__PURE__ */ X("dd", { children: ce(B) })]
						}),
						/* @__PURE__ */ Z("div", {
							className: "flex justify-between gap-3 text-[17px] font-bold text-sq-heading",
							children: [/* @__PURE__ */ X("dt", { children: "До сплати" }), /* @__PURE__ */ X("dd", {
								"data-testid": "debts-pay-due",
								children: G(H)
							})]
						})
					]
				}),
				O && /* @__PURE__ */ X("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-pay-error",
					children: O.text
				}),
				/* @__PURE__ */ X("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: C || l === 0,
					onClick: () => void se(),
					children: C ? "Проводжу…" : O?.unknown ? "Перевірити ще раз" : `Прийняти ${G(H)}`
				})
			]
		})
	});
}
// src/modules/debts/components/ReturnSheet.tsx
var Ae = "Немає відповіді від сервера — повернення могло пройти. Натисніть ще раз: удруге воно не запишеться.", je = "Попереднє повернення лишилося без відповіді — воно могло пройти. Оберіть товар і натисніть ще раз: удруге воно не запишеться.", Me = "Це повернення вже було записано — удруге не записано. Виписку оновлено.";
function Ne({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = V({}), [c, l] = V(""), [d, f] = V(!1), p = $(F("return", t)), [h, g] = V(() => p.replaying ? je : null), _ = n.filter((e) => (o[e.id] ?? 0) > 0), v = z(() => n.reduce((e, t) => e + m(t, o[t.id] ?? 0), 0), [n, o]);
	function b(e, t) {
		let n = Math.max(0, Math.min(e.remaining_quantity, Math.round(t)));
		s((t) => ({
			...t,
			[e.id]: n
		}));
	}
	async function x() {
		if (!(d || _.length === 0)) {
			f(!0), g(null);
			try {
				let n = await e.returnGoods(t, {
					lines: _.map((e) => ({
						line_id: e.id,
						quantity: o[e.id]
					})),
					client_uuid: p.current(),
					...c.trim() ? { reason: c.trim() } : {}
				});
				p.answered(), r(n.credit), K() && se.refreshCatalog().catch(() => void 0), a(), n.replay ? (s({}), g(Me)) : i();
			} catch (e) {
				let t = N(e, "Не вдалося повернути товар");
				t.unknown ? (p.unanswered(), g(Ae)) : (p.answered(), g(t.text)), t.code === "stale_statement" && a();
			} finally {
				f(!1);
			}
		}
	}
	return /* @__PURE__ */ X(I, {
		title: "Повернути товар",
		onClose: i,
		wide: !0,
		testId: "debts-return-sheet",
		children: /* @__PURE__ */ Z("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ X("p", {
					className: "text-[13px] text-sq-muted",
					children: "Товар, за який ще не заплатили, повертається на полицю, а борг зменшується на його вартість."
				}),
				/* @__PURE__ */ X("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o[e.id] ?? 0, n = e.unit === "" || e.unit === "шт";
						return /* @__PURE__ */ Z("li", {
							className: "border-b border-sq-divider/70 last:border-b-0 px-3 py-2.5 space-y-2",
							children: [/* @__PURE__ */ Z("div", {
								className: "flex items-start justify-between gap-3",
								children: [/* @__PURE__ */ Z("span", {
									className: "min-w-0",
									children: [/* @__PURE__ */ X("span", {
										className: "block text-[15px]",
										children: D(e)
									}), /* @__PURE__ */ Z("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											"винно за ",
											y(e.remaining_quantity, e.unit, e.price_per),
											" · ",
											G(e.owed_cents)
										]
									})]
								}), t > 0 && /* @__PURE__ */ Z("span", {
									className: "text-[15px] font-semibold tabular-nums shrink-0",
									children: ["−", G(m(e, t))]
								})]
							}), /* @__PURE__ */ Z("div", {
								className: "flex items-center gap-2",
								children: [O(e) ? /* @__PURE__ */ X("span", {
									className: "text-[13px] text-sq-muted",
									"data-testid": "debts-return-whole",
									children: "Ваговий товар повертається цілим рядком"
								}) : n ? /* @__PURE__ */ Z(Y, { children: [
									/* @__PURE__ */ X("button", {
										type: "button",
										"aria-label": "Менше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => b(e, t - 1),
										children: /* @__PURE__ */ X(u, { size: 20 })
									}),
									/* @__PURE__ */ X("span", {
										className: "w-10 text-center text-[17px] font-semibold tabular-nums",
										children: t
									}),
									/* @__PURE__ */ X("button", {
										type: "button",
										"aria-label": "Більше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => b(e, t + 1),
										children: /* @__PURE__ */ X(k, { size: 20 })
									})
								] }) : /* @__PURE__ */ X("input", {
									className: "pos-field w-32",
									inputMode: "numeric",
									"aria-label": `Скільки повернути, ${e.unit}`,
									value: t === 0 ? "" : String(t),
									placeholder: `0 ${e.unit}`,
									onChange: (t) => b(e, Number(t.target.value.replace(/\D/g, "")) || 0)
								}), /* @__PURE__ */ X("button", {
									type: "button",
									className: "ml-auto text-[15px] font-semibold text-sq-blue",
									onClick: () => b(e, t === e.remaining_quantity ? 0 : e.remaining_quantity),
									children: t === e.remaining_quantity ? "Скинути" : "Усе"
								})]
							})]
						}, e.id);
					})
				}),
				/* @__PURE__ */ Z("label", {
					className: "block",
					children: [/* @__PURE__ */ X("span", {
						className: "text-[13px] font-semibold text-sq-secondary",
						children: "Причина (необовʼязково)"
					}), /* @__PURE__ */ X("input", {
						className: "pos-field mt-1 w-full",
						value: c,
						maxLength: 200,
						placeholder: "Наприклад: не підійшов розмір",
						onChange: (e) => l(e.target.value)
					})]
				}),
				h && /* @__PURE__ */ X("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: h
				}),
				/* @__PURE__ */ X("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: d || _.length === 0,
					onClick: () => void x(),
					children: d ? "Повертаю…" : _.length === 0 ? "Оберіть, що повертається" : `Повернути на ${G(v)}`
				})
			]
		})
	});
}
// src/modules/debts/components/WriteOffSheet.tsx
var Pe = 3, Fe = "Немає відповіді від сервера — списання могло пройти. Натисніть ще раз: удруге воно не запишеться.", Ie = "Попереднє списання лишилося без відповіді — воно могло пройти. Натисніть ще раз: удруге воно не запишеться.", Le = "Це списання вже було записано — удруге не записано. Виписку оновлено.";
function Re({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = V(() => new Set(n.map((e) => e.id))), [c, l] = V(""), [u, d] = V(!1), f = $(F("writeoff", t)), [p, m] = V(() => f.replaying ? Ie : null), h = z(() => n.filter((e) => o.has(e.id)).reduce((e, t) => e + t.owed_cents, 0), [n, o]), g = c.trim().length >= Pe;
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
				f.answered(), r(s.credit), a(), s.replay ? m(Le) : i();
			} catch (e) {
				let t = N(e, "Не вдалося списати борг");
				t.unknown ? (f.unanswered(), m(Fe)) : (f.answered(), m(t.text)), t.code === "stale_statement" && a();
			} finally {
				d(!1);
			}
		}
	}
	return /* @__PURE__ */ X(I, {
		title: "Списати борг",
		onClose: i,
		wide: !0,
		testId: "debts-writeoff-sheet",
		children: /* @__PURE__ */ Z("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ X("p", {
					className: "text-[13px] text-sq-muted",
					children: "Борг за обраними товарами закривається без грошей і без чека. Товар не повертається на полицю."
				}),
				/* @__PURE__ */ X("ul", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					children: n.map((e) => {
						let t = o.has(e.id);
						return /* @__PURE__ */ X("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ Z("button", {
								type: "button",
								"aria-pressed": t,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${t ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => _(e.id),
								children: [
									/* @__PURE__ */ X("span", {
										className: `h-6 w-6 shrink-0 rounded-md grid place-items-center ${t ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: t && /* @__PURE__ */ X(A, { size: 16 })
									}),
									/* @__PURE__ */ Z("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ X("span", {
											className: "block text-[15px] truncate",
											children: D(e)
										}), /* @__PURE__ */ X("span", {
											className: "block text-[13px] text-sq-muted",
											children: y(e.remaining_quantity, e.unit, e.price_per)
										})]
									}),
									/* @__PURE__ */ X("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: G(e.owed_cents)
									})
								]
							})
						}, e.id);
					})
				}),
				/* @__PURE__ */ Z("label", {
					className: "block",
					children: [
						/* @__PURE__ */ X("span", {
							className: "text-[13px] font-semibold text-sq-secondary",
							children: "Причина"
						}),
						/* @__PURE__ */ X("input", {
							className: "pos-field mt-1 w-full",
							value: c,
							maxLength: 200,
							placeholder: "Наприклад: покупець виїхав, борг безнадійний",
							onChange: (e) => l(e.target.value)
						}),
						!g && c.length > 0 && /* @__PURE__ */ Z("span", {
							className: "mt-1 block text-[13px] text-sq-muted",
							children: [
								"Щонайменше ",
								Pe,
								" символи"
							]
						})
					]
				}),
				p && /* @__PURE__ */ X("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: p
				}),
				/* @__PURE__ */ X("button", {
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
function ze({ frame: t }) {
	let { customerId: n } = ge(), i = Number(n), a = J((e) => e.online), o = K(), s = a && (!o || U.hasLiveJwt()), c = q((e) => e.auth?.staff.role ?? null) === "owner", l = ve(Number.isInteger(i) ? i : void 0), [u, d] = V(null), [f, p] = V(null), [m, h] = V(0), [g, _] = V(null), v = L(() => h((e) => e + 1), []);
	ye(l, v), R(() => {
		if (!s || !Number.isInteger(i) || i <= 0) return;
		let t = !0;
		return e.statement(i).then((e) => {
			t && (d(e), p(null), r(e.credit, e.customer));
		}).catch((e) => {
			t && p(N(e, "Не вдалося прочитати виписку").text);
		}), () => {
			t = !1;
		};
	}, [
		i,
		s,
		m
	]);
	let b = /* @__PURE__ */ Z(pe, {
		to: "..",
		relative: "path",
		className: "-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue",
		children: [/* @__PURE__ */ X(j, {
			size: 20,
			"aria-hidden": !0
		}), "Борги"]
	});
	if (!s) return /* @__PURE__ */ Z(Q, {
		frame: t,
		children: [
			b,
			/* @__PURE__ */ X("div", {
				className: "mt-3",
				children: /* @__PURE__ */ X(Se, {
					rows: l,
					showCustomer: !1
				})
			}),
			/* @__PURE__ */ Z("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ X("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ X("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			})
		]
	});
	if (!u) return /* @__PURE__ */ Z(Q, {
		frame: t,
		children: [b, /* @__PURE__ */ X("p", {
			className: `mt-3 text-sm ${f ? "text-red-600" : "text-sq-muted"}`,
			children: f ?? "Завантаження…"
		})]
	});
	let { customer: S, credit: C, open_lines: w, entries: O } = u, k = w.reduce((e, t) => e + t.owed_cents, 0);
	return /* @__PURE__ */ Z(Q, {
		frame: t,
		children: [
			b,
			/* @__PURE__ */ Z("header", {
				className: "mt-2 mb-5 space-y-1",
				children: [
					/* @__PURE__ */ X("h2", {
						className: "text-[28px] font-bold text-sq-heading leading-tight",
						children: S.name
					}),
					S.phone && /* @__PURE__ */ X("p", {
						className: "text-[15px] text-sq-muted",
						children: S.phone
					}),
					/* @__PURE__ */ X("p", {
						className: "text-[17px] tabular-nums",
						"data-testid": "debts-statement-credit",
						children: C.limit_cents == null && C.balance_cents === 0 ? "Під запис не дозволено" : x(C)
					}),
					u.oldest_open_at && /* @__PURE__ */ Z("p", {
						className: "text-[13px] text-sq-muted",
						children: ["Найстаріший борг — ", T(u.oldest_open_at)]
					})
				]
			}),
			f && /* @__PURE__ */ X("p", {
				className: "mb-3 text-sm text-red-600",
				children: f
			}),
			/* @__PURE__ */ X(Se, {
				rows: l,
				showCustomer: !1
			}),
			w.length > 0 && /* @__PURE__ */ Z("div", {
				className: "flex flex-wrap gap-2 mb-6",
				children: [
					/* @__PURE__ */ X("button", {
						type: "button",
						className: "pos-btn-primary min-h-[48px] px-5 rounded-xl text-[16px]",
						onClick: () => _("pay"),
						children: "Прийняти оплату"
					}),
					/* @__PURE__ */ X("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px]",
						onClick: () => _("return"),
						children: "Повернути товар"
					}),
					c && /* @__PURE__ */ X("button", {
						type: "button",
						className: "sq-btn-quiet min-h-[48px] text-red-600",
						onClick: () => _("writeoff"),
						children: "Списати"
					})
				]
			}),
			/* @__PURE__ */ Z("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ X(M, {
					title: "Винно",
					count: w.length,
					action: w.length > 0 ? /* @__PURE__ */ X("span", {
						className: "tabular-nums",
						children: G(k)
					}) : void 0
				}), w.length === 0 ? /* @__PURE__ */ X("p", {
					className: "py-4 text-[15px] text-sq-secondary",
					children: "Нічого не винно."
				}) : /* @__PURE__ */ X("ul", {
					"data-testid": "debts-open-lines",
					children: w.map((e) => /* @__PURE__ */ X("li", {
						className: "sq-row",
						children: /* @__PURE__ */ Z("div", {
							className: "flex items-center gap-3 w-full min-h-[52px] py-2",
							children: [/* @__PURE__ */ Z("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ X("span", {
									className: "block text-[15px] truncate",
									children: D(e)
								}), /* @__PURE__ */ Z("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										new Date(e.created_at).toLocaleDateString("uk-UA"),
										" ·",
										" ",
										y(e.remaining_quantity, e.unit, e.price_per),
										e.returned_quantity > 0 ? ` (повернуто ${y(e.returned_quantity, e.unit, e.price_per)})` : "",
										e.note ? ` · ${e.note}` : ""
									]
								})]
							}), /* @__PURE__ */ X("span", {
								className: "text-[15px] font-semibold tabular-nums shrink-0",
								children: G(e.owed_cents)
							})]
						})
					}, e.id))
				})]
			}),
			c && /* @__PURE__ */ Z("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ X(M, { title: "Ліміт" }), /* @__PURE__ */ X("div", {
					className: "pt-3",
					children: /* @__PURE__ */ X(ne, {
						credit: C,
						touch: t === "till"
					})
				})]
			}),
			/* @__PURE__ */ Z("section", { children: [/* @__PURE__ */ X(M, {
				title: "Журнал",
				count: O.length
			}), O.length === 0 ? /* @__PURE__ */ X("p", {
				className: "py-4 text-[15px] text-sq-secondary",
				children: "Ще нічого не записано."
			}) : /* @__PURE__ */ X("ul", {
				"data-testid": "debts-journal",
				children: O.map((e) => /* @__PURE__ */ X("li", {
					className: "sq-row",
					children: /* @__PURE__ */ Z("div", {
						className: "flex items-center gap-3 w-full min-h-[52px] py-2",
						children: [/* @__PURE__ */ Z("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ Z("span", {
								className: "block text-[15px]",
								children: [E[e.kind], e.receipt_number ? ` · чек ${e.receipt_number}` : ""]
							}), /* @__PURE__ */ Z("span", {
								className: "block text-[13px] text-sq-muted",
								children: [
									new Date(e.created_at).toLocaleString("uk-UA"),
									e.staff_name ? ` · ${e.staff_name}` : "",
									e.offline ? " · без мережі" : "",
									e.reason ? ` · ${e.reason}` : ""
								]
							})]
						}), /* @__PURE__ */ X("span", {
							className: `text-[15px] font-semibold tabular-nums shrink-0 ${e.amount_cents > 0 ? "text-sq-heading" : "text-sq-success-ink"}`,
							children: ce(e.amount_cents)
						})]
					})
				}, e.id))
			})] }),
			g === "pay" && /* @__PURE__ */ X(ke, {
				customerId: S.id,
				customerName: S.name,
				openLines: w,
				onClose: () => _(null),
				onChanged: v
			}),
			g === "return" && /* @__PURE__ */ X(Ne, {
				customerId: S.id,
				openLines: w,
				onClose: () => _(null),
				onChanged: v
			}),
			g === "writeoff" && c && /* @__PURE__ */ X(Re, {
				customerId: S.id,
				openLines: w,
				onClose: () => _(null),
				onChanged: v
			})
		]
	});
}
// src/modules/debts/pages/DebtsRoutes.tsx
function Be({ frame: e = "till" }) {
	return /* @__PURE__ */ Z(he, { children: [/* @__PURE__ */ X(me, {
		index: !0,
		element: /* @__PURE__ */ X(we, { frame: e })
	}), /* @__PURE__ */ X(me, {
		path: ":customerId",
		element: /* @__PURE__ */ X(ze, { frame: e })
	})] });
}
export { Be as DebtsRoutes };
