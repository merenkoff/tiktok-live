// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useRef } from 'react';

const DRAG_THRESHOLD_PX = 6;

interface DragState {
  active: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  pointerId: number;
}

/**
 * Attaches mouse-drag-to-scroll behavior to a scrollable container and suppresses
 * the trailing click if a real drag happened. Only engages for pointerType "mouse" —
 * this targets POS touchscreen terminals whose driver emulates touch as mouse events
 * (so the browser never fires native touch scroll), while leaving real touch/pen
 * pointers untouched since they already get correct native scrolling + click suppression.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const state: DragState = {
      active: false,
      moved: false,
      startX: 0,
      startY: 0,
      scrollLeft: 0,
      scrollTop: 0,
      pointerId: -1,
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      state.active = true;
      state.moved = false;
      state.startX = e.clientX;
      state.startY = e.clientY;
      state.scrollLeft = el.scrollLeft;
      state.scrollTop = el.scrollTop;
      state.pointerId = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!state.active || e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        state.moved = true;
        // Only capture once a real drag starts: setPointerCapture also retargets the
        // resulting "click" event to `el`, which would break plain taps on children.
        el.setPointerCapture(e.pointerId);
      }
      if (state.moved) {
        el.scrollLeft = state.scrollLeft - dx;
        el.scrollTop = state.scrollTop - dy;
      }
    };

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== state.pointerId) return;
      state.active = false;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (state.moved) {
        e.stopPropagation();
        e.preventDefault();
        state.moved = false;
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  return ref;
}
