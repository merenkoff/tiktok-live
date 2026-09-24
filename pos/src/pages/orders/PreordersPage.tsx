// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What the shop promised, soonest first (`TechDocs/POS_FLORIST_BENCH.md` §14).
 *
 * The screen a florist opens first thing in the morning, so it answers «що
 * робити сьогодні» and nothing else: open orders only, ordered by when they are
 * due, with the overdue ones still in the list and marked. An order that fell
 * off a screen quietly is somebody standing at a counter with nothing to
 * collect.
 *
 * Handing one over does not happen here. «Видати» puts the order on the till
 * and goes there, because everything that can go wrong with taking money — a
 * ПРРО outage, a receipt that printed but did not register, a refusal that
 * voided the sale — is already handled once, on the sell screen. A second
 * checkout here would be a second place to get that wrong.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Flower2, MapPin, PackageLine, Phone } from '../../platform/glyphs';
import { api, useCartStore } from '@pos/platform';
import { formatUah } from '../../lib/money';
import { cartLinesFromPreorder } from '../../lib/preorderCart';
import type { Preorder } from '../../types';

/** «сьогодні 14:00», «завтра 10:00», «пн, 8 бер, 12:00». */
function dueLabel(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const time = at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(at, today)) return `сьогодні ${time}`;
  if (sameDay(at, tomorrow)) return `завтра ${time}`;
  return `${at.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function PreordersPage() {
  const navigate = useNavigate();
  const restore = useCartStore((s) => s.restore);
  const lines = useCartStore((s) => s.lines);

  const [orders, setOrders] = useState<Preorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.listPreorders());
    } catch {
      setError('Не вдалося завантажити замовлення');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assemble(order: Preorder) {
    setBusyId(order.id);
    try {
      await api.markPreorderAssembled(order.id);
      await load();
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(sent || 'Не вдалося позначити зібраним');
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(order: Preorder) {
    setBusyId(order.id);
    try {
      await api.cancelPreorder(order.id);
      await load();
    } catch {
      setError('Не вдалося скасувати замовлення');
    } finally {
      setBusyId(null);
    }
  }

  function handOver(order: Preorder) {
    restore({ lines: cartLinesFromPreorder(order), preorderId: order.id });
    navigate('/register');
  }

  return (
    // Its own scroller: the till's frame is a fixed-height column, so a morning
    // with a dozen orders must scroll here rather than run off the screen.
    <div className="flex-1 min-h-0 overflow-auto" data-testid="preorders-page">
      <header className="px-4 md:px-7 py-4 md:min-h-[72px]">
        <div className="flex items-center gap-3">
          <CalendarClock size={24} className="shrink-0" />
          <h1 className="text-2xl font-bold text-sq-heading">Замовлення</h1>
        </div>
        <p className="mt-0.5 text-[15px] text-sq-secondary">Що обіцяли, найближче спершу</p>
      </header>

      <div className="px-4 md:px-7 pb-6 space-y-3 max-w-3xl">
        {loading && <p className="text-sm text-sq-muted">Завантаження…</p>}
        {error && (
          <p className="rounded-sq bg-red-50 text-red-700 px-4 py-3 text-sm" data-testid="preorders-error">
            {error}
          </p>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <CalendarClock size={48} />
            <p className="text-[15px] text-sq-secondary max-w-sm">
              Замовлень немає. Наберіть кошик на касі й оформіть його як замовлення.
            </p>
          </div>
        )}

        {orders.map((order) => {
          const overdue = new Date(order.due_at).getTime() < Date.now();
          return (
            <article
              key={order.id}
              className="rounded-card bg-white shadow-card px-5 py-4"
              data-testid="preorder-row"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={`text-[17px] font-semibold ${overdue ? 'text-red-600' : 'text-sq-heading'}`}
                  data-testid="preorder-due-label"
                >
                  {dueLabel(order.due_at)}
                  {overdue && ' · прострочено'}
                </span>
                <span className="text-[17px] font-semibold text-sq-heading tabular-nums shrink-0">
                  {formatUah(order.quoted_total_cents)}
                </span>
              </div>

              <p className="mt-1.5 text-[15px] text-sq-text flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="text-sq-muted inline-flex">
                  {order.fulfilment === 'delivery' ? <MapPin size={16} /> : <PackageLine size={16} />}
                </span>
                {order.recipient_name || order.customer_name || 'Без імені'}
                {order.recipient_phone && (
                  <span className="text-sq-muted flex items-center gap-1 tabular-nums">
                    <Phone size={16} />
                    {order.recipient_phone}
                  </span>
                )}
              </p>
              {order.address && <p className="mt-0.5 text-[13px] text-sq-muted">{order.address}</p>}

              <ul className="mt-2.5 space-y-0.5 text-sm text-sq-secondary">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span className="tabular-nums">{item.quantity} ×</span> {item.product_name}
                    {item.label && ` · ${item.label}`}
                  </li>
                ))}
              </ul>

              {order.card_message && (
                // Set apart because it is the customer's words, not the shop's —
                // the florist copies it onto a card by hand.
                <p
                  className="mt-3 text-[15px] italic text-sq-text bg-sq-sidebar rounded-xl px-3.5 py-2.5"
                  data-testid="preorder-card-message"
                >
                  «{order.card_message}»
                </p>
              )}
              {order.note && <p className="mt-1.5 text-[13px] text-sq-muted">{order.note}</p>}

              {/* What honouring the promise costs now, only when it differs. */}
              {order.current_total_cents != null &&
                order.current_total_cents !== order.quoted_total_cents && (
                  <p className="mt-1.5 text-[13px] text-sq-muted tabular-nums" data-testid="preorder-drift">
                    Сьогодні це коштувало б {formatUah(order.current_total_cents)} — ціну зафіксовано
                    при замовленні.
                  </p>
                )}

              {confirming === order.id ? (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className={quietClass + ' flex-1'}
                  >
                    Ні
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      void cancel(order);
                    }}
                    className="flex-1 min-h-12 rounded-xl bg-red-50 text-red-600 text-[15px] font-semibold"
                    data-testid="preorder-cancel-confirm"
                  >
                    Скасувати замовлення
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(order.id)}
                    disabled={busyId != null}
                    className={quietClass + ' px-4'}
                    data-testid="preorder-cancel"
                  >
                    Скасувати
                  </button>
                  {order.status === 'new' && (
                    <button
                      type="button"
                      onClick={() => void assemble(order)}
                      disabled={busyId != null}
                      className={quietClass + ' px-4 inline-flex items-center gap-2'}
                      data-testid="preorder-assembled"
                    >
                      <Flower2 size={24} />
                      Зібрано
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handOver(order)}
                    // A cart with something already in it would be merged with a
                    // promise, and two people's flowers would land on one receipt.
                    disabled={busyId != null || lines.length > 0}
                    title={lines.length > 0 ? 'Спершу завершіть поточний чек' : undefined}
                    className="pos-btn-primary flex-1 min-h-12 rounded-xl text-[17px]"
                    data-testid="preorder-hand-over"
                  >
                    Видати
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** The white button beside the primary one: a hairline ring, never a fill. */
const quietClass =
  'min-h-12 rounded-xl bg-white ring-1 ring-sq-divider text-[15px] font-semibold text-sq-text hover:bg-sq-sidebar disabled:opacity-40';

export default PreordersPage;
