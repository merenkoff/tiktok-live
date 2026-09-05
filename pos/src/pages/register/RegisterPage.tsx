// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Search } from 'lucide-react';
import { cashierApi } from '../../offline/cashierApi';
import { useAuthStore, useCartStore } from '@pos/platform';
import { useDragScroll } from '../../hooks/useDragScroll';
import { formatUah } from '../../lib/money';
import { DEFAULT_RECEIPT_PAPER_WIDTH, ReceiptPaperWidth, printReceipt } from '../../lib/printer';
import { buildReceiptPayload } from '../../lib/receipt';
import { usePrintableReceipt } from '../../hooks/usePrintableReceipt';
import { getMeta } from '../../offline/db';
import type { CatalogItem, PaymentMethod, PosTag, SaleDetail, SalePaymentInput } from '../../types';
import { CheckoutModal } from '../../components/CheckoutModal';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import { ProductTile } from '../../components/cashier/ProductTile';
import { TagFolderTile } from '../../components/cashier/TagFolderTile';
import { SaleSidebar } from '../../components/cashier/SaleSidebar';
import { VariantPicker } from '../../components/cashier/VariantPicker';
import { MobileCartSheet } from '../../components/cashier/MobileCartSheet';
import { useCancelRungSale } from '../../modules/returns';

function paymentLabel(method: PaymentMethod): string {
  return method === 'cash' ? 'Готівка' : method === 'card' ? 'Картка' : 'QR-код';
}

function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

function needsBackNav(tagPath: PosTag[]): boolean {
  if (tagPath.length === 0) return false;
  if (tagPath.length === 1 && tagPath[0].show_in_catalog_bar) return false;
  return true;
}

