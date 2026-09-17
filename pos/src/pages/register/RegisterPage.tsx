// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { api, cashierApi, useAuthStore, useCartStore } from '@pos/platform';
import { formatUah } from '../../lib/money';
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

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
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
          })),
          payments,
          cart_discount: cartDiscount,
          customer_id: customer?.id ?? null,
        },
        opts
      );
      clear();
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

  /** The trade name plus the cached ПРРО requisites — everything the paper says about the store. */
  const receiptStore = () => ({ name: auth?.store.name ?? '', fiscal: auth?.store.fiscal ?? null });

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

    return (
      <div className="min-h-screen bg-white grid place-items-center p-6 font-sans">
        <div className="text-center max-w-sm w-full animate-fade-up">
          <div className="mx-auto w-14 h-14 rounded-full bg-sq-blue text-white grid place-items-center">
            <Check size={28} strokeWidth={2.5} />
          </div>
          <p className="sq-section-label mt-6">Чек</p>
          <h2 className="text-2xl font-bold mt-2 text-sq-text">{success.receipt_number}</h2>
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
              onSaveBasket={() => setBanner('Збереження кошика — скоро')}
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
          onSaveBasket={() => setBanner('Збереження кошика — скоро')}
        />
      )}

    </>
  );
}
