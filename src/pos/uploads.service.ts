// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/uploads.service.ts
//
// Product photos on the Railway volume, and — since phase F10 of
// TechDocs/POS_QR_MENU_FEEDBACK.md (§11.2) — a THUMBNAIL beside each raster
// one: `<uuid>.t.webp`, 264×264 (three times the 88 px the guest's card shows),
// made by `sharp` at upload time and once at boot for the files that predate
// it. The card loads the thumbnail, the dish's sheet still loads the full
// photo. Nothing is recorded in the database: the server keeps the set of
// thumbnails it has seen on disk, and `thumbUrlOf` answers from that set.

import { createWriteStream } from 'fs';
import { mkdir, readdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import type { MultipartFile } from '@fastify/multipart';
import sharp from 'sharp';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const POS_UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'pos-uploads');
export const POS_UPLOADS_PREFIX = '/pos-uploads';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;
const TOO_LARGE = 'Файл більше 5 МБ';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(POS_UPLOADS_DIR, { recursive: true });
}

// ── thumbnails (F10) ─────────────────────────────────────────────────

/** The card shows 88 CSS px; three times that keeps a 3× phone screen sharp. */
export const THUMB_SIZE = 264;
export const THUMB_SUFFIX = '.t.webp';
const THUMB_QUALITY = 80;
const RASTER_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** The thumbnails known to exist on disk, by file name — filled at boot and by every one made since. */
const knownThumbs = new Set<string>();

/** `<uuid>.jpg` → `<uuid>.t.webp`; a thumbnail's own name maps to itself. */
export function thumbNameOf(filename: string): string {
  if (filename.endsWith(THUMB_SUFFIX)) return filename;
  const ext = path.extname(filename);
  return `${ext ? filename.slice(0, -ext.length) : filename}${THUMB_SUFFIX}`;
}

/**
 * The thumbnail's URL for a product's `image_url`, or null: only for a file
 * of the uploads directory whose thumbnail the server has seen. A demo SVG
 * under `/demo-*`, an https picture or a file still without one gets null,
 * and the card then loads the picture itself, as before.
 */
export function thumbUrlOf(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || !imageUrl.startsWith(`${POS_UPLOADS_PREFIX}/`)) return null;
  const file = imageUrl.slice(POS_UPLOADS_PREFIX.length + 1);
  if (!file || file.includes('/') || file.endsWith(THUMB_SUFFIX)) return null;
  const thumb = thumbNameOf(file);
  return knownThumbs.has(thumb) ? `${POS_UPLOADS_PREFIX}/${thumb}` : null;
}

/** Whether a file of the uploads directory is a photo a thumbnail is made for (not a thumbnail, not an SVG). */
function isRasterPhoto(filename: string): boolean {
  return !filename.endsWith(THUMB_SUFFIX) && RASTER_EXT.has(path.extname(filename).toLowerCase());
}

/**
 * Make the thumbnail of one uploaded photo: a 264×264 cover crop as WebP,
 * the first frame of a GIF. Returns its file name, or null when it could not
 * be made — a failure here NEVER fails the upload that asked for it; the
 * card simply loads the full picture, and the next boot's backfill tries
 * again.
 */
export async function makeThumb(filename: string): Promise<string | null> {
  if (!isRasterPhoto(filename)) return null;
  const thumb = thumbNameOf(filename);
  try {
    await sharp(path.join(POS_UPLOADS_DIR, filename), { animated: false })
      .rotate()
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: THUMB_QUALITY })
      .toFile(path.join(POS_UPLOADS_DIR, thumb));
    knownThumbs.add(thumb);
    return thumb;
  } catch (error) {
    logger.warn('Thumbnail not made', { filename, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Once at boot: read the uploads directory, remember every thumbnail that is
 * there, and make the ones missing for photos uploaded before F10 (one file
 * at a time — `sharp` has its own thread pool and the volume is small). Safe
 * to run again: a second pass makes nothing.
 */
export async function backfillThumbs(): Promise<{ had: number; made: number; failed: number }> {
  await ensureUploadsDir();
  const files = await readdir(POS_UPLOADS_DIR);
  const present = new Set(files);
  let had = 0;
  for (const f of files) if (f.endsWith(THUMB_SUFFIX)) { knownThumbs.add(f); had += 1; }
  let made = 0;
  let failed = 0;
  for (const f of files) {
    if (!isRasterPhoto(f) || present.has(thumbNameOf(f))) continue;
    if (await makeThumb(f)) made += 1;
    else failed += 1;
  }
  return { had, made, failed };
}

/** Test seam: forget the thumbnails seen so far (the directory itself is left alone). */
export function resetKnownThumbs(): void {
  knownThumbs.clear();
}

export async function saveProductImage(file: MultipartFile): Promise<{ url: string; filename: string }> {
  const mime = file.mimetype;
  if (!ALLOWED_MIME.has(mime)) {
    throw new Error('Дозволені формати: JPEG, PNG, WebP, GIF');
  }

  const ext =
    EXT_BY_MIME[mime] ?? (path.extname(file.filename || '').toLowerCase() || '.jpg');
  const filename = `${randomUUID()}${ext}`;
  const dest = path.join(POS_UPLOADS_DIR, filename);

  await ensureUploadsDir();

  let size = 0;
  const source = file.file;
  source.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      source.destroy(new Error(TOO_LARGE));
    }
  });

  try {
    await pipeline(source, createWriteStream(dest));

    // `truncated` is set by the multipart layer when it hit its own file-size
    // limit. It is a boolean flag, not an error — throwing it directly left the
    // route reporting "Unknown error" (errorMessage only unwraps Error).
    if (source.truncated) {
      throw new Error(TOO_LARGE);
    }
  } catch (error) {
    // Whatever went wrong, a partial file is already on the volume. Drop it —
    // nothing references it and nothing would ever clean it up.
    await unlink(dest).catch(() => undefined);
    throw error;
  }

  // The card's thumbnail (F10); its failure is logged, never thrown.
  await makeThumb(filename);

  return {
    filename,
    url: `${POS_UPLOADS_PREFIX}/${filename}`,
  };
}

/**
 * What an image buffer really is, read from its first bytes — never from a
 * header someone else sent. `null` for anything that is not one of the four
 * formats the uploads directory serves.
 */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

/**
 * An image the server fetched itself (a menu import, TechDocs/POS_ONBOARDING.md
 * O2) rather than one a browser uploaded: the same directory, size limit and
 * formats as `saveProductImage`, with the type taken from the bytes.
 */
export async function saveImageBuffer(buffer: Buffer): Promise<{ url: string; filename: string }> {
  if (buffer.length > MAX_BYTES) throw new Error(TOO_LARGE);
  const mime = sniffImageMime(buffer);
  if (!mime || !ALLOWED_MIME.has(mime)) throw new Error('Дозволені формати: JPEG, PNG, WebP, GIF');
  const filename = `${randomUUID()}${EXT_BY_MIME[mime]}`;
  await ensureUploadsDir();
  await writeFile(path.join(POS_UPLOADS_DIR, filename), buffer);
  await makeThumb(filename);
  return { filename, url: `${POS_UPLOADS_PREFIX}/${filename}` };
}
