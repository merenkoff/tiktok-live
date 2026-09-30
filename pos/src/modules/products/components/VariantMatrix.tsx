// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState } from 'react';
import { sizeHint } from '../../../lib/sizeLadder';
import {
  buildCells,
  canonicalColour,
  cellKey,
  existingKeys,
  foldKey,
  MAX_MATRIX_ROWS,
  SIZE_SCALES,
  scaleById,
  tidy,
  type Cell,
  type ColourUse,
} from './variantMatrix';

/** One variant the matrix will create, in the shape the batch endpoint takes. */
export interface MatrixVariant {
  attributes: { color?: string; size?: string };
  unit: string;
  price_cents: number;
  cost_cents?: number;
  quantity: number;
  barcode?: string;
}

export interface MatrixResult {
  /** What to send — the rows that are new and were not struck out. */
  variants: MatrixVariant[];
  /** How many cells the card already has (they are listed, never created twice). */
  already: number;
  /** Why this cannot be saved yet, in the owner's words; null when it can. */
  problem: string | null;
}

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

const caption = 'text-[13px] font-semibold text-sq-secondary';
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

/** `12,5` and `12.5` and `1 250` are all prices; nothing else is. `null` for blank or nonsense. */
function parseMoney(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

interface RowEdit {
  price?: string;
  qty?: string;
  barcode?: string;
  removed?: boolean;
}

/**
 * The size × colour matrix (TechDocs/POS_CLOTHING.md, phase C1): pick colours,
 * pick sizes from a scale, give one price — and get every combination as a row
 * you can still adjust, instead of adding variants one at a time.
 *
 * Children's scales come first (heights, pairs of heights, months, years). A
 * colour typed is folded into the spelling the store already uses («Малиновий»
 * → «малиновий»), and a cell the card already has is listed as «вже є» and
 * never created twice. Barcodes are left to the server when the vertical mints
 * them (`autoBarcode`) — the field is only for one that came printed on a tag.
 *
 * It owns nothing the parent must persist: every change is reported through
 * `onChange` as the list of variants to send, plus the reason it cannot be
 * saved yet.
 */
export function VariantMatrix({
  unit,
  vocabulary,
  existing,
  autoBarcode,
  onChange,
  resetKey = 0,
}: {
  unit: string;
  /** The store's colours, most used first — suggestions, and the spellings to reuse. */
  vocabulary: ColourUse[];
  /** The card's current variants (edit mode): a cell that is already there is marked, not duplicated. */
  existing?: ReadonlyArray<{ is_active?: boolean; attributes?: Record<string, unknown> | null }>;
  autoBarcode: boolean;
  onChange: (result: MatrixResult) => void;
  /** Change it to clear every pick — the edit form does after a batch has been saved. */
  resetKey?: number;
}) {
  const [scaleId, setScaleId] = useState(() => scaleById(rememberedScale()).id);
  const [colours, setColours] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [extraSizes, setExtraSizes] = useState<string[]>([]);
  const [colourDraft, setColourDraft] = useState('');
  const [sizeDraft, setSizeDraft] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('0');
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  const scale = scaleById(scaleId);

  useEffect(() => {
    if (resetKey === 0) return;
    setColours([]);
    setPicked([]);
    setExtraSizes([]);
    setColourDraft('');
    setSizeDraft('');
    setEdits({});
  }, [resetKey]);

  // The scale's own sizes in the scale's order, then the ones typed by hand.
  const sizes = useMemo(() => {
    const chosen = new Set(picked.map(foldKey));
    const fromScale = scale.sizes.filter((s) => chosen.has(foldKey(s)));
    const typed = extraSizes.filter((s) => chosen.has(foldKey(s)) && !fromScale.some((f) => foldKey(f) === foldKey(s)));
    return [...fromScale, ...typed];
  }, [picked, scale, extraSizes]);

  const have = useMemo(() => existingKeys(existing ?? []), [existing]);
  const cells = useMemo(() => buildCells(colours, sizes), [colours, sizes]);

  const rows = useMemo(
    () =>
      cells.map((cell) => {
        const key = cellKey(cell);
        return { cell, key, exists: have.has(key) && (existing?.length ?? 0) > 0, edit: edits[key] ?? {} };
      }),
    [cells, have, existing, edits]
  );

  const result = useMemo<MatrixResult>(() => {
    const live = rows.filter((r) => !r.exists && !r.edit.removed);
    const already = rows.filter((r) => r.exists).length;
    const commonCents = parseMoney(price);
    const costCents = parseMoney(cost);
    const commonQty = qty.trim() === '' ? 0 : Number(qty);

    let problem: string | null = null;
    const variants: MatrixVariant[] = [];
    if (rows.length > MAX_MATRIX_ROWS) {
      problem = `Забагато варіантів (найбільше ${MAX_MATRIX_ROWS}) — оберіть менше кольорів чи розмірів`;
    } else if ((existing?.length ?? 0) > 0 && colours.length === 0 && sizes.length === 0) {
      // A card that has variants is never meant to gain a blank one: «додати»
      // with nothing chosen is a slip, not a request for a variant with no colour or size.
      problem = 'Оберіть кольори й розміри';
    } else if (live.length === 0 && (existing?.length ?? 0) > 0) {
      problem = already > 0 ? 'Усі ці варіанти вже є' : 'Оберіть кольори й розміри';
    } else if (cost.trim() !== '' && costCents == null) {
      problem = 'Закупівельна ціна — число';
    } else if (!Number.isInteger(commonQty) || commonQty < 0) {
      problem = 'Залишок — ціле число, не менше нуля';
    }

    for (const row of live) {
      const own = row.edit.price != null && row.edit.price.trim() !== '' ? parseMoney(row.edit.price) : commonCents;
      if (own == null || own <= 0) {
        problem ??= 'Вкажіть ціну: загальну або в кожному рядку';
        continue;
      }
      const rowQty = row.edit.qty != null && row.edit.qty.trim() !== '' ? Number(row.edit.qty) : commonQty;
      if (!Number.isInteger(rowQty) || rowQty < 0) {
        problem ??= 'Залишок — ціле число, не менше нуля';
        continue;
      }
      const attributes: MatrixVariant['attributes'] = {};
      if (row.cell.color) attributes.color = row.cell.color;
      if (row.cell.size) attributes.size = row.cell.size;
      const barcode = row.edit.barcode?.trim();
      variants.push({
        attributes,
        unit,
        price_cents: own,
        ...(costCents != null && costCents > 0 ? { cost_cents: costCents } : {}),
        quantity: rowQty,
        ...(barcode ? { barcode } : {}),
      });
    }
    return { variants: problem ? [] : variants, already, problem };
  }, [rows, price, cost, qty, unit, existing, colours, sizes]);

  // Report only a real change: the parent re-renders on every report, and the
  // result is rebuilt from a memo, so comparing the text keeps this from looping.
  const reported = useRef<string>('');
  useEffect(() => {
    const text = JSON.stringify(result);
    if (text === reported.current) return;
    reported.current = text;
    onChange(result);
  }, [result, onChange]);

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

  function edit(key: string, patch: RowEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const suggestions = vocabulary.filter((c) => !colours.some((s) => foldKey(s) === foldKey(c.name))).slice(0, 14);
  const isPicked = (size: string) => picked.some((s) => foldKey(s) === foldKey(size));
  const shownSizes = [...scale.sizes, ...extraSizes.filter((s) => !scale.sizes.some((f) => foldKey(f) === foldKey(s)))];
  const toCreate = rows.filter((r) => !r.exists && !r.edit.removed).length;

  return (
    <div className="sm:col-span-2 space-y-4" data-testid="variant-matrix">
      <div className="space-y-2">
        <p className={caption}>Кольори</p>
        {colours.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Обрані кольори">
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                className={chipOn}
                aria-label={`Прибрати колір ${c}`}
                onClick={() => toggleColour(c)}
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
            value={colourDraft}
            onChange={(e) => setColourDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addColour(colourDraft);
                setColourDraft('');
              }
            }}
          />
          <button
            type="button"
            className="sq-btn-quiet shrink-0"
            onClick={() => {
              addColour(colourDraft);
              setColourDraft('');
            }}
          >
            Додати
          </button>
        </div>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Кольори магазину">
            {suggestions.map((c) => (
              <button key={c.name} type="button" className={chipOff} onClick={() => toggleColour(c.name)}>
                + {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="flex flex-col gap-1.5">
            <span className={caption}>Розміри — яка сітка</span>
            <select
              className="sq-input"
              aria-label="Сітка розмірів"
              value={scaleId}
              onChange={(e) => changeScale(e.target.value)}
            >
              {SIZE_SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className="sq-btn-quiet" onClick={() => setPicked(shownSizes)}>
              Усі
            </button>
            <button type="button" className="sq-btn-quiet" onClick={() => setPicked([])}>
              Жодного
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Розміри">
          {shownSizes.map((size) => (
            <SizeChip key={size} size={size} pressed={isPicked(size)} onClick={() => toggleSize(size)} />
          ))}
        </div>
        <input
          className="sq-input"
          aria-label="Свій розмір"
          placeholder="Свій розмір — впишіть і натисніть Enter"
          value={sizeDraft}
          onChange={(e) => setSizeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSize(sizeDraft);
              setSizeDraft('');
            }
          }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className={caption}>Ціна, грн *</span>
          <input
            className="sq-input tabular-nums"
            inputMode="decimal"
            placeholder="Ціна, грн"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={caption}>Закупівельна ціна, грн</span>
          <input
            className="sq-input tabular-nums"
            inputMode="decimal"
            placeholder="Закупівельна, грн"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={caption}>Залишок кожного, шт</span>
          <input
            className="sq-input tabular-nums"
            inputMode="numeric"
            placeholder="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] text-sq-secondary" aria-live="polite" data-testid="matrix-summary">
          {toCreate === 1 ? 'Буде створено 1 варіант' : `Буде створено варіантів: ${toCreate}`}
          {result.already > 0 && ` · вже є: ${result.already}`}
        </p>
        <ul className="space-y-1.5">
          {rows.map((row, i) => {
            const label = [row.cell.color, row.cell.size].filter(Boolean).join(' / ') || 'Без кольору й розміру';
            const struck = row.edit.removed === true;
            return (
              <li
                key={row.key}
                data-testid={`matrix-row-${i}`}
                className={`flex flex-wrap items-center gap-2 ${row.exists || struck ? 'opacity-50' : ''}`}
              >
                <span className={`flex-1 min-w-[9rem] text-[15px] text-sq-text ${struck ? 'line-through' : ''}`}>
                  {label}
                  {row.exists && <span className="ml-2 text-[13px] text-sq-muted">вже є</span>}
                </span>
                {!row.exists && (
                  <>
                    <div className="w-24 shrink-0">
                      <input
                        className="sq-input tabular-nums"
                        aria-label={`Ціна: ${label}`}
                        inputMode="decimal"
                        placeholder={price || '—'}
                        value={row.edit.price ?? ''}
                        disabled={struck}
                        onChange={(e) => edit(row.key, { price: e.target.value })}
                      />
                    </div>
                    <div className="w-16 shrink-0">
                      <input
                        className="sq-input tabular-nums"
                        aria-label={`Залишок: ${label}`}
                        inputMode="numeric"
                        placeholder={qty || '0'}
                        value={row.edit.qty ?? ''}
                        disabled={struck}
                        onChange={(e) => edit(row.key, { qty: e.target.value })}
                      />
                    </div>
                    <div className="w-32 shrink-0">
                      <input
                        className="sq-input tabular-nums"
                        aria-label={`Штрихкод: ${label}`}
                        placeholder={autoBarcode ? 'авто' : 'штрихкод'}
                        value={row.edit.barcode ?? ''}
                        disabled={struck}
                        onChange={(e) => edit(row.key, { barcode: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="text-sq-muted hover:text-sq-text min-h-9 min-w-9"
                      aria-label={struck ? `Повернути: ${label}` : `Не створювати: ${label}`}
                      onClick={() => edit(row.key, { removed: !struck })}
                    >
                      {struck ? '↺' : '×'}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {result.problem && (
          <p role="status" className="text-[13px] text-sq-danger">
            {result.problem}
          </p>
        )}
        {autoBarcode && <p className="text-[13px] text-sq-muted">Штрихкоди проставить система.</p>}
      </div>
    </div>
  );
}

export type { Cell };
