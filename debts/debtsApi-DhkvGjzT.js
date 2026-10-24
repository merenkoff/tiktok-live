import { api as e } from "@pos/platform";
// src/modules/debts/lib/debtsApi.ts
function t(t, n, r) {
	return e.posRequest(t, n, r);
}
var n = {
	debtors(e = !1) {
		return t("get", e ? "/debts?all=1" : "/debts");
	},
	statement(e) {
		return t("get", `/debts/customers/${e}`);
	},
	balance(e) {
		return t("get", `/debts/customers/${e}/balance`);
	},
	setCredit(e, n) {
		return t("patch", `/debts/customers/${e}/credit`, n);
	},
	issue(e) {
		return t("post", "/debts/issue", e);
	},
	returnGoods(e, n) {
		return t("post", `/debts/customers/${e}/return`, n);
	},
	writeOff(e, n) {
		return t("post", `/debts/customers/${e}/writeoff`, n);
	},
	pay(e, n) {
		return t("post", `/debts/customers/${e}/pay`, n);
	},
	summary(e, n) {
		return t("get", `/debts/summary?${new URLSearchParams({
			from: e,
			to: n
		}).toString()}`);
	}
};
export { n as t };
