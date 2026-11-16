// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useRef, useState } from 'react';
import { api } from '@pos/platform';
import type { SkuSeries } from '@pos/platform';

/**
 * The article field, with «Наступний» beside it.
 *
 * The counterpart of `GenerateBarcodeButton`, with one deliberate difference.
 * A barcode is ours to invent, so that button writes one straight into the
 * field. An article is the shop's own numbering, and a shop usually runs more
 * than one series («0001…» for one kind of goods, «т001…» for another). WHICH
 * series a new card belongs to is the thing that gets forgotten, so this never
 * picks one silently: with several series it lists them all, each with what it
 * is currently used for, and the one the card's own tags already use leads and
 * is marked. Only when the shop numbers exactly one way is there nothing to
 * choose and the number goes straight in.
 *
 * The component owns the whole field — label, input, button and list — because
 * the list has to render as an ordinary block under the input. An absolutely
 * positioned menu would be clipped: `Dialog` is `overflow-hidden` and its body
 * `overflow-y-auto`, and both of this field's homes sit inside one.
 */
export function SkuField({
  value,
  onChange,
  tagIds,
  caption,
  captionClass,
}: {
  value: string;
  onChange: (sku: string) => void;
  /** The card's tags, so the series its kind of goods uses can lead the list. */
  tagIds: number[];
  caption: string;
  captionClass: string;
}) {
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState<SkuSeries[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Kept out of state: it only decides what a late answer is allowed to do.
  const openRef = useRef(false);

  async function load() {
    if (series) {
      setSeries(null);
      openRef.current = false;
      return;
    }
    setBusy(true);
    setFailed(false);
    openRef.current = true;
    try {
      const rows = await api.skuSeries(tagIds);
      if (!openRef.current) return;
      if (rows.length === 1) {
        // Nothing to choose — the shop numbers one way.
        onChange(rows[0]!.next);
        openRef.current = false;
        return;
      }
      setSeries(rows);
    } catch {
      // An empty list and a failed read are different things, and an owner who
      // saw nothing would go and retype a number the shop already uses.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function pick(next: string) {
    onChange(next);
    setSeries(null);
    openRef.current = false;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className={captionClass}>{caption}</span>
        <div className="flex gap-2">
          <input
            className="sq-input min-w-0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            title="Наступний номер у вашій нумерації артикулів"
            className="sq-btn-quiet shrink-0 whitespace-nowrap"
          >
            Наступний
          </button>
        </div>
      </label>

      {failed && (
        <p className="text-[13px] text-sq-muted">
          Не вдалося прочитати нумерацію. Спробуйте ще раз.
        </p>
      )}

      {series && (
        <div
          role="group"
          aria-label="Серії артикулів"
          className="rounded-sq border border-sq-divider bg-sq-bg p-1"
        >
          {series.length === 0 ? (
            <p className="p-2 text-[13px] text-sq-muted">
              Поки жодного артикула з номером — наберіть перший самі, далі
              підкажемо наступний.
            </p>
          ) : (
            series.map((s) => (
              <button
                key={s.prefix || '(digits)'}
                type="button"
                onClick={() => pick(s.next)}
                className="flex w-full flex-col gap-0.5 rounded-sq px-2 py-1.5 text-left hover:bg-sq-surface"
              >
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[15px] text-sq-text">{s.next}</span>
                  {s.inTag > 0 && (
                    <span className="rounded-sq bg-[#006AFF]/10 px-1.5 text-[11px] text-[#006AFF]">
                      ця категорія
                    </span>
                  )}
                </span>
                <span className="text-[12px] text-sq-muted">
                  після {s.last} · {s.count} шт
                  {s.samples.length > 0 && ` · ${s.samples.join(', ')}`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
