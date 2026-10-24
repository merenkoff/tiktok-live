import { t as e } from "./debtsApi-DhkvGjzT.js";
import { a as t, c as n, f as r, g as i, h as a, i as o, s, t as c } from "./queue-B9HzuKEV.js";
import { n as l } from "./sync-D_cQhPeR.js";
import { C as u, S as d, T as f, _ as p, a as m, b as h, d as g, f as _, g as v, h as y, i as b, m as x, o as S, p as C, r as w, t as T, u as E, v as D, w as O, x as k, y as A } from "./debt-80Dd-Q-1.js";
import { i as ee, n as j, r as M, t as te } from "./LimitEditor-z_VyzewD.js";
import { n as ne, t as N } from "./errors-CLut7Fii.js";
import { a as re, i as P, n as F, o as ie, t as I } from "./Sheet-CYHmLyix.js";
import { useCallback as L, useEffect as R, useMemo as z, useRef as B, useState as V } from "react";
import { DEFAULT_RECEIPT_PAPER_WIDTH as H, api as U, buildReceiptPayload as W, cashRoundingDelta as ae, cashierApi as G, formatSignedUah as oe, formatUah as K, getMeta as se, isOfflinePosEnabled as q, printReceipt as ce, storeCashRounding as le, useAuthStore as J, useOfflineStatus as Y, usePrintableReceipt as ue } from "@pos/platform";
import { Fragment as X, jsx as Z, jsxs as Q } from "react/jsx-runtime";
import { Link as de, Route as fe, Routes as pe, useParams as me } from "react-router-dom";
// src/modules/debts/lib/useQueue.ts
var he = [];
function ge(e) {
	let t = J((e) => e.auth?.store.id ?? null), n = q(), [r, i] = V(he);
	return R(() => {
		if (!n || t == null) {
			i(he);
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
function _e(e, t) {
	let n = B(new Set(e.map((e) => e.id)));
	R(() => {
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
function ve(e) {
	if (e.status === "queued") return "Чекає мережі";
	let t = e.lastError?.trim() || "невідома помилка";
	return e.status === "error" ? `Не вдалося надіслати: ${t}. Каса спробує ще раз сама.` : e.deadReason === "attempts_exhausted" ? `Не вдалося надіслати після ${e.attempts} ${x(e.attempts, "спроби", "спроб", "спроб")}: ${t}` : `Сервер не прийняв: ${t}`;
}
function ye(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
// src/modules/debts/components/QueuePanel.tsx
function be({ rows: e, showCustomer: t = !0 }) {
	let r = Y((e) => e.online), [i, a] = V(!1), [o, s] = V(null);
	if (e.length === 0) return null;
	let u = e.filter((e) => e.status !== "dead").length;
	async function d() {
		a(!0);
		try {
			await l();
		} finally {
			a(!1), Y.getState().refreshPending();
		}
	}
	async function f(e) {
		await n(e), r && d();
	}
	async function p(e) {
		s(null), await c(e), Y.getState().refreshPending();
	}
	return /* @__PURE__ */ Q("section", {
		className: "rounded-card bg-white ring-1 ring-amber-200 p-4 mb-5",
		"data-testid": "debts-queue",
		children: [
			/* @__PURE__ */ Z(M, {
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
										ye(e.createdAt),
										" · ",
										m(e.lines.length),
										e.note ? ` · ${e.note}` : ""
									]
								}),
								/* @__PURE__ */ Z("span", {
									className: `block text-[13px] ${e.status === "dead" ? "text-red-600" : "text-sq-muted"}`,
									children: ve(e)
								})
							]
						}), /* @__PURE__ */ Z("span", {
							className: "text-[15px] font-semibold tabular-nums shrink-0",
							children: K(e.totalCents)
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
function xe(e) {
	return new Date(e).toLocaleString("uk-UA", {
		day: "2-digit",
		month: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	});
}
function Se({ frame: n }) {
	let r = Y((e) => e.online), s = J((e) => e.auth?.store.id ?? null), c = q(), l = r && (!c || U.hasLiveJwt()), u = ge(), [d, p] = V("owing"), [m, h] = V(null), [g, v] = V(null), [y, b] = V(null), [S, C] = V(""), [w, T] = V(0);
	_e(u, L(() => T((e) => e + 1), [])), R(() => {
		if (!l) return;
		let t = !0;
		return b(null), e.debtors(d === "all").then((e) => {
			t && h(e.debtors);
		}).catch((e) => {
			t && b(N(e, "Не вдалося прочитати борги").text);
		}), () => {
			t = !1;
		};
	}, [
		d,
		l,
		w
	]), R(() => {
		if (l || !c || s == null) {
			v(null);
			return;
		}
		let e = !0, n = async () => {
			let [n, r, o] = await Promise.all([
				a(s),
				t(s),
				i(s)
			]);
			e && v({
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
	let E = !l && c, D = E ? g?.rows ?? null : m, O = z(() => (D ?? []).filter((e) => (!E || d === "all" || e.balance_cents > 0) && _(e, S)), [
		D,
		E,
		d,
		S
	]), k = (D ?? []).filter((e) => e.balance_cents > 0), A = k.reduce((e, t) => e + t.balance_cents, 0);
	return /* @__PURE__ */ Q($, {
		frame: n,
		children: [
			/* @__PURE__ */ Z(j, {
				glyph: f,
				title: "Борги",
				subtitle: "Хто скільки винен магазину — найдовше першими. Записати під запис можна з кошика, коли обрано покупця з лімітом."
			}),
			/* @__PURE__ */ Z(be, { rows: u }),
			!l && !c ? /* @__PURE__ */ Q("div", {
				className: "sq-card p-6 text-center",
				children: [/* @__PURE__ */ Z("p", {
					className: "text-lg font-semibold",
					children: "Потрібна мережа"
				}), /* @__PURE__ */ Z("p", {
					className: "mt-1 text-sm text-sq-muted",
					children: "Журнал боргу живе на сервері — без звʼязку його не прочитати."
				})]
			}) : E && g && g.filledAt == null ? /* @__PURE__ */ Q("div", {
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
						children: [/* @__PURE__ */ Z(ee, {
							value: d,
							onChange: p,
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
							value: S,
							placeholder: "Імʼя або телефон",
							"aria-label": "Пошук покупця",
							onChange: (e) => C(e.target.value)
						})]
					}),
					E && g?.filledAt != null && /* @__PURE__ */ Q("p", {
						className: "text-[13px] text-amber-800",
						"data-testid": "debts-mirror-note",
						children: [
							"Без мережі — за даними каси на ",
							xe(g.filledAt),
							", разом із записаним без мережі. Виписку відкриє мережа."
						]
					}),
					D && k.length > 0 && /* @__PURE__ */ Q("p", {
						className: "text-[15px] text-sq-secondary tabular-nums",
						"data-testid": "debts-total",
						children: [
							"Разом винні ",
							/* @__PURE__ */ Z("span", {
								className: "font-semibold text-sq-heading",
								children: K(A)
							}),
							" ·",
							" ",
							k.length,
							" ",
							x(k.length, "покупець", "покупці", "покупців")
						]
					}),
					y && !E && /* @__PURE__ */ Z("p", {
						className: "text-sm text-red-600",
						children: y
					}),
					!D && !(y && !E) && /* @__PURE__ */ Z("p", {
						className: "text-sm text-sq-muted",
						children: "Завантаження…"
					}),
					D && O.length === 0 && /* @__PURE__ */ Z("div", {
						className: "sq-card p-6 text-center text-[15px] text-sq-secondary",
						children: S ? "Нікого не знайдено" : d === "owing" ? "Ніхто нічого не винен." : "Ще нікому не дозволено під запис. Ліміт ставить власник у картці покупця."
					}),
					O.length > 0 && /* @__PURE__ */ Z("ul", {
						className: "rounded-card bg-white shadow-card overflow-hidden",
						"data-testid": "debtors",
						children: O.map((e) => /* @__PURE__ */ Z("li", {
							className: "sq-row last:shadow-none",
							children: E ? /* @__PURE__ */ Z("div", {
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5",
								children: /* @__PURE__ */ Z(Ce, { row: e })
							}) : /* @__PURE__ */ Z(de, {
								to: String(e.customer_id),
								className: "flex items-center gap-3 w-full min-h-[60px] py-2 px-4 md:px-5 hover:bg-sq-sidebar/60",
								children: /* @__PURE__ */ Z(Ce, { row: e })
							})
						}, e.customer_id))
					})
				]
			})
		]
	});
}
function Ce({ row: e }) {
	let t = S(e);
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
			children: K(e.balance_cents)
		}), /* @__PURE__ */ Z("span", {
			className: "block text-[13px] text-sq-muted",
			children: e.oldest_open_at ? `${m(e.open_lines)} · ${w(e.oldest_open_at)}` : e.limit_cents == null ? "" : `ліміт ${K(e.limit_cents)}`
		})]
	})] });
}
// src/modules/debts/lib/useReceiptPrint.tsx
function we() {
	let e = J((e) => e.auth), { printToPdf: t, printablePortal: n } = ue(), [r, i] = V(!1), [a, o] = V(null);
	return {
		print: L(async (n) => {
			let r = W(n, {
				name: e?.store.name ?? "",
				fiscal: e?.store.fiscal ?? null,
				vertical: e?.store.vertical?.id ?? null
			}), [a, s] = await Promise.all([se("receiptPrinterName"), se("receiptPaperWidthMm")]);
			if (!a) t(r);
			else {
				i(!0), o(null);
				try {
					await ce(a, r, s === 58 || s === 80 ? s : H), o("Чек надіслано на друк");
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
function Te(e) {
	let [t] = V(() => {
		let t = ie(e);
		return {
			key: t ?? crypto.randomUUID(),
			replaying: t != null
		};
	}), n = B(t.key);
	return {
		current: () => n.current,
		replaying: t.replaying,
		unanswered: () => P(e, n.current),
		answered: () => {
			re(e), n.current = crypto.randomUUID();
		}
	};
}
// src/modules/debts/components/PaySheet.tsx
var Ee = "Немає відповіді від сервера — оплата могла пройти. «Перевірити ще раз» не прийме гроші вдруге.", De = "Попередня оплата лишилася без відповіді — вона могла пройти. «Перевірити ще раз» не прийме гроші вдруге.";
function Oe({ customerId: t, customerName: n, openLines: i, onClose: a, onChanged: o }) {
	let s = J((e) => e.auth), c = le(s?.store.cash_rounding), [l, u] = V(i.length), [d, f] = V("cash"), [p, _] = V(""), [x, S] = V(!1), w = Te(F("pay", t)), [T, D] = V(() => w.replaying ? ne(De) : null), [j, M] = V(null), { print: te, printing: re, status: P, printablePortal: ie } = we();
	R(() => {
		u((e) => Math.min(Math.max(e, 1), i.length));
	}, [i.length]);
	let L = z(() => y(i), [i]), B = l > 0 ? L[l - 1] : 0, H = d === "cash" ? ae(B, c) : 0, U = B + H, W = (() => {
		let e = p.replace(/\s/g, "").replace(",", "."), t = Number(e);
		return e && Number.isFinite(t) && t > 0 ? Math.round(t * 100) : null;
	})(), G = W == null ? null : g(i, W);
	async function se() {
		if (!(x || l === 0)) {
			S(!0), D(null);
			try {
				let n = await e.pay(t, {
					line_ids: i.slice(0, l).map((e) => e.id),
					payments: [{
						method: d,
						amount_cents: U
					}],
					client_uuid: w.current(),
					cash_rounding: d === "cash" ? c : 0
				});
				w.answered(), r(n.credit), M(n), o();
				let a = s?.store.fiscal?.enabled ?? !1, u = (n.fiscal ?? n.sale.fiscal)?.status === "done";
				(s?.store.auto_print_receipt ?? !1) && (!a || u) && te(n.sale);
			} catch (e) {
				let t = N(e, "Не вдалося прийняти оплату");
				t.unknown ? (w.unanswered(), D({
					...t,
					text: Ee
				})) : (w.answered(), D(t)), t.credit && r(t.credit), t.status != null && t.status !== 400 && o();
			} finally {
				S(!1);
			}
		}
	}
	return j ? /* @__PURE__ */ Q(I, {
		title: "Оплату прийнято",
		onClose: a,
		testId: "debts-pay-done",
		children: [/* @__PURE__ */ Q("div", {
			className: "space-y-3 text-center",
			children: [
				/* @__PURE__ */ Z("div", {
					className: "mx-auto w-16 h-16 rounded-full bg-sq-blue text-white grid place-items-center",
					children: /* @__PURE__ */ Z(h, { size: 40 })
				}),
				/* @__PURE__ */ Q("p", {
					className: "text-[15px]",
					children: [
						/* @__PURE__ */ Z("span", {
							className: "font-semibold",
							children: n
						}),
						" — прийнято",
						" ",
						/* @__PURE__ */ Z("span", {
							className: "font-semibold tabular-nums whitespace-nowrap",
							children: K(j.sale.total_cents + (j.sale.rounding_cents ?? 0))
						}),
						j.sale.receipt_number && /* @__PURE__ */ Q(X, { children: [", ", /* @__PURE__ */ Q("span", {
							className: "whitespace-nowrap",
							children: ["чек ", j.sale.receipt_number]
						})] }),
						"."
					]
				}),
				/* @__PURE__ */ Z("p", {
					className: "text-[15px] tabular-nums",
					children: b(j.credit)
				}),
				j.warning && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm text-left",
					children: j.warning
				}),
				P && /* @__PURE__ */ Z("p", {
					className: "text-sm text-sq-secondary",
					children: P
				}),
				/* @__PURE__ */ Q("div", {
					className: "flex gap-2 pt-1",
					children: [/* @__PURE__ */ Q("button", {
						type: "button",
						className: "sq-btn-quiet flex-1 justify-center",
						disabled: re,
						onClick: () => void te(j.sale),
						children: [/* @__PURE__ */ Z(O, { size: 20 }), "Друкувати чек"]
					}), /* @__PURE__ */ Z("button", {
						type: "button",
						className: "pos-btn-primary flex-1 min-h-[48px] rounded-xl",
						onClick: a,
						children: "Готово"
					})]
				})
			]
		}), ie]
	}) : /* @__PURE__ */ Z(I, {
		title: "Прийняти оплату",
		onClose: a,
		wide: !0,
		testId: "debts-pay-sheet",
		children: /* @__PURE__ */ Q("div", {
			className: "space-y-4",
			children: [
				/* @__PURE__ */ Z("p", {
					className: "text-[13px] text-sq-muted",
					children: "Гасяться найстаріші товари, цілими рядками. Торкніться товару, до якого гасити."
				}),
				/* @__PURE__ */ Z("ol", {
					className: "rounded-xl ring-1 ring-sq-divider overflow-hidden",
					"data-testid": "debts-pay-lines",
					children: i.map((e, t) => {
						let n = t < l;
						return /* @__PURE__ */ Z("li", {
							className: "border-b border-sq-divider/70 last:border-b-0",
							children: /* @__PURE__ */ Q("button", {
								type: "button",
								"aria-pressed": n,
								className: `w-full text-left flex items-center gap-3 px-3 min-h-[52px] py-2 ${n ? "bg-sq-selected" : "bg-white"}`,
								onClick: () => u((e) => C(e, t)),
								children: [
									/* @__PURE__ */ Z("span", {
										className: `h-6 w-6 shrink-0 rounded-full grid place-items-center ${n ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: n && /* @__PURE__ */ Z(h, { size: 16 })
									}),
									/* @__PURE__ */ Q("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ Z("span", {
											className: "block text-[15px] truncate",
											children: E(e)
										}), /* @__PURE__ */ Q("span", {
											className: "block text-[13px] text-sq-muted",
											children: [
												new Date(e.created_at).toLocaleDateString("uk-UA"),
												" ·",
												" ",
												v(e.remaining_quantity, e.unit)
											]
										})]
									}),
									/* @__PURE__ */ Z("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: K(e.owed_cents)
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
						/* @__PURE__ */ Q("div", {
							className: "mt-1 flex gap-2",
							children: [/* @__PURE__ */ Z("input", {
								className: "pos-field min-w-0 flex-1",
								inputMode: "decimal",
								value: p,
								placeholder: "Наприклад: 500",
								onChange: (e) => _(e.target.value)
							}), G && G.count > 0 && /* @__PURE__ */ Z("button", {
								type: "button",
								className: "sq-btn-quiet shrink-0",
								onClick: () => u(G.count),
								children: "Взяти"
							})]
						}),
						G && /* @__PURE__ */ Z("span", {
							className: "mt-1 block text-[13px] text-sq-secondary tabular-nums",
							"data-testid": "debts-pay-offer",
							children: G.count > 0 ? `Закриває ${m(G.count)} на ${K(G.total)}` : `Не вистачає навіть на найстаріший товар (${K(L[0] ?? 0)})`
						})
					]
				}),
				/* @__PURE__ */ Z(ee, {
					value: d,
					onChange: f,
					ariaLabel: "Чим платить",
					className: "w-full",
					options: [{
						value: "cash",
						label: /* @__PURE__ */ Q("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Z(A, { size: 20 }), "Готівка"]
						})
					}, {
						value: "card",
						label: /* @__PURE__ */ Q("span", {
							className: "inline-flex items-center gap-1.5",
							children: [/* @__PURE__ */ Z(k, { size: 20 }), "Картка"]
						})
					}]
				}),
				/* @__PURE__ */ Q("dl", {
					className: "space-y-1 text-[15px] tabular-nums",
					children: [
						/* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3",
							children: [/* @__PURE__ */ Z("dt", {
								className: "text-sq-secondary",
								children: m(l)
							}), /* @__PURE__ */ Z("dd", { children: K(B) })]
						}),
						H !== 0 && /* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3 text-sq-secondary",
							children: [/* @__PURE__ */ Z("dt", { children: "Заокруглення готівки" }), /* @__PURE__ */ Z("dd", { children: oe(H) })]
						}),
						/* @__PURE__ */ Q("div", {
							className: "flex justify-between gap-3 text-[17px] font-bold text-sq-heading",
							children: [/* @__PURE__ */ Z("dt", { children: "До сплати" }), /* @__PURE__ */ Z("dd", {
								"data-testid": "debts-pay-due",
								children: K(U)
							})]
						})
					]
				}),
				T && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					"data-testid": "debts-pay-error",
					children: T.text
				}),
				/* @__PURE__ */ Z("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: x || l === 0,
					onClick: () => void se(),
					children: x ? "Проводжу…" : T?.unknown ? "Перевірити ще раз" : `Прийняти ${K(U)}`
				})
			]
		})
	});
}
// src/modules/debts/components/ReturnSheet.tsx
var ke = "Немає відповіді від сервера — повернення могло пройти. Натисніть ще раз: удруге воно не запишеться.", Ae = "Попереднє повернення лишилося без відповіді — воно могло пройти. Оберіть товар і натисніть ще раз: удруге воно не запишеться.", je = "Це повернення вже було записано — удруге не записано. Виписку оновлено.";
function Me({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = V({}), [c, l] = V(""), [f, m] = V(!1), h = Te(F("return", t)), [g, _] = V(() => h.replaying ? Ae : null), y = n.filter((e) => (o[e.id] ?? 0) > 0), b = z(() => n.reduce((e, t) => e + p(t, o[t.id] ?? 0), 0), [n, o]);
	function x(e, t) {
		let n = Math.max(0, Math.min(e.remaining_quantity, Math.round(t)));
		s((t) => ({
			...t,
			[e.id]: n
		}));
	}
	async function S() {
		if (!(f || y.length === 0)) {
			m(!0), _(null);
			try {
				let n = await e.returnGoods(t, {
					lines: y.map((e) => ({
						line_id: e.id,
						quantity: o[e.id]
					})),
					client_uuid: h.current(),
					...c.trim() ? { reason: c.trim() } : {}
				});
				h.answered(), r(n.credit), q() && G.refreshCatalog().catch(() => void 0), a(), n.replay ? (s({}), _(je)) : i();
			} catch (e) {
				let t = N(e, "Не вдалося повернути товар");
				t.unknown ? (h.unanswered(), _(ke)) : (h.answered(), _(t.text)), t.code === "stale_statement" && a();
			} finally {
				m(!1);
			}
		}
	}
	return /* @__PURE__ */ Z(I, {
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
										children: E(e)
									}), /* @__PURE__ */ Q("span", {
										className: "block text-[13px] text-sq-muted",
										children: [
											"винно за ",
											v(e.remaining_quantity, e.unit),
											" · ",
											K(e.owed_cents)
										]
									})]
								}), t > 0 && /* @__PURE__ */ Q("span", {
									className: "text-[15px] font-semibold tabular-nums shrink-0",
									children: ["−", K(p(e, t))]
								})]
							}), /* @__PURE__ */ Q("div", {
								className: "flex items-center gap-2",
								children: [n ? /* @__PURE__ */ Q(X, { children: [
									/* @__PURE__ */ Z("button", {
										type: "button",
										"aria-label": "Менше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => x(e, t - 1),
										children: /* @__PURE__ */ Z(d, { size: 20 })
									}),
									/* @__PURE__ */ Z("span", {
										className: "w-10 text-center text-[17px] font-semibold tabular-nums",
										children: t
									}),
									/* @__PURE__ */ Z("button", {
										type: "button",
										"aria-label": "Більше",
										className: "h-10 w-10 grid place-items-center rounded-[10px] bg-white ring-1 ring-sq-divider",
										onClick: () => x(e, t + 1),
										children: /* @__PURE__ */ Z(u, { size: 20 })
									})
								] }) : /* @__PURE__ */ Z("input", {
									className: "pos-field w-32",
									inputMode: "numeric",
									"aria-label": `Скільки повернути, ${e.unit}`,
									value: t === 0 ? "" : String(t),
									placeholder: `0 ${e.unit}`,
									onChange: (t) => x(e, Number(t.target.value.replace(/\D/g, "")) || 0)
								}), /* @__PURE__ */ Z("button", {
									type: "button",
									className: "ml-auto text-[15px] font-semibold text-sq-blue",
									onClick: () => x(e, t === e.remaining_quantity ? 0 : e.remaining_quantity),
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
				g && /* @__PURE__ */ Z("p", {
					role: "alert",
					className: "rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm",
					children: g
				}),
				/* @__PURE__ */ Z("button", {
					type: "button",
					className: "pos-btn-primary w-full min-h-[52px] rounded-xl text-[17px] tabular-nums",
					disabled: f || y.length === 0,
					onClick: () => void S(),
					children: f ? "Повертаю…" : y.length === 0 ? "Оберіть, що повертається" : `Повернути на ${K(b)}`
				})
			]
		})
	});
}
// src/modules/debts/components/WriteOffSheet.tsx
var Ne = 3, Pe = "Немає відповіді від сервера — списання могло пройти. Натисніть ще раз: удруге воно не запишеться.", Fe = "Попереднє списання лишилося без відповіді — воно могло пройти. Натисніть ще раз: удруге воно не запишеться.", Ie = "Це списання вже було записано — удруге не записано. Виписку оновлено.";
function Le({ customerId: t, openLines: n, onClose: i, onChanged: a }) {
	let [o, s] = V(() => new Set(n.map((e) => e.id))), [c, l] = V(""), [u, d] = V(!1), f = Te(F("writeoff", t)), [p, m] = V(() => f.replaying ? Fe : null), g = z(() => n.filter((e) => o.has(e.id)).reduce((e, t) => e + t.owed_cents, 0), [n, o]), _ = c.trim().length >= Ne;
	function y(e) {
		s((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}
	async function b() {
		if (!u && o.size !== 0 && _) {
			d(!0), m(null);
			try {
				let s = await e.writeOff(t, {
					line_ids: n.filter((e) => o.has(e.id)).map((e) => e.id),
					reason: c.trim(),
					client_uuid: f.current()
				});
				f.answered(), r(s.credit), a(), s.replay ? m(Ie) : i();
			} catch (e) {
				let t = N(e, "Не вдалося списати борг");
				t.unknown ? (f.unanswered(), m(Pe)) : (f.answered(), m(t.text)), t.code === "stale_statement" && a();
			} finally {
				d(!1);
			}
		}
	}
	return /* @__PURE__ */ Z(I, {
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
								onClick: () => y(e.id),
								children: [
									/* @__PURE__ */ Z("span", {
										className: `h-6 w-6 shrink-0 rounded-md grid place-items-center ${t ? "bg-sq-blue text-white" : "ring-1 ring-sq-divider"}`,
										"aria-hidden": !0,
										children: t && /* @__PURE__ */ Z(h, { size: 16 })
									}),
									/* @__PURE__ */ Q("span", {
										className: "min-w-0 flex-1",
										children: [/* @__PURE__ */ Z("span", {
											className: "block text-[15px] truncate",
											children: E(e)
										}), /* @__PURE__ */ Z("span", {
											className: "block text-[13px] text-sq-muted",
											children: v(e.remaining_quantity, e.unit)
										})]
									}),
									/* @__PURE__ */ Z("span", {
										className: "text-[15px] font-semibold tabular-nums shrink-0",
										children: K(e.owed_cents)
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
						!_ && c.length > 0 && /* @__PURE__ */ Q("span", {
							className: "mt-1 block text-[13px] text-sq-muted",
							children: [
								"Щонайменше ",
								Ne,
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
					disabled: u || o.size === 0 || !_,
					onClick: () => void b(),
					children: u ? "Списую…" : `Списати ${K(g)}`
				})
			]
		})
	});
}
// src/modules/debts/pages/StatementPage.tsx
function Re({ frame: t }) {
	let { customerId: n } = me(), i = Number(n), a = Y((e) => e.online), o = q(), s = a && (!o || U.hasLiveJwt()), c = J((e) => e.auth?.staff.role ?? null) === "owner", l = ge(Number.isInteger(i) ? i : void 0), [u, d] = V(null), [f, p] = V(null), [m, h] = V(0), [g, _] = V(null), y = L(() => h((e) => e + 1), []);
	_e(l, y), R(() => {
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
	let x = /* @__PURE__ */ Q(de, {
		to: "..",
		relative: "path",
		className: "-ml-1 inline-flex items-center gap-1 min-h-11 pr-1 text-[15px] font-semibold text-sq-blue",
		children: [/* @__PURE__ */ Z(D, {
			size: 20,
			"aria-hidden": !0
		}), "Борги"]
	});
	if (!s) return /* @__PURE__ */ Q($, {
		frame: t,
		children: [
			x,
			/* @__PURE__ */ Z("div", {
				className: "mt-3",
				children: /* @__PURE__ */ Z(be, {
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
		children: [x, /* @__PURE__ */ Z("p", {
			className: `mt-3 text-sm ${f ? "text-red-600" : "text-sq-muted"}`,
			children: f ?? "Завантаження…"
		})]
	});
	let { customer: S, credit: C, open_lines: O, entries: k } = u, A = O.reduce((e, t) => e + t.owed_cents, 0);
	return /* @__PURE__ */ Q($, {
		frame: t,
		children: [
			x,
			/* @__PURE__ */ Q("header", {
				className: "mt-2 mb-5 space-y-1",
				children: [
					/* @__PURE__ */ Z("h2", {
						className: "text-[28px] font-bold text-sq-heading leading-tight",
						children: S.name
					}),
					S.phone && /* @__PURE__ */ Z("p", {
						className: "text-[15px] text-sq-muted",
						children: S.phone
					}),
					/* @__PURE__ */ Z("p", {
						className: "text-[17px] tabular-nums",
						"data-testid": "debts-statement-credit",
						children: C.limit_cents == null && C.balance_cents === 0 ? "Під запис не дозволено" : b(C)
					}),
					u.oldest_open_at && /* @__PURE__ */ Q("p", {
						className: "text-[13px] text-sq-muted",
						children: ["Найстаріший борг — ", w(u.oldest_open_at)]
					})
				]
			}),
			f && /* @__PURE__ */ Z("p", {
				className: "mb-3 text-sm text-red-600",
				children: f
			}),
			/* @__PURE__ */ Z(be, {
				rows: l,
				showCustomer: !1
			}),
			O.length > 0 && /* @__PURE__ */ Q("div", {
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
				children: [/* @__PURE__ */ Z(M, {
					title: "Винно",
					count: O.length,
					action: O.length > 0 ? /* @__PURE__ */ Z("span", {
						className: "tabular-nums",
						children: K(A)
					}) : void 0
				}), O.length === 0 ? /* @__PURE__ */ Z("p", {
					className: "py-4 text-[15px] text-sq-secondary",
					children: "Нічого не винно."
				}) : /* @__PURE__ */ Z("ul", {
					"data-testid": "debts-open-lines",
					children: O.map((e) => /* @__PURE__ */ Z("li", {
						className: "sq-row",
						children: /* @__PURE__ */ Q("div", {
							className: "flex items-center gap-3 w-full min-h-[52px] py-2",
							children: [/* @__PURE__ */ Q("span", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ Z("span", {
									className: "block text-[15px] truncate",
									children: E(e)
								}), /* @__PURE__ */ Q("span", {
									className: "block text-[13px] text-sq-muted",
									children: [
										new Date(e.created_at).toLocaleDateString("uk-UA"),
										" ·",
										" ",
										v(e.remaining_quantity, e.unit),
										e.returned_quantity > 0 ? ` (повернуто ${v(e.returned_quantity, e.unit)})` : "",
										e.note ? ` · ${e.note}` : ""
									]
								})]
							}), /* @__PURE__ */ Z("span", {
								className: "text-[15px] font-semibold tabular-nums shrink-0",
								children: K(e.owed_cents)
							})]
						})
					}, e.id))
				})]
			}),
			c && /* @__PURE__ */ Q("section", {
				className: "mb-7",
				children: [/* @__PURE__ */ Z(M, { title: "Ліміт" }), /* @__PURE__ */ Z("div", {
					className: "pt-3",
					children: /* @__PURE__ */ Z(te, {
						credit: C,
						touch: t === "till"
					})
				})]
			}),
			/* @__PURE__ */ Q("section", { children: [/* @__PURE__ */ Z(M, {
				title: "Журнал",
				count: k.length
			}), k.length === 0 ? /* @__PURE__ */ Z("p", {
				className: "py-4 text-[15px] text-sq-secondary",
				children: "Ще нічого не записано."
			}) : /* @__PURE__ */ Z("ul", {
				"data-testid": "debts-journal",
				children: k.map((e) => /* @__PURE__ */ Z("li", {
					className: "sq-row",
					children: /* @__PURE__ */ Q("div", {
						className: "flex items-center gap-3 w-full min-h-[52px] py-2",
						children: [/* @__PURE__ */ Q("span", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ Q("span", {
								className: "block text-[15px]",
								children: [T[e.kind], e.receipt_number ? ` · чек ${e.receipt_number}` : ""]
							}), /* @__PURE__ */ Q("span", {
								className: "block text-[13px] text-sq-muted",
								children: [
									new Date(e.created_at).toLocaleString("uk-UA"),
									e.staff_name ? ` · ${e.staff_name}` : "",
									e.offline ? " · без мережі" : "",
									e.reason ? ` · ${e.reason}` : ""
								]
							})]
						}), /* @__PURE__ */ Z("span", {
							className: `text-[15px] font-semibold tabular-nums shrink-0 ${e.amount_cents > 0 ? "text-sq-heading" : "text-sq-success-ink"}`,
							children: oe(e.amount_cents)
						})]
					})
				}, e.id))
			})] }),
			g === "pay" && /* @__PURE__ */ Z(Oe, {
				customerId: S.id,
				customerName: S.name,
				openLines: O,
				onClose: () => _(null),
				onChanged: y
			}),
			g === "return" && /* @__PURE__ */ Z(Me, {
				customerId: S.id,
				openLines: O,
				onClose: () => _(null),
				onChanged: y
			}),
			g === "writeoff" && c && /* @__PURE__ */ Z(Le, {
				customerId: S.id,
				openLines: O,
				onClose: () => _(null),
				onChanged: y
			})
		]
	});
}
// src/modules/debts/pages/DebtsRoutes.tsx
function ze({ frame: e = "till" }) {
	return /* @__PURE__ */ Q(pe, { children: [/* @__PURE__ */ Z(fe, {
		index: !0,
		element: /* @__PURE__ */ Z(Se, { frame: e })
	}), /* @__PURE__ */ Z(fe, {
		path: ":customerId",
		element: /* @__PURE__ */ Z(Re, { frame: e })
	})] });
}
export { ze as DebtsRoutes };
