// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The arithmetic and the words of the debt journal on the till — pure, so the
// screens stay thin and every rule here is pinned by a test.
//
// The server decides everything (prices, the limit, which lines may be paid);
// what lives here is only what the till must say BEFORE it asks: why the
// button is grey, what paying the oldest three lines comes to, how old a debt
// is. Each of those is re-checked by the server on the write.

import { formatUah, refundLineAmount } from '@pos/platform';
import type { CartLine } from '@pos/platform';
import type { DebtCredit, DebtEntryKind, DebtLine, Debtor, IssueItem } from './types';

/**
 * The cart as `POST /debts/issue` takes it — the checkout's own wire shape
 * (ids of the chosen answers, sorted; the kitchen note), so a line is priced
 * and merged exactly as a sale would price and merge it.
 */
export function issueItems(lines: readonly CartLine[]): IssueItem[] {
  return lines.map((line) => ({
    variant_id: line.variant_id,
    quantity: line.quantity,
    ...(line.modifiers?.length ? { modifiers: line.modifiers.map((m) => m.id).sort((a, b) => a - b) } : {}),
    ...(line.note ? { note: line.note } : {}),
  }));
}

/** A bouquet assembled at the counter has no catalogue price to lock (G3_DEBTS.md, decision 10). */
export function hasAssembledLine(lines: readonly CartLine[]): boolean {
  return lines.some((line) => (line.components?.length ?? 0) > 0);
}

export type IssueBlockCode = 'no_customer' | 'offline' | 'no_credit' | 'locked' | 'assembled' | 'over_limit';

export interface IssueBlock {
  code: IssueBlockCode;
  text: string;
}

/**
 * Why this cart cannot go to this customer's tab, said before anyone taps;
 * null when it can — or when the credit is still loading, because a button
 * that greys and un-greys on every customer change is worse than one refusal
 * from the server.
 */
export function issueBlock(input: {
  customerId: number | null;
  credit: DebtCredit | null;
  totalCents: number;
  lines: readonly CartLine[];
  online: boolean;
}): IssueBlock | null {
  if (input.customerId == null) {
    return { code: 'no_customer', text: 'Оберіть покупця — під запис записують на людину' };
  }
  if (!input.online) {
    return { code: 'offline', text: 'Під запис — лише з мережею' };
  }
  if (hasAssembledLine(input.lines)) {
    return {
      code: 'assembled',
      text: 'Букет, зібраний на касі, під запис не записується — продайте його або запишіть готовий букет з каталогу',
    };
  }
  const credit = input.credit;
  if (!credit) return null;
  if (credit.limit_cents == null) {
    return {
      code: 'no_credit',
      text: 'Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця.',
    };
  }
  if (credit.locked) {
    return { code: 'locked', text: 'Власник заблокував записи під запис для цього покупця' };
  }
  const available = credit.available_cents ?? 0;
  if (input.totalCents > available) {
    return {
      code: 'over_limit',
      text: `Понад ліміт: ще можна ${formatUah(available)}, а в кошику ${formatUah(input.totalCents)}`,
    };
  }
  return null;
}

/** What paying the oldest k lines comes to, for k = 1..n (decision Д4: oldest first, whole lines). */
export function prefixTotals(open: readonly DebtLine[]): number[] {
  const totals: number[] = [];
  let sum = 0;
  for (const line of open) {
    sum += line.owed_cents;
    totals.push(sum);
  }
  return totals;
}

/**
 * How many of the oldest lines a sum the customer holds out will close —
 * «487,40 закриває 6 товарів». Whole lines only: the rest stays owed, and no
 * money is ever taken against nothing in particular.
 */
export function linesCoveredBy(open: readonly DebtLine[], amountCents: number): { count: number; total: number } {
  const totals = prefixTotals(open);
  let count = 0;
  for (const total of totals) {
    if (total > amountCents) break;
    count += 1;
  }
  return { count, total: count > 0 ? totals[count - 1] : 0 };
}

/** Tapping line `index` of the payment list: take it and every older one, or give back the newest one taken. */
export function nextCount(count: number, index: number): number {
  if (index + 1 === count && count > 1) return count - 1;
  return index + 1;
}

/**
 * What giving back `take` units of an unpaid line takes off the debt — the
 * refund's own cumulative rounding, so a discounted line's units always add
 * up to its total whatever order they come back in.
 */
export function returnAmount(
  line: Pick<DebtLine, 'line_total_cents' | 'quantity' | 'returned_quantity'>,
  take: number
): number {
  if (take <= 0) return 0;
  return refundLineAmount(line.line_total_cents, line.quantity, line.returned_quantity, take);
}

/** Name or phone, the phone compared digit to digit so «067 12» finds «+380671234567». */
export function matchesDebtor(row: Pick<Debtor, 'name' | 'phone'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 2 && row.phone.replace(/\D/g, '').includes(digits);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days between `iso` and `now`, on the device's calendar. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  const a = Date.UTC(then.getFullYear(), then.getMonth(), then.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/** «1 день», «3 дні», «12 днів» — the Ukrainian plural by the last digits. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** How long the oldest open line has waited: «сьогодні», «вчора», «12 днів». */
export function ageText(iso: string, now: Date = new Date()): string {
  const days = daysSince(iso, now);
  if (days === 0) return 'сьогодні';
  if (days === 1) return 'вчора';
  return `${days} ${plural(days, 'день', 'дні', 'днів')}`;
}

/** «1 товар», «3 товари», «6 товарів». */
export function goodsText(n: number): string {
  return `${n} ${plural(n, 'товар', 'товари', 'товарів')}`;
}

/** «Хліб · 500 г» — the line as the statement names it. */
export function lineTitle(line: Pick<DebtLine, 'product_name' | 'variant_label'>): string {
  return line.variant_label ? `${line.product_name} · ${line.variant_label}` : line.product_name;
}

/** «2 шт», «250 г». */
export function quantityText(quantity: number, unit: string): string {
  return `${quantity} ${unit || 'шт'}`;
}

export const ENTRY_LABEL: Record<DebtEntryKind, string> = {
  issue: 'Під запис',
  return: 'Повернуто товар',
  payment: 'Погашено',
  payment_void: 'Погашення скасовано',
  writeoff: 'Списано',
};

/**
 * «Борг 1 240,00 ₴ · ще можна 1 760,00 ₴» — the till's one line about a
 * customer's tab, and «Боргу немає · …» rather than a debt of nought.
 */
export function creditLine(credit: DebtCredit): string {
  const owed = credit.balance_cents > 0 ? `Борг ${formatUah(credit.balance_cents)}` : 'Боргу немає';
  if (credit.limit_cents == null) return credit.balance_cents > 0 ? `${owed} · під запис більше не можна` : owed;
  if (credit.locked) return `${owed} · записи заблоковано`;
  return `${owed} · ще можна ${formatUah(credit.available_cents ?? 0)}`;
}

/** A limit typed by the owner, in hryvnias, to kopecks; null when the field is empty or not a sum. */
export function limitInputToCents(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** The server's bounds for a limit — 1 ₴ … 100 000 ₴ (the CHECK on `pos_customers`, 073). */
export const LIMIT_MIN_CENTS = 100;
export const LIMIT_MAX_CENTS = 10_000_000;
