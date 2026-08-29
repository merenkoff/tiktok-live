// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/uploads.service.ts

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
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
      source.destroy(new Error('Файл більше 5 МБ'));
    }
  });

  await pipeline(source, createWriteStream(dest));

  if (file.file.truncated) {
    throw file.file.truncated;
  }

  return {
    filename,
    url: `${POS_UPLOADS_PREFIX}/${filename}`,
  };
}
