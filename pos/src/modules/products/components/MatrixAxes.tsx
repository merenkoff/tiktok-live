// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The two axes of the size × colour matrix — the colour chips with the
// store's own vocabulary, and the size chips of a scale — as two blocks over
// the state `lib/useMatrixAxes.ts` keeps, so the product card's matrix
// (`VariantMatrix`) and the receiving grid (`stock/components/ReceiveMatrixDialog`,
// clothing S1) pick colours and sizes with the very same controls. Lifted out
// of `VariantMatrix.tsx` verbatim: the labels, the keys and the remembered
// scale are the ones its tests pin.

import { useEffect, useState } from 'react';
import { sizeHint } from '../../../lib/sizeLadder';
import { foldKey, SIZE_SCALES, type ColourUse } from '../lib/variantMatrix';
import { matrixCaption, type MatrixAxes } from '../lib/useMatrixAxes';

const chipOn =
  'inline-flex items-center gap-1 min-h-9 px-3 rounded-[10px] text-[15px] transition-colors bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold';
const chipOff =
  'inline-flex items-center gap-1 min-h-9 px-3 rounded-[10px] text-[15px] transition-colors bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar';

/**
 * A size chip: the size as saved, and under it the same size in the other
 * system («12–18 міс» under «86», «≈ 104 см» under «3–4 роки») — the main label
 * short, the explanation a quiet second line (TechDocs/POS_CLOTHING.md, C1d).
 * The hint is computed, never saved, and is `aria-hidden`: the button's name
 * stays the size itself, so nothing about choosing one changes for a screen
 * reader or a test.
 */
function SizeChip({ size, pressed, onClick }: { size: string; pressed: boolean; onClick: () => void }) {
  const hint = sizeHint(size);
  return (
    <button
      type="button"
      aria-label={size}
      aria-pressed={pressed}
      title={hint ?? undefined}
      className={`${pressed ? chipOn : chipOff} ${hint ? '!flex-col !gap-0 !py-1 leading-tight' : ''}`}
      onClick={onClick}
    >
      <span>{size}</span>
      {hint && (
        <span aria-hidden="true" className={`text-[11px] font-normal ${pressed ? 'text-sq-blue/80' : 'text-sq-muted'}`}>
          {hint}
        </span>
      )}
    </button>
  );
}

/** The colour block: the chosen colours, the «Новий колір» box and the store's own suggestions. */
export function ColourAxis({
  axes,
  vocabulary,
  resetKey = 0,
}: {
  axes: MatrixAxes;
  vocabulary: ReadonlyArray<ColourUse>;
  resetKey?: number;
}) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (resetKey !== 0) setDraft('');
  }, [resetKey]);
  const suggestions = vocabulary.filter((c) => !axes.colours.some((s) => foldKey(s) === foldKey(c.name))).slice(0, 14);

  return (
    <div className="space-y-2">
      <p className={matrixCaption}>Кольори</p>
      {axes.colours.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Обрані кольори">
          {axes.colours.map((c) => (
            <button
              key={c}
              type="button"
              className={chipOn}
              aria-label={`Прибрати колір ${c}`}
              onClick={() => axes.toggleColour(c)}
            >
              {c} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="sq-input min-w-0"
          aria-label="Новий колір"
          placeholder="Колір — впишіть і натисніть Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              axes.addColour(draft);
              setDraft('');
            }
          }}
        />
        <button
          type="button"
          className="sq-btn-quiet shrink-0"
          onClick={() => {
            axes.addColour(draft);
            setDraft('');
          }}
        >
          Додати
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Кольори магазину">
          {suggestions.map((c) => (
            <button key={c.name} type="button" className={chipOff} onClick={() => axes.toggleColour(c.name)}>
              + {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The size block: the scale, «Усі» / «Жодного», one chip per size and the «Свій розмір» box. */
export function SizeAxis({ axes, resetKey = 0 }: { axes: MatrixAxes; resetKey?: number }) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (resetKey !== 0) setDraft('');
  }, [resetKey]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex flex-col gap-1.5">
          <span className={matrixCaption}>Розміри — яка сітка</span>
          <select
            className="sq-input"
            aria-label="Сітка розмірів"
            value={axes.scaleId}
            onChange={(e) => axes.changeScale(e.target.value)}
          >
            {SIZE_SCALES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="button" className="sq-btn-quiet" onClick={axes.pickAll}>
            Усі
          </button>
          <button type="button" className="sq-btn-quiet" onClick={axes.pickNone}>
            Жодного
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Розміри">
        {axes.shownSizes.map((size) => (
          <SizeChip key={size} size={size} pressed={axes.isPicked(size)} onClick={() => axes.toggleSize(size)} />
        ))}
      </div>
      <input
        className="sq-input"
        aria-label="Свій розмір"
        placeholder="Свій розмір — впишіть і натисніть Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            axes.addSize(draft);
            setDraft('');
          }
        }}
      />
    </div>
  );
}
