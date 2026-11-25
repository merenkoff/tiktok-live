// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The cafe till's side of «Віддалена кухня» (РК2, TechDocs/POS_REMOTE_KITCHEN.md
// §6–§8): which lines of the cart the remote kitchen cooks, what the request
// carries, and where the conversation with the kitchen stands. Pure, so the
// rules are tested without a till.

/** The fields of a cart line this block reads. Structural: the host's CartLine fits. */
export interface KitchenCartLine {
  variant_id: number;
  quantity: number;
  product_name: string;
  modifiers?: ReadonlyArray<{ id: number }>;
  note?: string;
  components?: unknown;
}

/** `GET /remote-kitchen/setup` → `as_cafe`, as this block uses it. */
export interface CafeSetup {
  linkId: number;
  /** `paused` by the kitchen's owner: the till asks nothing and says so. */
  linkActive: boolean;
  kitchenTitle: string;
  kitchenPhone: string | null;
  /** How long the kitchen has to answer before the till offers the phone. */
  answerSeconds: number;
  /** Is the kitchen taking requests right now (its «Пауза прийому»). */
  accepting: boolean;
  /** The cafe's dishes the kitchen cooks. */
  variantIds: ReadonlySet<number>;
  /** Read from what this till kept, offline (§8): read again once the network is back. */
  fromMemory?: true;
}

/** The order view (`RemoteOrderView` on the server), the fields this block reads. */
export interface CafeOrder {
  id: number;
  revision: number;
  status: string;
  quote_source: string | null;
  quoted_minutes: number | null;
  suggested_minutes: number | null;
  promised_at: string | null;
  answer_deadline_at: string | null;
  answer_overdue: boolean;
  quote_expires_at: string | null;
  decline_reason: string | null;
  kitchen_phone: string | null;
}

/** The statuses the cafe may still change the request in (the server's PRE_PAY). */
export const REVISABLE = new Set(['requested', 'quoted', 'expired', 'declined']);

/** What the cashier sees as the next step. */
export type Phase =
  /** Nothing asked yet (or the guest said no): «Запитати кухню». */
  | 'idle'
  /** Waiting for the kitchen, within its time to answer. */
  | 'asking'
  /** The kitchen is silent past its time: the phone, and the time typed in. */
  | 'overdue'
  /** A time is named; the guest has not said yes. */
  | 'quoted'
  /** The guest agreed: the receipt may be paid. */
  | 'agreed'
  /** «Не зможемо». */
  | 'declined'
  /** The named time went unused. */
  | 'expired'
  /** No network (РК5, §8): call the kitchen, write down the time it says. */
  | 'offline'
  /** Agreed with the kitchen by phone: the receipt may be paid, and goes with the time. */
  | 'phone_agreed';

const n = (v: unknown): number | null => {
  const x = Number(v);
  return v == null || v === '' || !Number.isFinite(x) ? null : x;
};

/** Read `/remote-kitchen/setup`. Null when this store is not a cafe with a kitchen. */
export function readSetup(raw: unknown): CafeSetup | null {
  const asCafe = (raw as { as_cafe?: unknown } | null)?.as_cafe as
    | {
        link?: {
          id?: unknown;
          status?: unknown;
          kitchen_title?: unknown;
          kitchen_phone?: unknown;
          answer_seconds?: unknown;
        };
        kitchen?: { accepting?: unknown };
        items?: Array<{ cafe_variant_id?: unknown }>;
      }
    | null
    | undefined;
  const link = asCafe?.link;
  const linkId = n(link?.id);
  if (!asCafe || !link || linkId == null) return null;
  const ids = new Set<number>();
  for (const item of Array.isArray(asCafe.items) ? asCafe.items : []) {
    const id = n(item?.cafe_variant_id);
    if (id != null) ids.add(id);
  }
  const phone = typeof link.kitchen_phone === 'string' && link.kitchen_phone.trim() ? link.kitchen_phone.trim() : null;
  return {
    linkId,
    linkActive: link.status === 'active',
    kitchenTitle: typeof link.kitchen_title === 'string' && link.kitchen_title.trim() ? link.kitchen_title : 'Кухня',
    kitchenPhone: phone,
    answerSeconds: n(link.answer_seconds) ?? 60,
    accepting: asCafe.kitchen?.accepting !== false,
    variantIds: ids,
  };
}

