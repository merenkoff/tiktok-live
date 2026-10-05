// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The state behind the matrix's two axes (`components/MatrixAxes.tsx`): which
// colours, which scale, which sizes — shared by the product card's matrix and
// the receiving grid (clothing S1). A hook rather than part of the component
// file so that file exports components only (react-refresh).

import { useEffect, useMemo, useState } from 'react';
import {
  canonicalColour,
  detectScale,
  foldKey,
  scaleById,
  tidy,
  type ColourUse,
  type SizeScale,
} from './variantMatrix';

const SCALE_KEY = 'pos.variantMatrix.scale';

/** The last scale chosen on this device — a convenience, never state, so every access is guarded. */
function rememberedScale(): string | null {
  try {
    return window.localStorage.getItem(SCALE_KEY);
  } catch {
    return null;
  }
}

function rememberScale(id: string): void {
  try {
    window.localStorage.setItem(SCALE_KEY, id);
  } catch {
    /* private window, blocked storage: the choice simply is not remembered */
  }
}

export const matrixCaption = 'text-[13px] font-semibold text-sq-secondary';
/** What the axes open on — a card's own colours and sizes, for the receiving grid. */
export interface MatrixAxesInitial {
  colours: readonly string[];
  sizes: readonly string[];
}

export interface MatrixAxes {
  scale: SizeScale;
  scaleId: string;
  changeScale: (id: string) => void;
  colours: string[];
  addColour: (text: string) => void;
  toggleColour: (name: string) => void;
  /** The sizes chosen, in the scale's order, then the ones typed by hand. */
  sizes: string[];
  /** The scale's sizes plus the typed ones — every chip on screen. */
  shownSizes: string[];
  isPicked: (size: string) => boolean;
  toggleSize: (size: string) => void;
  addSize: (text: string) => void;
  pickAll: () => void;
  pickNone: () => void;
}

/**
 * The state behind both blocks. `initial` seeds the choice from a card's
 * variants (the scale is detected from them, a size no scale knows is kept as
 * typed) and is read once, on mount — remount with a `key` to seed anew.
 * `resetKey` clears every pick, as the edit form does after a batch is saved.
 */
export function useMatrixAxes({
  vocabulary,
  resetKey = 0,
  initial,
}: {
  vocabulary: ReadonlyArray<ColourUse>;
  resetKey?: number;
  initial?: MatrixAxesInitial;
}): MatrixAxes {
  const [scaleId, setScaleId] = useState(() =>
    initial && initial.sizes.length > 0 ? detectScale(initial.sizes).id : scaleById(rememberedScale()).id
  );
  const [colours, setColours] = useState<string[]>(() => (initial ? [...initial.colours] : []));
  const [picked, setPicked] = useState<string[]>(() => (initial ? [...initial.sizes] : []));
  const [extraSizes, setExtraSizes] = useState<string[]>(() => {
    if (!initial || initial.sizes.length === 0) return [];
    const known = new Set(detectScale(initial.sizes).sizes.map(foldKey));
    return initial.sizes.filter((size) => !known.has(foldKey(size)));
  });

  const scale = scaleById(scaleId);

  useEffect(() => {
    if (resetKey === 0) return;
    setColours([]);
    setPicked([]);
    setExtraSizes([]);
  }, [resetKey]);

  // The scale's own sizes in the scale's order, then the ones typed by hand.
  const sizes = useMemo(() => {
    const chosen = new Set(picked.map(foldKey));
    const fromScale = scale.sizes.filter((s) => chosen.has(foldKey(s)));
    const typed = extraSizes.filter((s) => chosen.has(foldKey(s)) && !fromScale.some((f) => foldKey(f) === foldKey(s)));
    return [...fromScale, ...typed];
  }, [picked, scale, extraSizes]);

  const shownSizes = useMemo(
    () => [...scale.sizes, ...extraSizes.filter((s) => !scale.sizes.some((f) => foldKey(f) === foldKey(s)))],
    [scale, extraSizes]
  );

  function addColour(text: string) {
    const name = canonicalColour(text, vocabulary);
    if (!name) return;
    setColours((prev) => (prev.some((c) => foldKey(c) === foldKey(name)) ? prev : [...prev, name]));
  }

  function toggleColour(name: string) {
    setColours((prev) =>
      prev.some((c) => foldKey(c) === foldKey(name)) ? prev.filter((c) => foldKey(c) !== foldKey(name)) : [...prev, name]
    );
  }

  function toggleSize(size: string) {
    setPicked((prev) => (prev.some((s) => foldKey(s) === foldKey(size)) ? prev.filter((s) => foldKey(s) !== foldKey(size)) : [...prev, size]));
  }

  function addSize(text: string) {
    const size = tidy(text);
    if (!size) return;
    if (!scale.sizes.some((s) => foldKey(s) === foldKey(size)) && !extraSizes.some((s) => foldKey(s) === foldKey(size))) {
      setExtraSizes((prev) => [...prev, size]);
    }
    setPicked((prev) => (prev.some((s) => foldKey(s) === foldKey(size)) ? prev : [...prev, size]));
  }

  function changeScale(id: string) {
    setScaleId(id);
    rememberScale(id);
    // A new scheme starts a new choice: a month and a year are not two sizes of one shirt.
    setPicked([]);
    setExtraSizes([]);
  }

  return {
    scale,
    scaleId,
    changeScale,
    colours,
    addColour,
    toggleColour,
    sizes,
    shownSizes,
    isPicked: (size) => picked.some((s) => foldKey(s) === foldKey(size)),
    toggleSize,
    addSize,
    pickAll: () => setPicked(shownSizes),
    pickNone: () => setPicked([]),
  };
}
