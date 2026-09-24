// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What this shop is holding: the carts any till can pick up
 * (`TechDocs/POS_FLORIST_BENCH.md` §9).
 *
 * Read like a shelf of named parcels rather than a table — the cashier is
 * looking for one name they just heard out loud, so the name is the biggest
 * thing on the row, and who parked it and how long ago sit under it.
 *
 * Two buttons per row and they are deliberately different weights. «Забрати»
 * is the whole point of the screen. «Повернути» puts the flowers back and is
 * destructive in the quiet way — nothing is lost but the bouquet is
 * un-promised — so it confirms first.
 */

import { useState } from 'react';
import { Inbox, RotateCcw, ShoppingBag, X } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';
import type { ParkedCart } from '../../types';

interface Props {
  carts: ParkedCart[];
  loading?: boolean;
  error?: string | null;
  /** Non-null while one row is working, so only that row shows a spinner. */
  busyId?: number | null;
  onPickUp: (cart: ParkedCart) => void;
  onRelease: (cart: ParkedCart) => void;
  onClose: () => void;
}

/** «ще 3 год 20 хв» — how long this cart still holds its flowers. */
function holdsFor(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'термін минув';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours <= 0) return `ще ${minutes} хв`;
  const rest = minutes % 60;
  return rest === 0 ? `ще ${hours} год` : `ще ${hours} год ${rest} хв`;
}

export function ParkedCartsSheet({
  carts,
  loading,
  error,
  busyId,
  onPickUp,
  onRelease,
  onClose,
}: Props) {
  const [confirming, setConfirming] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label="Відкладені кошики"
        className="bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)] flex flex-col max-h-[85vh]"
        data-testid="parked-carts-sheet"
      >
        <div className="pl-5 pr-3 pt-4 pb-2 flex items-center justify-between gap-3 shrink-0">
          <h3 className="text-[19px] font-bold text-sq-heading">Відкладені кошики</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty shrink-0"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-3">
          {loading && <p className="py-3 text-sm text-sq-muted">Завантаження…</p>}

          {error && (
            <p className="py-3 text-sm text-red-600" data-testid="parked-error">
              {error}
            </p>
          )}

          {!loading && !error && carts.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <ShoppingBag size={48} />
              <p className="text-[15px] text-sq-secondary">
                Нічого не відкладено. Кошик, відкладений на будь-якій касі, зʼявиться тут.
              </p>
            </div>
          )}

          {carts.map((cart) => (
            <div
              key={cart.id}
              className="sq-row last:shadow-none py-3.5"
              data-testid="parked-cart-row"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-semibold text-sq-heading truncate">{cart.label}</span>
                <span className="text-[17px] font-semibold text-sq-heading tabular-nums shrink-0">
                  {formatUah(cart.total_cents)}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-sq-muted">
                {cart.staff_name ?? '—'} · {cart.items.length} поз. · {holdsFor(cart.expires_at)}
              </p>
              {cart.note && <p className="mt-1 text-sm text-sq-secondary">{cart.note}</p>}

              {confirming === cart.id ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className={quietClass + ' flex-1'}
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      onRelease(cart);
                    }}
                    className="flex-1 min-h-11 rounded-xl bg-red-50 text-red-600 text-[15px] font-semibold"
                    data-testid="parked-release-confirm"
                  >
                    Повернути товар
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(cart.id)}
                    disabled={busyId != null}
                    className={quietClass + ' px-3.5 inline-flex items-center gap-1.5'}
                    data-testid="parked-release"
                  >
                    <RotateCcw size={20} />
                    Повернути
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickUp(cart)}
                    disabled={busyId != null}
                    className="pos-btn-primary flex-1 min-h-11 rounded-xl text-[15px] gap-1.5"
                    data-testid="parked-pick-up"
                  >
                    <Inbox size={20} />
                    {busyId === cart.id ? 'Забираємо…' : 'Забрати'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The white button beside the primary one: a hairline ring, never a fill. */
const quietClass =
  'min-h-11 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-40';
