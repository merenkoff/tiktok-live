// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, formatUah, unitPriceLabel } from '@pos/platform';
import type { ProductVariant } from '../../../types';
import { Printer, PrinterColor, Segmented, X } from '@pos/platform/ui';
import { buildPriceTags, defaultCopies, variantLabel, type PriceTag } from '../../../lib/priceTag';
import { hasEan13Shape, isEan13 } from '../../../lib/ean13';
import { tagWidthMm } from '../../../lib/priceTagLayout';
import {
  formatMm,
  loadTagMediaSettings,
  mediaOf,
  saveTagMediaSettings,
  type LabelSpec,
  type TagMediaSettings,
} from '../../../lib/priceTagMedia';
import { triggerPrint } from '../../../lib/triggerPrint';
import { PriceTagsPrintable } from '../../../components/PriceTagsPrintable';
import { LabelSettings } from './LabelSettings';

const MEDIA_OPTIONS = [
  { value: 'roll', label: 'Чекова стрічка' },
  { value: 'label', label: 'Наліпки' },
] as const;

const PAPER_OPTIONS = [
  { value: '58', label: '58 мм' },
  { value: '80', label: '80 мм' },
] as const;

/** What the preview shows before the list has a single row with a name. */
const SAMPLE_TAG: PriceTag = {
  storeName: 'Магазин',
  productName: 'Назва товару',
  variantLabel: 'Колір · розмір',
  priceCents: 45000,
  compareAtCents: null,
  sku: 'АРТ-001',
  barcode: '2900000000018',
  copies: 1,
};

/**
 * What the dialog reads of a product — a `Product` as is, or the lines of a
 * posted receiving document folded into this shape by the stock module
 * (clothing L4), which has no `Product` to hand.
 */
export interface PriceTagsDialogProduct {
  id: number;
  name: string;
  variants: Array<
    Pick<
      ProductVariant,
      | 'id'
      | 'label'
      | 'unit'
      | 'price_cents'
      | 'compare_at_cents'
      | 'sku'
      | 'barcode'
      | 'quantity'
      | 'is_active'
      | 'price_per'
    >
  >;
}

/**
 * Where the copies come from. Absent — the stock on hand, one tag per unit on
 * the shelf. Set — a receiving document: only the variants it brought, one tag
 * per unit RECEIVED, so topping up two sizes does not print the whole rail.
 */
export interface PriceTagsReceived {
  docNumber: string;
  byVariant: ReadonlyMap<number, number>;
}

type Row = {
  key: string;
  productName: string;
  variantId: number;
  label: string;
  unit: string;
  priceCents: number;
  compareAtCents: number | null;
  /** 1000 on a weighed variant: the tag says «/кг» and the price per 100 g. */
  pricePer: number;
  sku: string | null;
  barcode: string | null;
  copies: number;
};

