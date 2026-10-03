// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { PosTag } from '@pos/platform';

export function flattenTags(tags: PosTag[]): PosTag[] {
  const out: PosTag[] = [];
  for (const t of tags) {
    out.push(t);
    if (t.children?.length) out.push(...flattenTags(t.children));
  }
  return out;
}

/** "Вік / 0–1 / 3–6 міс" — full path for a nested tag. */
export function tagPathLabel(flatTags: PosTag[], tag: PosTag): string {
  const parts = [tag.name];
  let current = tag;
  while (current.parent_id != null) {
    const parent = flatTags.find((t) => t.id === current.parent_id);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(' / ');
}
