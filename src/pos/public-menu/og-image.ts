// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/og-image.ts — the picture a messenger draws when the
// menu's link is pasted into a chat (TechDocs/POS_QR_MENU_FEEDBACK.md §12,
// phase F15): the brand frame `public/menu-assets/og-frame.png` (made once,
// locally, with the text baked in — the production image has no fonts) with
// the place's logo composed into its right half by `sharp` at request time,
// in a white card with soft corners and a shadow (decision Д36). No text is
// drawn here (Д37): the name and the address go in `og:title` and
// `og:description`, which Telegram prints under the picture.
//
// Made once per logo: the file lives under the uploads as
// `og/<store>-<version>.png` — its own folder, so the thumbnail backfill
// (F10), which walks the uploads flat, never shrinks it — where the version hashes the frame and the
// logo's address, and the page's `og:image` carries `?v=<version>` — a new
// logo is a new address, so Telegram fetches a new picture (Д40). A place
// with no logo gets the frame alone (Д39). A logo that cannot be read is
// logged and left out; the picture is never a reason for the page to fail.

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { logger } from '../../logger.js';
import { POS_UPLOADS_DIR, POS_UPLOADS_PREFIX, ensureUploadsDir } from '../uploads.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `public/` at the repo root — the same directory `api.ts` mounts at `/`. */
const PUBLIC_DIR = path.join(HERE, '..', '..', '..', 'public');
export const OG_FRAME_FILE = path.join(PUBLIC_DIR, 'menu-assets', 'og-frame.png');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
/** The frame's blue panel ends here; the logo card is centred in what is left. */
const PANEL_WIDTH = 460;
const CARD = 400;
const CARD_RADIUS = 32;
/** The logo's longest side inside the card. */
const LOGO_MAX = 320;
const CARD_LEFT = PANEL_WIDTH + Math.round((OG_WIDTH - PANEL_WIDTH - CARD) / 2);
const CARD_TOP = Math.round((OG_HEIGHT - CARD) / 2);
/** Where the made pictures live: a folder of the uploads volume, out of the thumbnail backfill's way. */
export const OG_DIR = path.join(POS_UPLOADS_DIR, 'og');

let frameVersion: string | null | undefined;

/** A short hash of the frame file, or null when this checkout has none (then there is no picture to offer). */
export async function ogFrameVersion(): Promise<string | null> {
  if (frameVersion !== undefined) return frameVersion;
  try {
    const bytes = await fs.readFile(OG_FRAME_FILE);
    frameVersion = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  } catch {
    frameVersion = null;
  }
  return frameVersion;
}

/** Test seam: forget the frame's hash (after replacing the file). */
export function resetOgFrameVersion(): void {
  frameVersion = undefined;
}

/** The version a store's picture carries: the frame and the logo's address, nothing else. */
export function ogImageVersion(frame: string, logoUrl: string | null): string {
  return crypto.createHash('sha1').update(`${frame}|${logoUrl ?? ''}`).digest('hex').slice(0, 12);
}

/**
 * Where a logo's bytes are, or null: a file of the uploads directory
 * (`/pos-uploads/<name>`, no path inside) or a file under `public/` (a demo's
 * `/demo-cafe/logo.svg`), never anything outside those two and never a
 * picture on another host — the server fetches nothing for this.
 */
export function logoFileOf(logoUrl: string | null): string | null {
  if (!logoUrl || !logoUrl.startsWith('/') || logoUrl.startsWith('//')) return null;
  if (logoUrl.startsWith(`${POS_UPLOADS_PREFIX}/`)) {
    const name = logoUrl.slice(POS_UPLOADS_PREFIX.length + 1);
    return name && !name.includes('/') && !name.includes('..') ? path.join(POS_UPLOADS_DIR, name) : null;
  }
  const resolved = path.resolve(PUBLIC_DIR, `.${logoUrl}`);
  return resolved.startsWith(`${PUBLIC_DIR}${path.sep}`) ? resolved : null;
}

/** The white card the logo sits in: soft corners and a shadow, drawn as SVG shapes — no text, so alpine draws it too. */
function cardSvg(): Buffer {
  const pad = 40;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD + pad * 2}" height="${CARD + pad * 2}">` +
      `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="14"/>` +
      `<feOffset dy="10"/><feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>` +
      `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` +
      `<rect x="${pad}" y="${pad}" width="${CARD}" height="${CARD}" rx="${CARD_RADIUS}" fill="#FFFFFF" filter="url(#s)"/></svg>`
  );
}

/**
 * The store's picture: made and written the first time, read from disk after
 * that. Null only when this checkout has no frame.
 */
export async function menuOgImage(store: { id: number; logoUrl: string | null }): Promise<{ file: string; version: string } | null> {
  const frame = await ogFrameVersion();
  if (!frame) return null;
  const version = ogImageVersion(frame, store.logoUrl);
  await ensureUploadsDir();
  await fs.mkdir(OG_DIR, { recursive: true });
  const file = path.join(OG_DIR, `${store.id}-${version}.png`);
  try {
    await fs.access(file);
    return { file, version };
  } catch {
    // not made yet
  }

  const layers: sharp.OverlayOptions[] = [];
  const logoFile = logoFileOf(store.logoUrl);
  if (logoFile) {
    try {
      const pad = 40;
      const logo = await sharp(logoFile, { animated: false })
        .rotate()
        .resize(LOGO_MAX, LOGO_MAX, { fit: 'inside' })
        .png()
        .toBuffer({ resolveWithObject: true });
      layers.push({ input: cardSvg(), left: CARD_LEFT - pad, top: CARD_TOP - pad });
      layers.push({
        input: logo.data,
        left: CARD_LEFT + Math.round((CARD - logo.info.width) / 2),
        top: CARD_TOP + Math.round((CARD - logo.info.height) / 2),
      });
    } catch (error) {
      logger.warn('Menu OG picture: logo left out', {
        storeId: store.id,
        logo: store.logoUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const tmp = `${file}.${process.pid}.tmp`;
  await sharp(OG_FRAME_FILE).composite(layers).png().toFile(tmp);
  await fs.rename(tmp, file);
  return { file, version };
}
