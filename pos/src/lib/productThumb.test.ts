// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Which picture the till's tile draws and the till keeps: the server's 264 px
// thumbnail beside every uploaded raster photo, the photo only without one.

import { describe, expect, it } from 'vitest';
import { thumbOf, tilePictureOf, tileSources } from './productThumb';

describe('productThumb', () => {
  it('names the thumbnail of an uploaded raster photo, and of nothing else', () => {
    expect(thumbOf('/pos-uploads/0f3a.jpg')).toBe('/pos-uploads/0f3a.t.webp');
    expect(thumbOf('/pos-uploads/0f3a.JPEG')).toBe('/pos-uploads/0f3a.t.webp');
    expect(thumbOf('/pos-uploads/0f3a.png')).toBe('/pos-uploads/0f3a.t.webp');
    expect(thumbOf('/pos-uploads/0f3a.t.webp')).toBeNull();
    expect(thumbOf('/pos-uploads/og/1-abc.png')).toBeNull();
    expect(thumbOf('/demo-clothing/body.svg')).toBeNull();
    expect(thumbOf('https://cdn.example.com/a.jpg')).toBeNull();
    expect(thumbOf(null)).toBeNull();
  });

  it('tries the thumbnail first, then the photo, each once', () => {
    expect(tileSources('/pos-uploads/a.jpg', '/pos-uploads/a.t.webp')).toEqual(['/pos-uploads/a.t.webp', '/pos-uploads/a.jpg']);
    expect(tileSources('/pos-uploads/a.jpg', undefined)).toEqual(['/pos-uploads/a.t.webp', '/pos-uploads/a.jpg']);
    // The server says there is none (null): the derived name is still worth a try.
    expect(tileSources('/demo/a.svg', null)).toEqual(['/demo/a.svg']);
    expect(tileSources(null, null)).toEqual([]);
  });

  it('keeps the thumbnail on the till where there is one', () => {
    expect(tilePictureOf({ image_url: '/pos-uploads/a.jpg', thumb_url: '/pos-uploads/a.t.webp' })).toBe('/pos-uploads/a.t.webp');
    expect(tilePictureOf({ image_url: '/demo/a.svg' })).toBe('/demo/a.svg');
    expect(tilePictureOf({ image_url: null })).toBeNull();
  });
});
