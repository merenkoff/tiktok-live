import type { CatalogItem, PosTag } from '../types';

export function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

/** Tag id + direct children — matches backend `resolveTagFilterIds`. */
export function tagFilterIds(tags: PosTag[], tagId: number): number[] {
  const flat = flattenTags(tags);
  const children = flat.filter((t) => t.parent_id === tagId).map((t) => t.id);
  return [tagId, ...children];
}

export function filterCatalog(
  items: CatalogItem[],
  tags: PosTag[],
  opts?: { q?: string; barcode?: string; tag_id?: number }
): CatalogItem[] {
  const barcode = opts?.barcode?.trim();
  if (barcode) {
    return items.filter((item) => (item.barcode ?? '') === barcode);
  }

  let next = items;
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    next = next.filter((item) => {
      const hay = [
        item.product_name,
        item.sku ?? '',
        item.barcode ?? '',
        item.size,
        item.color,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  if (opts?.tag_id) {
    const ids = new Set(tagFilterIds(tags, opts.tag_id));
    next = next.filter((item) => (item.tag_ids ?? []).some((id) => ids.has(id)));
  }

  return next;
}
