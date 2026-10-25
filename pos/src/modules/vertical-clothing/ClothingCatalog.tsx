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
 * statically imported, never lazy — and why it knows weighed goods too
 * (TechDocs/grocery/G4_WEIGHED.md): a grocery store whose own catalog failed
 * still sells cheese by the kilogram through the weight pad, rather than not
 * at all.
 */

import { useEffect, useState } from 'react';
import { Camera, Search } from '@pos/platform/ui';
import { displayUnit, isWeighed, useCartStore, useSalesCatalog } from '@pos/platform';
import type { CatalogItem, SalesCatalogProps } from '@pos/platform';
import {
  BarcodeScanner,
  CatalogTagBar,
  ProductTile,
  ScanWedge,
  TagFolderTile,
  VariantPicker,
  WeightPad,
  useDragScroll,
} from '@pos/platform/ui';
import { tileCompareAt } from './lib/tilePrice';

export function ClothingCatalog({ active, stockEpoch }: SalesCatalogProps) {
  const catalog = useSalesCatalog();
  const addItem = useCartStore((s) => s.addItem);
  const addWeighed = useCartStore((s) => s.addWeighed);
  const setBanner = useCartStore((s) => s.setBanner);
  const gridRef = useDragScroll<HTMLDivElement>();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [picker, setPicker] = useState<CatalogItem[] | null>(null);
  /** The weighed variant whose weight is being typed (Г4). */
  const [weighing, setWeighing] = useState<CatalogItem | null>(null);

  // A sale (or a cancelled one) moved stock: re-read what is on screen so the
  // tiles stop offering the last item of something that just left the shop.
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
    const items = await catalog.lookupBarcode(code);
    if (items.length === 1) {
      ring(items[0]);
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
    if (variants.length === 1) ring(variants[0]);
    else setPicker(variants);
  }

  return (
    <section className="flex flex-col min-h-0 bg-white">
      <ScanWedge active={active && !picker && !cameraOpen && !weighing} onScan={(code) => void handleBarcode(code)} />

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
            // A weighed product is priced per kilogram and never sold out by
            // the books (G4_WEIGHED.md, decision 6); a card that mixes it with
            // pieces names no price, since the cheapest of a price per kg and
            // a price per pack means nothing.
            const weighed = variants.filter((v) => isWeighed(v.price_per));
            const allWeighed = weighed.length === variants.length;
            const minPrice = Math.min(...variants.map((v) => v.price_cents));
            const stock = variants.reduce((s, v) => s + v.quantity, 0);
            return (
              <ProductTile
                key={productId}
                name={first.product_name}
                subtitle={first.label}
                priceCents={weighed.length > 0 && !allWeighed ? undefined : minPrice}
                priceUnit={allWeighed ? displayUnit(first.unit, first.price_per) : undefined}
                compareAtCents={weighed.length > 0 ? null : tileCompareAt(variants)}
                imageUrl={first.image_url}
                stock={weighed.length > 0 ? undefined : stock}
                disabled={weighed.length === 0 && stock <= 0}
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
