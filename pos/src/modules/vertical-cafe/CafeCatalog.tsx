// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The sell screen's catalog for a café — the menu (TechDocs/POS_CAFE.md §3).
 *
 * What is the café's here is the tap rule, and only that. The sheet the
 * questions are asked on is host UI (`ModifierSheet` in `@pos/platform/ui`),
 * the arithmetic is the host's (`@pos/platform`, pinned to the server's), the
 * cart, payment and receipt are the host frame's. This module decides when a
 * tap on a tile is the whole order and when it has to ask first:
 *
 *   - a tap adds the drink «як завжди»: every required question answered by
 *     its default, the optional ones left alone — one tap, the common case;
 *   - a tap asks first only when it has to: a size to pick, or a required
 *     question with no default;
 *   - the «⋯» in the tile's corner always asks, defaults pre-selected. Visible,
 *     rather than a long-press nobody finds and a wet thumb mistimes.
 *
 * The defaults are sent explicitly on the one-tap path: the server never
 * applies `is_default` on its own (POS_CAFE.md §4.4).
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Camera, Search } from '@pos/platform/ui';
import {
  defaultModifierIds,
  groupsOf,
  needsModifierSheet,
  useCartStore,
  useSalesCatalog,
  useVertical,
} from '@pos/platform';
import type { CatalogItem, SalesCatalogProps } from '@pos/platform';
import {
  CatalogTagBar,
  ModifierSheet,
  ProductTile,
  ScanWedge,
  TagFolderTile,
  useDragScroll,
} from '@pos/platform/ui';

// The camera scanner drags in html5-qrcode (~500 kB); split out so a till
// that never presses the button never downloads it — see `FlowersCatalog`.
const BarcodeScanner = lazy(() =>
  import('../../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);
import { HostTooOldError, missingHostApi } from './lib/hostPlatform';
import { isStopListed } from './lib/stopList';

export default function CafeCatalog({ active, stockEpoch }: SalesCatalogProps) {
  // Throws into the host's `CatalogBoundary`, which falls back to the bundled
  // catalog — a café on an old till keeps selling, plainly.
  const missing = missingHostApi();
  if (missing.length > 0) throw new HostTooOldError(missing);

  return <CafeCatalogBody active={active} stockEpoch={stockEpoch} />;
}

interface SheetState {
  variants: CatalogItem[];
  initialVariantId: number | null;
}

function CafeCatalogBody({ active, stockEpoch }: SalesCatalogProps) {
  const catalog = useSalesCatalog();
  const vertical = useVertical();
  const addItem = useCartStore((s) => s.addItem);
  const setBanner = useCartStore((s) => s.setBanner);
  const gridRef = useDragScroll<HTMLDivElement>();

  const [cameraOpen, setCameraOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState | null>(null);

  // What the size row on the sheet is called — the vertical's own word for it.
  const sizeLabel = vertical.attributes.find((a) => a.key === 'size')?.label ?? 'Розмір';

  useEffect(() => {
    if (stockEpoch > 0) void catalog.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockEpoch]);

  /** The tap rule. `ask` is the «⋯»: always the sheet, defaults pre-selected. */
  function ring(variants: CatalogItem[], { ask = false } = {}) {
    const groups = groupsOf(variants);
    if (ask || needsModifierSheet(variants, groups)) {
      setSheet({
        variants,
        initialVariantId: variants.length === 1 ? variants[0].variant_id : null,
      });
      return;
    }
    addItem(variants[0], 1, { modifiers: defaultModifierIds(groups), note: '' });
  }

  async function handleBarcode(code: string): Promise<void> {
    const items = await catalog.lookupBarcode(code);
    if (items.length === 0) {
      setBanner('Штрихкод не знайдено');
      return;
    }
    // A scanned bottle is one variant and rings at once; a drink with sizes
    // asks, exactly as a tap on its tile would.
    ring(items);
    catalog.setQuery('');
  }

  return (
    // `relative`: the sheet is positioned inside this section, so on a wide
    // till the cart next to it stays visible while the question is asked.
    <section className="relative flex flex-col min-h-0 bg-white" data-testid="cafe-catalog">
      <ScanWedge
        active={active && !cameraOpen && !sheet}
        onScan={(code) => void handleBarcode(code)}
      />

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
            const groups = groupsOf(variants);
            const minPrice = Math.min(...variants.map((v) => v.price_cents));
            // For a derived drink this is what the beans and cups allow; for a
            // croissant, what is in the case. 0 greys the tile — «Сирника
            // немає» is an answer to the guest, an empty cell is a question to
            // the barista (§3).
            const stock = variants.reduce((s, v) => s + v.quantity, 0);
            // «Сьогодні не робимо» (К3): the barista pulled it for the day on
            // the kitchen board. Greyed with its own word, because the dish
            // may well be in the case — «немає» would be a lie.
            const stopped = isStopListed(first);
            const subtitle =
              variants.length > 1
                ? variants.map((v) => v.label).filter(Boolean).join(' / ')
                : first.label;
            return (
              <ProductTile
                key={productId}
                name={first.product_name}
                subtitle={subtitle}
                priceCents={minPrice}
                imageUrl={first.image_url}
                stock={stock}
                disabled={stock <= 0 || stopped}
                badge={stopped ? 'стоп' : undefined}
                onClick={() => ring(variants)}
                onMore={groups.length > 0 ? () => ring(variants, { ask: true }) : undefined}
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

      {sheet && (
        <ModifierSheet
          productName={sheet.variants[0]?.product_name ?? ''}
          variants={sheet.variants}
          variantLabel={sizeLabel}
          initialVariantId={sheet.initialVariantId}
          initialModifierIds={defaultModifierIds(groupsOf(sheet.variants))}
          onAdd={({ item, modifiers, note }) => {
            addItem(item, 1, { modifiers, note });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