/**
 * The lines the remote kitchen cooks: a dish the link maps, rung whole. A
 * bouquet-style assembled line carries its own components and is never the
 * kitchen's, and a weighed one has no whole count to send.
 */
export function kitchenLines<L extends KitchenCartLine>(lines: readonly L[], ids: ReadonlySet<number>): L[] {
  return lines.filter(
    (line) => ids.has(line.variant_id) && line.components == null && Number.isInteger(line.quantity) && line.quantity > 0
  );
}

/** `items` of `POST /remote-kitchen/orders` and `PUT …/items`. */
export function orderItems(lines: readonly KitchenCartLine[]) {
  return lines.map((line) => ({
    variant_id: line.variant_id,
    quantity: line.quantity,
    ...(line.modifiers?.length ? { modifiers: line.modifiers } : {}),
    ...(line.note ? { note: line.note } : {}),
  }));
}

/**
 * What the kitchen was asked about, as one string: a change in it means the
 * named time no longer answers this cart. Order-free, because the cashier
 * moving a line up the list changes nothing for the kitchen.
 */
export function signatureOf(lines: readonly KitchenCartLine[]): string {
  return lines
    .map((line) =>
      [
        line.variant_id,
        line.quantity,
        (line.modifiers ?? [])
          .map((m) => m.id)
          .sort((a, b) => a - b)
          .join('.'),
        line.note ?? '',
      ].join(':')
    )
    .sort()
    .join('|');
}

/** Where the conversation stands, from the order and whether the guest said yes. */
export function phaseOf(order: CafeOrder | null, agreed: boolean, now: number = Date.now()): Phase {
  if (!order) return 'idle';
  switch (order.status) {
    case 'requested':
      return order.answer_overdue || isPast(order.answer_deadline_at, now) ? 'overdue' : 'asking';
    case 'quoted':
      if (isPast(order.quote_expires_at, now)) return 'expired';
      return agreed ? 'agreed' : 'quoted';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    default:
      // guest_declined, or anything past payment: nothing left to agree on here.
      return 'idle';
  }
}

function isPast(iso: string | null, now: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t <= now;
}

/** Whole seconds until `iso`, never below zero; null without a time. */
export function secondsUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 1000));
}

/** «14:35» in the till's own clock. */
export function clockOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The phone's minutes: the whole promise, in fives, 5…240 (the server rounds the same way). */
export function clampPhoneMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 40;
  return Math.min(240, Math.max(5, Math.ceil(minutes / 5) * 5));
}

/** The minutes the phone stepper starts from: the kitchen's own estimate, else 40. */
export function defaultPhoneMinutes(order: Pick<CafeOrder, 'suggested_minutes'> | null): number {
  const suggested = order?.suggested_minutes;
  return clampPhoneMinutes(suggested != null && suggested > 0 ? suggested : 40);
}

/** Why «Оплатити» waits, or null when nothing holds it. */
export function holdReason(phase: Phase, hasKitchenLines: boolean): string | null {
  if (!hasKitchenLines || phase === 'agreed' || phase === 'phone_agreed') return null;
  if (phase === 'offline') return 'Страви з кухні: без мережі подзвоніть на кухню й запишіть, коли буде готово.';
  if (phase === 'quoted') return 'Страви з кухні: спершу запитайте гостя, чи згоден він на цей час.';
  if (phase === 'asking' || phase === 'overdue') return 'Страви з кухні: дочекайтеся часу від кухні.';
  return 'Страви з кухні: спершу запитайте кухню, коли буде готово.';
}

/** A refusal of `POST /remote-kitchen/orders` or a step, in words for the cashier. */
export function refusalOf(err: unknown, fallback: string): { message: string; paused: boolean; phone: string | null } {
  const data = (err as { response?: { data?: Record<string, unknown> } } | null)?.response?.data ?? {};
  const message = typeof data.error === 'string' && data.error.trim() ? data.error : fallback;
  const phone = typeof data.kitchen_phone === 'string' && data.kitchen_phone.trim() ? data.kitchen_phone : null;
  return { message, paused: data.paused === true, phone };
}

/** 1 страва, 2 страви, 5 страв, 11 страв, 21 страва. */
export function dishWord(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'страв';
  if (ones === 1) return 'страва';
  if (ones >= 2 && ones <= 4) return 'страви';
  return 'страв';
}
