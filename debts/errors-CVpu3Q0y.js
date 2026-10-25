// src/modules/debts/lib/errors.ts
function e(e) {
	return typeof e == "number" && Number.isFinite(e) ? e : null;
}
function t(e) {
	return {
		text: e,
		code: null,
		status: null,
		unknown: !0,
		credit: null,
		openLines: null,
		saleVoided: !1,
		limit: null,
		saleIds: [],
		notTakenCents: null
	};
}
function n(t, n) {
	let r = t?.response, i = e(r?.status), a = r?.data ?? null, o = typeof a?.error == "string" ? a.error.trim() : "", s = typeof a?.message == "string" ? a.message.trim() : "", c = /^[a-z][a-z_]*$/.test(o), l = n;
	o && !(c && s) ? l = o : s ? l = s : r || (l = "Немає звʼязку з сервером — перевірте мережу і спробуйте ще раз");
	let u = e(a?.balance_cents), d = e(a?.attempt_cents), f = e(a?.limit_cents), p = e(a?.available_cents);
	return {
		text: l,
		code: typeof a?.code == "string" ? a.code : c ? o : null,
		status: i,
		unknown: !r,
		credit: a?.credit && typeof a.credit == "object" ? a.credit : null,
		openLines: Array.isArray(a?.open_lines) ? a.open_lines : null,
		saleVoided: a?.sale_voided === !0,
		limit: u != null && d != null && f != null && p != null ? {
			balance: u,
			attempt: d,
			limit: f,
			available: p
		} : null,
		saleIds: Array.isArray(a?.sale_ids) ? a.sale_ids.filter((e) => typeof e == "number" && Number.isInteger(e)) : [],
		notTakenCents: e(a?.not_taken_cents)
	};
}
export { t as n, n as t };
