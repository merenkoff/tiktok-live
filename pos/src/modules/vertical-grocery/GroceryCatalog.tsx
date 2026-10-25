// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The sell screen's catalog for a grocery — a corner shop or a market stall
 * (TechDocs/grocery/G4_WEIGHED.md §6).
 *
 * Two kinds of goods share one counter, and what is the grocery's here is how
 * each is rung:
 *
 *   - a packed good (milk, bread) is scanned by the maker's code, or tapped,
 *     and goes in as one piece — a second scan makes it two;
 *   - a weighed good (cheese, potatoes, sweets) opens the weight pad: on a tap
 *     of its tile, on a variety picked in the picker, or on a scan of the
 *     shop's own `29…` price tag. Each weighing is its own line.
 *
 * Two things differ from the bundled catalog this falls back to. A scan does
 * not replace the grid: the cashier alternates scanning packs and tapping
 * loose vegetables, so the tiles they tap stay where they were — the lookup
 * goes through `cashierApi.getCatalog`, not the hook's `lookupBarcode`, which
 * shows the scanned product alone. And a weighed tile keeps its markdown
 * («229,90 → 189,90 ₴/кг», `groceryTile`).
 *
 * The weight pad, the cart and the arithmetic are the host's (`WeightPad`,
 * `addWeighed`, `lineAmountCents` — platform 21); nothing here prices a line.
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Camera, Search } from '@pos/platform/ui';
import { cashierApi, isWeighed, useCartStore, useSalesCatalog } from '@pos/platform';
import type { CatalogItem, SalesCatalogProps } from '@pos/platform';
import {
  CatalogTagBar,
  ProductTile,
  ScanWedge,
  TagFolderTile,
  VariantPicker,
  WeightPad,
  useDragScroll,
} from '@pos/platform/ui';
import { HostTooOldError, missingHostApi } from './lib/hostPlatform';
import { groceryTile } from './lib/tile';

// The camera scanner drags in html5-qrcode (~500 kB); split out so a till that
// never presses the button never downloads it — by file path, for the reason
// `FlowersCatalog` gives (the barrel is already in this bundle's static graph).
const BarcodeScanner = lazy(() =>
  import('../../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);

export default function GroceryCatalog({ active, stockEpoch }: SalesCatalogProps) {
  // Throws into the host's `CatalogBoundary`, which falls back to the bundled
  // catalog — a grocery on an old till keeps selling what it can, plainly.
  const missing = missingHostApi();
  if (missing.length > 0) throw new HostTooOldError(missing);

  return <GroceryCatalogBody active={active} stockEpoch={stockEpoch} />;
}

function GroceryCatalogBody({ active, stockEpoch }: SalesCatalogProps) {
  const catalog = useSalesCatalog();
  const addItem = useCartStore((s) => s.addItem);
  const addWeighed = useCartStore((s) => s.addWeighed);
  const setBanner = useCartStore((s) => s.setBanner);
  const gridRef = useDragScroll<HTMLDivElement>();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  /** The weighed variant whose weight is being typed. */
  const [weighing, setWeighing] = useState<CatalogItem | null>(null);

  // A sale (or a cancelled one) moved stock: re-read what is on screen so the
  // tiles stop offering the last carton of something that just left the shop.
  useEffect(() => {
    if (stockEpoch > 0) void catalog.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockEpoch]);

  /** A piece goes straight into the cart; a weighed variant asks its weight first. */
  function ring(item: CatalogItem): void {
    if (isWeighed(item.price_per)) setWeighing(item);
    else addItem(item);
  }

  async function handleBarcode(code: string): Promise<void> {
    const barcode = code.trim();
    if (!barcode) return;
    let items: CatalogItem[];
    try {
      items = await cashierApi.getCatalog({ barcode });
    } catch {
      setBanner('Не вдалося знайти штрихкод — спробуйте ще раз');
      return;
    }
    if (items.length === 0) {
      setBanner('Штрихкод не знайдено');
      return;
    }
    if (items.length === 1) ring(items[0]);
    else setPicker(items);
  }

  function onProductTap(variants: CatalogItem[]): void {
    if (variants.length === 1) ring(variants[0]);
    else setPicker(variants);
  }

  return (
    <section className="flex flex-col min-h-0 bg-white" data-testid="grocery-catalog">
      <ScanWedge
        active={active && !picker && !cameraOpen && !weighing}
        onScan={(code) => void handleBarcode(code)}
      />

      <div className="px-4 pt-3 pb-1 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={20}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sq-muted pointer-events-none"
            />
            <input
              className="pos-field text-[15px] !pl-11 !bg-sq-empty !border-transparent !rounded-xl"
              placeholder="Пошук або скан штрихкоду"
              value={catalog.query}
              onChange={(e) => catalog.setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="min-h-12 min-w-12 grid place-items-center rounded-xl text-sq-blue bg-sq-empty hover:bg-sq-selected transition-colors"
            aria-label="Камера"
          >
            <Camera size={20} />
          </button>
        </div>

        {!catalog.query.trim() && (
          <CatalogTagBar
            tags={catalog.catalogBarTags}
            activeId={catalog.catalogBarActiveId}
            showBack={catalog.showBack}
            backLabel={catalog.backLabel}
            onSelect={catalog.selectCatalogBarTag}
            onBack={catalog.goBackOne}
          />
        )}
      </div>

      <div ref={gridRef} className="flex-1 overflow-auto px-4 pt-2 pb-4 bg-white select-none">
        {catalog.loading && <p className="text-sm text-sq-muted">Завантаження…</p>}
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3">
          {catalog.folderTiles.map((folder) => (
            <TagFolderTile
              key={folder.id}
              name={folder.name}
              color={folder.color}
              onClick={() => catalog.enterTag(folder)}
            />
          ))}

          {catalog.grouped.map(([productId, variants]) => {
            const first = variants[0];
            const tile = groceryTile(variants);
            return (
              <ProductTile
                key={productId}
                name={first.product_name}
                subtitle={first.label}
                priceCents={tile.priceCents}
                priceUnit={tile.priceUnit}
                compareAtCents={tile.compareAtCents}
                imageUrl={first.image_url}
                stock={tile.stock}
                disabled={tile.disabled}
                onClick={() => onProductTap(variants)}
                testId={`grocery-tile-${productId}`}
              />
            );
          })}
        </div>
        {!catalog.loading && catalog.folderTiles.length === 0 && catalog.grouped.length === 0 && (
          <div className="rounded-sq border border-dashed border-sq-divider p-8 text-center text-sq-muted text-sm mt-4">
            Порожньо
          </div>
        )}
      </div>

      {cameraOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onScan={(code) => {
              setCameraOpen(false);
              void handleBarcode(code);
            }}
            onClose={() => setCameraOpen(false)}
          />
        </Suspense>
      )}

      {picker && (
        <VariantPicker
          productName={picker[0]?.product_name ?? ''}
          variants={picker}
          onPick={(item) => {
            setPicker(null);
            ring(item);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {weighing && (
        <WeightPad
          productName={weighing.product_name}
          variantLabel={weighing.label}
          unit={weighing.unit}
          pricePer={weighing.price_per ?? 1}
          priceCents={weighing.price_cents}
          stock={weighing.quantity}
          onConfirm={(quantity, source) => {
            if (addWeighed(weighing, quantity, source) === null) setWeighing(null);
          }}
          onClose={() => setWeighing(null)}
        />
      )}
    </section>
  );
}
