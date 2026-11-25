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
  clampPhoneMinutes,
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
import { isOnline, queuesOfflineSales, remoteCartControls, type RemoteCartControls } from '../lib/hostPlatform';
import { printGuestTicket, type TicketOrder, type TicketOutcome } from '../ticket/guestTicket';
import { noticeTicketFailure } from '../ticket/notices';

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
  /**
   * Agreed with the kitchen by phone while offline (РК5, §8), for the cart it
   * was agreed for: another dish, and it is void.
   */
  phone: { minutes: number; agreedAt: string; signature: string } | null;
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
  phone: null,
});

export function createRemoteCheckout(
  api: Api = defaultApi,
  cart: () => RemoteCartControls | null = remoteCartControls,
  now: () => number = Date.now,
  printTicket: (order: TicketOrder) => Promise<TicketOutcome> = printGuestTicket,
  online: () => boolean = isOnline,
  /** Whether this till queues an offline sale (the desktop): only there may a phone time ride with it. */
  queues: () => boolean = queuesOfflineSales
) {
  let state = initial();
  const listeners = new Set<() => void>();
  let setupLoading = false;
  let setupFailedAt = 0;
  /** When the setup in hand was taken from what the till kept: read again once there is a network. */
  let memoryAt = 0;
  /**
   * Requests the kitchen must stop holding a time for, sent while the till had
   * no network: told again once it has one, or the kitchen would keep an
   * unanswered request beside the order it took by phone.
   */
  const toDecline = new Map<number, CafeOrder>();
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** The uuid of a request not yet answered, so a retried tap is the same request. */
  let pendingUuid: string | null = null;

  const set = (patch: Partial<RemoteCheckoutState>) => {
    state = { ...state, ...patch };
    applyToCart();
    schedulePoll();
    for (const l of listeners) l();
  };

  const phoneHolds = () => state.phone != null && state.phone.signature === state.signature;

  /** May a kitchen dish be sold here offline on the kitchen's word by phone (§8). */
  const canPhone = () => cart()?.setRemotePhone != null && queues();

  /**
   * Tell the kitchen to stop holding a time; with no answer at all (offline),
   * remember to tell it later. An answer that said no (the request expired, was
   * paid meanwhile) is final and never asked again.
   */
  function declineQuietly(order: CafeOrder) {
    void api.guestDeclined(order).then(
      () => toDecline.delete(order.id),
      (error: unknown) => {
        const answered = Boolean(error && typeof error === 'object' && (error as { response?: unknown }).response);
        if (answered) toDecline.delete(order.id);
        else toDecline.set(order.id, order);
      }
    );
  }

  const phase = (): Phase => {
    if (phoneHolds()) return 'phone_agreed';
    if (!online()) return 'offline';
    return phaseOf(state.order, state.agreed, now());
  };

  /** The host cart follows the store: the hold, and the order the sale pays. */
  function applyToCart() {
    const controls = cart();
    if (!controls) return;
    const hasLines = state.setup != null && state.lines.length > 0;
    const p = phase();
    // Agreed by phone (§8): nothing holds the receipt, and it carries the time.
    if (hasLines && p === 'phone_agreed' && controls.setRemotePhone && canPhone()) {
      controls.setCheckoutHold(null);
      controls.setRemoteOrderId(null);
      controls.setRemotePhone({ minutes: state.phone!.minutes, agreed_at: state.phone!.agreedAt });
      return;
    }
    controls.setRemotePhone?.(null);
    if (hasLines && (p === 'offline' || (p === 'phone_agreed' && !canPhone()))) {
      controls.setRemoteOrderId(null);
      controls.setCheckoutHold(
        !state.setup!.linkActive
          ? 'Страви з кухні: звʼязок із кухнею призупинено.'
          : canPhone()
            ? holdReason('offline', true)
            : 'Страви з кухні продаються лише онлайн — перевірте звʼязок.'
      );
      return;
    }
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
      // The kitchen may correct a time the server confirmed by itself (РК4,
      // «Змінити час»): the guest agreed to the old one, so ask them again.
      const sameTime = next.quoted_minutes === order.quoted_minutes;
      set({
        order: next,
        agreed: next.status === 'quoted' && next.revision === order.revision && sameTime ? state.agreed : false,
      });
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
      if (setup?.fromMemory) memoryAt = now();
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
    // Taken from what the till kept, and the network seems to be there: look
    // again now and then, in case the change of state was never announced.
    if (state.setup?.fromMemory && online() && now() - memoryAt >= SETUP_RETRY_MS) void reloadSetup();
    if (state.setup === null) return;
    const lines = kitchenLines(cartLines, state.setup.variantIds);
    const signature = signatureOf(lines);
    if (signature === state.signature && lines.length === state.lines.length) return;

    if (lines.length === 0) {
      const order = state.order;
      // Kitchen dishes gone from the cart. After a paid receipt the cart is
      // simply empty; otherwise the kitchen should stop holding the time.
      if (order && !state.agreed && REVISABLE.has(order.status)) declineQuietly(order);
      // The guest agreed and the cart emptied: the sale most likely went
      // through. The guest's ticket — once the order is paid and numbered;
      // and if it never was, the kitchen stops holding the time.
      if (order && state.agreed) void ticketAfterSale(order);
      pendingUuid = null;
      set({ lines, signature, order: null, askedSignature: null, agreed: false, error: null, phone: null });
      return;
    }
    set({
      lines,
      signature,
      agreed: state.askedSignature === signature ? state.agreed : false,
      // A time the kitchen named on the phone was for those dishes, not these.
      phone: state.phone?.signature === signature ? state.phone : null,
    });
    // An open request follows the cart: the kitchen sees the new dishes at once.
    const order = state.order;
    if (online() && order && state.askedSignature !== signature && (order.status === 'requested' || order.status === 'quoted')) {
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
   * After an agreed cart emptied: print the guest's ticket for the order this
   * till just sold. Reads the order until the kitchen has numbered it (payment
   * numbers it in the same transaction, so the first read normally sees it).
   * An order still waiting for the guest after every read was not paid — the
   * cashier cleared the cart, parked it, gave it «під запис» — so the kitchen
   * is told the guest declined rather than hold the time until it expires.
   * Prints at most once: whatever the printer says, the loop is over.
   */
  async function ticketAfterSale(order: CafeOrder) {
    let lastStatus: string | null = null;
    for (let attempt = 0; attempt < TICKET_TRIES; attempt += 1) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, TICKET_RETRY_MS));
      let view: CafeOrder & TicketOrder;
      try {
        view = (await api.readOrder(order.id)) as CafeOrder & TicketOrder;
      } catch {
        // No answer: look again; the tracker's «Талон» is there if every try fails.
        continue;
      }
      lastStatus = view.status;
      if (view.status === 'requested' || view.status === 'quoted') continue;
      if (!PAID_ON_ITS_WAY.has(view.status)) return;
      if (view.order_no == null) continue;
      let outcome: TicketOutcome;
      try {
        outcome = await printTicket(view);
      } catch (e) {
        outcome = { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
      }
      if (outcome.kind === 'failed') noticeTicketFailure({ orderId: order.id, error: outcome.error });
      return;
    }
    if (lastStatus === 'requested' || lastStatus === 'quoted') declineQuietly(order);
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

  /**
   * «Узгоджено телефоном» (РК5, §8): offline, the cashier called the kitchen,
   * it named a time and the guest agreed. The receipt may go; it carries the
   * time, and the server files the kitchen's order when the receipt arrives.
   */
  function phoneAgree(minutes: number) {
    if (!state.setup || !state.setup.linkActive || state.lines.length === 0 || !canPhone()) return;
    // A request asked before the network went is now answered by the phone:
    // the kitchen must not keep holding a time for it beside the phone order.
    const open = state.order;
    if (open && REVISABLE.has(open.status)) declineQuietly(open);
    pendingUuid = null;
    set({
      phone: { minutes: clampPhoneMinutes(minutes), agreedAt: new Date(now()).toISOString(), signature: state.signature },
      order: null,
      askedSignature: null,
      agreed: false,
      error: null,
    });
  }

  /** «Змінити» after a phone agreement: back to the call. */
  function phoneUndo() {
    set({ phone: null });
  }

  /**
   * The till went on- or offline: the hold and the screen follow, and a setup
   * that came from what the till kept is read again once there is a network.
   */
  function connectivityChanged() {
    if (online()) {
      if (state.setup?.fromMemory) {
        setupFailedAt = 0;
        void reloadSetup();
      }
      for (const order of [...toDecline.values()]) declineQuietly(order);
    } else if (state.setup === undefined) {
      // The first read failed while the till still thought it was online — a
      // router with no internet: what the till kept stands in now, at once,
      // not after the minute a failed read waits.
      setupFailedAt = 0;
      void loadSetup();
    }
    set({});
  }

  async function reloadSetup() {
    if (setupLoading) return;
    setupLoading = true;
    try {
      const setup = await api.loadSetup();
      if (setup?.fromMemory) {
        memoryAt = now();
        return;
      }
      // The block's effect reads the cart again against the fresh list of dishes.
      set({ setup: setup && setup.variantIds.size > 0 ? setup : null });
    } catch {
      // Still nothing: what the till kept stands.
    } finally {
      setupLoading = false;
    }
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
    phoneAgree,
    phoneUndo,
    /** Whether the block offers «Узгоджено телефоном» here (the desktop, platform 25). */
    canPhone,
    connectivityChanged,
    decline,
    refresh,
    /** Tests only. */
    reset() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      pendingUuid = null;
      setupFailedAt = 0;
      memoryAt = 0;
      toDecline.clear();
      state = initial();
    },
  };
}

export type RemoteCheckout = ReturnType<typeof createRemoteCheckout>;

/** The till's one conversation. */
export const remoteCheckout = createRemoteCheckout();
