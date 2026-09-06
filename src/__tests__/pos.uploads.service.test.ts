// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.uploads.service.test.ts
//
// The only POS service with no database behind it — it writes product photos
// onto the Railway volume. Worth pinning: the MIME allowlist, the extension it
// picks (the stored name must not inherit whatever the client sent), the 5 MB
// cap, and that every accepted upload lands under POS_UPLOADS_DIR with a
// non-guessable name.

import { afterAll, describe, expect, it } from 'vitest';
import { readdir, readFile, rm, stat } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import type { MultipartFile } from '@fastify/multipart';
import {
  POS_UPLOADS_DIR,
  POS_UPLOADS_PREFIX,
  ensureUploadsDir,
  saveProductImage,
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
    written.map((f) => rm(path.join(POS_UPLOADS_DIR, f), { force: true }))
  );
});

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
