// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// A photo made small before upload: left as it is where it cannot or need not
// be (a GIF, a browser that cannot decode it, one already small enough), and
// re-encoded as a JPEG no longer than the long edge otherwise.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { downscaleImage } from './downscaleImage';

const OPTS = { maxEdge: 1600, quality: 0.85 };
const file = (type: string, name = 'photo') => new File([new Uint8Array(10)], name, { type });

afterEach(() => vi.unstubAllGlobals());

describe('downscaleImage', () => {
  it('leaves a GIF, and anything where the browser cannot decode', async () => {
    const gif = file('image/gif');
    expect(await downscaleImage(gif, OPTS)).toBe(gif);
    vi.stubGlobal('createImageBitmap', undefined);
    const jpg = file('image/jpeg');
    expect(await downscaleImage(jpg, OPTS)).toBe(jpg);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('HEIC'))));
    const heic = file('image/heic');
    expect(await downscaleImage(heic, OPTS)).toBe(heic);
  });

  it('leaves a picture already small enough', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 800, height: 600, close })));
    const png = file('image/png');
    expect(await downscaleImage(png, OPTS)).toBe(png);
    expect(close).toHaveBeenCalled();
  });

  it('re-encodes a big one as a JPEG within the long edge', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    const drawn: number[][] = [];
    const ctx = { fillStyle: '', fillRect: vi.fn(), drawImage: (_b: unknown, ...args: number[]) => drawn.push(args) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob(['x'], { type })),
    };
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : create(tag)
    );
    const out = await downscaleImage(file('image/jpeg', 'IMG_0001.HEIC.jpg'), OPTS);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('IMG_0001.HEIC.jpg');
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawn[0]).toEqual([0, 0, 1600, 1200]);
    vi.restoreAllMocks();
  });
});
