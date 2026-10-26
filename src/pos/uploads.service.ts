// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/uploads.service.ts

import { createWriteStream } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import type { MultipartFile } from '@fastify/multipart';

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
  return { filename, url: `${POS_UPLOADS_PREFIX}/${filename}` };
}
