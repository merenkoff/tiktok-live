// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.og-image.test.ts — the picture a messenger
// draws for a menu's link (TechDocs/POS_QR_MENU_FEEDBACK.md §12, phase F15):
// the brand frame with the place's logo, made once per logo. No database.

import { afterAll, describe, expect, it } from 'vitest';
import { readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import {
  OG_FRAME_FILE,
  OG_HEIGHT,
  OG_WIDTH,
  logoFileOf,
  menuOgImage,
  ogFrameVersion,
  ogImageVersion,
} from '../pos/public-menu/og-image.js';
import { POS_UPLOADS_DIR, POS_UPLOADS_PREFIX, ensureUploadsDir, saveImageBuffer, thumbNameOf } from '../pos/uploads.service.js';
import { menuOgImageUrl } from '../pos/public-menu/urls.js';

const made: string[] = [];
const STORE = 990_001; // no real store has this id

afterAll(async () => {
  await Promise.all(made.map((f) => rm(f, { force: true })));
});

describe('the menu’s Open Graph picture (F15)', () => {
  it('has a brand frame in this checkout, 1200×630, whose hash is the picture’s first half of a version', async () => {
    const meta = await sharp(OG_FRAME_FILE).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', OG_WIDTH, OG_HEIGHT]);
    const frame = await ogFrameVersion();
    expect(frame).toMatch(/^[0-9a-f]{8}$/);
    expect(ogImageVersion(frame!, '/demo-cafe/logo.svg')).toMatch(/^[0-9a-f]{12}$/);
    expect(ogImageVersion(frame!, '/demo-cafe/logo.svg')).not.toBe(ogImageVersion(frame!, '/demo-restaurant/logo.svg'));
    expect(ogImageVersion(frame!, null)).not.toBe(ogImageVersion('00000000', null));
    expect(menuOgImageUrl('shablya', 'abc123')).toBe('https://the-live.shop/m/shablya/og.png?v=abc123');
  });

  it('reads a logo only from the uploads directory or from public/, never elsewhere and never from another host', () => {
    expect(logoFileOf(`${POS_UPLOADS_PREFIX}/ab12.jpg`)).toBe(path.join(POS_UPLOADS_DIR, 'ab12.jpg'));
    expect(logoFileOf('/demo-cafe/logo.svg')).toMatch(/[\\/]public[\\/]demo-cafe[\\/]logo\.svg$/);
    expect(logoFileOf(`${POS_UPLOADS_PREFIX}/../.env`)).toBeNull();
    expect(logoFileOf(`${POS_UPLOADS_PREFIX}/a/b.jpg`)).toBeNull();
    expect(logoFileOf('/../.env')).toBeNull();
    expect(logoFileOf('//evil.example/x.png')).toBeNull();
    expect(logoFileOf('https://cdn.example.com/logo.png')).toBeNull();
    expect(logoFileOf(null)).toBeNull();
  });

  it('composes the frame with a demo’s SVG logo, writes it once and reads the file the second time', async () => {
    const first = await menuOgImage({ id: STORE, logoUrl: '/demo-cafe/logo.svg' });
    expect(first).not.toBeNull();
    made.push(first!.file);
    const meta = await sharp(first!.file).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', OG_WIDTH, OG_HEIGHT]);
    const before = await stat(first!.file);
    const again = await menuOgImage({ id: STORE, logoUrl: '/demo-cafe/logo.svg' });
    expect(again).toEqual(first);
    expect((await stat(first!.file)).mtimeMs).toBe(before.mtimeMs);
    // A pixel in the card's area is the card's white, not the frame's light grey.
    const { data } = await sharp(first!.file).extract({ left: 640, top: 125, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });

  it('composes a tiny raster logo from the uploads too, and draws the frame alone without a logo or with one it cannot read', async () => {
    await ensureUploadsDir();
    const logo = await sharp({ create: { width: 128, height: 128, channels: 3, background: { r: 120, g: 20, b: 20 } } }).jpeg().toBuffer();
    const saved = await saveImageBuffer(logo);
    made.push(path.join(POS_UPLOADS_DIR, saved.filename), path.join(POS_UPLOADS_DIR, thumbNameOf(saved.filename)));
    const withLogo = await menuOgImage({ id: STORE + 1, logoUrl: saved.url });
    made.push(withLogo!.file);
    const centre = await sharp(withLogo!.file).extract({ left: 830, top: 315, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(centre.data[0]).toBeGreaterThan(centre.data[2]); // the red logo sits in the middle of the card

    const bare = await menuOgImage({ id: STORE + 2, logoUrl: null });
    made.push(bare!.file);
    const frame = await readFile(OG_FRAME_FILE);
    const bareBytes = await readFile(bare!.file);
    const framePixels = await sharp(frame).raw().toBuffer();
    const barePixels = await sharp(bareBytes).raw().toBuffer();
    expect(barePixels.equals(framePixels)).toBe(true);

    const broken = path.join(POS_UPLOADS_DIR, `og-broken-${Date.now()}.png`);
    await writeFile(broken, Buffer.from('not a picture'));
    made.push(broken);
    const unreadable = await menuOgImage({ id: STORE + 3, logoUrl: `${POS_UPLOADS_PREFIX}/${path.basename(broken)}` });
    made.push(unreadable!.file);
    expect((await sharp(unreadable!.file).metadata()).width).toBe(OG_WIDTH);
  });
});
