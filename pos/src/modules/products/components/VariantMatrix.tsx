// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCells,
  cellKey,
  existingKeys,
  MAX_MATRIX_ROWS,
  planArticles,
  type Cell,
  type ColourUse,
} from '../lib/variantMatrix';
import { ColourAxis, SizeAxis } from './MatrixAxes';
import { SkuField } from './SkuField';
import { matrixCaption as caption, useMatrixAxes } from '../lib/useMatrixAxes';

/** One variant the matrix will create, in the shape the batch endpoint takes. */
export interface MatrixVariant {
  attributes: { color?: string; size?: string };
  unit: string;
  price_cents: number;
  cost_cents?: number;
  quantity: number;
  sku?: string;
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
  sku?: string;
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
 * Articles are the shop's own numbering, so they are never invented here: the
 * owner gives the first one («Наступний» reads it off the articles already
 * handed out, `SkuField`) and the rows count on from it — the index is unique
 * per store, so every variant gets its own. Each row shows the number it will
 * get and takes another typed over it; an empty field numbers nothing.
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
  tagIds,
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
  /** The card's tags, so «Наступний» can lead with this category's series. */
  tagIds?: number[];
}) {
  const axes = useMatrixAxes({ vocabulary, resetKey });
  const { colours, sizes } = axes;
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [qty, setQty] = useState('0');
  /** The first article; the rows count on from it. Empty numbers nothing. */
  const [sku, setSku] = useState('');
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});

  useEffect(() => {
    if (resetKey === 0) return;
    setEdits({});
    setSku('');
  }, [resetKey]);

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

  // The article each row to be created will carry, by its key — what the
  // row's field shows as its placeholder and what is sent.
  const articles = useMemo(() => {
    const live = rows.filter((r) => !r.exists && !r.edit.removed);
    const plan = planArticles(sku, live.map((r) => r.edit.sku));
    return { byKey: new Map(live.map((r, i) => [r.key, plan.skus[i] ?? ''])), problem: plan.problem };
  }, [rows, sku]);

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
      const article = articles.byKey.get(row.key);
      variants.push({
        attributes,
        unit,
        price_cents: own,
        ...(costCents != null && costCents > 0 ? { cost_cents: costCents } : {}),
        quantity: rowQty,
        ...(article ? { sku: article } : {}),
        ...(barcode ? { barcode } : {}),
      });
    }
    // Last: a price that is missing is the first thing to fix, and with no rows
    // to create there is nothing for an article to repeat on.
    if (live.length > 0) problem ??= articles.problem;
    return { variants: problem ? [] : variants, already, problem };
  }, [rows, price, cost, qty, unit, existing, colours, sizes, articles]);

  // Report only a real change: the parent re-renders on every report, and the
  // result is rebuilt from a memo, so comparing the text keeps this from looping.
  const reported = useRef<string>('');
  useEffect(() => {
    const text = JSON.stringify(result);
    if (text === reported.current) return;
    reported.current = text;
    onChange(result);
  }, [result, onChange]);

  function edit(key: string, patch: RowEdit) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const toCreate = rows.filter((r) => !r.exists && !r.edit.removed).length;

  return (
    <div className="sm:col-span-2 space-y-4" data-testid="variant-matrix">
      <ColourAxis axes={axes} vocabulary={vocabulary} resetKey={resetKey} />
      <SizeAxis axes={axes} resetKey={resetKey} />

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

      <div className="space-y-1.5">
        {/* Its own block, not a third of the price row: the list of series opens under the field and needs the width. */}
        <div className="sm:max-w-md">
          <SkuField
            value={sku}
            onChange={setSku}
            tagIds={tagIds ?? []}
            caption="Артикул першого варіанта"
            captionClass={caption}
          />
        </div>
        <p className="text-[13px] text-sq-muted">
          Кожен варіант отримає наступний номер — його видно в рядку, і там же його можна замінити. Порожнє поле —
          без артикулів.
        </p>
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
                {/* 7.5rem, not 9: with the article field the row must still fit the card's column on one line. */}
                <span className={`flex-1 min-w-[7.5rem] text-[15px] text-sq-text ${struck ? 'line-through' : ''}`}>
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
                    <div className="w-24 shrink-0">
                      <input
                        className="sq-input"
                        aria-label={`Артикул: ${label}`}
                        placeholder={(!struck && articles.byKey.get(row.key)) || 'артикул'}
                        value={row.edit.sku ?? ''}
                        disabled={struck}
                        onChange={(e) => edit(row.key, { sku: e.target.value })}
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
