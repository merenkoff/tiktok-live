import { t as e } from "./debtsApi-BOZMyvlE.js";
import { _ as t, d as n, f as r, i, o as a, p as o, u as s, v as c } from "./queue-B9HzuKEV.js";
import { useCallback as l, useEffect as u, useState as d } from "react";
import { api as f, isOfflinePosEnabled as p, useAuthStore as m, useOfflineStatus as h } from "@pos/platform";
// src/modules/debts/lib/usePending.ts
var g = {
	cents: 0,
	count: 0
};
function _(e) {
	let t = m((e) => e.auth?.store.id ?? null), n = p(), [r, o] = d(g);
	return u(() => {
		if (!n || t == null || e == null) {
			o(g);
			return;
		}
		let r = !0, s = () => {
			a(t, e).then((e) => {
				r && o((t) => t.cents === e.cents && t.count === e.count ? t : e);
			});
		};
		s();
		let c = i(s);
		return () => {
			r = !1, c();
		};
	}, [
		n,
		t,
		e
	]), r;
}
// src/modules/debts/lib/useCredit.ts
function v(i) {
	let a = h((e) => e.online), g = m((e) => e.auth?.store.id ?? null), v = p(), y = _(i), [b, x] = d(() => i == null ? null : s(i)), [S, C] = d(!1), [w, T] = d(!1), [E, D] = d(!1), [O, k] = d(0);
	u(() => {
		if (i != null) return n((e) => {
			e === i && (x(s(e)), C(!1), T(!1), D(!1));
		});
	}, [i]), u(() => {
		if (C(!1), T(!1), D(!1), i == null) {
			x(null);
			return;
		}
		let n = !0;
		x(s(i));
		let o = async () => {
			if (!v || g == null) {
				n && C(!0);
				return;
			}
			let e = await t(g, i);
			n && (T(!0), e === "unknown" ? (x(null), D(!0), C(!0)) : x(e === "none" ? c(i) : e.credit));
		};
		return !a || v && !f.hasLiveJwt() ? (o(), () => {
			n = !1;
		}) : (e.balance(i).then((e) => {
			n && r(e);
		}).catch(() => {
			n && o();
		}), () => {
			n = !1;
		});
	}, [
		i,
		O,
		a,
		v,
		g
	]);
	let A = l(() => k((e) => e + 1), []);
	return {
		credit: b ? o(b, y.cents) : null,
		failed: S,
		local: w,
		unknown: E,
		pending: y,
		reload: A
	};
}
export { v as t };
