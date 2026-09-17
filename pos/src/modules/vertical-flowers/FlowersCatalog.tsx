// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The sell screen's catalog for a flower shop.
 *
 * Thin on purpose. It proves the whole path — a signed remote bundle a store is
 * pointed at, rendering the catalog half of `/register` — while the flower-shop
 * features that justify it (bouquets assembled from stems, freshness, write-off
 * analytics) are a later phase that will live in this same module.
 *
 * What differs from the bundled clothing catalog today is small and real: stems
 * are counted in a unit worth showing on the tile, and the caption is the one
 * the flowers vertical derives («Червона · 60 см»).
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Camera, Search } from 'lucide-react';
import { useCartStore, useSalesCatalog, useVertical } from '@pos/platform';
import type { CatalogItem, SalesCatalogProps } from '@pos/platform';
import {
  CatalogTagBar,
  ProductTile,
  ScanWedge,
  TagFolderTile,
  VariantPicker,
  useDragScroll,
} from '@pos/platform/ui';

// The camera scanner drags in html5-qrcode (~500 kB). The host bundle has
// already paid for it; a remote bundles `@pos/platform/ui` locally, so without
// this split every till running this module would download half a megabyte for
// a button most cashiers never press — the wedge scanner is what they use.
//
// Imported by file path rather than through the barrel on purpose: the barrel
// is already in this bundle's static graph (the tiles above), so a dynamic
// import of it resolves to the same chunk and splits nothing.
const BarcodeScanner = lazy(() =>
  import('../../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);
import { HostTooOldError, missingHostApi } from './lib/hostPlatform';

export default function FlowersCatalog({ active, stockEpoch }: SalesCatalogProps) {
  // Throws into the host's `CatalogBoundary`, which falls back to the bundled
  // catalog — a shop on an old till keeps selling, plainly.
  const missing = missingHostApi();
  if (missing.length > 0) throw new HostTooOldError(missing);

  return <FlowersCatalogBody active={active} stockEpoch={stockEpoch} />;
}

function FlowersCatalogBody({ active, stockEpoch }: SalesCatalogProps) {
  const catalog = useSalesCatalog();
  const vertical = useVertical();
  const addItem = useCartStore((s) => s.addItem);
  const setBanner = useCartStore((s) => s.setBanner);
  const gridRef = useDragScroll<HTMLDivElement>();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    if (stockEpoch > 0) void catalog.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockEpoch]);

  async function handleBarcode(code: string): Promise<void> {
    const items = await catalog.lookupBarcode(code);
    if (items.length === 1) {
      addItem(items[0]);
      catalog.setQuery('');
      return;
    }
    if (items.length === 0) {
      setBanner('Штрихкод не знайдено');
      return;
    }
    setPicker(items);
  }

  return (
    <section className="flex flex-col min-h-0 bg-white" data-testid="flowers-catalog">
      <ScanWedge
        active={active && !picker && !cameraOpen}
        onScan={(code) => void handleBarcode(code)}
      />

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
              value={catalog.query}
              onChange={(e) => catalog.setQuery(e.target.value)}
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

      <div ref={gridRef} className="flex-1 overflow-auto p-3 bg-white select-none">
        {catalog.loading && <p className="text-sm text-sq-muted">Завантаження…</p>}
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-2">
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
            const minPrice = Math.min(...variants.map((v) => v.price_cents));
            const stock = variants.reduce((s, v) => s + v.quantity, 0);
            // A florist counts stems, and how many are left is the thing they
            // look at — so it goes on the tile rather than behind a tap.
            const unit = first.unit || vertical.defaultUnit;
            return (
              <ProductTile
                key={productId}
                name={first.product_name}
                subtitle={[first.label, `${stock} ${unit}`].filter(Boolean).join(' · ')}
                priceCents={minPrice}
                imageUrl={first.image_url}
                stock={stock}
                disabled={stock <= 0}
                onClick={() =>
                  variants.length === 1 ? addItem(variants[0]) : setPicker(variants)
                }
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
            addItem(item);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  );
}
