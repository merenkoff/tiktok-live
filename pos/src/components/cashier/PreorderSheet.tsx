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
import { CalendarClock, X } from '../../platform/glyphs';
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
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div
        className="bg-white rounded-sq w-full max-w-md overflow-hidden animate-fade-up shadow-lg flex flex-col max-h-[90vh]"
        data-testid="preorder-sheet"
      >
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Замовлення наперед</h3>
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

        <div className="overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-sq-muted">
            {lineCount} поз. на {formatUah(totalCents)}. Ціну зафіксовано на сьогодні — навіть
            якщо квіти подорожчають, клієнт заплатить стільки. Залишок не резервується: стебла
            купуються ближче до дати.
          </p>

          <label className="block">
            <span className="text-sm text-sq-secondary">Коли</span>
            <input
              type="datetime-local"
              className="pos-field mt-1.5"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              data-testid="preorder-due"
            />
          </label>

          <div className="flex gap-1.5" role="group" aria-label="Спосіб видачі">
            {(['pickup', 'delivery'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFulfilment(mode)}
                className={`flex-1 min-h-11 rounded-sq text-sm font-semibold ${
                  fulfilment === mode
                    ? 'bg-sq-blue text-white'
                    : 'bg-sq-bg text-sq-secondary'
                }`}
                data-testid={`preorder-${mode}`}
              >
                {mode === 'pickup' ? 'Самовивіз' : 'Доставка'}
              </button>
            ))}
          </div>

          {fulfilment === 'delivery' && (
            <label className="block">
              <span className="text-sm text-sq-secondary">Адреса</span>
              <input
                className="pos-field mt-1.5"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="вул. Хрещатик, 1, кв. 5"
                data-testid="preorder-address"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-sq-secondary">Отримувач</span>
              <input
                className="pos-field mt-1.5"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Оксана"
                data-testid="preorder-recipient"
              />
            </label>
            <label className="block">
              <span className="text-sm text-sq-secondary">Телефон</span>
              <input
                className="pos-field mt-1.5"
                inputMode="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+380…"
                data-testid="preorder-phone"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm text-sq-secondary">Текст листівки</span>
            <textarea
              className="pos-field mt-1.5 min-h-[72px]"
              value={cardMessage}
              onChange={(e) => setCardMessage(e.target.value)}
              placeholder="З днем народження!"
              data-testid="preorder-card"
            />
            <span className="mt-1 block text-xs text-sq-muted">
              Слова клієнта — їх перепишуть на листівку від руки.
            </span>
          </label>

          <label className="block">
            <span className="text-sm text-sq-secondary">Примітка для себе</span>
            <input
              className="pos-field mt-1.5"
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

        <div className="p-4 border-t border-sq-divider">
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
            className="sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2"
            data-testid="preorder-submit"
          >
            <CalendarClock size={24} />
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
