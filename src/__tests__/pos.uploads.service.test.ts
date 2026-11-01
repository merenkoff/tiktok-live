// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.uploads.service.test.ts
//
// The only POS service with no database behind it — it writes product photos
// onto the Railway volume. Worth pinning: the MIME allowlist, the extension it
// picks (the stored name must not inherit whatever the client sent), the 5 MB
// cap, and that every accepted upload lands under POS_UPLOADS_DIR with a
// non-guessable name. Since F10 (TechDocs/POS_QR_MENU_FEEDBACK.md §11.2) also
// the thumbnail made beside every raster photo, and the boot-time backfill.

import { afterAll, describe, expect, it } from 'vitest';
import { readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import sharp from 'sharp';
import type { MultipartFile } from '@fastify/multipart';
import {
  POS_UPLOADS_DIR,
  POS_UPLOADS_PREFIX,
  THUMB_SIZE,
  THUMB_SUFFIX,
  backfillThumbs,
  ensureUploadsDir,
  resetKnownThumbs,
  saveImageBuffer,
  saveProductImage,
  thumbNameOf,
  thumbUrlOf,
} from '../pos/uploads.service.js';

const written: string[] = [];

/** Minimal stand-in for the @fastify/multipart file part. */
function fakeFile(
  opts: { mimetype: string; filename?: string; body?: Buffer; truncated?: boolean }
): MultipartFile {
  const stream = Readable.from([opts.body ?? Buffer.from('binary-image-bytes')]);
  (stream as Readable & { truncated?: boolean }).truncated = opts.truncated ?? false;
  return {
    mimetype: opts.mimetype,
    filename: opts.filename ?? 'upload.bin',
    file: stream,
  } as unknown as MultipartFile;
}

async function save(opts: Parameters<typeof fakeFile>[0]) {
  const saved = await saveProductImage(fakeFile(opts));
  written.push(saved.filename);
  return saved;
}

afterAll(async () => {
  await Promise.all(
    written.flatMap((f) => [f, thumbNameOf(f)]).map((f) => rm(path.join(POS_UPLOADS_DIR, f), { force: true }))
  );
});

/** A real picture, so `sharp` has something to shrink: a flat 600×400. */
const realPng = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer();

describe('POS uploads service', () => {
  it('creates the uploads directory idempotently', async () => {
    await ensureUploadsDir();
    await ensureUploadsDir();
    expect((await stat(POS_UPLOADS_DIR)).isDirectory()).toBe(true);
  });

  it('writes the bytes it was given and returns a URL under the public prefix', async () => {
    const body = Buffer.from('the actual jpeg bytes');
    const saved = await save({ mimetype: 'image/jpeg', body });

    expect(saved.url).toBe(`${POS_UPLOADS_PREFIX}/${saved.filename}`);
    const onDisk = await readFile(path.join(POS_UPLOADS_DIR, saved.filename));
    expect(onDisk.equals(body)).toBe(true);
  });

  it.each([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
  ])('stores %s as %s regardless of the uploaded name', async (mimetype, ext) => {
    const saved = await save({ mimetype, filename: 'evil.php' });
    expect(path.extname(saved.filename)).toBe(ext);
  });

  it('never reuses the client filename — the stored name is a fresh UUID', async () => {
    const a = await save({ mimetype: 'image/png', filename: 'photo.png' });
    const b = await save({ mimetype: 'image/png', filename: 'photo.png' });

    expect(a.filename).not.toBe(b.filename);
    expect(a.filename).not.toContain('photo');
    expect(a.filename).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/
    );
  });

  it.each(['application/pdf', 'image/svg+xml', 'text/html', 'application/octet-stream'])(
    'rejects %s',
    async (mimetype) => {
      await expect(saveProductImage(fakeFile({ mimetype }))).rejects.toThrow(
        'Дозволені формати: JPEG, PNG, WebP, GIF'
      );
    }
  );

  it('aborts an upload larger than 5 MB', async () => {
    const tooBig = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);
    await expect(
      saveProductImage(fakeFile({ mimetype: 'image/jpeg', body: tooBig }))
    ).rejects.toThrow('Файл більше 5 МБ');
  });

  it('accepts a file exactly at the 5 MB limit', async () => {
    const saved = await save({
      mimetype: 'image/jpeg',
      body: Buffer.alloc(5 * 1024 * 1024, 0x41),
    });
    expect((await stat(path.join(POS_UPLOADS_DIR, saved.filename))).size).toBe(
      5 * 1024 * 1024
    );
  });

  it('rejects a stream the multipart layer marked truncated', async () => {
    await expect(
      saveProductImage(fakeFile({ mimetype: 'image/jpeg', truncated: true }))
    ).rejects.toThrow('Файл більше 5 МБ');
  });

  it('leaves no partial file behind when an upload is rejected', async () => {
    const before = await readdir(POS_UPLOADS_DIR);
    await expect(
      saveProductImage(
        fakeFile({ mimetype: 'image/jpeg', body: Buffer.alloc(5 * 1024 * 1024 + 1, 0x41) })
      )
    ).rejects.toThrow();
    await expect(
      saveProductImage(fakeFile({ mimetype: 'image/jpeg', truncated: true }))
    ).rejects.toThrow();

    expect((await readdir(POS_UPLOADS_DIR)).sort()).toEqual(before.sort());
  });
});

