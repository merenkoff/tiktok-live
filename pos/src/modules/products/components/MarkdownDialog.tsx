// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { formatUah } from '@pos/platform';
import type { Product } from '@pos/platform';
import { Segmented } from '@pos/platform/ui';
import { Dialog } from './Dialog';
import { captionClass } from './formStyles';
import {
  ROUNDING_OPTIONS,
  countPhrase,
  createMarkdown,
  groupSkipped,
  previewMarkdown,
  type MarkdownCreated,
  type MarkdownPreview,
  type MarkdownRounding,
} from '../data/markdownsApi';
import { requestErrorMessage } from '../lib/saveErrors';

const PREVIEW_DELAY_MS = 300;

function parsePercent(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/**
 * «Уцінити» over the selected products (clothing D2): a percentage off the
 * ORIGINAL price of every variant, rounded the way the shop prices, with an
 * optional last day — after which the server puts the prices back on its own.
 *
 * The numbers on screen come from the server's preview, never from a client
 * copy of the arithmetic: what the owner reads here («Пальто: 1 590 → 1 110»)
 * is exactly what «Уцінити» will write, and the variants it will leave out
 * are named with the reason (already in a live markdown, priced from its
 * components, nothing left after rounding).
 */
export function MarkdownDialog({
  products,
  onClose,
  onApplied,
}: {
  products: Product[];
  onClose: () => void;
  onApplied: (result: MarkdownCreated) => void;
}) {
  const [percent, setPercent] = useState('');
  const [rounding, setRounding] = useState<'1' | '100' | '1000'>('100');
  const [endsOn, setEndsOn] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<MarkdownPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const pct = parsePercent(percent);

  // The preview follows the fields with a short pause, so typing «30» does
  // not ask the server about «3» first.
  useEffect(() => {
    if (pct == null) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      previewMarkdown({
        product_ids: productIds,
        percent: pct,
        rounding: Number(rounding) as MarkdownRounding,
        ends_on: null,
        name: '',
      })
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(requestErrorMessage(err, 'Не вдалося порахувати уцінку'));
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pct, rounding, productIds]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (pct == null) {
      setError('Вкажіть відсоток знижки від 1 до 99');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createMarkdown({
        product_ids: productIds,
        percent: pct,
        rounding: Number(rounding) as MarkdownRounding,
        ends_on: endsOn || null,
        name: name.trim(),
      });
      onApplied(result);
    } catch (err) {
      setError(requestErrorMessage(err, 'Не вдалося уцінити'));
    } finally {
      setBusy(false);
    }
  }

  const example = preview?.items[0] ?? null;
  const skippedGroups = preview ? groupSkipped(preview.skipped) : [];
  const canApply = !busy && pct != null && (preview?.items.length ?? 0) > 0;

  return (
    <Dialog
      title="Уцінити"
      description={`Обрано товарів: ${products.length}. Знижка рахується від старої ціни, тож повторна уцінка не подвоюється; стара ціна лишиться закресленою на касі й на цінику.`}
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      size="md"
      testId="markdown-dialog"
      footer={
        <>
          <button type="button" className="sq-btn-quiet" onClick={onClose} disabled={busy}>
            Скасувати
          </button>
          <button
            type="submit"
            className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px]"
            disabled={!canApply}
            data-testid="markdown-apply"
          >
            {busy ? 'Уцінюємо…' : preview && preview.items.length > 0 ? `Уцінити ${preview.items.length}` : 'Уцінити'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Знижка, %</span>
          <input
            className="sq-input tabular-nums"
            inputMode="numeric"
            placeholder="30"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            required
            autoFocus
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={captionClass}>Округлення нової ціни</span>
          <Segmented
            ariaLabel="Округлення нової ціни"
            value={rounding}
            options={ROUNDING_OPTIONS}
            onChange={setRounding}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className={captionClass}>Діє до</span>
            <input
              type="date"
              className="sq-input tabular-nums"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </label>
          {/* Outside the label on purpose: a hint inside it becomes part of the field's name. */}
          <p className="text-[13px] text-sq-muted">
            Порожньо — поки не завершите вручну. З датою ціни повернуться самі наступного дня.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={captionClass}>Назва (необов’язково)</span>
          <input
            className="sq-input"
            placeholder={pct != null ? `Уцінка −${pct} %` : 'Літо −30 %'}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-5 rounded-xl bg-sq-sidebar px-4 py-3 text-[15px] space-y-1" data-testid="markdown-preview">
        {pct == null ? (
          <p className="text-sq-muted">Вкажіть відсоток — покажемо, що зміниться.</p>
        ) : previewError ? (
          <p className="text-red-700">{previewError}</p>
        ) : !preview ? (
          <p className="text-sq-muted">Рахуємо…</p>
        ) : (
          <>
            <p className="text-sq-text">
              {preview.items.length > 0
                ? `Уцінимо ${countPhrase(preview.items.length, preview.products)}`
                : 'Немає що уцінювати серед обраних'}
            </p>
            {example && (
              <p className="text-sq-secondary tabular-nums">
                Наприклад, {example.product_name}
                {example.label ? ` · ${example.label}` : ''}: {formatUah(example.compare_at_after)} →{' '}
                {formatUah(example.price_after)}
              </p>
            )}
            {skippedGroups.length > 0 && (
              <p className="text-[13px] text-sq-muted">
                Пропустимо: {skippedGroups.map((g) => `${g.label} — ${g.count}`).join('; ')}
              </p>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </p>
      )}
    </Dialog>
  );
}
