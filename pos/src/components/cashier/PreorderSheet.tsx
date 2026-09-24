// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Taking an order for a day that has not happened yet
 * (`TechDocs/POS_FLORIST_BENCH.md` §14).
 *
 * More fields than any other sheet in the till, and each one earns its place by
 * being something the florist would otherwise write on a sticky note:
 *
 * - **when** — the only required field besides the cart itself;
 * - **recipient**, separately from the buyer, because in a flower shop they are
 *   usually different people and the courier needs the second phone number;
 * - **card message**, which is the customer's words copied onto a card by hand,
 *   so it is not the same field as a note to the shop.
 *
 * The price is quoted by the server and locked there. Nothing here sends one.
 *
 * Online only, and it says so rather than timing out: taking an order means the
 * server issuing an id and pricing the lines.
 */

import { useState } from 'react';
import { Clock, X } from '../../platform/glyphs';
import { formatUah } from '../../lib/money';

interface Props {
  totalCents: number;
  lineCount: number;
  defaultRecipient?: string;
  online: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (input: {
    due_at: string;
    fulfilment: 'pickup' | 'delivery';
    address: string | null;
    recipient_name: string | null;
    recipient_phone: string | null;
    card_message: string | null;
    note: string | null;
  }) => void;
  onClose: () => void;
}

/** Tomorrow at noon — the commonest order, and a date nobody has to retype. */
function defaultDue(): string {
  const at = new Date(Date.now() + 86_400_000);
  at.setHours(12, 0, 0, 0);
  // `datetime-local` wants a local-time string with no zone.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function PreorderSheet({
  totalCents,
  lineCount,
  defaultRecipient,
  online,
  busy,
  error,
  onSubmit,
  onClose,
}: Props) {
  const [dueAt, setDueAt] = useState(defaultDue());
  const [fulfilment, setFulfilment] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [recipientName, setRecipientName] = useState(defaultRecipient ?? '');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [cardMessage, setCardMessage] = useState('');
  const [note, setNote] = useState('');

  const needsAddress = fulfilment === 'delivery' && !address.trim();

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(28,32,38,.32)] grid place-items-end md:place-items-center p-4">
      <div
        role="dialog"
        aria-label="Замовлення наперед"
        className="bg-white rounded-card w-full max-w-md overflow-hidden animate-fade-up shadow-[0_24px_60px_rgba(0,20,60,.28)] flex flex-col max-h-[90vh]"
        data-testid="preorder-sheet"
      >
        <div className="pl-5 pr-3 pt-4 pb-2 flex items-center justify-between gap-3 shrink-0">
          <h3 className="text-[19px] font-bold text-sq-heading">Замовлення наперед</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="w-10 h-10 grid place-items-center rounded-full text-sq-secondary hover:bg-sq-empty disabled:opacity-40 shrink-0"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pt-1 pb-5 space-y-4">
          <p className="text-sm text-sq-secondary">
            {lineCount} поз. на <span className="tabular-nums">{formatUah(totalCents)}</span>. Ціну зафіксовано на сьогодні — навіть
            якщо квіти подорожчають, клієнт заплатить стільки. Залишок не резервується: стебла
            купуються ближче до дати.
          </p>

          <label className={labelClass}>
            <span className={captionClass}>Коли</span>
            <input
              type="datetime-local"
              className="pos-field"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              data-testid="preorder-due"
            />
          </label>

          <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty" role="group" aria-label="Спосіб видачі">
            {(['pickup', 'delivery'] as const).map((mode) => {
              const on = fulfilment === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFulfilment(mode)}
                  className={`flex-1 min-h-11 rounded-[9px] text-[15px] transition-colors ${
                    on
                      ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                      : 'font-medium text-sq-secondary hover:text-sq-text'
                  }`}
                  data-testid={`preorder-${mode}`}
                >
                  {mode === 'pickup' ? 'Самовивіз' : 'Доставка'}
                </button>
              );
            })}
          </div>

          {fulfilment === 'delivery' && (
            <label className={labelClass}>
              <span className={captionClass}>Адреса</span>
              <input
                className="pos-field"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="вул. Хрещатик, 1, кв. 5"
                data-testid="preorder-address"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span className={captionClass}>Отримувач</span>
              <input
                className="pos-field"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Оксана"
                data-testid="preorder-recipient"
              />
            </label>
            <label className={labelClass}>
              <span className={captionClass}>Телефон</span>
              <input
                className="pos-field tabular-nums"
                inputMode="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+380…"
                data-testid="preorder-phone"
              />
            </label>
          </div>

          <label className={labelClass}>
            <span className={captionClass}>Текст листівки</span>
            <textarea
              className="pos-field min-h-[72px]"
              value={cardMessage}
              onChange={(e) => setCardMessage(e.target.value)}
              placeholder="З днем народження!"
              data-testid="preorder-card"
            />
            <span className="text-[13px] text-sq-muted">
              Слова клієнта — їх перепишуть на листівку від руки.
            </span>
          </label>

          <label className={labelClass}>
            <span className={captionClass}>Примітка для себе</span>
            <input
              className="pos-field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Без лілій — алергія"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="preorder-error">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 pt-3 pb-5 shrink-0 shadow-[0_-1px_0_rgb(var(--sq-divider-rgb))]">
          <button
            type="button"
            disabled={busy || !online || !dueAt || needsAddress}
            onClick={() =>
              onSubmit({
                due_at: new Date(dueAt).toISOString(),
                fulfilment,
                address: address.trim() || null,
                recipient_name: recipientName.trim() || null,
                recipient_phone: recipientPhone.trim() || null,
                card_message: cardMessage.trim() || null,
                note: note.trim() || null,
              })
            }
            className="pos-btn-primary min-h-[52px] w-full rounded-xl text-[17px] gap-2"
            data-testid="preorder-submit"
          >
            <Clock size={20} />
            {!online
              ? 'Потрібна мережа'
              : needsAddress
                ? 'Вкажіть адресу'
                : busy
                  ? 'Записуємо…'
                  : 'Записати замовлення'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelClass = 'flex flex-col gap-1.5';
const captionClass = 'text-[13px] font-semibold text-sq-secondary';
