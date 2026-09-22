import { useEffect as e, useRef as t } from "react";
//#region src/hooks/useDragScroll.ts
var n = 6;
function r() {
	let r = t(null);
	return e(() => {
		let e = r.current;
		if (!e) return;
		let t = {
			active: !1,
			moved: !1,
			startX: 0,
			startY: 0,
			scrollLeft: 0,
			scrollTop: 0,
			pointerId: -1
		}, i = (n) => {
			n.pointerType === "mouse" && n.button === 0 && (t.active = !0, t.moved = !1, t.startX = n.clientX, t.startY = n.clientY, t.scrollLeft = e.scrollLeft, t.scrollTop = e.scrollTop, t.pointerId = n.pointerId);
		}, a = (r) => {
			if (!t.active || r.pointerId !== t.pointerId) return;
			let i = r.clientX - t.startX, a = r.clientY - t.startY;
			!t.moved && Math.hypot(i, a) > n && (t.moved = !0, e.setPointerCapture(r.pointerId)), t.moved && (e.scrollLeft = t.scrollLeft - i, e.scrollTop = t.scrollTop - a);
		}, o = (e) => {
			e.pointerId === t.pointerId && (t.active = !1);
		}, s = (e) => {
			t.moved && (e.stopPropagation(), e.preventDefault(), t.moved = !1);
		};
		return e.addEventListener("pointerdown", i), e.addEventListener("pointermove", a), e.addEventListener("pointerup", o), e.addEventListener("pointercancel", o), e.addEventListener("click", s, !0), () => {
			e.removeEventListener("pointerdown", i), e.removeEventListener("pointermove", a), e.removeEventListener("pointerup", o), e.removeEventListener("pointercancel", o), e.removeEventListener("click", s, !0);
		};
	}, []), r;
}
//#endregion
export { r as t };
