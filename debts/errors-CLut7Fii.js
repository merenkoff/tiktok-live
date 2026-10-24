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
		limit: null
	};
}
function n(t, n) {
	let r = t?.response, i = e(r?.status), a = r?.data ?? null, o = n;
	typeof a?.error == "string" && a.error.trim() ? o = a.error : typeof a?.message == "string" && a.message.trim() ? o = a.message : r || (o = "Немає звʼязку з сервером — перевірте мережу і спробуйте ще раз");
	let s = e(a?.balance_cents), c = e(a?.attempt_cents), l = e(a?.limit_cents), u = e(a?.available_cents);
	return {
		text: o,
		code: typeof a?.code == "string" ? a.code : null,
		status: i,
		unknown: !r,
		credit: a?.credit && typeof a.credit == "object" ? a.credit : null,
		openLines: Array.isArray(a?.open_lines) ? a.open_lines : null,
		saleVoided: a?.sale_voided === !0,
		limit: s != null && c != null && l != null && u != null ? {
			balance: s,
			attempt: c,
			limit: l,
			available: u
		} : null
	};
}
export { t as n, n as t };
