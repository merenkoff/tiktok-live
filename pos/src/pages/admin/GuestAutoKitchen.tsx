// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/pages/admin/GuestAutoKitchen.tsx
//
// Where a guest's order goes (phase Q9, TechDocs/POS_QR_MENU.md «Q8 + Q9»):
// to a waiter first (058, the default), or straight to the kitchen and the
// bar — for tables a waiter already serves, or always — up to a sum.
//
// A part of `PublicMenuCard`, not a card of its own, because it only means
// something while ordering is on, and the server resets it to `off` the moment
// ordering goes off.
//
// Raising the mode is the one setting on this page that can cost the owner
// food: it is never one tap. The riskier choice opens the list of what can go
// wrong and needs a ticked «Я розумію ці ризики» before the request goes, and
// the server, too, refuses a raise without `auto_kitchen_ack` and records who
// confirmed and when. Lowering is always one tap — a safer setting must never
// be behind a question.

import { useEffect, useState } from 'react';
import { formatUahCompact } from '../../lib/money';

export type AutoKitchenMode = 'off' | 'reorders' | 'all';

const RANK: Record<AutoKitchenMode, number> = { off: 0, reorders: 1, all: 2 };

const LIMIT_MIN_CENTS = 100;
const LIMIT_MAX_CENTS = 10_000_000;

const OPTIONS: Array<{ mode: AutoKitchenMode; title: string; text: string }> = [
  {
    mode: 'off',
    title: 'Спершу до офіціанта',
    text: 'Офіціант приймає кожне замовлення, і лише тоді воно йде на кухню. Найбезпечніше.',
  },
  {
    mode: 'reorders',
    title: 'Дозамовлення — одразу на кухню',
    text:
      'Перше замовлення столу приймає офіціант. Коли стіл уже обслуговується (рахунок відкрито), наступні йдуть на кухню й бар одразу, а офіціант отримує сповіщення.',
  },
  {
    mode: 'all',
    title: 'Усі замовлення — одразу на кухню',
    text: 'Кожне замовлення йде на кухню без офіціанта; якщо рахунку ще немає, він відкривається сам.',
  },
];

const RADIO = 'mt-0.5 w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';
const CHECKBOX = 'w-5 h-5 shrink-0 accent-[rgb(var(--sq-blue-rgb))]';

function risksOf(mode: AutoKitchenMode, limitCents: number): string[] {
  const risks = [
    'Кухня готує без людини, яка перевірила замовлення: жарт, дитина з телефоном, сфотографований QR — страву приготують, а склад спишеться. Раунд можна скасувати, доки його не видано: склад повернеться, продукти — ні.',
  ];
  if (mode === 'all') {
    risks.push('Рахунок відкриється й за столом, до якого ще не підходив офіціант, — гість може поїсти й піти, не заплативши.');
  }
  risks.push(
    'Офіціант дізнається про таке замовлення лише зі сповіщення на екрані «Столи» — потрібен оновлений модуль «Столи». Якщо на екран ніхто не дивиться, страву винесуть невідомо кому.',
    `Єдиний запобіжник — ліміт суми: замовлення понад ${formatUahCompact(limitCents)} чекатиме офіціанта, як зараз.`,
    'Якщо наліпку з QR сфотографували чи вкрали, «Створити нове посилання» нижче робить усі старі QR недійсними.'
  );
  return risks;
}

function limitText(cents: number): string {
  return String(cents / 100).replace('.', ',');
}

/** «1 500», «1500,50» → kopecks; anything else is NaN. */
function parseLimit(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

export function GuestAutoKitchen({
  mode,
  limitCents,
  ackAt,
  saving,
  onMode,
  onLimit,
}: {
  mode: AutoKitchenMode;
  limitCents: number;
  ackAt: string | null;
  saving: boolean;
  onMode: (mode: AutoKitchenMode, ack: boolean) => Promise<void>;
  onLimit: (cents: number) => Promise<void>;
}) {
  // The riskier mode the owner picked and has not confirmed yet.
  const [pending, setPending] = useState<AutoKitchenMode | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [limit, setLimit] = useState(() => limitText(limitCents));

  useEffect(() => setLimit(limitText(limitCents)), [limitCents]);

  function pick(next: AutoKitchenMode) {
    if (next === mode) {
      setPending(null);
      return;
    }
    if (RANK[next] < RANK[mode]) {
      setPending(null);
      void onMode(next, false);
      return;
    }
    setPending(next);
    setUnderstood(false);
  }

  async function confirm() {
    if (!pending || !understood) return;
    await onMode(pending, true);
    setPending(null);
    setUnderstood(false);
  }

  const parsed = parseLimit(limit);
  const limitValid = Number.isFinite(parsed) && parsed >= LIMIT_MIN_CENTS && parsed <= LIMIT_MAX_CENTS;
  const limitChanged = limitValid && parsed !== limitCents;
  const shown = pending ?? mode;

  return (
    <fieldset className="pl-8 space-y-2" disabled={saving}>
      <legend className="text-[15px] font-semibold text-sq-heading">Куди йде замовлення гостя</legend>

      {OPTIONS.map((option) => (
        <label key={option.mode} className="flex items-start gap-3 py-1 text-[15px] text-sq-text">
          <input
            type="radio"
            name="guest-auto-kitchen"
            className={RADIO}
            checked={shown === option.mode}
            onChange={() => pick(option.mode)}
          />
          <span className="space-y-0.5">
            <span className="block">{option.title}</span>
            <span className="block text-[13px] leading-relaxed text-sq-muted">{option.text}</span>
          </span>
        </label>
      ))}

      {pending && (
        <div
          role="group"
          aria-labelledby="auto-kitchen-risks"
          className="rounded-xl bg-sq-sidebar px-[18px] py-4 space-y-3"
        >
          <p id="auto-kitchen-risks" className="text-[15px] font-semibold text-sq-heading">
            Ще не увімкнено. Перш ніж увімкнути — що може піти не так:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-[13px] leading-relaxed text-sq-secondary">
            {risksOf(pending, limitCents).map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
          <label className="min-h-11 flex items-center gap-3 text-[15px] text-sq-text">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            <span>Я розумію ці ризики</span>
          </label>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="sq-btn-primary" disabled={!understood} onClick={() => void confirm()}>
              Увімкнути
            </button>
            <button type="button" className="sq-btn-quiet" onClick={() => setPending(null)}>
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="pt-1 space-y-1.5">
        <label htmlFor="guest-auto-limit" className="block text-[13px] font-semibold text-sq-secondary">
          Ліміт суми, грн
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            id="guest-auto-limit"
            className="sq-input w-36"
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            aria-invalid={!limitValid}
          />
          <button type="button" className="sq-btn-quiet" disabled={!limitChanged} onClick={() => void onLimit(parsed)}>
            Зберегти ліміт
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-sq-muted">
          {limitValid
            ? 'Замовлення дорожче за цю суму завжди спершу приймає офіціант, хоч би що обрано вище.'
            : 'Від 1 до 100 000 грн.'}
        </p>
        {mode !== 'off' && ackAt && (
          <p className="text-[13px] text-sq-muted">
            Ризики підтверджено {new Date(ackAt).toLocaleDateString('uk-UA')}.
          </p>
        )}
      </div>
    </fieldset>
  );
}
