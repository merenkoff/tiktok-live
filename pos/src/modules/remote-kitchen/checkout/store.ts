// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One conversation with the remote kitchen per till (РК2,
// TechDocs/POS_REMOTE_KITCHEN.md §8). Module-level, not component state: the
// till draws the cart twice on a phone (the sidebar and the cart sheet), and
// two copies of the block must not ask the kitchen twice or disagree about
// whether «Оплатити» may go. Every copy reads this store and calls `sync`.

import * as defaultApi from './cafeApi';
import {
  REVISABLE,
  holdReason,
  kitchenLines,
  phaseOf,
  refusalOf,
  signatureOf,
  type CafeOrder,
  type CafeSetup,
  type KitchenCartLine,
  type Phase,
} from './lib';
import { remoteCartControls, type RemoteCartControls } from '../lib/hostPlatform';
import { printGuestTicket, type TicketOrder } from '../ticket/guestTicket';

export const ASK_POLL_MS = 3000;
export const QUOTE_POLL_MS = 10000;
/** A failed setup read is tried again after this long, not on every render. */
export const SETUP_RETRY_MS = 60000;
/** After the sale: how long to wait for the kitchen's number, and how many times to look. */
export const TICKET_RETRY_MS = 1500;
export const TICKET_TRIES = 4;
const PAID_ON_ITS_WAY: ReadonlySet<string> = new Set(['paid', 'cooking', 'ready', 'dispatched', 'arrived']);

export interface RemoteCheckoutState {
  /** undefined: not read yet; null: this store has no remote kitchen. */
  setup: CafeSetup | null | undefined;
  order: CafeOrder | null;
  /** The cart the current order was asked (or last revised) for. */
  askedSignature: string | null;
  /** The guest said yes to the named time. */
  agreed: boolean;
  /** The kitchen lines of the cart as last seen. */
  lines: KitchenCartLine[];
  signature: string;
  busy: boolean;
  error: string | null;
}

type Api = typeof defaultApi;

const initial = (): RemoteCheckoutState => ({
  setup: undefined,
  order: null,
  askedSignature: null,
  agreed: false,
  lines: [],
  signature: '',
  busy: false,
  error: null,
});

