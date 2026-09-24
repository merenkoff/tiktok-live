// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The bench's second ending: a bouquet made for the window rather than for the
 * customer standing there (`TechDocs/POS_FLORIST_BENCH.md` §11).
 *
 * It becomes a catalogue card for ONE physical object — its own price, stock of
 * exactly 1 — and the stems leave the shelf through a production document. All
 * of that happens in one server call; this sheet only collects the two things
 * the server cannot know: what to call it, and whether the florist rounded the
 * price.
 *
 * Rounding the price here is NOT the hole §3.5 refuses. That one was a freely
 * settable price on a *line of a receipt*, invisible in every report. This is
 * the catalogue price of a real product card — the place prices are supposed to
 * live, printed on the tag and visible everywhere.
 */

import { useState } from 'react';
import { Printer, Store, X } from '@pos/platform/ui';
import { formatUah, uahInputToCents } from '@pos/platform';
import { BouquetPhoto } from './BouquetPhoto';

interface Props {
  /** What the bench computed: stems at catalogue price plus the labour charge. */
  computedCents: number;
  busy: boolean;
  error: string | null;
  onSubmit: (input: {
    name: string | null;
    priceCents: number | null;
    imageUrl: string | null;
    print: boolean;
  }) => void;
  onClose: () => void;
}

export function ShowcaseSheet({ computedCents, busy, error, onSubmit, onClose }: Props) {
  const [name, setName] = useState('');
  // Comma, like every other price on this screen. `uahInputToCents` takes
  // either, but a field that disagrees with the total two panels away reads as
  // a different number.
  const [priceText, setPriceText] = useState(
    (computedCents / 100).toFixed(2).replace('.', ',')
  );

  // Uploaded as soon as it is shot, so the card carries it from birth rather
  // than needing a second write. Optional: a bouquet without a photo still has
  // its printed tag, and making the camera mandatory would stop a sale.
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const priceCents = uahInputToCents(priceText);
  const rounded = priceCents !== computedCents;

  function submit(print: boolean): void {
    onSubmit({
      name: name.trim() || null,
      // Send a price only when it differs: otherwise the server prices the
      // bouquet from its components itself, which keeps one authority for the
      // arithmetic instead of two that can drift.
      priceCents: rounded ? priceCents : null,
      imageUrl,
      print,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label="Букет на вітрину"
        className="bg-white rounded-card w-full max-w-[460px] overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)]"
        data-testid="showcase-sheet"
      >
        <div className="px-5 pt-[18px] pb-3.5 flex items-center gap-2.5">
          <Store size={24} />
          <h3 className="flex-1 text-[19px] font-bold text-sq-heading">Букет на вітрину</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-9 h-9 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-5 flex flex-col gap-3.5">
          <BouquetPhoto value={imageUrl} onChange={setImageUrl} disabled={busy} />

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Назва</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              // Left blank on purpose: the number comes from the production
              // document, which only the server mints. Inventing one here would
              // be a guess that two tills could make identically.
              placeholder="Букет №… — за номером документа"
              data-testid="showcase-name"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-sq-secondary">Ціна на цінник</span>
            <input
              className={`${fieldClass} text-lg font-semibold tabular-nums`}
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(/[^\d.,]/g, ''))}
              data-testid="showcase-price"
            />
            <span className="text-[13px] text-sq-muted">
              {rounded
                ? `Стебла й робота флориста — ${formatUah(computedCents)}, округлено`
                : 'Стебла та робота флориста'}
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="showcase-error">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || priceCents <= 0}
            onClick={() => submit(true)}
            className="pos-btn-primary min-h-[52px] rounded-xl w-full text-[17px] gap-2"
            data-testid="showcase-submit-print"
          >
            <Printer size={20} />
            {busy ? 'Робимо…' : 'Зробити і надрукувати цінник'}
          </button>
          <button
            type="button"
            disabled={busy || priceCents <= 0}
            onClick={() => submit(false)}
            className="min-h-11 w-full text-base font-semibold text-sq-blue disabled:opacity-50"
            data-testid="showcase-submit"
          >
            Зробити без цінника
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  'h-[46px] rounded-[10px] bg-sq-empty px-3.5 text-base text-sq-text outline-none border-0 focus:ring-2 focus:ring-sq-blue focus:bg-white placeholder:text-sq-muted';
