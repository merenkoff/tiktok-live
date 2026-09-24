// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The menu beside a table's bill (К4l, TechDocs/POS_TABLES.md §3.2).
//
// The sell screen's tiles, not a search list: tags, folders, photos, a price
// and the count of what is already on the draft, in the very components the
// till draws its catalog with. Built here rather than borrowed whole: the
// host resolves the vertical's `sales.Catalog` slot for `/register` alone,
// and that slot rings straight into the one cart store every shell shares —
// a bill cannot go there without mixing with a walk-in sale at the counter.
// So this module takes the primitives (`useSalesCatalog`, `ProductTile`,
// `CatalogTagBar`, `TagFolderTile`, `ModifierSheet`) and hands each tap to
// the bill instead.
//
// The tap rule IS the café's, copied rather than imported (the two modules
// are built and shipped apart): a tap rings the dish «як завжди» with every
// required answer at its default, and asks first only when it has to — a
// size to pick, or a required question with no default. The «⋯» in the corner
// always asks, defaults pre-selected. A dish the kitchen stopped for the day
// is greyed with «стоп», one the shelf is out of with «немає» — the guest
// asked, and both are answers the waiter gives out loud. No stock figure is
// ever printed: the guest is looking at this screen (§5).

import { useEffect, useState } from 'react';
import { Search } from '@pos/platform/ui';
import { defaultModifierIds, groupsOf, needsModifierSheet, useSalesCatalog, useVertical } from '@pos/platform';
import type { CatalogItem } from '@pos/platform';
import { CatalogTagBar, ModifierSheet, ProductTile, ScanWedge, TagFolderTile, useDragScroll } from '@pos/platform/ui';
import type { DishChoice } from '../lib/draft';
import { stopListedToday } from '../lib/menu';

export interface MenuCatalogProps {
  /** Units of each dish already on the draft, by product id — the tile's badge. */
  counts: ReadonlyMap<number, number>;
  online: boolean;
  /** False while something opaque covers the menu, so a wedge scanner lets go. */
  active: boolean;
  /** Only a till has a wedge scanner; on a tablet the hidden input would raise the keyboard. */
  canScan: boolean;
  /** Bumped by the bill after stock moved, so the tiles re-read what is left. */
  epoch: number;
  onAdd: (choice: DishChoice) => void;
  /**
   * The rows on screen, grouped by product, whenever they change. A bill line
   * names only its variant, so this grouping is what the page maps a draft
   * back onto dishes with, for the count on each tile.
   */
  onRows?: (grouped: ReadonlyArray<readonly [number, readonly CatalogItem[]]>) => void;
}

interface SheetState {
  variants: CatalogItem[];
  initialVariantId: number | null;
}

export function MenuCatalog({
  counts,
  online,
  active,
  canScan,
  epoch,
  onAdd,
  onRows,
}: MenuCatalogProps): JSX.Element {
  const catalog = useSalesCatalog();
  const vertical = useVertical();
  const gridRef = useDragScroll<HTMLDivElement>();
  const [sheet, setSheet] = useState<SheetState | null>(null);

  // What the size row on the sheet is called — the vertical's own word for it.
  const sizeLabel = vertical.attributes.find((a) => a.key === 'size')?.label ?? 'Розмір';

  useEffect(() => {
    if (epoch > 0) void catalog.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  useEffect(() => {
    onRows?.(catalog.grouped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.grouped]);

  /** The tap rule. `ask` is the «⋯»: always the sheet, defaults pre-selected. */
  function ring(variants: CatalogItem[], { ask = false } = {}): void {
    const groups = groupsOf(variants);
    if (ask || needsModifierSheet(variants, groups)) {
      setSheet({
        variants,
        initialVariantId: variants.length === 1 ? variants[0].variant_id : null,
      });
      return;
    }
    // The defaults travel explicitly — the server never applies `is_default`,
    // and a bill line that arrives without them is refused by name.
    onAdd({ item: variants[0], modifiers: defaultModifierIds(groups), note: '' });
  }

  async function handleBarcode(code: string): Promise<void> {
    const items = await catalog.lookupBarcode(code);
    if (items.length > 0) ring(items);
    catalog.setQuery('');
  }

  const empty = !catalog.loading && catalog.folderTiles.length === 0 && catalog.grouped.length === 0;

  return (
    // `relative`: the sheet is positioned inside this section, so on a wide
    // screen the bill beside it stays visible while the question is asked.
    <section className="relative flex h-full min-h-0 flex-col bg-white" data-testid="menu-catalog">
      {canScan && <ScanWedge active={active && !sheet} onScan={(code) => void handleBarcode(code)} />}

      <div className="shrink-0 space-y-2 border-b border-sq-divider px-3 pb-2 pt-3">
        <div className="relative">
          <Search
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sq-muted"
          />
          <input
            className="pos-field text-sm !pl-10 !bg-sq-bg !border-sq-divider"
            placeholder="Що додати?"
            data-testid="menu-search"
            value={catalog.query}
            onChange={(e) => catalog.setQuery(e.target.value)}
          />
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

      <div ref={gridRef} className="flex-1 select-none overflow-auto bg-white p-3">
        {catalog.loading && catalog.grouped.length === 0 && (
          <p className="text-sm text-sq-muted">Завантаження…</p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {catalog.folderTiles.map((folder) => (
            <div key={folder.id} data-testid={`menu-folder-${folder.id}`}>
              <TagFolderTile name={folder.name} color={folder.color} onClick={() => catalog.enterTag(folder)} />
            </div>
          ))}

          {catalog.grouped.map(([productId, variants]) => {
            const first = variants[0];
            const groups = groupsOf(variants);
            const minPrice = Math.min(...variants.map((v) => v.price_cents));
            // For a dish with a recipe this is what the kitchen's shelf allows;
            // for a bottle, what is in the fridge. 0 greys the tile: «немає» is
            // an answer to the guest, an empty cell is a question to the cook.
            const stock = variants.reduce((s, v) => s + v.quantity, 0);
            // «Сьогодні не робимо» (К3): pulled for the day on the kitchen
            // board. Its own word, because the dish may well be in the case.
            const stopped = stopListedToday(first);
            const subtitle =
              variants.length > 1
                ? variants.map((v) => v.label).filter(Boolean).join(' / ')
                : first.label;
            return (
              <ProductTile
                key={productId}
                testId={`menu-tile-${productId}`}
                name={first.product_name}
                subtitle={subtitle}
                priceCents={minPrice}
                imageUrl={first.image_url}
                stock={stock}
                count={counts.get(productId) ?? 0}
                disabled={!online || stock <= 0 || stopped}
                badge={stopped ? 'стоп' : undefined}
                onClick={() => ring(variants)}
                onMore={groups.length > 0 ? () => ring(variants, { ask: true }) : undefined}
              />
            );
          })}
        </div>
        {empty && (
          <div className="mt-4 rounded-sq border border-dashed border-sq-divider p-8 text-center text-sm text-sq-muted">
            {catalog.query.trim() ? 'Нічого не знайшли' : 'Меню порожнє'}
          </div>
        )}
      </div>

      {sheet && (
        <ModifierSheet
          productName={sheet.variants[0]?.product_name ?? ''}
          variants={sheet.variants}
          variantLabel={sizeLabel}
          initialVariantId={sheet.initialVariantId}
          initialModifierIds={defaultModifierIds(groupsOf(sheet.variants))}
          onAdd={({ item, modifiers, note }) => {
            onAdd({ item, modifiers, note });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}
