// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The stems, as tiles. One tap adds one (`TechDocs/POS_FLORIST_BENCH.md` §3.2).
 *
 * The grid **does not reorder** as stems go in (§3.8): muscle memory is the
 * only thing that beats Hick's law at 40–80 positions, and a tile that moves
 * because it was just used destroys it. The count rides on the tile instead,
 * which is also the answer to "did I already put a rose in?".
 *
 * Bouquet cards are filtered out here rather than shown greyed: the bench is
 * for assembling one, and a composite may not contain another composite — the
 * server enforces that one-level rule, so offering it would only produce a
 * refusal the florist cannot act on.
 */

import { ProductTile, TagFolderTile, useDragScroll } from '@pos/platform/ui';
import type { CatalogItem, PosTag } from '@pos/platform';

interface Props {
  grouped: Array<[number, CatalogItem[]]>;
  folderTiles: PosTag[];
  loading: boolean;
  defaultUnit: string;
  countOf: (variantId: number) => number;
  onPick: (variants: CatalogItem[]) => void;
  onEnterTag: (tag: PosTag) => void;
}

export function StemGrid({
  grouped,
  folderTiles,
  loading,
  defaultUnit,
  countOf,
  onPick,
  onEnterTag,
}: Props) {
  const gridRef = useDragScroll<HTMLDivElement>();

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-auto p-3 bg-white select-none"
      data-testid="bench-grid"
    >
      {loading && <p className="text-sm text-sq-muted">Завантаження…</p>}

      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
        {folderTiles.map((folder) => (
          <TagFolderTile
            key={folder.id}
            name={folder.name}
            color={folder.color}
            onClick={() => onEnterTag(folder)}
          />
        ))}

        {grouped.map(([productId, variants]) => {
          const first = variants[0];
          const minPrice = Math.min(...variants.map((v) => v.price_cents));
          const stock = variants.reduce((s, v) => s + v.quantity, 0);
          const inBouquet = variants.reduce((s, v) => s + countOf(v.variant_id), 0);
          const unit = first.unit || defaultUnit;
          return (
            <ProductTile
              key={productId}
              name={first.product_name}
              subtitle={[first.label, `${stock} ${unit}`].filter(Boolean).join(' · ')}
              priceCents={minPrice}
              imageUrl={first.image_url}
              stock={stock}
              count={inBouquet}
              disabled={stock <= 0}
              onClick={() => onPick(variants)}
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
  );
}
