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
import { Inbox, RotateCcw, X } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div
        className="bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg flex flex-col max-h-[85vh]"
        data-testid="parked-carts-sheet"
      >
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Відкладені кошики</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {loading && <p className="p-3 text-sm text-sq-muted">Завантаження…</p>}

          {error && (
            <p className="p-3 text-sm text-red-600" data-testid="parked-error">
              {error}
            </p>
          )}

          {!loading && !error && carts.length === 0 && (
            <p className="p-6 text-center text-sm text-sq-muted">
              Нічого не відкладено. Кошик, відкладений на будь-якій касі, зʼявиться тут.
            </p>
          )}

          {carts.map((cart) => (
            <div
              key={cart.id}
              className="rounded-sq border border-sq-divider p-3"
              data-testid="parked-cart-row"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-sq-text truncate">{cart.label}</span>
                <span className="text-sm font-semibold text-sq-text shrink-0">
                  {formatUah(cart.total_cents)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-sq-muted">
                {cart.staff_name ?? '—'} · {cart.items.length} поз. · {holdsFor(cart.expires_at)}
              </p>
              {cart.note && <p className="mt-1 text-xs text-sq-secondary">{cart.note}</p>}

              {confirming === cart.id ? (
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="flex-1 min-h-11 rounded-sq bg-sq-bg text-sq-secondary text-sm font-semibold"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      onRelease(cart);
                    }}
                    className="flex-1 min-h-11 rounded-sq bg-red-50 text-red-600 text-sm font-semibold"
                    data-testid="parked-release-confirm"
                  >
                    Повернути товар
                  </button>
                </div>
              ) : (
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(cart.id)}
                    disabled={busyId != null}
                    className="min-h-11 px-3 rounded-sq bg-sq-bg text-sq-secondary text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
                    data-testid="parked-release"
                  >
                    <RotateCcw size={16} />
                    Повернути
                  </button>
                  <button
                    type="button"
                    onClick={() => onPickUp(cart)}
                    disabled={busyId != null}
                    className="pos-btn-primary flex-1 min-h-11 text-sm flex items-center justify-center gap-1.5 disabled:opacity-40"
                    data-testid="parked-pick-up"
                  >
                    <Inbox size={16} />
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
