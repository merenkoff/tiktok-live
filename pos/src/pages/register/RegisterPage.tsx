// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { api, cashierApi, useAuthStore, useCartStore, useOfflineStatus } from '@pos/platform';
import { formatUah } from '../../lib/money';
import { localOrderLabel } from '../../lib/localOrderNo';
import {
  classifyCheckoutError,
  keepsModalOpen,
  type CheckoutFailure,
} from '../../lib/checkoutError';
import { DEFAULT_RECEIPT_PAPER_WIDTH, ReceiptPaperWidth, printReceipt } from '../../lib/printer';
import { buildReceiptPayload, fiscalBlockComplete } from '../../lib/receipt';
import { usePrintableReceipt } from '../../hooks/usePrintableReceipt';
import { getMeta } from '../../offline/db';
import type { PaymentMethod, SaleDetail, SalePaymentInput } from '../../types';
import { CheckoutModal } from '../../components/CheckoutModal';
import { SaleSidebar } from '../../components/cashier/SaleSidebar';
import { MobileCartSheet } from '../../components/cashier/MobileCartSheet';
import { ParkCartSheet } from '../../components/cashier/ParkCartSheet';
import { ParkedCartsSheet } from '../../components/cashier/ParkedCartsSheet';
import { PreorderSheet } from '../../components/cashier/PreorderSheet';
import { cartLinesFromParked } from '../../lib/parkedCart';
import type { ParkedCart } from '../../types';
import { useCancelRungSale } from '../../modules/returns';
import { resolveSalesCatalog } from '../../modules/verticals';
import { ClothingCatalog } from '../../modules/vertical-clothing/ClothingCatalog';
import { reportModuleEvent } from '../../modules/telemetry';
import { CatalogBoundary } from './CatalogBoundary';

function paymentLabel(method: PaymentMethod): string {
  return method === 'cash' ? 'Готівка' : method === 'card' ? 'Картка' : 'QR-код';
}

/**
 * The sell screen's frame: the cart, payment, ПРРО outcomes, the receipt and
 * the success screen. What is being sold — the tags, the grid, the scanner —
 * comes from the store's sales-vertical module; see `modules/verticals.ts`.
 *
 * The split is where it is because everything in this file is the same for a
 * clothes rail, a bucket of stems and a coffee machine, and everything on the
 * other side of it is not.
 */
