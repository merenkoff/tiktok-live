// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CatalogItem, PosTag, TagStation } from '@pos/platform';

/**
 * Where a drink or dish is made, read off the tags the till already has —
 * only for the words on the modifier sheet («Коментар для бару»). The ticket
 * itself is routed by the desktop's own mirror (К3), never by this.
 *
 * A product wearing a kitchen tag and a bar tag reads as kitchen, the way the
 * ticket falls back; no station at all reads as null.
 */
export function stationOf(item: CatalogItem | undefined, tags: readonly PosTag[]): TagStation | null {
  const ids = new Set(item?.tag_ids ?? []);
  if (ids.size === 0) return null;
  let found: TagStation | null = null;
  const walk = (level: readonly PosTag[]) => {
    for (const tag of level) {
      if (ids.has(tag.id) && tag.station) {
        if (tag.station === 'kitchen') found = 'kitchen';
        else if (found == null) found = tag.station;
      }
      if (tag.children?.length) walk(tag.children);
    }
  };
  walk(tags);
  return found;
}
