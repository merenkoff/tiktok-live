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

import { cashRoundingDelta, formatQuantity, formatUah, isWeighed, refundLineAmount } from '@pos/platform';
import type { CartLine, CashRoundingStep } from '@pos/platform';
import type { DebtCredit, DebtEntry, DebtEntryKind, DebtLine, Debtor, IssueItem } from './types';

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
    // A weighed line says how it was weighed, as checkout does — without it
    // the server takes the till for one that does not know weights (Г4).
    ...(line.weight_source ? { weight_source: line.weight_source } : {}),
  }));
}

/**
 * Weighed goods go back only whole (G4_WEIGHED.md, decision 8): a part of a
 * weighing could miss its own rounding by a kopeck, so the server refuses it
 * and the till offers «усе» or nothing.
 */
export function returnsWhole(line: Pick<DebtLine, 'price_per'>): boolean {
  return isWeighed(line.price_per);
}

/** A bouquet assembled at the counter has no catalogue price to lock (G3_DEBTS.md, decision 10). */
export function hasAssembledLine(lines: readonly CartLine[]): boolean {
  return lines.some((line) => (line.components?.length ?? 0) > 0);
}

export type IssueBlockCode =
  | 'no_customer'
  | 'offline'
  | 'no_mirror'
  | 'no_credit'
  | 'locked'
  | 'assembled'
  | 'over_limit';

export interface IssueBlock {
  code: IssueBlockCode;
  text: string;
}

/**
 * Why this cart cannot go to this customer's tab, said before anyone taps;
 * null when it can — or when the credit is still loading, because a button
 * that greys and un-greys on every customer change is worse than one refusal
 * from the server.
 *
 * Without a network the desktop till (`queue`) still writes a handover down,
 * and judges it by its mirror exactly as the server would judge it online —
 * decision Д3 does not lapse because the cable did. What it cannot do is
 * judge a customer it has never heard about (`noMirror`): then it refuses.
 */