describe('the cards’ thumbnails (F10)', () => {
  it('names a thumbnail after its photo, and answers a URL only for an upload whose thumbnail it has seen', () => {
    expect(thumbNameOf('ab12.jpg')).toBe(`ab12${THUMB_SUFFIX}`);
    expect(thumbNameOf('ab12.PNG')).toBe(`ab12${THUMB_SUFFIX}`);
    expect(thumbNameOf(`ab12${THUMB_SUFFIX}`)).toBe(`ab12${THUMB_SUFFIX}`);
    expect(thumbUrlOf(null)).toBeNull();
    expect(thumbUrlOf('/demo-cafe/latte.svg')).toBeNull();
    expect(thumbUrlOf('https://cdn.example.com/photo.jpg')).toBeNull();
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/never-seen.jpg`)).toBeNull();
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/../etc/passwd`)).toBeNull();
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/x${THUMB_SUFFIX}`)).toBeNull();
  });

  it('makes a 264×264 WebP beside a photo the server fetched itself, and says so through thumbUrlOf', async () => {
    const saved = await saveImageBuffer(await realPng());
    written.push(saved.filename);
    const thumb = thumbNameOf(saved.filename);
    const meta = await sharp(path.join(POS_UPLOADS_DIR, thumb)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', THUMB_SIZE, THUMB_SIZE]);
    expect(thumbUrlOf(saved.url)).toBe(`${POS_UPLOADS_PREFIX}/${thumb}`);
  });

  it('makes one for a browser upload too — a GIF from its first frame — and never fails the upload over it', async () => {
    const gif = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 120, b: 10 } } }).gif().toBuffer();
    const animated = await save({ mimetype: 'image/gif', body: gif });
    const meta = await sharp(path.join(POS_UPLOADS_DIR, thumbNameOf(animated.filename))).metadata();
    expect([meta.format, meta.width, meta.height, meta.pages ?? 1]).toEqual(['webp', THUMB_SIZE, THUMB_SIZE, 1]);
    expect(thumbUrlOf(animated.url)).toMatch(new RegExp(`${THUMB_SUFFIX.replace('.', '\\.')}$`));

    // Bytes that are not a picture at all: the upload lands as before, the card loads the file itself.
    const garbage = await save({ mimetype: 'image/jpeg', body: Buffer.from('not a jpeg at all') });
    expect((await readFile(path.join(POS_UPLOADS_DIR, garbage.filename))).toString()).toBe('not a jpeg at all');
    await expect(stat(path.join(POS_UPLOADS_DIR, thumbNameOf(garbage.filename)))).rejects.toThrow();
    expect(thumbUrlOf(garbage.url)).toBeNull();
  });

  it('backfills the photos that predate it at boot, remembers the ones there, and makes nothing on a second pass', async () => {
    await ensureUploadsDir();
    const name = `backfill-${Date.now()}.png`;
    written.push(name);
    await writeFile(path.join(POS_UPLOADS_DIR, name), await realPng());
    resetKnownThumbs();
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/${name}`)).toBeNull();

    const first = await backfillThumbs();
    expect(first.made).toBeGreaterThanOrEqual(1);
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/${name}`)).toBe(`${POS_UPLOADS_PREFIX}/${thumbNameOf(name)}`);

    resetKnownThumbs();
    const again = await backfillThumbs();
    expect(again.made).toBe(0);
    expect(again.had).toBeGreaterThanOrEqual(first.had + first.made);
    // Re-read from disk, so a thumbnail made by an earlier boot is known without being remade.
    expect(thumbUrlOf(`${POS_UPLOADS_PREFIX}/${name}`)).toBe(`${POS_UPLOADS_PREFIX}/${thumbNameOf(name)}`);
  });
});
