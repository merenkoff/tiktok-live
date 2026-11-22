// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The small copy of a product photo the till's tile draws
// (TechDocs/POS_CLOTHING.md «Головна каси й швидкість фото»). The server makes
// a 264 px WebP beside every uploaded raster photo — `<uuid>.<ext>` →
// `<uuid>.t.webp` (`src/pos/uploads.service.ts`) — and the catalog names it
// as `thumb_url`; a module or a snapshot from before that is answered by
// deriving the same name here. Pure: the tile, the offline cache and the
// tests share it.

/** The thumbnail's address for a `/pos-uploads` raster photo, or null (an SVG, an https picture, none). */
export function thumbOf(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const m = /^\/pos-uploads\/([^/]+)\.(jpe?g|png|webp|gif)$/i.exec(imageUrl);
  return m && !m[1].endsWith('.t') ? `/pos-uploads/${m[1]}.t.webp` : null;
}

/**
 * What a tile tries, in order: the thumbnail, then the photo itself (a
 * thumbnail not made yet, a deleted one), then nothing — the caption.
 */
export function tileSources(imageUrl: string | null | undefined, thumbUrl?: string | null): string[] {
  const thumb = thumbUrl ?? thumbOf(imageUrl);
  return [thumb, imageUrl].filter((u, i, all): u is string => !!u && all.indexOf(u) === i);
}

/** The one picture of an item worth keeping on the till: its thumbnail where there is one. */
export function tilePictureOf(item: { image_url: string | null; thumb_url?: string | null }): string | null {
  return tileSources(item.image_url, item.thumb_url)[0] ?? null;
}
