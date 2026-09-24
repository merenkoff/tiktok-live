// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, formatUah } from '@pos/platform';
import type { Product } from '@pos/platform';
import { Printer, PrinterColor, Segmented, X } from '@pos/platform/ui';
import { buildPriceTags, defaultCopies, variantLabel, type PriceTag } from '../../../lib/priceTag';
import { hasEan13Shape, isEan13 } from '../../../lib/ean13';
import { tagWidthMm, type TagPaperWidth } from '../../../lib/priceTagLayout';
import { triggerPrint } from '../../../lib/triggerPrint';
import { PriceTagsPrintable } from '../../../components/PriceTagsPrintable';

const PAPER_KEY = 'pos.priceTagPaperWidth';
const PAPER_OPTIONS = [
  { value: '58', label: '58 мм' },
  { value: '80', label: '80 мм' },
] as const;

/**
 * Station-local, so it lives in `localStorage` rather than on the store: the
 * desktop cashier keeps `receiptPaperWidthMm` in Dexie, but this page is
 * web-only and the roll is a property of whatever printer is attached here.
 */
function loadPaper(): TagPaperWidth {
  try {
    return localStorage.getItem(PAPER_KEY) === '80' ? 80 : 58;
  } catch {
    return 58;
  }
}

type Row = {
  key: string;
  productName: string;
  variantId: number;
  label: string;
  unit: string;
  priceCents: number;
  sku: string | null;
  barcode: string | null;
  copies: number;
};

export function PriceTagsDialog({
  products,
  storeName,
  onClose,
  onBarcodeGenerated,
}: {
  products: Product[];
  storeName: string;
  onClose: () => void;
  onBarcodeGenerated: () => void;
}) {
  const [paper, setPaper] = useState<TagPaperWidth>(loadPaper);
  const [rows, setRows] = useState<Row[]>(() =>
    products.flatMap((p) =>
      p.variants
        .filter((v) => v.is_active)
        .map((v) => ({
          key: `${p.id}-${v.id}`,
          productName: p.name,
          variantId: v.id,
          label: variantLabel(v),
          unit: v.unit,
          priceCents: v.price_cents,
          sku: v.sku,
          barcode: v.barcode,
          copies: defaultCopies(v.quantity, v.unit),
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

  function choosePaper(next: TagPaperWidth) {
    setPaper(next);
    try {
      localStorage.setItem(PAPER_KEY, String(next));
    } catch {
      // Private browsing: the choice just does not stick.
    }
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

  function print() {
    setPrinting(
      buildPriceTags(
        storeName,
        rows.map((r) => ({
          product: { name: r.productName },
          variant: {
            id: r.variantId,
            label: r.label,
            unit: r.unit,
            price_cents: r.priceCents,
            sku: r.sku,
            barcode: r.barcode,
            quantity: 0,
          },
          copies: r.copies,
        }))
      )
    );
  }

  // The printable sends itself to `document.body`; the dialog is portalled for
  // a different reason — a page wrapper with a finished `animate-fade-up` on it
  // used to leave a transform behind, which made *it* the containing block for
  // `position: fixed`, so this centred itself on the product list instead of on
  // the window. The stylesheet no longer leaves that transform, and portalling
  // means no future one can put the dialog off-screen either.
  return (
    <>
      <PriceTagsPrintable tags={printing} paperWidth={paper} />
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
                  Кількість — за залишком на складі; змініть, якщо треба інакше. Кожен цінник
                  друкується окремою сторінкою, тож принтер ріже їх так само, як чеки.
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
              <span className="text-[15px] text-sq-secondary">Стрічка</span>
              <Segmented
                ariaLabel="Стрічка"
                value={String(paper) as '58' | '80'}
                options={PAPER_OPTIONS}
                onChange={(next) => choosePaper(next === '80' ? 80 : 58)}
              />
              <span className="text-[15px] text-sq-secondary tabular-nums">
                Ширина цінника: {tagWidthMm(paper)} мм
              </span>
              <span className="text-[15px] text-sq-secondary tabular-nums ml-auto">
                Усього цінників: {total}
              </span>
            </div>

            {missing > 0 && (
              <p className="mx-5 mt-3.5 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                Без придатного штрихкоду: {missing}
                {bad > 0 && ` (з них ${bad} — з хибною контрольною цифрою)`}. Такі цінники
                надрукуються без коду — згенеруйте внутрішній, щоб касир міг сканувати.
              </p>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-2">
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
                      <td className="text-right tabular-nums whitespace-nowrap">{formatUah(r.priceCents)}</td>
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

            <div className="flex justify-end gap-2 px-5 py-4 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
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