export function PriceTagsDialog({
  products,
  storeName,
  received,
  onClose,
  onBarcodeGenerated,
}: {
  products: PriceTagsDialogProduct[];
  storeName: string;
  received?: PriceTagsReceived;
  onClose: () => void;
  onBarcodeGenerated: () => void;
}) {
  // Station-local, in `localStorage` rather than on the store: the media is a
  // property of whatever printer is attached here (`lib/priceTagMedia.ts`).
  const [media, setMedia] = useState<TagMediaSettings>(loadTagMediaSettings);
  // The label's settings take most of the dialog, and a station sets them once:
  // open when labels are chosen here, folded into one line when the dialog
  // opens on labels chosen last time — the list is what it was opened for.
  const [labelOpen, setLabelOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    products.flatMap((p) =>
      p.variants
        // A received variant is printed even if the card has since been
        // archived: the goods are on the rail and need a tag either way.
        .filter((v) => (received ? received.byVariant.has(v.id) : v.is_active))
        .map((v) => ({
          key: `${p.id}-${v.id}`,
          productName: p.name,
          variantId: v.id,
          label: variantLabel(v),
          unit: v.unit,
          priceCents: v.price_cents,
          compareAtCents: v.compare_at_cents ?? null,
          pricePer: v.price_per ?? 1,
          sku: v.sku,
          barcode: v.barcode,
          copies: defaultCopies(received ? received.byVariant.get(v.id) ?? 0 : v.quantity, v.unit),
        }))
    )
  );
  const [printing, setPrinting] = useState<PriceTag[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // The printable is mounted before the dialog triggers the OS dialog, and torn
  // down on `afterprint` — the same handshake usePrintableReceipt uses.
  useEffect(() => {
    if (!printing) return;
    const clear = () => setPrinting(null);
    window.addEventListener('afterprint', clear);
    const raf = requestAnimationFrame(triggerPrint);
    return () => {
      window.removeEventListener('afterprint', clear);
      cancelAnimationFrame(raf);
    };
  }, [printing]);

  const total = useMemo(() => rows.reduce((n, r) => n + r.copies, 0), [rows]);
  const missing = useMemo(() => rows.filter((r) => !isEan13(r.barcode ?? '')).length, [rows]);
  // Thirteen digits that do not add up. Worth calling out on its own: such a
  // tag used to print a symbol that looks perfect and that no scanner accepts,
  // so the shop's conclusion was "the printer is bad", not "this code is".
  const bad = useMemo(
    () => rows.filter((r) => hasEan13Shape(r.barcode ?? '') && !isEan13(r.barcode!)).length,
    [rows]
  );

  function setCopies(key: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, copies: Math.max(0, Math.floor(value) || 0) } : r))
    );
  }

  function updateMedia(next: TagMediaSettings) {
    setMedia(next);
    saveTagMediaSettings(next);
  }

  // Closes the loop from the migration: an item whose article number moved out
  // of the barcode column has nothing to print until a code is minted.
  async function generateFor(row: Row) {
    setBusyKey(row.key);
    try {
      const barcode = await api.generateInternalBarcode();
      await api.updateVariant(row.variantId, { barcode });
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, barcode } : r)));
      onBarcodeGenerated();
    } catch {
      // Nothing changes on screen; pressing again is the recovery.
    } finally {
      setBusyKey(null);
    }
  }

  function tagsOf(list: Row[], copies?: number): PriceTag[] {
    return buildPriceTags(
      storeName,
      list.map((r) => ({
        product: { name: r.productName },
        variant: {
          id: r.variantId,
          label: r.label,
          unit: r.unit,
          price_cents: r.priceCents,
          compare_at_cents: r.compareAtCents,
          price_per: r.pricePer,
          sku: r.sku,
          barcode: r.barcode,
          quantity: 0,
        },
        copies: copies ?? r.copies,
      }))
    );
  }

  function print() {
    setPrinting(tagsOf(rows));
  }

  // One label of the first row: a whole receiving document printed upside
  // down, or on the wrong size of paper, is a roll of labels in the bin.
  const firstRow = rows.find((r) => r.copies > 0) ?? rows[0];
  function printTest() {
    if (firstRow) setPrinting(tagsOf([firstRow], 1));
  }

  const sample = firstRow ? tagsOf([firstRow], 1)[0]! : SAMPLE_TAG;
  const onLabels = media.kind === 'label';

  // The printable sends itself to `document.body`; the dialog is portalled for
  // a different reason — a page wrapper with a finished `animate-fade-up` on it
  // used to leave a transform behind, which made *it* the containing block for
  // `position: fixed`, so this centred itself on the product list instead of on
  // the window. The stylesheet no longer leaves that transform, and portalling
  // means no future one can put the dialog off-screen either.
  return (
    <>
      <PriceTagsPrintable tags={printing} media={mediaOf(media)} />
      {createPortal(
        <div
          data-testid="price-tags-overlay"
          className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-center p-4"
        >
          <div
            role="dialog"
            aria-label="Друк цінників"
            className="bg-white rounded-card w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
          >
            <div className="px-5 pt-[18px] pb-3.5 flex items-start gap-2.5">
              <PrinterColor size={24} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[19px] font-bold text-sq-heading">Друк цінників</h3>
                <p className="text-[15px] text-sq-secondary mt-1 leading-relaxed">
                  {received
                    ? `Кількість — за приходом ${received.docNumber}: по одному цінику на кожну отриману одиницю; змініть, якщо треба інакше.`
                    : 'Кількість — за залишком на складі; змініть, якщо треба інакше.'}{' '}
                  {onLabels
                    ? 'Кожен цінник — окрема наліпка.'
                    : 'Кожен цінник друкується окремою сторінкою, тож принтер ріже їх так само, як чеки.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
                aria-label="Закрити"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-5 pb-3.5 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
              <Segmented
                ariaLabel="На чому друкувати"
                value={media.kind}
                options={MEDIA_OPTIONS}
                onChange={(kind) => {
                  updateMedia({ ...media, kind });
                  setLabelOpen(kind === 'label');
                }}
              />
              {onLabels ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-[15px] text-sq-secondary tabular-nums">
                    Наліпка {formatMm(media.label.widthMm)} × {formatMm(media.label.heightMm)} мм
                    {media.label.rotate !== 0 && `, поворот ${media.label.rotate}°`}
                  </span>
                  <button
                    type="button"
                    className="text-[15px] font-semibold text-sq-blue hover:underline underline-offset-2"
                    aria-expanded={labelOpen}
                    onClick={() => setLabelOpen((open) => !open)}
                  >
                    {labelOpen ? 'Готово' : 'Змінити'}
                  </button>
                </span>
              ) : (
                <>
                  <Segmented
                    ariaLabel="Стрічка"
                    value={String(media.paper) as '58' | '80'}
                    options={PAPER_OPTIONS}
                    onChange={(next) => updateMedia({ ...media, paper: next === '80' ? 80 : 58 })}
                  />
                  <span className="text-[15px] text-sq-secondary tabular-nums">
                    Ширина цінника: {tagWidthMm(media.paper)} мм
                  </span>
                </>
              )}
              <span className="text-[15px] text-sq-secondary tabular-nums ml-auto">
                Усього цінників: {total}
              </span>
            </div>

            {/* One scrolling region under a fixed head and foot: on a phone the
                label's settings alone are taller than the screen, and the
                buttons must not scroll away with them. */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {onLabels && labelOpen && (
                <div className="px-5 py-4 shadow-[0_1px_0_rgb(var(--sq-divider-rgb))]">
                  <LabelSettings
                    value={media.label}
                    onChange={(label: LabelSpec) => updateMedia({ ...media, label })}
                    sample={sample}
                  />
                  <p className="text-[13px] text-sq-secondary leading-snug mt-3.5">
                    У вікні друку оберіть принтер наліпок і папір {formatMm(media.label.widthMm)} ×{' '}
                    {formatMm(media.label.heightMm)} мм (якщо такого немає — додайте його в налаштуваннях
                    принтера), поля — «Немає», масштаб — 100 %. Спершу — «Пробний друк»: одна наліпка
                    покаже, чи збігся розмір і куди дивиться текст.
                  </p>
                </div>
              )}

              {missing > 0 && (
                <p className="mx-5 mt-3.5 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                  Без придатного штрихкоду: {missing}
                  {bad > 0 && ` (з них ${bad} — з хибною контрольною цифрою)`}. Такі цінники
                  надрукуються без коду — згенеруйте внутрішній, щоб касир міг сканувати.
                </p>
              )}

              <div className="px-5 py-2">
                <table className="sq-table">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th className="!text-right">Ціна</th>
                      <th>Штрихкод</th>
                      <th className="!text-right !pr-0">Цінників</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>
                          <p className="text-sq-text">{r.productName}</p>
                          {r.label && <p className="text-[13px] text-sq-muted">{r.label}</p>}
                        </td>
                        <td className="text-right tabular-nums whitespace-nowrap">
                          <p>{unitPriceLabel(r.priceCents, r.unit, r.pricePer)}</p>
                          {r.compareAtCents != null && r.compareAtCents > r.priceCents && (
                            <p className="text-[13px] text-sq-muted">було {formatUah(r.compareAtCents)}</p>
                          )}
                        </td>
                        <td>
                          {isEan13(r.barcode ?? '') ? (
                            <span className="text-[13px] text-sq-secondary tabular-nums">{r.barcode}</span>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              {hasEan13Shape(r.barcode ?? '') && (
                                <span className="text-[13px] text-amber-700 tabular-nums line-through">
                                  {r.barcode}
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={busyKey === r.key}
                                onClick={() => void generateFor(r)}
                                className="sq-btn-quiet !min-h-9 !px-3 !text-[13px]"
                              >
                                Згенерувати
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="!pr-0">
                          <div className="w-20 ml-auto">
                            <input
                              type="number"
                              min={0}
                              value={r.copies}
                              onChange={(e) => setCopies(r.key, Number(e.target.value))}
                              aria-label={`Цінників: ${r.productName}${r.label ? ` · ${r.label}` : ''}`}
                              className="sq-input text-right tabular-nums"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 px-5 py-4 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
              {onLabels && (
                <button
                  type="button"
                  className="sq-btn-quiet mr-auto"
                  disabled={!firstRow}
                  onClick={printTest}
                >
                  Пробний друк
                </button>
              )}
              <button type="button" className="sq-btn-quiet" onClick={onClose}>
                Закрити
              </button>
              <button
                type="button"
                className="pos-btn-primary min-h-11 px-5 rounded-sq text-[15px] gap-2"
                disabled={total === 0}
                onClick={print}
              >
                <Printer size={20} />
                Друкувати {total}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
