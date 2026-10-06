// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import { readListParams, writeListParams } from './listParams';

describe('the list view in the address', () => {
  it('reads a plain address as «everything, no words»', () => {
    expect(readListParams(new URLSearchParams(''))).toEqual({ q: '', tag: 'all' });
  });

  it('reads the words, a tag id and the review filter', () => {
    expect(readListParams(new URLSearchParams('q=зайчик+86&tag=12'))).toEqual({ q: 'зайчик 86', tag: 12 });
    expect(readListParams(new URLSearchParams('tag=review'))).toEqual({ q: '', tag: 'needs_review' });
  });

  it('reads and writes the two named views — no photo and the archive — by name', () => {
    expect(readListParams(new URLSearchParams('tag=no-photo'))).toEqual({ q: '', tag: 'no_photo' });
    expect(readListParams(new URLSearchParams('tag=archived&q=зайчик'))).toEqual({ q: 'зайчик', tag: 'archived' });
    expect(writeListParams(new URLSearchParams(''), { tag: 'no_photo' }).toString()).toBe('tag=no-photo');
    expect(writeListParams(new URLSearchParams('q=x'), { tag: 'archived' }).toString()).toBe('q=x&tag=archived');
    expect(readListParams(writeListParams(new URLSearchParams(''), { tag: 'archived' })).tag).toBe('archived');
  });

  it('shrugs at a junk tag', () => {
    expect(readListParams(new URLSearchParams('tag=abc')).tag).toBe('all');
    expect(readListParams(new URLSearchParams('tag=-1')).tag).toBe('all');
  });

  it('writes only what is not the default, and leaves other keys alone', () => {
    const base = new URLSearchParams('edit=42');
    expect(writeListParams(base, { q: 'зайчик', tag: 12 }).toString()).toBe('edit=42&q=%D0%B7%D0%B0%D0%B9%D1%87%D0%B8%D0%BA&tag=12');
    expect(writeListParams(new URLSearchParams('q=x&tag=12'), { q: '', tag: 'all' }).toString()).toBe('');
    expect(writeListParams(new URLSearchParams(''), { tag: 'needs_review' }).toString()).toBe('tag=review');
    // A partial write keeps the half it was not given.
    expect(writeListParams(new URLSearchParams('q=x&tag=12'), { q: 'y' }).toString()).toBe('q=y&tag=12');
  });

  it('round-trips', () => {
    const written = writeListParams(new URLSearchParams(''), { q: '98/104', tag: 'needs_review' });
    expect(readListParams(written)).toEqual({ q: '98/104', tag: 'needs_review' });
  });
});
