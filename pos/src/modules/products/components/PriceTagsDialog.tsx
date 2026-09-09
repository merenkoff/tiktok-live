// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, formatUah } from '@pos/platform';
import type { Product } from '@pos/platform';
import { buildPriceTags, defaultCopies, variantLabel, type PriceTag } from '../../../lib/priceTag';
import { isEan13 } from '../../../lib/ean13';
import { triggerPrint } from '../../../lib/triggerPrint';
import { PriceTagsPrintable, type TagPaperWidth } from '../../../components/PriceTagsPrintable';

const PAPER_KEY = 'pos.priceTagPaperWidth';
const BTN = 'rounded-sq border border-sq-divider bg-sq-surface px-3 py-2 text-sm disabled:opacity-50';

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
          priceCents: v.price_cents,
          sku: v.sku,
          barcode: v.barcode,
          copies: defaultCopies(v.quantity),
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
            size: '',
            color: '',
            price_cents: r.priceCents,
            sku: r.sku,
            barcode: r.barcode,
            quantity: 0,
          },
          copies: r.copies,
        }))
      ).map((tag, i) => ({ ...tag, variantLabel: rows[i]!.label }))
    );
  }

  return (
    <>
      {createPortal(<PriceTagsPrintable tags={printing} paperWidth={paper} />, document.body)}
      <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
        <div className="bg-sq-surface rounded-sq w-full max-w-3xl max-h-[85vh] flex flex-col shadow-lg">
          <div className="p-5 border-b border-sq-divider">
            <p className="sq-section-label">Друк цінників</p>
            <p className="text-sm text-sq-secondary mt-1">
              Кількість — за залишком на складі; змініть, якщо треба інакше. Кожен цінник
              друкується окремою сторінкою, тож принтер ріже їх так само, як чеки.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-sq-divider">
            <span className="text-sm text-sq-secondary">Стрічка</span>
            {([58, 80] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => choosePaper(w)}
                className={`${BTN} ${paper === w ? 'border-[#006AFF] text-[#006AFF]' : ''}`}
              >
                {w} мм
              </button>
            ))}
            <span className="text-sm text-sq-secondary ml-auto">Усього цінників: {total}</span>
          </div>

          {missing > 0 && (
            <p className="mx-5 mt-3 rounded-sq bg-amber-50 text-amber-800 px-3 py-2 text-sm">
              Без штрихкоду: {missing}. Такі цінники надрукуються без коду — згенеруйте
              внутрішній, щоб касир міг сканувати.
            </p>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-3">
            <table className="w-full text-sm">
              <thead className="text-sq-secondary">
                <tr>
                  <th className="text-left font-medium py-1">Товар</th>
                  <th className="text-left font-medium py-1">Ціна</th>
                  <th className="text-left font-medium py-1">Штрихкод</th>
                  <th className="text-right font-medium py-1">Цінників</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sq-divider">
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-2 pr-2">
                      <p className="text-sq-text">{r.productName}</p>
                      {r.label && <p className="text-xs text-sq-secondary">{r.label}</p>}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{formatUah(r.priceCents)}</td>
                    <td className="py-2 pr-2">
                      {isEan13(r.barcode ?? '') ? (
                        <span className="font-mono text-xs">{r.barcode}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyKey === r.key}
                          onClick={() => void generateFor(r)}
                          className={`${BTN} text-xs`}
                        >
                          Згенерувати
                        </button>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={r.copies}
                        onChange={(e) => setCopies(r.key, Number(e.target.value))}
                        className="w-16 rounded-sq border border-sq-divider bg-sq-bg px-2 py-1 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 p-5 border-t border-sq-divider">
            <button type="button" className={BTN} onClick={onClose}>
              Закрити
            </button>
            <button
              type="button"
              className="sq-btn-primary px-4 py-2 text-sm disabled:opacity-50"
              disabled={total === 0}
              onClick={print}
            >
              Друкувати {total}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
