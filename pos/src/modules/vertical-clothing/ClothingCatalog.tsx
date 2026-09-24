// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The catalog half of the sell screen for a shop that sells goods off a rail:
 * tag folders, a product grid, one tile per product, a picker when a product
 * has several variants.
 *
 * This is also the fallback every other vertical falls back to — if a store's
 * own catalog module is missing, not downloaded yet or throws, the frame
 * renders this one and the till keeps selling. That is why it is bundled and
 * statically imported, never lazy.
 */

import { useEffect, useState } from 'react';
import { Camera, Search } from '@pos/platform/ui';
import { useCartStore, useSalesCatalog } from '@pos/platform';
import type { CatalogItem, SalesCatalogProps } from '@pos/platform';
import {
  BarcodeScanner,
  CatalogTagBar,
  ProductTile,
  ScanWedge,
  TagFolderTile,
  VariantPicker,
  useDragScroll,
} from '@pos/platform/ui';

export function ClothingCatalog({ active, stockEpoch }: SalesCatalogProps) {
  const catalog = useSalesCatalog();
  const addItem = useCartStore((s) => s.addItem);
  const setBanner = useCartStore((s) => s.setBanner);
  const gridRef = useDragScroll<HTMLDivElement>();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);

  // A sale (or a cancelled one) moved stock: re-read what is on screen so the
  // tiles stop offering the last item of something that just left the shop.
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

  function onProductTap(variants: CatalogItem[]): void {
    if (variants.length === 1) addItem(variants[0]);
    else setPicker(variants);
  }

  return (
    <section className="flex flex-col min-h-0 bg-white">
      <ScanWedge active={active && !picker && !cameraOpen} onScan={(code) => void handleBarcode(code)} />

      <div className="px-3 pt-3 pb-2 space-y-2 border-b border-sq-divider shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={20}
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
            return (
              <ProductTile
                key={productId}
                name={first.product_name}
                subtitle={first.label}
                priceCents={minPrice}
                imageUrl={first.image_url}
                stock={stock}
                disabled={stock <= 0}
                onClick={() => onProductTap(variants)}
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
        <BarcodeScanner
          onScan={(code) => {
            setCameraOpen(false);
            void handleBarcode(code);
          }}
          onClose={() => setCameraOpen(false)}
        />
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
