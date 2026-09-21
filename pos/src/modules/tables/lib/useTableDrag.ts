// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Dragging a table around the plan (phase К4i).
//
// Written by hand on pointer events, like `useDragScroll` in the host, and for
// the same reason: `pos/` has ten runtime dependencies and a drag-and-drop
// library would be an eleventh for one screen the owner opens twice a year.
//
// Two things it borrows from that hook and one it does not. It borrows the
// 6 px threshold — a tap on a table is «edit it», and a finger that moves two
// pixels while tapping must not count as a drag — and the click suppression
// that follows, so letting go does not also open the form. It does NOT limit
// itself to `pointerType === 'mouse'`: that hook is about POS touchscreens
// whose driver fakes a mouse and where real touch already scrolls natively,
// while here a real finger on a tablet is exactly how an owner lays out a
// room. The tile carries `touch-action: none` so the browser does not take
// the gesture away as a scroll.

import { useCallback, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 6;

export interface DragState {
  /** The table being dragged, or null while nothing is. */
  id: number | null;
  /** Pixels travelled since the press — what the tile offsets itself by. */
  dx: number;
  dy: number;
}

export interface TableDrag {
  drag: DragState;
  /** Attach to each tile: `onPointerDown={(e) => start(e, table.id)}`. */
  start: (event: React.PointerEvent<HTMLElement>, id: number) => void;
  /** True while the last gesture was a real drag — the tile swallows the click. */
  suppressClick: () => boolean;
}

/**
 * @param onDrop  called once, with the pixels travelled, when a real drag ends.
 */
export function useTableDrag(onDrop: (id: number, dxPx: number, dyPx: number) => void): TableDrag {
  const [drag, setDrag] = useState<DragState>({ id: null, dx: 0, dy: 0 });
  const movedRef = useRef(false);

  const start = useCallback(
    (event: React.PointerEvent<HTMLElement>, id: number) => {
      if (event.button !== 0) return;
      const el = event.currentTarget;
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      movedRef.current = false;
      setDrag({ id, dx: 0, dy: 0 });

      const move = (e: PointerEvent): void => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!movedRef.current && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          movedRef.current = true;
          // Captured only once a real drag starts: capturing on press would
          // retarget the click and break a plain tap on the tile.
          try {
            el.setPointerCapture(pointerId);
          } catch {
            // A test environment without pointer capture — the drag still works.
          }
        }
        if (movedRef.current) setDrag({ id, dx, dy });
      };

      const end = (e: PointerEvent): void => {
        if (e.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        setDrag({ id: null, dx: 0, dy: 0 });
        if (movedRef.current) onDrop(id, dx, dy);
      };

      // On `window`, not the tile: a finger that leaves the tile mid-drag
      // (which is the normal case — the table moves out from under it) must
      // not silently drop the gesture.
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [onDrop]
  );

  const suppressClick = useCallback(() => {
    if (!movedRef.current) return false;
    movedRef.current = false;
    return true;
  }, []);

  return { drag, start, suppressClick };
}
