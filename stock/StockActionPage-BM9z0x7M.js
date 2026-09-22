import { t as e } from "./useDragScroll-Hmq7ij8E.js";
import { useEffect as t, useMemo as n, useRef as r, useState as i } from "react";
import { Link as a, useNavigate as o } from "react-router-dom";
import { api as s, enrichGtinFromSources as ee, formatUah as te, gtinSourceLabel as ne, isInternalBarcode as re, uahInputToCents as c, useVertical as ie } from "@pos/platform";
import { Fragment as ae, jsx as l, jsxs as u } from "react/jsx-runtime";
//#region src/components/AttributeFields.tsx
var d = "w-full rounded-sq border border-sq-divider bg-sq-bg px-3 py-2 text-sm text-sq-text";
function oe({ schema: e, value: t, onChange: n, unit: r, disabled: i, className: a = "grid gap-2 sm:grid-cols-2" }) {
	function o(e, r) {
		let i = { ...t };
		r === "" ? delete i[e] : i[e] = r, n(i);
	}
	let s = r != null && r.options.length > 1;
	return e.length === 0 && !s ? null : /* @__PURE__ */ u("div", {
		className: a,
		children: [e.map((e) => {
			let n = t[e.key], r = n == null ? "" : String(n), a = e.unitSuffix ? `${e.label}, ${e.unitSuffix}` : e.label;
			return /* @__PURE__ */ u("label", {
				className: "block",
				children: [/* @__PURE__ */ u("span", {
					className: "text-xs text-sq-secondary",
					children: [a, e.required && /* @__PURE__ */ l("span", {
						className: "text-rose-600",
						children: " *"
					})]
				}), e.type === "select" ? /* @__PURE__ */ u("select", {
					className: `${d} mt-1`,
					value: r,
					disabled: i,
					onChange: (t) => o(e.key, t.target.value),
					children: [/* @__PURE__ */ l("option", {
						value: "",
						children: "—"
					}), (e.options ?? []).map((e) => /* @__PURE__ */ l("option", {
						value: e,
						children: e
					}, e))]
				}) : /* @__PURE__ */ l("input", {
					className: `${d} mt-1`,
					type: e.type === "number" ? "number" : "text",
					inputMode: e.type === "number" ? "decimal" : void 0,
					value: r,
					disabled: i,
					placeholder: e.placeholder ?? e.label,
					onChange: (t) => o(e.key, t.target.value)
				})]
			}, e.key);
		}), s && /* @__PURE__ */ u("label", {
			className: "block",
			children: [/* @__PURE__ */ l("span", {
				className: "text-xs text-sq-secondary",
				children: "Одиниця"
			}), /* @__PURE__ */ l("select", {
				className: `${d} mt-1`,
				value: r.value,
				disabled: i,
				onChange: (e) => r.onChange(e.target.value),
				children: r.options.map((e) => /* @__PURE__ */ l("option", {
					value: e,
					children: e
				}, e))
			})]
		})]
	});
}
//#endregion
//#region src/modules/stock/pages/StockActionPage.tsx
function se(e, t) {
	return e.attributes.filter((e) => e.inLabel).map((e) => {
		let n = t[e.key];
		return n == null || n === "" ? "" : e.unitSuffix ? `${n} ${e.unitSuffix}` : String(n);
	}).filter(Boolean).join(" · ");
}
var ce = [
	{
		code: "damaged",
		label: "Брак"
	},
	{
		code: "lost",
		label: "Втрата"
	},
	{
		code: "gift",
		label: "Подарунок"
	},
	{
		code: "other",
		label: "Інше"
	}
], le = [
	{
		code: "found",
		label: "Знайшли"
	},
	{
		code: "loss",
		label: "Не вистачає"
	},
	{
		code: "data_fix",
		label: "Помилка введення"
	},
	{
		code: "other",
		label: "Інше"
	}
];
function ue(e) {
	if (e && typeof e == "object" && "response" in e) {
		let t = e.response?.data?.error;
		if (t) return t;
	}
	return e instanceof Error ? e.message : "Помилка";
}
function f(e) {
	return /^\d{8,}$/.test(e.trim());
}
function p({ type: d }) {
	let p = ie(), de = o(), [m, fe] = i([]), [pe, me] = i([]), [h, g] = i(""), [_, v] = i([]), [y, he] = i(""), [b, ge] = i(""), [x, _e] = i(d === "writeoff" ? "damaged" : "data_fix"), [S, ve] = i(""), [C, w] = i(null), [T, E] = i(!1), [D, O] = i(!0), ye = e(), [be, k] = i(!1), [A, j] = i(""), [M, N] = i("1"), [P, F] = i(""), [I, L] = i(""), [R, z] = i({}), [B, V] = i(p.defaultUnit), [H, U] = i(""), [xe, W] = i(!1), [Se, G] = i(""), [Ce, we] = i([]), [K, q] = i(null), [Te, Ee] = i(!1), [De, Oe] = i(!1), J = r(null), Y = r(!1), ke = d === "receipt" ? "Прихід товару" : d === "writeoff" ? "Списання" : "Корекція залишку", Ae = d === "receipt" ? "Оберіть товари з поставки або створіть новий — картка зʼявиться в каталозі лише після проведення." : d === "writeoff" ? "Спишіть брак, втрату або подарунок. Кількість не може перевищувати залишок." : "Вкажіть, скільки товару має бути на складі. Система сама порахує різницю.";
	t(() => {
		O(!0), Promise.all([s.stockOnHand(), d === "receipt" ? s.listSuppliers() : Promise.resolve([])]).then(([e, t]) => {
			fe(e), me(t);
		}).catch(() => w("Не вдалося завантажити товари")).finally(() => O(!1));
	}, [d]);
	let X = n(() => new Set(_.filter((e) => e.kind === "existing").map((e) => e.variant_id)), [_]), Z = n(() => _.filter((e) => e.kind === "placeholder").length, [_]), Q = n(() => {
		let e = h.trim().toLowerCase();
		return (e ? m.filter((t) => [
			t.product_name,
			t.label,
			t.sku,
			t.barcode
		].filter(Boolean).some((t) => String(t).toLowerCase().includes(e))) : m).slice(0, e ? 40 : 60);
	}, [m, h]);
	function je(e) {
		if (X.has(e.variant_id)) return;
		let t = `${e.product_name} ${e.label}`.trim();
		v(d === "adjustment" ? (n) => [...n, {
			kind: "existing",
			variant_id: e.variant_id,
			label: t,
			quantity: 0,
			target_qty: e.quantity,
			on_hand: e.quantity
		}] : (n) => [...n, {
			kind: "existing",
			variant_id: e.variant_id,
			label: t,
			quantity: 1,
			unit_cost_cents: e.cost_cents,
			on_hand: e.quantity
		}]), g(""), k(!1);
	}
	async function Me() {
		W(!0);
		try {
			let e = await s.generateInternalBarcode();
			G(e);
		} catch {
			w("Не вдалося згенерувати штрихкод");
		} finally {
			W(!1);
		}
	}
	function Ne() {
		let e = h.trim(), t = f(e);
		j(t ? "" : e), G(t ? e : ""), U(""), N("1"), F(""), L(""), z({}), V(p.defaultUnit), q(null), Y.current = !1;
		let n = (t ? "" : e).toLowerCase(), r = n ? m.filter((e) => e.product_name.toLowerCase().includes(n)).map((e) => e.product_name).filter((e, t, n) => n.indexOf(e) === t).slice(0, 5) : [];
		we(r), k(!0), t && Pe(e);
	}
	async function Pe(e) {
		if (!(d !== "receipt" || Y.current) && f(e) && !re(e)) {
			Ee(!0);
			try {
				let { hint: t } = await ee(e, {
					getGtinCache: async (e) => {
						let t = await s.getGtinCache(e);
						return t.found ? {
							found: !0,
							hint: {
								gtin: t.gtin,
								name: t.name,
								brand: t.brand,
								image_url: t.image_url,
								best_source: t.best_source
							}
						} : { found: !1 };
					},
					ingestGtin: (e, t) => s.ingestGtin(e, t),
					lookupQuotaProviders: (e) => s.lookupGtinQuotaProviders(e)
				});
				t?.name && !Y.current && (Oe(!1), q(t), j((e) => e.trim() ? e : t.name));
			} catch {} finally {
				Ee(!1);
			}
		}
	}
	function Fe(e) {
		G(e), Y.current = !1, J.current && clearTimeout(J.current), J.current = setTimeout(() => {
			Pe(e.trim());
		}, 400);
	}
	function Ie() {
		Y.current = !0, q(null);
	}
	function Le() {
		let e = A.trim();
		if (!e) {
			w("Вкажіть назву нового товару");
			return;
		}
		let t = Number(M);
		if (!t || t <= 0) {
			w("Кількість має бути більше 0");
			return;
		}
		let n = c(P);
		if (P.trim() === "" || n < 0) {
			w("Вкажіть ціну продажу");
			return;
		}
		let r = I.trim(), i = r === "" ? void 0 : c(r), a = R, o = JSON.stringify(p.attributes.map((e) => a[e.key] ?? null));
		if (_.some((t) => t.kind === "placeholder" && t.name.toLowerCase() === e.toLowerCase() && JSON.stringify(p.attributes.map((e) => t.attributes[e.key] ?? null)) === o)) {
			w("Такий новий товар уже є в документі");
			return;
		}
		v((r) => [...r, {
			kind: "placeholder",
			clientKey: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			name: e,
			quantity: t,
			price_cents: n,
			unit_cost_cents: i,
			attributes: a,
			unit: B,
			summary: se(p, a),
			sku: H.trim(),
			barcode: Se.trim()
		}]), k(!1), g(""), w(null);
	}
	async function Re() {
		if (d !== "receipt") return null;
		if (y) return Number(y);
		if (!b.trim()) return null;
		let e = await s.createSupplier({ name: b.trim() });
		return me((t) => [...t, e]), he(e.id), e.id;
	}
	async function $(e, t) {
		if (e.preventDefault(), _.length === 0) {
			w("Додайте хоча б один товар зі списку нижче");
			return;
		}
		if (d === "adjustment" && !_.some((e) => e.kind === "existing" && (e.target_qty ?? e.on_hand) !== e.on_hand)) {
			w("Змініть «Має бути» хоча б для одного товару");
			return;
		}
		if ((d === "writeoff" || d === "adjustment") && x === "other" && !S.trim()) {
			w("Для причини «Інше» потрібен коментар");
			return;
		}
		if (d === "writeoff") {
			let e = _.find((e) => e.kind === "existing" && e.quantity > e.on_hand);
			if (e) {
				w(`На складі лише ${e.on_hand} шт: ${e.label}`);
				return;
			}
		}
		if (!(d === "receipt" && !t && Z > 0 && !window.confirm(`Буде створено ${Z} ${Z === 1 ? "новий товар" : "нових товарів"} у каталозі. Продовжити?`))) {
			E(!0), w(null);
			try {
				let e = await Re(), n = await s.createStockDocument({
					type: d,
					supplier_id: e,
					reason_code: d === "receipt" ? null : x,
					note: S || null
				});
				for (let e of _) {
					if (e.kind === "placeholder") {
						await s.addStockDocumentPlaceholderLine(n.id, {
							name: e.name,
							quantity: e.quantity,
							price_cents: e.price_cents,
							unit_cost_cents: e.unit_cost_cents ?? null,
							attributes: e.attributes,
							unit: e.unit,
							sku: e.sku || null,
							barcode: e.barcode || null
						});
						continue;
					}
					if (d === "adjustment") {
						let t = e.target_qty ?? e.on_hand;
						if (t === e.on_hand) continue;
						await s.addStockDocumentLine(n.id, {
							variant_id: e.variant_id,
							target_qty: t
						});
					} else await s.addStockDocumentLine(n.id, {
						variant_id: e.variant_id,
						quantity: e.quantity,
						unit_cost_cents: d === "receipt" ? e.unit_cost_cents ?? null : null
					});
				}
				t || await s.postStockDocument(n.id, crypto.randomUUID()), de(`/admin/stock/documents/${n.id}`);
			} catch (e) {
				w(ue(e));
			} finally {
				E(!1);
			}
		}
	}
	let ze = d === "writeoff" ? ce : le, Be = d === "receipt" && !D && Q.length === 0 && h.trim().length > 0;
	return /* @__PURE__ */ u("form", {
		className: "max-w-3xl space-y-5 pb-24",
		onSubmit: (e) => void $(e, !1),
		children: [
			/* @__PURE__ */ u("div", { children: [
				/* @__PURE__ */ l(a, {
					to: "/admin/stock",
					className: "text-sm text-[#006AFF] hover:underline",
					children: "← Склад"
				}),
				/* @__PURE__ */ l("h1", {
					className: "text-2xl font-semibold mt-2",
					children: ke
				}),
				/* @__PURE__ */ l("p", {
					className: "text-sm text-[#6E6E6E] mt-1",
					children: Ae
				})
			] }),
			d === "receipt" && /* @__PURE__ */ u("div", {
				className: "grid sm:grid-cols-2 gap-3",
				children: [/* @__PURE__ */ u("label", {
					className: "block space-y-1",
					children: [/* @__PURE__ */ l("span", {
						className: "text-sm text-[#6E6E6E]",
						children: "Постачальник"
					}), /* @__PURE__ */ u("select", {
						value: y,
						onChange: (e) => he(e.target.value ? Number(e.target.value) : ""),
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm",
						children: [/* @__PURE__ */ l("option", {
							value: "",
							children: "Без постачальника"
						}), pe.map((e) => /* @__PURE__ */ l("option", {
							value: e.id,
							children: e.name
						}, e.id))]
					})]
				}), /* @__PURE__ */ u("label", {
					className: "block space-y-1",
					children: [/* @__PURE__ */ l("span", {
						className: "text-sm text-[#6E6E6E]",
						children: "Або новий"
					}), /* @__PURE__ */ l("input", {
						value: b,
						onChange: (e) => ge(e.target.value),
						placeholder: "Назва постачальника",
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
					})]
				})]
			}),
			d !== "receipt" && /* @__PURE__ */ u("div", { children: [/* @__PURE__ */ l("p", {
				className: "text-sm text-[#6E6E6E] mb-1.5",
				children: "Причина"
			}), /* @__PURE__ */ l("div", {
				className: "flex flex-wrap gap-1.5",
				children: ze.map((e) => /* @__PURE__ */ l("button", {
					type: "button",
					onClick: () => _e(e.code),
					className: `px-3 py-1.5 text-sm rounded-[4px] border ${x === e.code ? "border-[#006AFF] bg-[#E8F1FF] text-[#006AFF]" : "border-[#E0E0E0] bg-white"}`,
					children: e.label
				}, e.code))
			})] }),
			/* @__PURE__ */ u("label", {
				className: "block space-y-1",
				children: [/* @__PURE__ */ l("span", {
					className: "text-sm text-[#6E6E6E]",
					children: "Коментар"
				}), /* @__PURE__ */ l("input", {
					value: S,
					onChange: (e) => ve(e.target.value),
					className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm",
					placeholder: x === "other" ? "обовʼязково для «Інше»" : "необовʼязково"
				})]
			}),
			/* @__PURE__ */ u("div", {
				className: "space-y-2",
				children: [/* @__PURE__ */ u("div", {
					className: "flex items-baseline justify-between gap-2",
					children: [/* @__PURE__ */ l("p", {
						className: "text-sm font-medium",
						children: "Товари в документі"
					}), /* @__PURE__ */ u("p", {
						className: "text-xs text-[#6E6E6E]",
						children: [_.length, " поз."]
					})]
				}), /* @__PURE__ */ u("div", {
					className: "rounded-[4px] border border-[#E0E0E0] bg-white divide-y divide-[#E0E0E0]",
					children: [_.length === 0 && /* @__PURE__ */ l("p", {
						className: "p-4 text-sm text-[#6E6E6E]",
						children: "Поки порожньо — оберіть товар зі списку каталогу нижче."
					}), _.map((e, t) => {
						if (e.kind === "placeholder") return /* @__PURE__ */ u("div", {
							className: "p-3 flex flex-wrap gap-3 items-center",
							children: [
								/* @__PURE__ */ u("div", {
									className: "flex-1 min-w-[140px]",
									children: [
										/* @__PURE__ */ u("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [/* @__PURE__ */ l("p", {
												className: "text-sm font-medium",
												children: e.name
											}), /* @__PURE__ */ l("span", {
												className: "text-[11px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-[3px] bg-[#FFF4E5] text-[#B54708]",
												children: "Новий"
											})]
										}),
										/* @__PURE__ */ l("p", {
											className: "text-xs text-[#6E6E6E]",
											children: "Створиться при проведенні"
										}),
										(e.summary || e.barcode) && /* @__PURE__ */ u("p", {
											className: "text-xs text-[#6E6E6E]",
											children: [e.summary, e.barcode ? ` · ${e.barcode}` : ""]
										})
									]
								}),
								/* @__PURE__ */ u("label", {
									className: "text-sm",
									children: [
										"К-сть",
										" ",
										/* @__PURE__ */ l("input", {
											type: "number",
											min: 1,
											value: e.quantity,
											onChange: (e) => {
												let n = Number(e.target.value);
												v((e) => e.map((e, r) => r === t && e.kind === "placeholder" ? {
													...e,
													quantity: n
												} : e));
											},
											className: "ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
										})
									]
								}),
								/* @__PURE__ */ u("label", {
									className: "text-sm",
									children: [
										"Ціна ₴",
										" ",
										/* @__PURE__ */ l("input", {
											value: (e.price_cents / 100).toFixed(2),
											onChange: (e) => {
												let n = c(e.target.value);
												v((e) => e.map((e, r) => r === t && e.kind === "placeholder" ? {
													...e,
													price_cents: n
												} : e));
											},
											className: "ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
										})
									]
								}),
								/* @__PURE__ */ u("label", {
									className: "text-sm",
									children: [
										"Закупка ₴",
										" ",
										/* @__PURE__ */ l("input", {
											value: ((e.unit_cost_cents ?? 0) / 100).toFixed(2),
											onChange: (e) => {
												let n = c(e.target.value);
												v((e) => e.map((e, r) => r === t && e.kind === "placeholder" ? {
													...e,
													unit_cost_cents: n
												} : e));
											},
											className: "ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
										})
									]
								}),
								/* @__PURE__ */ l("button", {
									type: "button",
									onClick: () => v((e) => e.filter((e, n) => n !== t)),
									className: "text-sm text-red-600",
									children: "Прибрати"
								})
							]
						}, e.clientKey);
						let n = (e.target_qty ?? e.on_hand) - e.on_hand;
						return /* @__PURE__ */ u("div", {
							className: "p-3 flex flex-wrap gap-3 items-center",
							children: [
								/* @__PURE__ */ u("div", {
									className: "flex-1 min-w-[140px]",
									children: [/* @__PURE__ */ l("p", {
										className: "text-sm font-medium",
										children: e.label
									}), /* @__PURE__ */ u("p", {
										className: "text-xs text-[#6E6E6E]",
										children: [
											"Зараз на складі: ",
											e.on_hand,
											" шт"
										]
									})]
								}),
								d === "adjustment" ? /* @__PURE__ */ u("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ u("label", {
										className: "text-sm whitespace-nowrap",
										children: [
											"Має бути",
											" ",
											/* @__PURE__ */ l("input", {
												type: "number",
												min: 0,
												value: e.target_qty ?? 0,
												onChange: (e) => {
													let n = Number(e.target.value);
													v((e) => e.map((e, r) => r === t && e.kind === "existing" ? {
														...e,
														target_qty: n
													} : e));
												},
												className: "ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5 font-semibold"
											})
										]
									}), /* @__PURE__ */ l("span", {
										className: `text-sm tabular-nums font-medium ${n === 0 ? "text-[#6E6E6E]" : n > 0 ? "text-emerald-700" : "text-red-600"}`,
										children: n === 0 ? "без змін" : n > 0 ? `+${n}` : n
									})]
								}) : /* @__PURE__ */ u(ae, { children: [/* @__PURE__ */ u("label", {
									className: "text-sm",
									children: [
										"К-сть",
										" ",
										/* @__PURE__ */ l("input", {
											type: "number",
											min: 1,
											value: e.quantity,
											onChange: (e) => {
												let n = Number(e.target.value);
												v((e) => e.map((e, r) => r === t && e.kind === "existing" ? {
													...e,
													quantity: n
												} : e));
											},
											className: "ml-1 w-20 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
										})
									]
								}), d === "receipt" && /* @__PURE__ */ u("label", {
									className: "text-sm",
									children: [
										"Закупка ₴",
										" ",
										/* @__PURE__ */ l("input", {
											value: ((e.unit_cost_cents ?? 0) / 100).toFixed(2),
											onChange: (e) => {
												let n = c(e.target.value);
												v((e) => e.map((e, r) => r === t && e.kind === "existing" ? {
													...e,
													unit_cost_cents: n
												} : e));
											},
											className: "ml-1 w-24 rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1.5"
										})
									]
								})] }),
								/* @__PURE__ */ l("button", {
									type: "button",
									onClick: () => v((e) => e.filter((e, n) => n !== t)),
									className: "text-sm text-red-600",
									children: "Прибрати"
								})
							]
						}, e.variant_id);
					})]
				})]
			}),
			/* @__PURE__ */ u("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ l("p", {
						className: "text-sm font-medium",
						children: "Каталог — натисніть, щоб додати"
					}),
					/* @__PURE__ */ l("input", {
						value: h,
						onChange: (e) => g(e.target.value),
						placeholder: "Пошук назви, SKU або штрихкоду…",
						className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm",
						autoFocus: !0
					}),
					/* @__PURE__ */ u("div", {
						ref: ye,
						className: "rounded-[4px] border border-[#E0E0E0] bg-white max-h-72 overflow-auto divide-y divide-[#E0E0E0] select-none",
						children: [
							D && /* @__PURE__ */ l("p", {
								className: "p-4 text-sm text-[#6E6E6E]",
								children: "Завантаження каталогу…"
							}),
							!D && Q.length === 0 && /* @__PURE__ */ u("div", {
								className: "p-4 space-y-3",
								children: [/* @__PURE__ */ u("p", {
									className: "text-sm text-[#6E6E6E]",
									children: ["Нічого не знайдено", h.trim() ? ` для «${h.trim()}»` : ""]
								}), Be && /* @__PURE__ */ l("button", {
									type: "button",
									onClick: Ne,
									className: "sq-btn-primary px-4 py-2 text-sm",
									children: "+ Створити новий товар"
								})]
							}),
							Q.map((e) => {
								let t = X.has(e.variant_id);
								return /* @__PURE__ */ u("button", {
									type: "button",
									disabled: t,
									onClick: () => je(e),
									className: `w-full text-left px-3 py-2.5 text-sm flex justify-between gap-3 ${t ? "bg-[#F5F5F5] text-[#6E6E6E]" : "hover:bg-[#E8F1FF]"}`,
									children: [/* @__PURE__ */ u("span", { children: [
										/* @__PURE__ */ l("span", {
											className: "font-medium",
											children: e.product_name
										}),
										" ",
										/* @__PURE__ */ l("span", {
											className: "text-[#6E6E6E]",
											children: e.label
										})
									] }), /* @__PURE__ */ l("span", {
										className: "tabular-nums whitespace-nowrap text-[#6E6E6E]",
										children: t ? "додано" : `${e.quantity} шт`
									})]
								}, e.variant_id);
							})
						]
					})
				]
			}),
			be && d === "receipt" && /* @__PURE__ */ u("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white p-4 space-y-3",
				children: [
					/* @__PURE__ */ u("div", { children: [/* @__PURE__ */ l("p", {
						className: "text-sm font-semibold",
						children: "Новий товар у приході"
					}), /* @__PURE__ */ l("p", {
						className: "text-xs text-[#6E6E6E] mt-0.5",
						children: "Картка зʼявиться в каталозі лише після «Провести»."
					})] }),
					Ce.length > 0 && /* @__PURE__ */ u("p", {
						className: "text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-[4px] px-3 py-2",
						children: [
							"Можливо це вже є: ",
							Ce.join(", "),
							"?"
						]
					}),
					Te && /* @__PURE__ */ l("p", {
						className: "text-xs text-[#6E6E6E]",
						children: "Шукаємо назву за штрихкодом…"
					}),
					K?.name && /* @__PURE__ */ u("div", {
						className: "flex items-start gap-3 text-sm bg-[#E8F1FF] border border-[#C5DBFF] rounded-[4px] px-3 py-2",
						children: [
							K.image_url && !De && /* @__PURE__ */ l("img", {
								src: K.image_url,
								alt: "",
								loading: "lazy",
								referrerPolicy: "no-referrer",
								onError: () => Oe(!0),
								className: "w-12 h-12 rounded-[4px] object-cover bg-white shrink-0"
							}),
							/* @__PURE__ */ u("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ u("p", { children: ["Знайдено: ", /* @__PURE__ */ l("span", {
									className: "font-medium",
									children: K.name
								})] }), /* @__PURE__ */ u("p", {
									className: "text-xs text-[#4A6791]",
									children: [K.brand ? `${K.brand} · ` : "", ne(K.best_source)]
								})]
							}),
							/* @__PURE__ */ l("button", {
								type: "button",
								onClick: Ie,
								className: "text-[#006AFF] text-xs underline shrink-0",
								children: "Очистити підказку"
							})
						]
					}),
					/* @__PURE__ */ u("div", {
						className: "grid sm:grid-cols-2 gap-3",
						children: [
							/* @__PURE__ */ u("label", {
								className: "block space-y-1 sm:col-span-2",
								children: [/* @__PURE__ */ l("span", {
									className: "text-sm text-[#6E6E6E]",
									children: "Назва *"
								}), /* @__PURE__ */ l("input", {
									value: A,
									onChange: (e) => j(e.target.value),
									className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm",
									autoFocus: !0
								})]
							}),
							/* @__PURE__ */ u("label", {
								className: "block space-y-1",
								children: [/* @__PURE__ */ l("span", {
									className: "text-sm text-[#6E6E6E]",
									children: "Кількість *"
								}), /* @__PURE__ */ l("input", {
									type: "number",
									min: 1,
									value: M,
									onChange: (e) => N(e.target.value),
									className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
								})]
							}),
							/* @__PURE__ */ u("label", {
								className: "block space-y-1",
								children: [/* @__PURE__ */ l("span", {
									className: "text-sm text-[#6E6E6E]",
									children: "Ціна продажу *"
								}), /* @__PURE__ */ l("input", {
									value: P,
									onChange: (e) => F(e.target.value),
									placeholder: "грн",
									className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
								})]
							}),
							/* @__PURE__ */ u("label", {
								className: "block space-y-1",
								children: [/* @__PURE__ */ l("span", {
									className: "text-sm text-[#6E6E6E]",
									children: "Закупка"
								}), /* @__PURE__ */ l("input", {
									value: I,
									onChange: (e) => {
										let t = e.target.value;
										L(t), !P.trim() && t.trim() && F(t);
									},
									placeholder: "грн",
									className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
								})]
							}),
							/* @__PURE__ */ l(oe, {
								className: "grid gap-2",
								schema: p.attributes,
								value: R,
								onChange: z,
								unit: {
									value: B,
									options: p.units,
									onChange: V
								}
							}),
							/* @__PURE__ */ u("label", {
								className: "block space-y-1",
								children: [
									/* @__PURE__ */ l("span", {
										className: "text-sm text-[#6E6E6E]",
										children: "Артикул (SKU)"
									}),
									/* @__PURE__ */ l("input", {
										value: H,
										onChange: (e) => U(e.target.value),
										className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
									}),
									/* @__PURE__ */ l("span", {
										className: "block text-xs text-[#9A9A9A]",
										children: "код з бирки постачальника"
									})
								]
							}),
							/* @__PURE__ */ u("label", {
								className: "block space-y-1",
								children: [
									/* @__PURE__ */ l("span", {
										className: "text-sm text-[#6E6E6E]",
										children: "Штрихкод"
									}),
									/* @__PURE__ */ u("div", {
										className: "flex gap-2",
										children: [/* @__PURE__ */ l("input", {
											value: Se,
											onChange: (e) => Fe(e.target.value),
											className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
										}), /* @__PURE__ */ l("button", {
											type: "button",
											disabled: xe,
											onClick: () => void Me(),
											title: "Внутрішній код магазину — коли бирка не сканується",
											className: "shrink-0 rounded-[4px] border border-[#E0E0E0] bg-white px-3 text-sm whitespace-nowrap disabled:opacity-50",
											children: "Згенерувати"
										})]
									}),
									/* @__PURE__ */ l("span", {
										className: "block text-xs text-[#9A9A9A]",
										children: "те, що читає сканер — або згенеруйте внутрішній код"
									})
								]
							})
						]
					}),
					/* @__PURE__ */ u("div", {
						className: "flex flex-wrap gap-2",
						children: [/* @__PURE__ */ l("button", {
							type: "button",
							onClick: Le,
							className: "sq-btn-primary px-4 py-2 text-sm",
							children: "Додати в прихід"
						}), /* @__PURE__ */ l("button", {
							type: "button",
							onClick: () => k(!1),
							className: "rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2 text-sm",
							children: "Скасувати"
						})]
					})
				]
			}),
			C && /* @__PURE__ */ l("p", {
				className: "text-sm text-red-600",
				children: C
			}),
			/* @__PURE__ */ u("div", {
				className: "flex flex-wrap gap-2 sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-[#F5F5F5] border-t border-[#E0E0E0]",
				children: [/* @__PURE__ */ l("button", {
					type: "button",
					disabled: T,
					onClick: (e) => void $(e, !0),
					className: "rounded-[4px] border border-[#E0E0E0] bg-white px-4 py-2.5 text-sm",
					children: "Зберегти чернетку"
				}), /* @__PURE__ */ l("button", {
					type: "submit",
					disabled: T || D,
					className: "sq-btn-primary px-6 py-2.5 text-sm",
					children: T ? "…" : "Провести"
				})]
			}),
			d === "receipt" && _.length > 0 && /* @__PURE__ */ u("p", {
				className: "text-xs text-[#6E6E6E]",
				children: [
					"Сума закупки:",
					" ",
					te(_.reduce((e, t) => (t.kind, e + (t.unit_cost_cents ?? 0) * t.quantity), 0)),
					Z > 0 ? ` · нових товарів: ${Z}` : ""
				]
			})
		]
	});
}
//#endregion
export { p as StockActionPage };
