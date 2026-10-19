// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { Segmented } from '@pos/platform/ui';
import { PriceLabel } from '../../../components/PriceTagsPrintable';
import { labelLayout, type LabelWarning } from '../../../lib/priceLabelLayout';
import {
  LABEL_HEIGHT_MM,
  LABEL_PRESETS,
  LABEL_WIDTH_MM,
  TAG_ROTATIONS,
  formatMm,
  normalizeLabel,
  type LabelSpec,
  type TagRotation,
} from '../../../lib/priceTagMedia';
import type { PriceTag } from '../../../lib/priceTag';

const chipOn =
  'inline-flex items-center min-h-9 px-3 rounded-[10px] text-[15px] tabular-nums transition-colors bg-sq-blue/[0.08] ring-2 ring-inset ring-sq-blue text-sq-blue font-semibold';
const chipOff =
  'inline-flex items-center min-h-9 px-3 rounded-[10px] text-[15px] tabular-nums transition-colors bg-sq-surface ring-1 ring-inset ring-sq-divider text-sq-text font-medium hover:bg-sq-sidebar';

const ROTATION_OPTIONS = TAG_ROTATIONS.map((r) => ({ value: String(r) as `${TagRotation}`, label: `${r}°` }));

/** CSS pixels in a millimetre on screen. */
const MM_PX = 96 / 25.4;
/** The preview's box; a long label is scaled down into it, never up. */
const PREVIEW_MAX = { w: 230, h: 210 };

const WARNING_TEXT: Record<LabelWarning, string> = {
  barcode_small:
    'Штрихкод на наліпці такої ширини виходить дрібнішим за стандарт — сканер може його не прочитати. Візьміть ширшу наліпку або спробуйте поворот на 90°.',
  cramped: 'Не все вміщається на наліпку цього розміру — низ цінника може обрізатися.',
};

function parseMm(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/**
 * The label's size and which way the text runs, with the label drawn as it
 * will come out of the printer.
 *
 * The preview is the very component that prints (`PriceLabel`), on the first
 * tag of the list, so a caption cut short or a barcode that came out too
 * small is seen here and not at the counter.
 */
export function LabelSettings({
  value,
  onChange,
  sample,
}: {
  value: LabelSpec;
  onChange: (next: LabelSpec) => void;
  sample: PriceTag;
}) {
  // Typed text, not numbers: «5» on the way to «58» must not snap to the
  // 20 mm floor while the owner is still typing.
  const [widthText, setWidthText] = useState(formatMm(value.widthMm));
  const [heightText, setHeightText] = useState(formatMm(value.heightMm));

  const layout = labelLayout(value);
  const scale = Math.min(
    1,
    PREVIEW_MAX.w / (layout.page.w * MM_PX),
    PREVIEW_MAX.h / (layout.page.h * MM_PX)
  );

  function set(next: Partial<LabelSpec>) {
    const label = normalizeLabel({ ...value, ...next });
    onChange(label);
    return label;
  }

  function choosePreset(widthMm: number, heightMm: number) {
    const label = set({ widthMm, heightMm });
    setWidthText(formatMm(label.widthMm));
    setHeightText(formatMm(label.heightMm));
  }

  function typed(axis: 'widthMm' | 'heightMm', text: string) {
    (axis === 'widthMm' ? setWidthText : setHeightText)(text);
    const n = parseMm(text);
    const range = axis === 'widthMm' ? LABEL_WIDTH_MM : LABEL_HEIGHT_MM;
    if (n != null && n >= range.min && n <= range.max) set({ [axis]: n });
  }

  function settle() {
    // Whatever is in the boxes when the owner leaves them becomes the label —
    // out of range is pulled back in, nonsense goes back to what it was.
    const label = set({
      widthMm: parseMm(widthText) ?? value.widthMm,
      heightMm: parseMm(heightText) ?? value.heightMm,
    });
    setWidthText(formatMm(label.widthMm));
    setHeightText(formatMm(label.heightMm));
  }

  function swap() {
    choosePreset(value.heightMm, value.widthMm);
  }

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-4">
      <div className="flex-1 min-w-[260px] space-y-3.5">
        <div>
          <p className="text-[13px] font-semibold text-sq-secondary mb-1.5">Розмір наліпки, мм</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Готові розміри">
            {LABEL_PRESETS.map((p) => {
              const on = p.widthMm === value.widthMm && p.heightMm === value.heightMm;
              return (
                <button
                  key={`${p.widthMm}x${p.heightMm}`}
                  type="button"
                  aria-pressed={on}
                  className={on ? chipOn : chipOff}
                  onClick={() => choosePreset(p.widthMm, p.heightMm)}
                >
                  {p.widthMm}×{p.heightMm}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="block text-[13px] text-sq-secondary mb-1">Ширина — поперек стрічки</span>
            <input
              type="text"
              inputMode="decimal"
              value={widthText}
              onChange={(e) => typed('widthMm', e.target.value)}
              onBlur={settle}
              aria-label="Ширина наліпки, мм"
              className="sq-input w-24 text-right tabular-nums"
            />
          </label>
          <button
            type="button"
            onClick={swap}
            className="sq-btn-quiet !min-h-11 !px-3"
            aria-label="Поміняти ширину й висоту"
            title="Поміняти ширину й висоту"
          >
            ⇄
          </button>
          <label className="block">
            <span className="block text-[13px] text-sq-secondary mb-1">Висота — вздовж стрічки</span>
            <input
              type="text"
              inputMode="decimal"
              value={heightText}
              onChange={(e) => typed('heightMm', e.target.value)}
              onBlur={settle}
              aria-label="Висота наліпки, мм"
              className="sq-input w-24 text-right tabular-nums"
            />
          </label>
        </div>

        <div>
          <p className="text-[13px] font-semibold text-sq-secondary mb-1.5">Поворот тексту</p>
          <Segmented
            ariaLabel="Поворот тексту"
            value={String(value.rotate) as `${TagRotation}`}
            options={ROTATION_OPTIONS}
            onChange={(next) => set({ rotate: Number(next) as TagRotation })}
          />
          <p className="text-[13px] text-sq-muted mt-1.5 leading-snug">
            90° — коли наліпки йдуть через принтер вузьким боком уперед, а цінник має читатися вшир.
          </p>
        </div>
      </div>

      <figure className="shrink-0 flex flex-col items-center" aria-label="Попередній вигляд наліпки">
        <figcaption className="text-[12px] text-sq-muted mb-1.5">↑ цей край виходить із принтера першим</figcaption>
        <div
          data-testid="label-preview"
          className="ring-1 ring-sq-divider rounded-[3px] overflow-hidden bg-white shadow-[0_1px_4px_rgba(0,0,0,.08)]"
          style={{ width: layout.page.w * MM_PX * scale, height: layout.page.h * MM_PX * scale }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}>
            <PriceLabel tag={sample} layout={layout} />
          </div>
        </div>
        <p className="text-[12px] text-sq-muted mt-1.5 tabular-nums">
          {formatMm(layout.page.w)} × {formatMm(layout.page.h)} мм
        </p>
      </figure>

      {layout.warnings.length > 0 && (
        <div className="w-full space-y-1.5">
          {layout.warnings.map((w) => (
            <p key={w} className="rounded-xl bg-amber-50 text-amber-800 px-4 py-2.5 text-sm">
              {WARNING_TEXT[w]}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
