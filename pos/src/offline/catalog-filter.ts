// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CatalogItem, PosTag } from '../types';

export function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

/** Tag id + every descendant — matches backend `resolveTagFilterIds`. */
export function tagFilterIds(tags: PosTag[], tagId: number): number[] {
  const flat = flattenTags(tags);
  const byParent = new Map<number, number[]>();
  for (const t of flat) {
    if (t.parent_id == null) continue;
    const siblings = byParent.get(t.parent_id) ?? [];
    siblings.push(t.id);
    byParent.set(t.parent_id, siblings);
  }
  const ids: number[] = [];
  const stack = [tagId];
  while (stack.length) {
    const id = stack.pop() as number;
    ids.push(id);
    for (const childId of byParent.get(id) ?? []) stack.push(childId);
  }
  return ids;
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
