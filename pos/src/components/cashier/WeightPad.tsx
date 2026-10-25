// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useEffect, useState, type FormEvent } from 'react';
import { lineAmountCents } from '../../lib/lineMoney';
import { formatUah } from '../../lib/money';
import {
  displayUnit,
  formatQuantity,
  MANUAL_WEIGHT_NOTE,
  parseWeightInput,
  unitPriceLabel,
  weightPadInput,
  weightProblem,
  weightToPadText,
  type WeightPadKey,
  type WeightSource,
} from '../../lib/weighed';
import { Delete, X } from '../../platform/glyphs';

interface Props {
  productName: string;
  /** The variant's caption, when it has one. */
  variantLabel?: string;
  /** The base unit the weight is counted in — `г` or `мл`. */
  unit: string;
  /** What `priceCents` is for: 1000 base units — a kilogram or a litre. */
  pricePer: number;
  priceCents: number;
  /** The weight a cart line already has, to change it; absent for a new weighing. */
  initialQuantity?: number;
  /**
   * What the books say is on the shelf, in base units — shown, never
   * enforced: the scale is the truth and the server sells a weighed line
   * below nothing (TechDocs/grocery/G4_WEIGHED.md, decision 6).
   */
  stock?: number | null;
  /** The button's verb: «Додати» for a new weighing, «Зберегти» for a changed one. */
  confirmLabel?: string;
  onConfirm: (quantity: number, source: WeightSource) => void;
  onClose: () => void;
}

const KEYS: WeightPadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'];

/**
 * The weight pad (phase Г4): the cashier reads the plain scale's display and
 * types it in kilograms — «0,350» — and sees what the line will cost before
 * it goes into the cart, at the sum the server will file (`lineAmountCents`).
 *
 * The weight is typed by hand, and the pad says so: such a line goes out as
 * `weight_source: 'manual'` and the receipt prints «вагу введено вручну» under
 * it. A connected scale (Г9) and a scale's label barcode (Г6) are the phases
 * that will fill this field by themselves.
 *
 * In `@pos/platform/ui` so the bundled fallback catalog and a grocery
 * vertical's own catalog open the same pad, and the cart opens it again to
 * change a weight — a weighed line has no «+1 г».
 */
export function WeightPad({
  productName,
  variantLabel,
  unit,
  pricePer,
  priceCents,
  initialQuantity,
  stock,
  confirmLabel = 'Додати',
  onConfirm,
  onClose,
}: Props) {
  const [text, setText] = useState(() => (initialQuantity ? weightToPadText(initialQuantity) : ''));
  // A weight the till put there is replaced by the first key, as on the cash pad.
  const [fresh, setFresh] = useState(initialQuantity != null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const quantity = parseWeightInput(text);
  const problem = weightProblem(quantity, priceCents, pricePer);
  const sum = quantity != null && quantity > 0 ? lineAmountCents(quantity, priceCents, pricePer) : 0;
  const shown = displayUnit(unit, pricePer);

  function press(key: WeightPadKey) {
    setText((current) => weightPadInput(current, key, fresh));
    setFresh(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (problem || quantity == null) return;
    onConfirm(quantity, 'manual');
  }

  return (
    <div className="fixed inset-0 z-40 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <form
        role="dialog"
        aria-label={`Вага: ${productName}`}
        onSubmit={submit}
        noValidate
        className="bg-white rounded-card w-full max-w-sm overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)] flex flex-col"
        data-testid="weight-pad"
      >
        <div className="pl-5 pr-3 pt-4 pb-1 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 className="text-[19px] font-bold text-sq-heading truncate">{productName}</h3>
            <p className="text-[14px] text-sq-secondary truncate tabular-nums">
              {[variantLabel, unitPriceLabel(priceCents, unit, pricePer)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-2 space-y-3">
          <label className="rounded-[14px] ring-2 ring-sq-blue px-4 py-3 flex flex-col cursor-text">
            <span className="text-[13px] text-sq-secondary flex items-center gap-2">
              Вага
              <span className="text-[11px] font-semibold uppercase tracking-wide text-sq-secondary bg-sq-sidebar rounded px-1.5 py-0.5">
                вручну
              </span>
            </span>
            <span className="flex items-baseline gap-1.5 text-[30px] font-bold text-sq-heading tabular-nums">
              <input
                aria-label={`Вага, ${shown}`}
                className="min-w-0 w-full bg-transparent outline-none border-0 p-0"
                value={text}
                placeholder="0,000"
                inputMode="none"
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\s/g, '').replace('.', ',');
                  if (/^\d{0,3}(,\d{0,3})?$/.test(raw)) {
                    setText(raw);
                    setFresh(false);
                  }
                }}
                data-testid="weight-pad-input"
              />
              <span className="shrink-0">{shown}</span>
            </span>
          </label>

          <div className="flex items-baseline justify-between gap-3 min-h-6">
            {text !== '' && problem ? (
              <p className="text-[14px] text-sq-danger" role="status" data-testid="weight-pad-problem">
                {problem}
              </p>
            ) : (
              <p className="text-[14px] text-sq-secondary tabular-nums" data-testid="weight-pad-sum">
                Сума <span className="font-semibold text-sq-heading">{formatUah(sum)}</span>
              </p>
            )}
            {stock != null && (
              <p className="text-[13px] text-sq-muted tabular-nums shrink-0">
                за обліком {formatQuantity(stock, unit, pricePer)}
              </p>
            )}
          </div>
          <p className="text-[13px] text-sq-muted">Як на дисплеї ваг, у кілограмах. У чеку буде «{MANUAL_WEIGHT_NOTE}».</p>
        </div>

        <div className="px-5 pt-3 grid grid-cols-3 gap-2 auto-rows-fr">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              aria-label={key === 'del' ? 'Стерти' : key === ',' ? 'Кома' : undefined}
              className="min-h-14 rounded-xl bg-sq-sidebar hover:bg-sq-selected active:bg-sq-selected text-[22px] font-semibold text-sq-text grid place-items-center"
              data-testid={`weight-pad-key-${key === ',' ? 'comma' : key}`}
            >
              {key === 'del' ? <Delete size={20} /> : key}
            </button>
          ))}
        </div>

        <div className="p-5">
          <button
            type="submit"
            disabled={problem != null}
            className="pos-btn-primary w-full min-h-[56px] rounded-xl text-[17px] tabular-nums"
            data-testid="weight-pad-confirm"
          >
            {problem != null || quantity == null
              ? confirmLabel
              : `${confirmLabel} · ${formatQuantity(quantity, unit, pricePer)} · ${formatUah(sum)}`}
          </button>
        </div>
      </form>
    </div>
  );
}
