// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The product list's view, kept in the address (C1e, PR3): the search words
// and the tag. The card is a page of its own now, so «← Товари» and the
// browser's Back must land on the same list the owner left — which they do
// when the list reads its view from the URL rather than from component state.
// Defaults are left out, so the plain `/admin/products` stays plain.

/**
 * What the left panel narrows the list to: everything, a tag, or one of the
 * named views — cards from a receipt to check, cards with no photo, and the
 * archive (the one view that shows archived cards rather than hiding them).
 */
export type TagFilter = 'all' | 'needs_review' | 'no_photo' | 'archived' | number;

export interface ListParams {
  q: string;
  tag: TagFilter;
}

const Q = 'q';
const TAG = 'tag';
const NEEDS_REVIEW = 'review';
const NO_PHOTO = 'no-photo';
const ARCHIVED = 'archived';

export function readListParams(sp: URLSearchParams): ListParams {
  const q = sp.get(Q) ?? '';
  const raw = sp.get(TAG);
  let tag: TagFilter = 'all';
  if (raw === NEEDS_REVIEW) tag = 'needs_review';
  else if (raw === NO_PHOTO) tag = 'no_photo';
  else if (raw === ARCHIVED) tag = 'archived';
  else if (raw && /^\d+$/.test(raw)) tag = Number(raw);
  return { q, tag };
}

/** The same params with the view written in — other keys (`edit`…) left as they are. */
export function writeListParams(prev: URLSearchParams, next: Partial<ListParams>): URLSearchParams {
  const out = new URLSearchParams(prev);
  if (next.q !== undefined) {
    if (next.q === '') out.delete(Q);
    else out.set(Q, next.q);
  }
  if (next.tag !== undefined) {
    if (next.tag === 'all') out.delete(TAG);
    else out.set(TAG, tagParam(next.tag));
  }
  return out;
}

function tagParam(tag: Exclude<TagFilter, 'all'>): string {
  if (tag === 'needs_review') return NEEDS_REVIEW;
  if (tag === 'no_photo') return NO_PHOTO;
  if (tag === 'archived') return ARCHIVED;
  return String(tag);
}