export function createRemoteCheckout(
  api: Api = defaultApi,
  cart: () => RemoteCartControls | null = remoteCartControls,
  now: () => number = Date.now,
  printTicket: (order: TicketOrder) => Promise<unknown> = printGuestTicket
) {
  let state = initial();
  const listeners = new Set<() => void>();
  let setupLoading = false;
  let setupFailedAt = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** The uuid of a request not yet answered, so a retried tap is the same request. */
  let pendingUuid: string | null = null;

  const set = (patch: Partial<RemoteCheckoutState>) => {
    state = { ...state, ...patch };
    applyToCart();
    schedulePoll();
    for (const l of listeners) l();
  };

  const phase = (): Phase => phaseOf(state.order, state.agreed, now());

  /** The host cart follows the store: the hold, and the order the sale pays. */
  function applyToCart() {
    const controls = cart();
    if (!controls) return;
    const hasLines = state.setup != null && state.lines.length > 0;
    const p = phase();
    const fresh = state.order != null && state.askedSignature === state.signature;
    const payable = hasLines && fresh && p === 'agreed';
    controls.setCheckoutHold(hasLines ? (payable ? null : holdReason(fresh ? p : 'idle', true)) : null);
    controls.setRemoteOrderId(payable ? state.order!.id : null);
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    const order = state.order;
    if (!order || listeners.size === 0) return;
    const p = phase();
    const delay = p === 'asking' || p === 'overdue' ? ASK_POLL_MS : p === 'quoted' || p === 'agreed' ? QUOTE_POLL_MS : 0;
    if (!delay) return;
    pollTimer = setTimeout(() => void refresh(), delay);
  }

  async function refresh() {
    const order = state.order;
    if (!order) return;
    try {
      const next = await api.readOrder(order.id);
      // The cashier may have moved on (a new order, the cart emptied) while this read flew.
      if (state.order?.id !== order.id) return;
      set({ order: next, agreed: next.status === 'quoted' && next.revision === order.revision ? state.agreed : false });
    } catch {
      // No answer: try again on the next tick, the screen keeps what it had.
      schedulePoll();
    }
  }

  async function loadSetup() {
    if (setupLoading || (state.setup === undefined && setupFailedAt && now() - setupFailedAt < SETUP_RETRY_MS)) return;
    setupLoading = true;
    try {
      const setup = await api.loadSetup();
      setupFailedAt = 0;
      set({ setup: setup && setup.variantIds.size > 0 ? setup : null });
    } catch {
      setupFailedAt = now();
    } finally {
      setupLoading = false;
    }
  }

  /** Called by every copy of the block whenever the cart changes. Idempotent. */
  function sync(cartLines: readonly KitchenCartLine[]) {
    if (state.setup === undefined) {
      void loadSetup();
      return;
    }
    if (state.setup === null) return;
    const lines = kitchenLines(cartLines, state.setup.variantIds);
    const signature = signatureOf(lines);
    if (signature === state.signature && lines.length === state.lines.length) return;

    if (lines.length === 0) {
      const order = state.order;
      // Kitchen dishes gone from the cart. After a paid receipt the cart is
      // simply empty; otherwise the kitchen should stop holding the time.
      if (order && !state.agreed && REVISABLE.has(order.status)) {
        void api.guestDeclined(order).catch(() => undefined);
      }
      // The guest agreed and the cart emptied: the sale most likely went
      // through. The guest's ticket — once the order is paid and numbered.
      if (order && state.agreed) void ticketAfterSale(order.id);
      pendingUuid = null;
      set({ lines, signature, order: null, askedSignature: null, agreed: false, error: null });
      return;
    }
    set({ lines, signature, agreed: state.askedSignature === signature ? state.agreed : false });
    // An open request follows the cart: the kitchen sees the new dishes at once.
    const order = state.order;
    if (order && state.askedSignature !== signature && (order.status === 'requested' || order.status === 'quoted')) {
      void revise();
    }
  }

  /** «Запитати кухню» / «Запитати ще раз». */
  async function ask() {
    if (state.busy || !state.setup || state.lines.length === 0) return;
    const signature = state.signature;
    const lines = state.lines;
    const order = state.order;
    set({ busy: true, error: null });
    try {
      let next: CafeOrder;
      if (order && REVISABLE.has(order.status)) {
        next = await api.reviseOrder(order, lines);
      } else {
        pendingUuid ??= crypto.randomUUID();
        next = await api.createOrder(pendingUuid, lines);
        pendingUuid = null;
      }
      set({ order: next, askedSignature: signature, agreed: false, busy: false });
    } catch (err) {
      const refusal = refusalOf(err, 'Кухня не отримала запит — спробуйте ще раз.');
      const message = refusal.paused
        ? `Кухня зараз не приймає замовлень.${refusal.phone ? ` Телефон: ${refusal.phone}` : ''}`
        : refusal.message;
      set({ busy: false, error: message });
    }
  }

  /**
   * Print the guest's ticket for an order this till just sold. Reads the order
   * until the kitchen has numbered it (payment numbers it in the same
   * transaction, but the cart may empty a moment before the read sees it);
   * an order that is not paid — the cashier took the dishes out — prints nothing.
   */
  async function ticketAfterSale(orderId: number) {
    for (let attempt = 0; attempt < TICKET_TRIES; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, TICKET_RETRY_MS));
      try {
        const view = (await api.readOrder(orderId)) as CafeOrder & TicketOrder;
        if (view.status === 'requested' || view.status === 'quoted') continue;
        if (!PAID_ON_ITS_WAY.has(view.status)) return;
        if (view.order_no == null) continue;
        await printTicket(view);
        return;
      } catch {
        // No answer: look again; the tracker's «Талон» is there if every try fails.
      }
    }
  }

  async function revise() {
    const order = state.order;
    if (!order || state.busy) return;
    const signature = state.signature;
    set({ busy: true, error: null, agreed: false });
    try {
      const next = await api.reviseOrder(order, state.lines);
      set({ order: next, askedSignature: signature, busy: false });
    } catch (err) {
      set({ busy: false, error: refusalOf(err, 'Кухня не отримала зміни — запитайте ще раз.').message });
    }
  }

  /** The time the kitchen said on the phone, typed by the cashier. */
  async function phoneQuote(minutes: number) {
    const order = state.order;
    if (!order || state.busy) return;
    set({ busy: true, error: null });
    try {
      set({ order: await api.phoneQuote(order, minutes), busy: false, agreed: false });
    } catch (err) {
      set({ busy: false, error: refusalOf(err, 'Час не записано — спробуйте ще раз.').message });
    }
  }

  function agree() {
    if (phase() !== 'quoted' || state.askedSignature !== state.signature) return;
    set({ agreed: true, error: null });
  }

  /** «Змінити»: the guest has not decided after all. */
  function unagree() {
    set({ agreed: false });
  }

  /** «Гість відмовився»: the kitchen stops holding the time; the dishes stay for the cashier to remove. */
  async function decline() {
    const order = state.order;
    if (!order || state.busy) return;
    set({ busy: true, error: null });
    try {
      await api.guestDeclined(order);
      set({ order: null, askedSignature: null, agreed: false, busy: false });
    } catch (err) {
      set({ busy: false, error: refusalOf(err, 'Не вдалося скасувати запит — спробуйте ще раз.').message });
    }
  }

  return {
    getState: () => state,
    phase,
    subscribe(listener: () => void) {
      listeners.add(listener);
      schedulePoll();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      };
    },
    sync,
    ask,
    phoneQuote,
    agree,
    unagree,
    decline,
    refresh,
    /** Tests only. */
    reset() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      pendingUuid = null;
      setupFailedAt = 0;
      state = initial();
    },
  };
}

export type RemoteCheckout = ReturnType<typeof createRemoteCheckout>;

/** The till's one conversation. */
export const remoteCheckout = createRemoteCheckout();
