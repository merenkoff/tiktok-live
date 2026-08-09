import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, Search } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../hooks/useAuth';
import { useCartStore } from '../../hooks/useCart';
import { formatUah } from '../../lib/money';
import type { CatalogItem, PosTag, SaleDetail } from '../../types';
import { CheckoutModal } from '../../components/CheckoutModal';
import { BarcodeScanner } from '../../components/BarcodeScanner';
import { ProductTile } from '../../components/cashier/ProductTile';
import { TagFolderTile } from '../../components/cashier/TagFolderTile';
import { SaleSidebar } from '../../components/cashier/SaleSidebar';
import { BottomNav } from '../../components/cashier/BottomNav';
import { VariantPicker } from '../../components/cashier/VariantPicker';
import { MobileCartSheet } from '../../components/cashier/MobileCartSheet';

function paymentLabel(method: 'cash' | 'card'): string {
  return method === 'cash' ? 'Готівка' : 'Картка';
}

export function RegisterPage() {
  const auth = useAuthStore((s) => s.auth);
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role());

  const lines = useCartStore((s) => s.lines);
  const banner = useCartStore((s) => s.banner);
  const addItem = useCartStore((s) => s.addItem);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const totalCents = useCartStore((s) => s.totalCents);
  const setBanner = useCartStore((s) => s.setBanner);

  const [tags, setTags] = useState<PosTag[]>([]);
  const [tagPath, setTagPath] = useState<PosTag[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState<SaleDetail | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  const wedgeRef = useRef<HTMLInputElement>(null);

  const currentTag = tagPath[tagPath.length - 1] ?? null;

  const loadTags = useCallback(async () => {
    setTags(await api.getTags());
  }, []);

  const loadCatalog = useCallback(async (opts?: { q?: string; barcode?: string; tag_id?: number }) => {
    setLoading(true);
    try {
      const items = await api.getCatalog(opts);
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

  const folderTiles: PosTag[] = useMemo(() => {
    if (query.trim()) return [];
    if (!currentTag) return tags;
    return currentTag.children ?? [];
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

  async function pay(payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>) {
    setPaying(true);
    try {
      const sale = await api.completeSale({
        items: lines.map((line) => ({
          variant_id: line.variant_id,
          quantity: line.quantity,
        })),
        payments,
      });
      clear();
      setCheckoutOpen(false);
      setMobileCartOpen(false);
      setSuccess(sale);
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
          <button
            type="button"
            className="pos-btn-primary mt-10 w-full py-3.5"
            onClick={() => setSuccess(null)}
          >
            Новий чек
          </button>
        </div>
      </div>
    );
  }

  const lineCount = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="h-[100dvh] flex flex-col bg-sq-bg font-sans overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sq-divider bg-white">
        <nav className="flex items-center gap-1 text-sm text-sq-secondary flex-1 min-w-0 overflow-x-auto">
          <span className="text-sq-text font-semibold shrink-0 mr-1">Каталог</span>
          <button
            type="button"
            className="text-sq-blue font-medium shrink-0 min-h-11 px-1"
            onClick={() => setTagPath([])}
          >
            Усі
          </button>
          {tagPath.map((t, i) => (
            <span key={t.id} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={14} />
              <button
                type="button"
                className={`min-h-11 px-1 ${
                  i === tagPath.length - 1 ? 'text-sq-text font-medium' : 'text-sq-blue'
                }`}
                onClick={() => setTagPath(tagPath.slice(0, i + 1))}
              >
                {t.name}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setShowSearch((v) => !v)}
          className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-blue"
          aria-label="Пошук"
        >
          <Search size={20} />
        </button>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="min-h-11 min-w-11 grid place-items-center rounded-sq text-sq-blue"
          aria-label="Камера"
        >
          <Camera size={20} />
        </button>
      </div>

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
        <div className="mx-3 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm">{banner}</div>
      )}

      {showSearch && (
        <div className="px-3 py-2 bg-white border-b border-sq-divider">
          <input
            className="pos-field text-sm"
            placeholder="Пошук…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      )}

      <div className="flex-1 grid lg:grid-cols-[1fr_360px] min-h-0">
        <section className="flex flex-col min-h-0">
          <div className="flex-1 overflow-auto p-3">
            {loading && <p className="text-sm text-sq-muted">Завантаження…</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
              {folderTiles.map((folder) => (
                <TagFolderTile
                  key={folder.id}
                  name={folder.name}
                  onClick={() => {
                    if (!currentTag) {
                      const root = tags.find((t) => t.id === folder.id);
                      if (root) setTagPath([root]);
                      return;
                    }
                    setTagPath([...tagPath, { ...folder, children: [] }]);
                  }}
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
            totalCents={totalCents()}
            onSetQty={setQty}
            onRemove={remove}
            onClear={() => {
              if (lines.length && confirm('Очистити кошик?')) clear();
            }}
            onCharge={() => setCheckoutOpen(true)}
          />
        </div>
      </div>

      <div className="lg:hidden border-t border-sq-divider bg-white px-3 py-2 flex items-center gap-3">
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

      <BottomNav isOwner={role === 'owner'} onLogout={() => void logout()} />

      {checkoutOpen && (
        <CheckoutModal
          totalCents={totalCents()}
          loading={paying}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={(payments) => void pay(payments)}
        />
      )}

      {mobileCartOpen && (
        <MobileCartSheet
          lines={lines}
          totalCents={totalCents()}
          onSetQty={setQty}
          onRemove={remove}
          onClose={() => setMobileCartOpen(false)}
          onCharge={() => {
            setMobileCartOpen(false);
            setCheckoutOpen(true);
          }}
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
    </div>
  );
}