export function RegisterPage() {
  const auth = useAuthStore((s) => s.auth);

  const lines = useCartStore((s) => s.lines);
  const banner = useCartStore((s) => s.banner);
  const addItem = useCartStore((s) => s.addItem);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const totalCents = useCartStore((s) => s.totalCents);
  const setBanner = useCartStore((s) => s.setBanner);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  const customer = useCartStore((s) => s.customer);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const catalogBarRef = useDragScroll<HTMLDivElement>();
  const gridRef = useDragScroll<HTMLDivElement>();

  const [tags, setTags] = useState<PosTag[]>([]);
  const [tagPath, setTagPath] = useState<PosTag[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<SaleDetail | null>(null);
  // Cancelling the receipt we just rang up — the common "wrong item" fix. Under
  // ПРРО that is a full refund; the `returns` module owns the dialog and lazy-
  // loads it, so checkout stays reachable even with `returns` disabled.
  const cancelRung = useCancelRungSale();
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [receiptPrinterName, setReceiptPrinterName] = useState<string | null>(null);
  const [receiptPaperWidth, setReceiptPaperWidth] =
    useState<ReceiptPaperWidth>(DEFAULT_RECEIPT_PAPER_WIDTH);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  const wedgeRef = useRef<HTMLInputElement>(null);
  // Guards auto-print against StrictMode / effect re-runs — keyed by receipt.
  const autoPrintedRef = useRef<string | null>(null);
  const { printToPdf, printablePortal } = usePrintableReceipt();
  // Fresh draft id per checkout session — used as the QR payment reference.
  const [saleDraftId, setSaleDraftId] = useState('');
  useEffect(() => {
    if (checkoutOpen) setSaleDraftId(crypto.randomUUID());
  }, [checkoutOpen]);

  const currentTag = tagPath[tagPath.length - 1] ?? null;
  const flatTags = useMemo(() => flattenTags(tags), [tags]);

  const catalogBarTags = useMemo(
    () => flatTags.filter((t) => t.show_in_catalog_bar).sort((a, b) => a.sort_order - b.sort_order),
    [flatTags]
  );

  const showBack = needsBackNav(tagPath);
  const backLabel =
    tagPath.length <= 1 ? 'Усі товари' : (tagPath[tagPath.length - 2]?.name ?? 'Усі товари');

  const loadTags = useCallback(async () => {
    setTags(await cashierApi.getTags());
  }, []);

  const loadCatalog = useCallback(async (opts?: { q?: string; barcode?: string; tag_id?: number }) => {
    setLoading(true);
    try {
      const items = await cashierApi.getCatalog(opts);
      setCatalog(items);
      return items;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (query.trim()) {
      void loadCatalog({ q: query });
      return;
    }
    if (currentTag) {
      void loadCatalog({ tag_id: currentTag.id });
      return;
    }
    void loadCatalog();
  }, [currentTag, query, loadCatalog]);

  useEffect(() => {
    wedgeRef.current?.focus();
  }, [success, checkoutOpen, mobileCartOpen]);

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
      const key = success.receipt_number || String(success.id);
      if (autoPrintedRef.current === key) return;
      autoPrintedRef.current = key;

      setPrinting(true);
      setPrintStatus(null);
      try {
        await printReceipt(printerName, buildReceiptPayload(success, auth?.store.name ?? ''), paper);
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
  }, [success, auth?.store.auto_print_receipt, auth?.store.name]);

  // A cancel/partial-refund against the just-rung receipt: keep the shown
  // receipt fresh, and pull a new catalog since stock moved.
  useEffect(() => {
    if (cancelRung.detail) setSuccess(cancelRung.detail);
  }, [cancelRung.detail]);
  useEffect(() => {
    if (cancelRung.result) void loadCatalog();
  }, [cancelRung.result, loadCatalog]);

  const folderTiles: PosTag[] = useMemo(() => {
    if (query.trim()) return [];
    const level = !currentTag ? tags : currentTag.children ?? [];
    return level.filter((t) => !t.show_in_catalog_bar);
  }, [query, currentTag, tags]);

  const grouped = useMemo(() => {
    const map = new Map<number, CatalogItem[]>();
    for (const item of catalog) {
      const list = map.get(item.product_id) ?? [];
      list.push(item);
      map.set(item.product_id, list);
    }
    return [...map.entries()];
  }, [catalog]);

  function enterTag(tag: PosTag) {
    setQuery('');
    if (!currentTag) {
      const root = tags.find((t) => t.id === tag.id) ?? tag;
      setTagPath([root]);
      return;
    }
    setTagPath([...tagPath, { ...tag, children: tag.children ?? [] }]);
  }

  function selectCatalogBarTag(tag: PosTag | null) {
    setQuery('');
    if (!tag) {
      setTagPath([]);
      return;
    }
    const full = flatTags.find((t) => t.id === tag.id) ?? tag;
    // Bar selection is always a single-level path so «‹ назад» does not appear
    if (full.parent_id == null) {
      const root = tags.find((t) => t.id === full.id) ?? full;
      setTagPath([root]);
      return;
    }
    setTagPath([{ ...full, children: [] }]);
  }

  function goBackOne() {
    setQuery('');
    setTagPath((prev) => prev.slice(0, -1));
  }

  async function handleBarcode(code: string) {
    const items = await loadCatalog({ barcode: code.trim() });
    if (items.length === 1) {
      addItem(items[0]);
      setQuery('');
      return;
    }
    if (items.length === 0) {
      setBanner('Штрихкод не знайдено');
      return;
    }
    setPicker(items);
  }

  function onProductTap(variants: CatalogItem[]) {
    if (variants.length === 1) {
      addItem(variants[0]);
      return;
    }
    setPicker(variants);
  }

  async function pay(payments: SalePaymentInput[]) {
    setPaying(true);
    try {
      const sale = await cashierApi.completeSale({
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          quantity: line.quantity,
        })),
        payments,
        cart_discount: cartDiscount,
        customer_id: customer?.id ?? null,
      });
      clear();
      setCheckoutOpen(false);
      setMobileCartOpen(false);
      setSuccess(sale);
      setPrintStatus(null);
      await loadCatalog(
        currentTag && !query ? { tag_id: currentTag.id } : { q: query || undefined }
      );
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error &&
        'response' in error &&
        (error as { response?: { data?: { error?: string } } }).response?.data?.error
          ? String((error as { response?: { data?: { error?: string } } }).response?.data?.error)
          : 'Не вдалося завершити продаж';
      setBanner(message);
    } finally {
      setPaying(false);
    }
  }

  // Keyed on the receipt number, not the object: a partial refund refreshes
  // `success` in place (same number) and must keep the cancellation state.
  useEffect(() => {
    cancelRung.reset();
  }, [success?.receipt_number, cancelRung.reset]);

  async function printSuccessReceipt() {
    if (!success || !receiptPrinterName) return;
    setPrinting(true);
    setPrintStatus(null);
    try {
      await printReceipt(
        receiptPrinterName,
        buildReceiptPayload(success, auth?.store.name ?? ''),
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
    printToPdf(buildReceiptPayload(success, auth?.store.name ?? ''));
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
              cancelRung.reset();
            }}
          >
            Новий чек
          </button>
          {cancelRung.result !== 'refunded' && cancelRung.result !== 'voided' && (
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
  const catalogBarActiveId =
    !showBack && currentTag?.show_in_catalog_bar ? currentTag.id : !currentTag ? 'all' : null;

  return (
    <>
      <input
          ref={wedgeRef}
          className="sr-only"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = (e.target as HTMLInputElement).value;
              (e.target as HTMLInputElement).value = '';
              if (value.trim()) void handleBarcode(value);
            }
          }}
        />

        {banner && (
          <div className="mx-3 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm shrink-0">
            {banner}
          </div>
        )}

        <div className="flex-1 grid lg:grid-cols-[1fr_360px] min-h-0">
          <section className="flex flex-col min-h-0 bg-white">
            <div className="px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
                  />
                  <input
                    className="pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider"
                    placeholder="Пошук"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="min-h-12 min-w-12 grid place-items-center rounded-sq text-sq-blue border border-sq-divider bg-white"
                  aria-label="Камера"
                >
                  <Camera size={20} />
                </button>
              </div>

              {!query.trim() && (
                <div
                  ref={catalogBarRef}
                  className="flex items-stretch gap-0 overflow-x-auto -mx-1 px-1 select-none"
                >
                  {showBack && (
                    <button
                      type="button"
                      onClick={goBackOne}
                      className="shrink-0 px-3 py-2 text-sm font-medium text-sq-blue whitespace-nowrap"
                    >
                      ‹ {backLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => selectCatalogBarTag(null)}
                    className={`shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${
                      catalogBarActiveId === 'all'
                        ? 'font-semibold text-sq-text border-sq-text'
                        : 'font-medium text-sq-secondary border-transparent'
                    }`}
                  >
                    Усі товари
                  </button>
                  {catalogBarTags.map((tag) => {
                    const active = catalogBarActiveId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => selectCatalogBarTag(tag)}
                        className={`shrink-0 px-3 py-2 text-sm whitespace-nowrap border-b-2 ${
                          active
                            ? 'font-semibold text-sq-text border-sq-text'
                            : 'font-medium text-sq-secondary border-transparent'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div ref={gridRef} className="flex-1 overflow-auto p-3 bg-white select-none">
              {loading && <p className="text-sm text-sq-muted">Завантаження…</p>}
              <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
                {folderTiles.map((folder) => (
                  <TagFolderTile
                    key={folder.id}
                    name={folder.name}
                    color={folder.color}
                    onClick={() => enterTag(folder)}
                  />
                ))}

                {grouped.map(([productId, variants]) => {
                  const first = variants[0];
                  const minPrice = Math.min(...variants.map((v) => v.price_cents));
                  const stock = variants.reduce((s, v) => s + v.quantity, 0);
                  return (
                    <ProductTile
                      key={productId}
                      name={first.product_name}
                      subtitle={[first.color, first.size].filter(Boolean).join(' / ')}
                      priceCents={minPrice}
                      imageUrl={first.image_url}
                      stock={stock}
                      disabled={stock <= 0}
                      onClick={() => onProductTap(variants)}
                    />
                  );
                })}
              </div>
              {!loading && folderTiles.length === 0 && grouped.length === 0 && (
                <div className="rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4">
                  Порожньо
                </div>
              )}
            </div>
          </section>

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
          onClose={() => setCheckoutOpen(false)}
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

      {cameraOpen && (
        <BarcodeScanner
          onClose={() => setCameraOpen(false)}
          onScan={(code) => void handleBarcode(code)}
        />
      )}

      {picker && (
        <VariantPicker
          productName={picker[0]?.product_name ?? 'Варіант'}
          variants={picker}
          onClose={() => setPicker(null)}
          onPick={(item) => {
            addItem(item);
            setPicker(null);
          }}
        />
      )}
    </>
  );
}
