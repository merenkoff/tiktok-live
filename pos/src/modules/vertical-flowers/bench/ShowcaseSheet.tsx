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
import { Printer, X } from '@pos/platform/ui';
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
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div
        className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg"
        data-testid="showcase-sheet"
      >
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Букет на вітрину</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <BouquetPhoto value={imageUrl} onChange={setImageUrl} disabled={busy} />

          <label className="block">
            <span className="text-sm text-sq-secondary">Назва</span>
            <input
              className="pos-field mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              // Left blank on purpose: the number comes from the production
              // document, which only the server mints. Inventing one here would
              // be a guess that two tills could make identically.
              placeholder="Букет №… — за номером документа"
              data-testid="showcase-name"
            />
          </label>

          <label className="block">
            <span className="text-sm text-sq-secondary">Ціна на цінник</span>
            <input
              className="pos-field mt-1.5 text-lg"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(/[^\d.,]/g, ''))}
              data-testid="showcase-price"
            />
            <span className="mt-1 block text-xs text-sq-muted">
              {rounded
                ? `Розраховано: ${formatUah(computedCents)}`
                : 'Стебла та робота флориста'}
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="showcase-error">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy || priceCents <= 0}
              onClick={() => submit(true)}
              className="sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2"
              data-testid="showcase-submit-print"
            >
              <Printer size={20} />
              {busy ? 'Робимо…' : 'Зробити і надрукувати цінник'}
            </button>
            <button
              type="button"
              disabled={busy || priceCents <= 0}
              onClick={() => submit(false)}
              className="min-h-12 w-full rounded-sq border border-sq-divider text-sq-text disabled:opacity-50"
              data-testid="showcase-submit"
            >
              Зробити без цінника
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