export function RegisterPage() {
  const auth = useAuthStore((s) => s.auth);
  const vertical = auth?.store.vertical?.id ?? 'clothing';
  const { Catalog, moduleId, source, reason } = useMemo(
    () => resolveSalesCatalog(vertical),
    [vertical]
  );

  useEffect(() => {
    // Worth one line: this is how anyone finds out a vertical's release never
    // reached a shop. Clothing legitimately has no module of its own.
    if (source === 'fallback' && vertical !== 'clothing') {
      reportModuleEvent({ type: 'vertical_catalog_fallback', moduleId, vertical, reason: reason ?? 'missing' });
    }
  }, [source, reason, moduleId, vertical]);

  /**
   * Bumped whenever a sale moves stock, so the catalog re-reads it. A counter
   * rather than a callback: the frame does not know what the catalog is
   * showing, and the catalog keeps its own tag and search state across it.
   */
  const [stockEpoch, setStockEpoch] = useState(0);

  const lines = useCartStore((s) => s.lines);
  const banner = useCartStore((s) => s.banner);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const totalCents = useCartStore((s) => s.totalCents);
  const setBanner = useCartStore((s) => s.setBanner);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  const customer = useCartStore((s) => s.customer);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const restore = useCartStore((s) => s.restore);
  const preorderId = useCartStore((s) => s.preorderId);
  const online = useOfflineStatus((s) => s.online);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  // Putting this cart aside, and the shelf of carts any till can take back.
  // See TechDocs/POS_FLORIST_BENCH.md §9.
  const [parkOpen, setParkOpen] = useState(false);
  const [parking, setParking] = useState(false);
  const [parkError, setParkError] = useState<string | null>(null);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [parkedCarts, setParkedCarts] = useState<ParkedCart[]>([]);
  const [parkedLoading, setParkedLoading] = useState(false);
  const [parkedError, setParkedError] = useState<string | null>(null);
  const [parkedBusyId, setParkedBusyId] = useState<number | null>(null);
  /** The cart this sale came out of, so the server can note what it became. */
  const [fromParkedId, setFromParkedId] = useState<number | null>(null);
  // Taking an order for a day that has not happened yet (§14).
  const [preorderOpen, setPreorderOpen] = useState(false);
  const [preordering, setPreordering] = useState(false);
  const [preorderError, setPreorderError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<SaleDetail | null>(null);
  /** Shown inside the payment modal, which is opaque and covers everything else. */
  const [checkoutError, setCheckoutError] = useState<{
    message: string;
    supportCode?: string | null;
    action?: ReactNode;
  } | null>(null);
  /** Set when the sale went through but its ПРРО receipt did not. */
  const [fiscalNotice, setFiscalNotice] = useState<{
    message: string;
    supportCode: string | null;
  } | null>(null);
  // Cancelling the receipt we just rang up — the common "wrong item" fix. Under
  // ПРРО that is a full refund; the `returns` module owns the dialog and lazy-
  // loads it, so checkout stays reachable even with `returns` disabled.
  const cancelRung = useCancelRungSale();

  // What this shop is already holding, for the badge on the button. Read once
  // per till session and after anything that changes it: the point is that a
  // cashier walking up to an empty till can SEE there is a bouquet waiting,
  // rather than having to know to look. A poll would cost more than it is
  // worth — a cart parked at the other till is announced out loud anyway.
  useEffect(() => {
    let alive = true;
    void api
      .listParkedCarts()
      .then((carts) => {
        if (alive) setParkedCarts(carts);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [receiptPrinterName, setReceiptPrinterName] = useState<string | null>(null);
  const [receiptPaperWidth, setReceiptPaperWidth] =
    useState<ReceiptPaperWidth>(DEFAULT_RECEIPT_PAPER_WIDTH);
  // Guards auto-print against StrictMode / effect re-runs — keyed by receipt.
  const autoPrintedRef = useRef<string | null>(null);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  // Fresh draft id per checkout session — used as the QR payment reference.
  const [saleDraftId, setSaleDraftId] = useState('');
  useEffect(() => {
    if (checkoutOpen) setSaleDraftId(crypto.randomUUID());
  }, [checkoutOpen]);

  // After a sale: load the station's receipt-printer config, then (if the store
  // has auto-print on and a thermal printer is configured) silently print once.
  // The thermal-vs-nothing decision is made from the resolved meta values here,
  // not from the async React state, so there's no flash of the wrong path.
  useEffect(() => {
    if (!success) return;
    let cancelled = false;
    void (async () => {
      const [name, mm] = await Promise.all([
        getMeta<string>('receiptPrinterName'),
        getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
      ]);
      if (cancelled) return;
      const printerName = name ?? null;
      const paper: ReceiptPaperWidth = mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH;
      setReceiptPrinterName(printerName);
      setReceiptPaperWidth(paper);

      if (!(auth?.store.auto_print_receipt ?? false)) return;
      if (!printerName) return; // web / desktop without a configured printer → no-op
      // Never auto-print an un-fiscalised receipt in a ПРРО store: the customer
      // would walk out with a slip that looks like a receipt and carries no
      // fiscal number. An offline-stamped receipt DOES carry one, so it prints
      // automatically once its контрольне число is there too — the completeness
      // rule lives in `fiscalBlockComplete`, next to the layout it governs. The
      // manual button below stays for everything else, clearly labelled.
      if ((auth?.store.fiscal?.enabled ?? false) && !fiscalBlockComplete(success.fiscal)) {
        return;
      }
      const key = success.receipt_number || String(success.id);
      if (autoPrintedRef.current === key) return;
      autoPrintedRef.current = key;

      setPrinting(true);
      setPrintStatus(null);
      try {
        await printReceipt(
          printerName,
          buildReceiptPayload(success, {
            name: auth?.store.name ?? '',
            fiscal: auth?.store.fiscal ?? null,
            vertical: auth?.store.vertical?.id ?? null,
          }),
          paper
        );
        if (!cancelled) setPrintStatus('Чек надіслано на друк');
      } catch (e) {
        if (!cancelled) {
          setPrintStatus(`Не вдалося надрукувати чек: ${typeof e === 'string' ? e : String(e)}`);
        }
      } finally {
        if (!cancelled) setPrinting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    success,
    auth?.store.auto_print_receipt,
    auth?.store.name,
    auth?.store.vertical?.id,
    auth?.store.fiscal,
  ]);

  // A cancel/partial-refund against the just-rung receipt: keep the shown
  // receipt fresh, and pull a new catalog since stock moved.
  useEffect(() => {
    if (cancelRung.detail) setSuccess(cancelRung.detail);
  }, [cancelRung.detail]);
  useEffect(() => {
    if (cancelRung.result) setStockEpoch((n) => n + 1);
  }, [cancelRung.result]);

  // ── Parked carts (TechDocs/POS_FLORIST_BENCH.md §9) ──────────────────────

  /**
   * What the server said, not what axios says about it.
   *
   * Every refusal on this path is something a cashier has to act on at the
   * counter — «Кошик уже забрали», «Термін минув» — and «Request failed with
   * status code 409» tells them none of it.
   */
  function sentMessage(error: unknown, fallback: string): string {
    return (
      (error as { response?: { data?: { error?: string } } }).response?.data?.error || fallback
    );
  }

  async function park(label: string, note: string | null) {
    setParking(true);
    setParkError(null);
    try {
      await api.parkCart({
        client_uuid: crypto.randomUUID(),
        label,
        note,
        customer_id: customer?.id ?? null,
        cart_discount: cartDiscount,
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          quantity: line.quantity,
          ...(line.components
            ? {
                components: line.components.map((c) => ({
                  component_variant_id: c.component_variant_id,
                  quantity: c.quantity,
                })),
              }
            : {}),
        })),
      });
      clear();
      setParkOpen(false);
      setMobileCartOpen(false);
      // The stems this cart now holds are off the catalog, so the tiles behind
      // have to re-read — the same reason a sale bumps it.
      setStockEpoch((n) => n + 1);
      setBanner(`Відкладено: ${label}`);
      await refreshParked().catch(() => undefined);
    } catch (error) {
      setParkError(sentMessage(error, 'Не вдалося відкласти кошик'));
    } finally {
      setParking(false);
    }
  }

  async function refreshParked(): Promise<void> {
    setParkedCarts(await api.listParkedCarts());
  }

  async function openParked() {
    setParkedOpen(true);
    setParkedLoading(true);
    setParkedError(null);
    try {
      await refreshParked();
    } catch {
      setParkedError('Не вдалося завантажити відкладені кошики');
    } finally {
      setParkedLoading(false);
    }
  }

  async function pickUpParked(cart: ParkedCart) {
    setParkedBusyId(cart.id);
    setParkedError(null);
    try {
      const taken = await api.pickUpParkedCart(cart.id);
      // The real customer row, not a stub built from the two fields the list
      // carries: the cart sidebar shows the phone and the discount rules read
      // the birthdays. A failure here is not worth losing the cart over — the
      // cashier can pick the customer again.
      const restoredCustomer = taken.customer_id
        ? await api.getCustomer(taken.customer_id).catch(() => null)
        : null;
      restore({
        lines: cartLinesFromParked(taken),
        cartDiscount: taken.cart_discount,
        customer: restoredCustomer,
      });
      setFromParkedId(taken.id);
      setParkedOpen(false);
      setStockEpoch((n) => n + 1);
      setBanner(`Кошик «${taken.label}» на касі`);
    } catch (error) {
      // A 409: the other till got there first, or it lapsed while this one was
      // reading the list. Refresh rather than leave a row that is not there.
      setParkedError(sentMessage(error, 'Не вдалося забрати кошик'));
      setParkedCarts(await api.listParkedCarts().catch(() => []));
    } finally {
      setParkedBusyId(null);
    }
  }

  async function releaseParked(cart: ParkedCart) {
    setParkedBusyId(cart.id);
    try {
      await api.releaseParkedCart(cart.id);
      setParkedCarts((carts) => carts.filter((c) => c.id !== cart.id));
      setStockEpoch((n) => n + 1);
    } catch {
      setParkedError('Не вдалося повернути товар');
    } finally {
      setParkedBusyId(null);
    }
  }

  async function takePreorder(input: {
    due_at: string;
    fulfilment: 'pickup' | 'delivery';
    address: string | null;
    recipient_name: string | null;
    recipient_phone: string | null;
    card_message: string | null;
    note: string | null;
  }) {
    setPreordering(true);
    setPreorderError(null);
    try {
      await api.createPreorder({
        client_uuid: crypto.randomUUID(),
        customer_id: customer?.id ?? null,
        ...input,
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          quantity: line.quantity,
          ...(line.components
            ? {
                components: line.components.map((c) => ({
                  component_variant_id: c.component_variant_id,
                  quantity: c.quantity,
                })),
              }
            : {}),
        })),
      });
      clear();
      setPreorderOpen(false);
      setMobileCartOpen(false);
      // Deliberately NOT bumping `stockEpoch`: an order holds no stock, so the
      // tiles behind have nothing new to read.
      setBanner('Замовлення записано');
    } catch (error) {
      setPreorderError(sentMessage(error, 'Не вдалося записати замовлення'));
    } finally {
      setPreordering(false);
    }
  }

  async function pay(payments: SalePaymentInput[], opts: { clientUuid?: string } = {}) {
    setPaying(true);
    setCheckoutError(null);
    try {
      const sale = await cashierApi.completeSale(
        {
          items: lines.map((line) => ({
            variant_id: line.variant_id,
            quantity: line.quantity,
            // A bouquet assembled at the counter carries its own recipe. Only
            // the ids and counts go: the server re-prices from them, because a
            // line price the till can set freely is a hole no receipt shows.
            ...(line.components
              ? {
                  components: line.components.map((c) => ({
                    component_variant_id: c.component_variant_id,
                    quantity: c.quantity,
                  })),
                }
              : {}),
            // The answers a café line chose and its kitchen note. Ids only,
            // sorted: the server prices from them and keys its merge on them.
            ...(line.modifiers?.length
              ? { modifiers: line.modifiers.map((m) => m.id).sort((a, b) => a - b) }
              : {}),
            ...(line.note ? { note: line.note } : {}),
          })),
          payments,
          cart_discount: cartDiscount,
          customer_id: customer?.id ?? null,
          parked_cart_id: fromParkedId,
          preorder_id: preorderId,
        },
        opts
      );
      clear();
      setFromParkedId(null);
      setCheckoutOpen(false);
      setMobileCartOpen(false);
      setSuccess(sale);
      setFiscalNotice(null);
      setPrintStatus(null);
      setStockEpoch((n) => n + 1);
    } catch (error) {
      await handleCheckoutFailure(classifyCheckoutError(error), payments);
    } finally {
      setPaying(false);
    }
  }

  /**
   * Render a checkout failure by what it means for the customer, not by status.
   *
   * The distinction that matters: did the customer pay and leave with the
   * goods? If so this is a success screen with a warning, and telling the
   * cashier to ring it again would take the money twice.
   */
  async function handleCheckoutFailure(
    failure: CheckoutFailure,
    payments: SalePaymentInput[]
  ): Promise<void> {
    if (failure.kind === 'fiscal_failed_kept') {
      // The sale stands, un-fiscalised. The body carries only the id, so pull
      // the receipt itself to show a real number and total.
      clear();
      setCheckoutOpen(false);
      setMobileCartOpen(false);
      setPrintStatus(null);
      setFiscalNotice({ message: failure.message, supportCode: failure.supportCode });
      try {
        setSuccess(await api.getSale(failure.saleId));
      } catch {
        setSuccess(null);
        setBanner(`${failure.message} Чек №${failure.saleId}.`);
      }
      setStockEpoch((n) => n + 1);
      return;
    }

    if (keepsModalOpen(failure)) {
      setCheckoutError({
        message:
          // Which machine holds the register is the only thing the cashier
          // needs to know to fix this; the handover itself is on «Зміна ПРРО».
          // No link: that screen belongs to the provider's bundle and does not
          // exist as a route until it has loaded.
          failure.kind === 'register_held'
            ? `${failure.message}.${
                failure.holderName ? ` Зараз касу тримає «${failure.holderName}».` : ''
              } Передати її можна на екрані «Зміна ПРРО».`
            : failure.message,
        supportCode: 'supportCode' in failure ? failure.supportCode : null,
        action:
          failure.kind === 'unknown_state' ? (
            <button
              type="button"
              onClick={() => void pay(payments, { clientUuid: failure.clientUuid })}
              className="mt-2 min-h-11 px-3 rounded-sq bg-red-600 text-white text-sm font-semibold"
            >
              Перевірити ще раз
            </button>
          ) : undefined,
      });
      return;
    }

    // Cart survives, so the cashier can ring it again — and the next attempt
    // mints a fresh client_uuid, which is what the voided receipt needs.
    setCheckoutOpen(false);
    setBanner(
      failure.kind === 'fiscal_failed_voided' || failure.kind === 'sale_voided_replay'
        ? `${failure.message} Пробийте чек ще раз.`
        : failure.message
    );
  }

  // Keyed on the receipt number, not the object: a partial refund refreshes
  // `success` in place (same number) and must keep the cancellation state.
  useEffect(() => {
    cancelRung.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on receipt number by design (see comment above); only `cancelRung.reset` is used
  }, [success?.receipt_number, cancelRung.reset]);

  /**
   * A line with modifiers or a kitchen note can be sold, but not parked or
   * ordered ahead until К3: the server refuses it (`parked-carts.service.ts`,
   * `preorders.service.ts`), and dropping the fields on the way would lose
   * what the customer asked for. Said here, before a sheet opens for nothing.
   */
  const hasModifiedLine = lines.some((l) => l.modifiers?.length || l.note);

  function openPark() {
    if (hasModifiedLine) {
      setBanner('Позицію з модифікаторами поки не можна відкласти');
      return;
    }
    setParkError(null);
    setParkOpen(true);
  }

  function openPreorder() {
    if (hasModifiedLine) {
      setBanner('Позицію з модифікаторами поки не можна замовити наперед');
      return;
    }
    setPreorderError(null);
    setPreorderOpen(true);
  }

  /** The trade name plus the cached ПРРО requisites — everything the paper says about the store. */
  const receiptStore = () => ({
    name: auth?.store.name ?? '',
    fiscal: auth?.store.fiscal ?? null,
    vertical: auth?.store.vertical?.id ?? null,
  });

  async function printSuccessReceipt() {
    if (!success || !receiptPrinterName) return;
    setPrinting(true);
    setPrintStatus(null);
    try {
      await printReceipt(
        receiptPrinterName,
        buildReceiptPayload(success, receiptStore()),
        receiptPaperWidth,
      );
      setPrintStatus('Чек надіслано на друк');
    } catch (e) {
      setPrintStatus(`Не вдалося надрукувати чек: ${typeof e === 'string' ? e : String(e)}`);
    } finally {
      setPrinting(false);
    }
  }

  function printSuccessReceiptAsPdf() {
    if (!success) return;
    setPrintStatus(null);
    printToPdf(buildReceiptPayload(success, receiptStore()));
  }

  if (success) {
    const payText = success.payments
      .map((p) => `${paymentLabel(p.method)} ${formatUah(p.amount_cents)}`)
      .join(' · ');
    // The number the counter calls out — «сорок два», not «R-2026-000317».
    // Shown per vertical: a clothing store has no counter to call it at. An
    // `OFF-` sale the desktop queued offline has no server number until it
    // syncs, so it shows the till's own — «К1» — and says whose it is (К3d).
    const localNo = success.order_no == null ? (success.local_order_no ?? null) : null;
    const orderCaption =
      success.order_no != null
        ? String(success.order_no)
        : localNo != null
          ? localOrderLabel(localNo)
          : null;
    const showOrderNo = vertical === 'cafe' && orderCaption != null;

    return (
      <div className="min-h-screen bg-white grid place-items-center p-6 font-sans">
        <div className="text-center max-w-sm w-full animate-fade-up">
          <div className="mx-auto w-14 h-14 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={28} strokeWidth={2.5} />
          </div>
          {showOrderNo ? (
            <>
              <p className="sq-section-label mt-6">Замовлення</p>
              <p
                className="text-7xl font-bold mt-2 text-sq-text tabular-nums leading-none"
                data-testid="order-no"
              >
                {orderCaption}
              </p>
              {localNo != null && (
                <p className="text-xs text-sq-secondary mt-2" data-testid="order-no-local">
                  Номер каси — сервер призначить свій після синхронізації
                </p>
              )}
              <p className="text-sm text-sq-secondary mt-3">Чек {success.receipt_number}</p>
            </>
          ) : (
            <>
              <p className="sq-section-label mt-6">Чек</p>
              <h2 className="text-2xl font-bold mt-2 text-sq-text">{success.receipt_number}</h2>
            </>
          )}
          <p className="text-5xl font-bold mt-6 text-sq-text">{formatUah(success.total_cents)}</p>
          <p className="text-sq-secondary mt-3 text-sm">{success.staff_name}</p>
          {payText && <p className="text-sq-secondary mt-1 text-sm">{payText}</p>}
          {fiscalNotice && (
            <div
              role="alert"
              className="mt-6 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm text-left"
            >
              <p className="font-semibold">Чек не зареєстровано в ПРРО</p>
              <p className="mt-1">{fiscalNotice.message}</p>
              <p className="mt-1">Реєстрація повториться автоматично.</p>
              {fiscalNotice.supportCode && (
                <p className="mt-1 text-xs">Код: {fiscalNotice.supportCode}</p>
              )}
            </div>
          )}
          {cancelRung.result && (
            <p className="mt-6 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm font-semibold">
              {cancelRung.result === 'partially_refunded'
                ? 'Частину чека повернуто — товар повернувся на склад.'
                : 'Чек скасовано — кошти й товар повернуто.'}
            </p>
          )}
          <button
            type="button"
            className="pos-btn-primary mt-10 w-full py-3.5"
            onClick={() => {
              setSuccess(null);
              setFiscalNotice(null);
              cancelRung.reset();
            }}
          >
            Новий чек
          </button>
          {fiscalNotice && (
            // Cancelling routes through a refund, and a refund against a sale
            // with no fiscal document can never itself be fiscalised — it would
            // leave an orphan no reconciler can see. Wait for the retry instead.
            <p className="mt-3 rounded-sq bg-sq-surface border border-sq-divider px-3 py-2 text-xs text-sq-secondary text-left">
              Повернення буде доступне після реєстрації чека в ПРРО.
            </p>
          )}
          {!fiscalNotice && cancelRung.result !== 'refunded' && cancelRung.result !== 'voided' && (
            <button
              type="button"
              className="mt-3 w-full min-h-12 rounded-sq border border-red-300 bg-red-50 text-red-700 text-sm font-semibold"
              onClick={() => cancelRung.open(success)}
            >
              Скасувати чек
            </button>
          )}
          {receiptPrinterName && (
            <button
              type="button"
              className="mt-3 w-full py-3 text-sm font-medium text-sq-blue disabled:opacity-50"
              onClick={() => void printSuccessReceipt()}
              disabled={printing}
            >
              {printing ? 'Друк…' : 'Друкувати чек'}
            </button>
          )}
          <button
            type="button"
            className={`w-full py-3 text-sm font-medium text-sq-blue ${receiptPrinterName ? '' : 'mt-3'}`}
            onClick={printSuccessReceiptAsPdf}
          >
            {receiptPrinterName ? 'Зберегти чек як PDF' : 'Принтер не обрано — зберегти чек як PDF'}
          </button>
          {printStatus && <p className="text-sq-secondary text-sm mt-1">{printStatus}</p>}
        </div>
        {printablePortal}
        {cancelRung.node}
      </div>
    );
  }

  const lineCount = lines.reduce((s, l) => s + l.quantity, 0);
  // Anything opaque on top of the catalog takes the scanner with it: a wedge
  // scan landing behind the payment modal would ring up an invisible item.
  const catalogActive = !checkoutOpen && !mobileCartOpen && !success;

  return (
    <>
        {banner && (
          <div className="mx-3 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm shrink-0">
            {banner}
          </div>
        )}

        <div className="flex-1 grid lg:grid-cols-[1fr_360px] min-h-0">
          <CatalogBoundary
            key={moduleId}
            moduleId={moduleId}
            vertical={vertical}
            fallback={<ClothingCatalog active={catalogActive} stockEpoch={stockEpoch} />}
          >
            <Suspense
              fallback={<p className="p-3 text-sm text-sq-muted">Завантаження каталогу…</p>}
            >
              <Catalog active={catalogActive} stockEpoch={stockEpoch} />
            </Suspense>
          </CatalogBoundary>

          <div className="hidden lg:block min-h-0">
            <SaleSidebar
              staffName={auth?.staff.display_name ?? ''}
              lines={lines}
              customer={customer}
              cartDiscount={cartDiscount}
              onSetCustomer={setCustomer}
              onSetCartDiscount={setCartDiscount}
              onSetQty={setQty}
              onRemove={remove}
              onClear={() => {
                if (lines.length && confirm('Очистити кошик?')) clear();
              }}
              onCharge={() => setCheckoutOpen(true)}
              onSaveBasket={openPark}
              onOpenParked={() => void openParked()}
              parkedCount={parkedCarts.length}
              locked={preorderId != null}
              onCancelPreorder={clear}
              onTakePreorder={openPreorder}
            />
          </div>
        </div>

        <div className="lg:hidden border-t border-sq-divider bg-white px-3 py-2 flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="flex-1 text-left min-h-11"
            onClick={() => setMobileCartOpen(true)}
          >
            <p className="text-xs text-sq-secondary">Чек ({lineCount})</p>
            <p className="font-semibold">{formatUah(totalCents())}</p>
          </button>
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() => setCheckoutOpen(true)}
            className="pos-btn-primary px-4 py-2.5"
          >
            Сплатити
          </button>
        </div>

      {checkoutOpen && (
        <CheckoutModal
          totalCents={totalCents()}
          loading={paying}
          saleRef={saleDraftId}
          error={checkoutError}
          onClose={() => {
            setCheckoutError(null);
            setCheckoutOpen(false);
          }}
          onConfirm={(payments) => void pay(payments)}
        />
      )}

      {preorderOpen && (
        <PreorderSheet
          totalCents={totalCents()}
          lineCount={lines.length}
          defaultRecipient={customer?.name}
          online={online}
          busy={preordering}
          error={preorderError}
          onSubmit={(input) => void takePreorder(input)}
          onClose={() => setPreorderOpen(false)}
        />
      )}

      {parkOpen && (
        <ParkCartSheet
          totalCents={totalCents()}
          lineCount={lines.length}
          defaultLabel={customer?.name}
          online={online}
          busy={parking}
          error={parkError}
          onSubmit={(label, note) => void park(label, note)}
          onClose={() => setParkOpen(false)}
        />
      )}

      {parkedOpen && (
        <ParkedCartsSheet
          carts={parkedCarts}
          loading={parkedLoading}
          error={parkedError}
          busyId={parkedBusyId}
          onPickUp={(cart) => void pickUpParked(cart)}
          onRelease={(cart) => void releaseParked(cart)}
          onClose={() => setParkedOpen(false)}
        />
      )}

      {mobileCartOpen && (
        <MobileCartSheet
          lines={lines}
          customer={customer}
          cartDiscount={cartDiscount}
          onSetCustomer={setCustomer}
          onSetCartDiscount={setCartDiscount}
          onSetQty={setQty}
          onRemove={remove}
          onClose={() => setMobileCartOpen(false)}
          onCharge={() => {
            setMobileCartOpen(false);
            setCheckoutOpen(true);
          }}
          onSaveBasket={openPark}
          onOpenParked={() => void openParked()}
          parkedCount={parkedCarts.length}
          locked={preorderId != null}
        />
      )}

    </>
  );
}