export function issueBlock(input: {
  customerId: number | null;
  credit: DebtCredit | null;
  totalCents: number;
  lines: readonly CartLine[];
  online: boolean;
  /** This till keeps a queue of handovers written down without a network (the desktop). */
  queue?: boolean;
  /** Offline, and the till never had the list of who may take credit. */
  noMirror?: boolean;
}): IssueBlock | null {
  if (input.customerId == null) {
    return { code: 'no_customer', text: 'Оберіть покупця — під запис записують на людину' };
  }
  if (!input.online && !input.queue) {
    return { code: 'offline', text: 'Під запис — лише з мережею' };
  }
  if (hasAssembledLine(input.lines)) {
    return {
      code: 'assembled',
      text: 'Букет, зібраний на касі, під запис не записується — продайте його або запишіть готовий букет з каталогу',
    };
  }
  if (!input.online && input.noMirror) {
    return {
      code: 'no_mirror',
      text: 'Без мережі каса не знає, кому можна під запис: вона ще жодного разу не отримала ліміти покупців. Потрібна мережа.',
    };
  }
  // A customer this till created offline is not on the server yet — and no owner has given them a limit.
  if (input.customerId < 0) {
    return {
      code: 'no_credit',
      text: 'Цьому покупцеві під запис не дозволено. Ліміт ставить власник у картці покупця.',
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
 * «487,40 закриває 6 товарів». Whole lines only; what a sum does beyond them
 * is {@link planPayment}'s.
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
 * Whether the backend takes a debt in parts (078, G3_DEBTS.md §11): its lines
 * say how many of their units are paid. An older one answers without, and
 * would ignore a part — so the till never asks it for one.
 */
export function takesParts(open: readonly DebtLine[]): boolean {
  return open.length > 0 && open.every((line) => typeof line.paid_quantity === 'number');
}

/**
 * What `units` more of a line come to after the ones that already left it —
 * returned or paid — by the refund's own cumulative rounding: the server's
 * `unitsCents`, so the till asks for exactly what the receipt will carry.
 */
export function unitsCents(
  line: Pick<DebtLine, 'line_total_cents' | 'quantity' | 'returned_quantity' | 'paid_quantity'>,
  units: number
): number {
  if (units <= 0) return 0;
  return refundLineAmount(line.line_total_cents, line.quantity, line.returned_quantity + (line.paid_quantity ?? 0), units);
}

/**
 * A line whose units can go on a receipt one by one: counted in pieces (a
 * weighing goes whole until the Checkbox sandbox run, Д8), more than one left,
 * and no «внесок» on it — a line money was taken toward closes only whole.
 */
export function takesUnits(line: Pick<DebtLine, 'price_per' | 'prepaid_cents' | 'remaining_quantity'>): boolean {
  return !isWeighed(line.price_per) && (line.prepaid_cents ?? 0) === 0 && line.remaining_quantity > 1;
}

/** What a sum the customer hands over does to the debt (G3_DEBTS.md §11). */
export interface PayPlan {
  /** The oldest lines it closes whole. */
  wholeCount: number;
  wholeCents: number;
  /** Some units of the next line, on the same receipt. */
  units: { line: DebtLine; quantity: number; cents: number } | null;
  /** The receipt: the whole lines and the units, before cash rounding. */
  receiptCents: number;
  /** НБУ № 25 on the receipt, cash only. */
  roundingCents: number;
  /** Money toward the next line that does not close it. */
  prepay: { line: DebtLine; cents: number } | null;
  /** What goes back to the customer. */
  changeCents: number;
  /** Some of that change would have been a «внесок», but the store fiscalises (step 1 has no chain). */
  prepayRefused: boolean;
}

/**
 * A sum the customer hands over, laid out the way the server will take it:
 * whole lines from the oldest while the receipt stays payable, then as many
 * units of the next line as the rest covers — when that line is counted in
 * pieces — then a «внесок» toward that same line, a sum the till can take
 * in cash (a multiple of the store's rounding step). Whatever is left is
 * change.
 *
 * `partial` false (a backend older than 078) keeps to whole lines; the rest
 * is change, as it always was. `prepayAllowed` false (a store with ПРРО, until
 * the prepayment chain) still takes units — an ordinary receipt for real
 * goods — and gives the rest back.
 */
export function planPayment(
  open: readonly DebtLine[],
  offerCents: number,
  opts: { method: 'cash' | 'card'; step: CashRoundingStep; partial: boolean; prepayAllowed: boolean }
): PayPlan {
  const step = opts.method === 'cash' ? opts.step : 0;
  const due = (cents: number) => cents + cashRoundingDelta(cents, step);
  const offer = Math.max(0, Math.round(offerCents));

  let wholeCount = 0;
  let wholeCents = 0;
  while (wholeCount < open.length && due(wholeCents + open[wholeCount].owed_cents) <= offer) {
    wholeCents += open[wholeCount].owed_cents;
    wholeCount += 1;
  }

  const next = opts.partial ? open[wholeCount] : undefined;
  let units: PayPlan['units'] = null;
  if (next && takesUnits(next)) {
    let k = 0;
    while (k + 1 < next.remaining_quantity && due(wholeCents + unitsCents(next, k + 1)) <= offer) k += 1;
    if (k > 0) units = { line: next, quantity: k, cents: unitsCents(next, k) };
  }

  const receiptCents = wholeCents + (units?.cents ?? 0);
  const roundingCents = due(receiptCents) - receiptCents;
  let changeCents = offer - receiptCents - roundingCents;

  let prepay: PayPlan['prepay'] = null;
  let prepayRefused = false;
  if (next && changeCents > 0) {
    // Short of what the line still owes after the units: a sum that closed it
    // would have closed it whole above. Kept below by a kopeck in any case.
    const owedAfter = next.owed_cents - (units?.cents ?? 0);
    let cents = Math.min(changeCents, owedAfter - 1);
    if (step > 0) cents -= cents % step;
    if (cents > 0) {
      if (opts.prepayAllowed) {
        prepay = { line: next, cents };
        changeCents -= cents;
      } else {
        prepayRefused = true;
      }
    }
  }

  return { wholeCount, wholeCents, units, receiptCents, roundingCents, prepay, changeCents, prepayRefused };
}

/** What the plan takes now: the receipt with its rounding, and the «внесок». */
export function planTotal(plan: PayPlan): number {
  return plan.receiptCents + plan.roundingCents + (plan.prepay?.cents ?? 0);
}

/** Whether the plan takes anything at all. */
export function planTakes(plan: PayPlan): boolean {
  return plan.receiptCents > 0 || plan.prepay != null;
}

/**
 * The plan as `POST /debts/customers/:id/pay` takes it: the whole lines by id,
 * the next line's units and «внесок» as `part`, and the receipt's money in
 * `payments` — none when the request is only a «внесок».
 */
export function planRequest(
  open: readonly DebtLine[],
  plan: PayPlan,
  method: 'cash' | 'card'
): {
  line_ids?: number[];
  part?: { line_id: number; quantity?: number; amount_cents?: number; method: 'cash' | 'card' };
  payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>;
} {
  const partLine = plan.units?.line ?? plan.prepay?.line ?? null;
  return {
    ...(plan.wholeCount > 0 ? { line_ids: open.slice(0, plan.wholeCount).map((line) => line.id) } : {}),
    ...(partLine
      ? {
          part: {
            line_id: partLine.id,
            ...(plan.units ? { quantity: plan.units.quantity } : {}),
            ...(plan.prepay ? { amount_cents: plan.prepay.cents } : {}),
            method,
          },
        }
      : {}),
    payments: plan.receiptCents > 0 ? [{ method, amount_cents: plan.receiptCents + plan.roundingCents }] : [],
  };
}

/** «3 з 5 шт» — the units a receipt takes of a line, out of what it still has. */
export function unitsOfText(units: number, line: Pick<DebtLine, 'remaining_quantity' | 'unit' | 'price_per'>): string {
  return `${units} з ${quantityText(line.remaining_quantity, line.unit, line.price_per)}`;
}

/**
 * The plan in the cashier's words, a sentence per step — what the receipt
 * closes, the units, the «внесок» and what stays owed on that line, the change.
 */
export function planWords(plan: PayPlan, open: readonly DebtLine[]): string[] {
  const words: string[] = [];
  if (plan.wholeCount > 0) words.push(`Закриває ${goodsText(plan.wholeCount)} на ${formatUah(plan.wholeCents)}`);
  if (plan.units) {
    words.push(`${unitsOfText(plan.units.quantity, plan.units.line)} «${lineTitle(plan.units.line)}» на ${formatUah(plan.units.cents)}`);
  }
  if (plan.prepay) {
    const left = plan.prepay.line.owed_cents - (plan.units?.cents ?? 0) - plan.prepay.cents;
    words.push(
      `Внесок ${formatUah(plan.prepay.cents)} на «${lineTitle(plan.prepay.line)}» — лишиться винно ${formatUah(left)}`
    );
  }
  if (!planTakes(plan)) {
    words.push(`Не вистачає навіть на найстаріший товар (${formatUah(open[0]?.owed_cents ?? 0)})`);
  }
  if (plan.prepayRefused) {
    words.push(
      planTakes(plan)
        ? `Решту ${formatUah(plan.changeCents)} поверніть покупцеві: у магазині з ПРРО внесок за частину товару поки не приймається`
        : 'У магазині з ПРРО внесок за частину товару поки не приймається — гроші поверніть покупцеві'
    );
  } else if (plan.changeCents > 0 && planTakes(plan)) {
    words.push(`Решта ${formatUah(plan.changeCents)}`);
  }
  return words;
}

/**
 * What has already happened to an open line, beside what is left of it:
 * «повернуто 1 шт, оплачено 2 шт», «внесено 300,00 ₴».
 */
export function lineProgress(
  line: Pick<DebtLine, 'returned_quantity' | 'paid_quantity' | 'prepaid_cents' | 'unit' | 'price_per'>
): string | null {
  const left: string[] = [];
  if (line.returned_quantity > 0) left.push(`повернуто ${quantityText(line.returned_quantity, line.unit, line.price_per)}`);
  if ((line.paid_quantity ?? 0) > 0) left.push(`оплачено ${quantityText(line.paid_quantity ?? 0, line.unit, line.price_per)}`);
  const parts: string[] = [];
  if (left.length > 0) parts.push(left.join(', '));
  if ((line.prepaid_cents ?? 0) > 0) parts.push(`внесено ${formatUah(line.prepaid_cents ?? 0)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * What giving back `take` units of an unpaid line takes off the debt — the
 * refund's own cumulative rounding, counted after the units that already
 * left the line, returned or paid (078), so a discounted line's units always
 * add up to its total whatever order they go in.
 */
export function returnAmount(
  line: Pick<DebtLine, 'line_total_cents' | 'quantity' | 'returned_quantity' | 'paid_quantity'>,
  take: number
): number {
  return unitsCents(line, take);
}

/**
 * A line money was taken toward as a «внесок» goes back only by voiding those
 * first (G3_DEBTS.md §11) — the server refuses, so the till says why before.
 */
export function returnBlockedByPrepay(line: Pick<DebtLine, 'prepaid_cents'>): boolean {
  return (line.prepaid_cents ?? 0) > 0;
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

/** «2 шт», «250 г», and a weighed line in kilograms — «0,350 кг». */
export function quantityText(quantity: number, unit: string, pricePer = 1): string {
  if (isWeighed(pricePer)) return formatQuantity(quantity, unit, pricePer);
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
 * The «внесок» entries a cashier can still undo (078): not voided yet, and
 * toward goods still open — once a receipt closed them or the owner wrote
 * them off, the server refuses, so the till offers nothing.
 */
export function undoablePrepayments(
  entries: readonly DebtEntry[],
  open: readonly Pick<DebtLine, 'id'>[]
): Set<number> {
  const voided = new Set(entries.filter((e) => e.kind === 'payment_void' && e.sale_id != null).map((e) => e.sale_id));
  const openIds = new Set(open.map((line) => line.id));
  return new Set(
    entries
      .filter(
        (e) =>
          e.kind === 'payment' &&
          e.prepayment === true &&
          e.sale_id != null &&
          !voided.has(e.sale_id) &&
          e.prepay_line_id != null &&
          openIds.has(e.prepay_line_id)
      )
      .map((e) => e.id)
  );
}

/** The journal's word for an entry — a «внесок» is a `payment` too, and says so (078). */
export function entryLabel(entry: Pick<DebtEntry, 'kind' | 'prepayment'>): string {
  if (entry.prepayment && entry.kind === 'payment') return 'Внесок';
  if (entry.prepayment && entry.kind === 'payment_void') return 'Внесок скасовано';
  return ENTRY_LABEL[entry.kind];
}

/**
 * «Борг 1 240,00 ₴ · ще можна 1 760,00 ₴» — the till's one line about a
 * customer's tab, and «Боргу немає · …» rather than a debt of nought.
 */
export function creditLine(credit: DebtCredit): string {
  const owed = credit.balance_cents > 0 ? `Борг ${formatUah(credit.balance_cents)}` : 'Боргу немає';
  if (credit.limit_cents == null) return credit.balance_cents > 0 ? `${owed} · під запис більше не можна` : owed;
  if (credit.locked) return `${owed} · записи заблоковано`;
  // Only a handover written down without a network — or a limit the owner lowered — gets here.
  if (credit.balance_cents > credit.limit_cents) {
    return `${owed} · понад ліміт на ${formatUah(credit.balance_cents - credit.limit_cents)}`;
  }
  return `${owed} · ще можна ${formatUah(credit.available_cents ?? 0)}`;
}

/** A debtor whose debt is above the limit the owner set — the list says so beside the sum. */
export function isOverLimit(row: Pick<Debtor, 'balance_cents' | 'limit_cents'>): boolean {
  return row.limit_cents != null && row.balance_cents > row.limit_cents;
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
