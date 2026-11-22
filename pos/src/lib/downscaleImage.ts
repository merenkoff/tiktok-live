// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A photo made small enough before it leaves the device (TechDocs/POS_CLOTHING.md
// «Головна каси й швидкість фото»). A phone or tablet camera frame is 3–8 MB,
// the server's limit is 5 MB and it stores what it is sent, so a product
// photographed with a phone was refused — or kept at full size, and every
// till that drew it paid for it. The florist's bench did this first
// (`vertical-flowers/bench/BouquetPhoto.tsx`); the product card shares it now.

export interface DownscaleOptions {
  /** Long edge of the stored picture, in pixels. */
  maxEdge: number;
  /** JPEG quality, 0–1. */
  quality: number;
  /** The file name the upload carries. */
  name?: string;
}

/**
 * The file as a JPEG no longer than `maxEdge` on its long side. Left as it is:
 * a GIF (it may move), a picture already small enough in a format the server
 * keeps, and anything the browser cannot decode (it goes to the server, which
 * answers in words). A transparent PNG lands on white — product shots are.
 */
export async function downscaleImage(file: File, opts: DownscaleOptions): Promise<File> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, opts.maxEdge / Math.max(bitmap.width, bitmap.height));
    // Already small enough: re-encoding would only lose detail for nothing.
    if (scale === 1 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality));
    if (!blob) return file;
    const name = opts.name ?? file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
