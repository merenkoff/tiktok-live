import { useEffect as e, useMemo as t, useState as n } from "react";
import { Link as r, useNavigate as i, useParams as a } from "react-router-dom";
import { api as o } from "@pos/platform";
import { jsx as s, jsxs as c } from "react/jsx-runtime";
//#region src/modules/stock/pages/StockInventoryPage.tsx
function l() {
	let { id: l } = a(), u = i(), [d, f] = n(null), [p, m] = n([]), [h, g] = n(null), [_, v] = n(!1), [y, b] = n("");
	async function x(e) {
		let t = await o.getStockDocument(e);
		f(t), m(t.lines ?? []);
	}
	e(() => {
		l && x(Number(l)).catch(() => g("Не вдалося завантажити"));
	}, [l]);
	async function S() {
		v(!0), g(null);
		try {
			let e = await o.createStockDocument({
				type: "inventory",
				note: "Повна інвентаризація"
			});
			await o.bulkInventoryLines(e.id, {}), u(`/admin/stock/inventory/${e.id}`, { replace: !0 });
		} catch (e) {
			g(e instanceof Error ? e.message : "Помилка");
		} finally {
			v(!1);
		}
	}
	async function C() {
		if (d) {
			v(!0);
			try {
				let e = await o.refreshInventorySystemQty(d.id);
				m(e);
			} catch (e) {
				g(e instanceof Error ? e.message : "Помилка");
			} finally {
				v(!1);
			}
		}
	}
	async function w(e, t) {
		if (!d || d.status !== "draft") return;
		let n = await o.updateStockDocumentLine(d.id, e.id, { counted_qty: t });
		m((t) => t.map((t) => t.id === e.id ? {
			...t,
			...n
		} : t));
	}
	async function T() {
		if (d) {
			v(!0), g(null);
			try {
				let e = await o.postStockDocument(d.id, crypto.randomUUID());
				f(e), m(e.lines ?? []);
			} catch (e) {
				g(e instanceof Error ? e.message : "Помилка проведення");
			} finally {
				v(!1);
			}
		}
	}
	let E = t(() => p.filter((e) => (e.counted_qty ?? e.system_qty ?? 0) !== (e.system_qty ?? 0)), [p]), D = t(() => {
		let e = y.trim().toLowerCase();
		return e ? p.filter((t) => [t.product_name, t.label].filter(Boolean).some((t) => String(t).toLowerCase().includes(e))) : p;
	}, [p, y]);
	return l ? /* @__PURE__ */ c("div", {
		className: "max-w-4xl space-y-4 pb-24",
		children: [
			/* @__PURE__ */ s(r, {
				to: "/admin/stock",
				className: "text-sm text-[#006AFF] hover:underline",
				children: "← Склад"
			}),
			/* @__PURE__ */ c("div", {
				className: "flex flex-wrap items-end justify-between gap-3",
				children: [/* @__PURE__ */ c("div", { children: [
					/* @__PURE__ */ s("p", {
						className: "sq-section-label",
						children: "Інвентаризація"
					}),
					/* @__PURE__ */ s("h1", {
						className: "text-2xl font-semibold",
						children: d?.doc_number ?? "…"
					}),
					/* @__PURE__ */ s("p", {
						className: "text-sm text-[#6E6E6E]",
						children: d?.status === "draft" ? "Чернетка — можна правити" : `Статус: ${d?.status === "posted" ? "Проведено" : d?.status === "voided" ? "Скасовано" : d?.status === "reversed" ? "Відмінено" : d?.status ?? "…"}`
					})
				] }), d?.status === "draft" && /* @__PURE__ */ s("button", {
					type: "button",
					disabled: _,
					onClick: () => void C(),
					className: "rounded-[4px] border border-[#E0E0E0] bg-white px-3 py-2 text-sm",
					children: "Оновити облікові"
				})]
			}),
			/* @__PURE__ */ s("input", {
				value: y,
				onChange: (e) => b(e.target.value),
				placeholder: "Пошук…",
				className: "w-full rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-3 py-2.5 text-sm"
			}),
			h && /* @__PURE__ */ s("p", {
				className: "text-sm text-red-600",
				children: h
			}),
			/* @__PURE__ */ s("div", {
				className: "rounded-[4px] border border-[#E0E0E0] bg-white overflow-hidden",
				children: /* @__PURE__ */ c("table", {
					className: "w-full text-sm",
					children: [/* @__PURE__ */ s("thead", {
						className: "bg-[#F5F5F5] text-left text-[#6E6E6E]",
						children: /* @__PURE__ */ c("tr", { children: [
							/* @__PURE__ */ s("th", {
								className: "px-3 py-2 font-medium",
								children: "Товар"
							}),
							/* @__PURE__ */ s("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Облік"
							}),
							/* @__PURE__ */ s("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Пораховано"
							}),
							/* @__PURE__ */ s("th", {
								className: "px-3 py-2 font-medium text-right",
								children: "Різниця"
							})
						] })
					}), /* @__PURE__ */ s("tbody", { children: D.map((e) => {
						let t = e.system_qty ?? 0, n = e.counted_qty ?? t, r = n - t;
						return /* @__PURE__ */ c("tr", {
							className: "border-t border-[#E0E0E0]",
							children: [
								/* @__PURE__ */ c("td", {
									className: "px-3 py-2",
									children: [
										e.product_name,
										" ",
										/* @__PURE__ */ s("span", {
											className: "text-[#6E6E6E]",
											children: e.label
										})
									]
								}),
								/* @__PURE__ */ s("td", {
									className: "px-3 py-2 text-right tabular-nums",
									children: t
								}),
								/* @__PURE__ */ s("td", {
									className: "px-3 py-2 text-right",
									children: d?.status === "draft" ? /* @__PURE__ */ s("input", {
										type: "number",
										min: 0,
										value: n,
										onChange: (t) => void w(e, Number(t.target.value)),
										className: "w-20 text-right rounded-[4px] border border-[#E0E0E0] bg-[#F5F5F5] px-2 py-1"
									}) : /* @__PURE__ */ s("span", {
										className: "tabular-nums",
										children: n
									})
								}),
								/* @__PURE__ */ s("td", {
									className: `px-3 py-2 text-right tabular-nums font-medium ${r === 0 ? "text-[#6E6E6E]" : r < 0 ? "text-red-600" : "text-emerald-700"}`,
									children: r === 0 ? "—" : r > 0 ? `+${r}` : r
								})
							]
						}, e.id);
					}) })]
				})
			}),
			d?.status === "draft" && /* @__PURE__ */ c("div", {
				className: "fixed bottom-0 left-0 right-0 md:left-[240px] border-t border-[#E0E0E0] bg-white p-4 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ c("p", {
					className: "text-sm",
					children: ["Розбіжностей: ", /* @__PURE__ */ s("strong", { children: E.length })]
				}), /* @__PURE__ */ s("button", {
					type: "button",
					disabled: _,
					onClick: () => {
						window.confirm(`Провести інвентаризацію? Залишки зміняться на пораховані (${E.length} розбіжностей).`) && T();
					},
					className: "sq-btn-primary px-5 py-2.5 text-sm",
					children: "Провести"
				})]
			})
		]
	}) : /* @__PURE__ */ c("div", {
		className: "max-w-xl space-y-4",
		children: [
			/* @__PURE__ */ s(r, {
				to: "/admin/stock",
				className: "text-sm text-[#006AFF] hover:underline",
				children: "← Склад"
			}),
			/* @__PURE__ */ s("h1", {
				className: "text-2xl font-semibold",
				children: "Інвентаризація"
			}),
			/* @__PURE__ */ s("p", {
				className: "text-sm text-[#6E6E6E]",
				children: "Порахуйте фактичні залишки. Система порівняє з обліком і виправить різницю після проведення."
			}),
			h && /* @__PURE__ */ s("p", {
				className: "text-sm text-red-600",
				children: h
			}),
			/* @__PURE__ */ s("button", {
				type: "button",
				disabled: _,
				onClick: () => void S(),
				className: "sq-btn-primary px-5 py-3 text-sm",
				children: "Почати повну інвентаризацію"
			})
		]
	});
}
//#endregion
export { l as StockInventoryPage };
