// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LABEL,
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  TAG_MEDIA_KEY,
  TAG_PAPER_KEY,
  loadTagMedia,
  loadTagMediaSettings,
  mediaOf,
  normalizeLabel,
  parseTagMediaSettings,
  saveTagMediaSettings,
} from './priceTagMedia';

afterEach(() => localStorage.clear());

describe('a label as typed', () => {
  it('rounds to half a millimetre and keeps inside what a printer takes', () => {
    expect(normalizeLabel({ widthMm: 58.26, heightMm: 39.8, rotate: 90 })).toEqual({
      widthMm: 58.5,
      heightMm: 40,
      rotate: 90,
    });
    expect(normalizeLabel({ widthMm: 5, heightMm: 900, rotate: 0 })).toEqual({
      widthMm: LABEL_WIDTH_MM.min,
      heightMm: LABEL_HEIGHT_MM.max,
      rotate: 0,
    });
  });

  it('falls back to the default for anything it cannot read, and to upright for a stray angle', () => {
    expect(normalizeLabel({ widthMm: 'abc', heightMm: null, rotate: 45 })).toEqual(DEFAULT_LABEL);
    expect(normalizeLabel(undefined)).toEqual(DEFAULT_LABEL);
  });
});

describe('the stored settings', () => {
  it('reads a station that only ever chose a roll width', () => {
    // What every station has today: the dialog wrote the width alone.
    expect(parseTagMediaSettings(null, '80')).toEqual({
      kind: 'roll',
      paper: 80,
      label: DEFAULT_LABEL,
    });
  });

  it('reads labels back', () => {
    const stored = JSON.stringify({
      kind: 'label',
      paper: 58,
      label: { widthMm: 40, heightMm: 30, rotate: 270 },
    });
    expect(mediaOf(parseTagMediaSettings(stored, null))).toEqual({
      kind: 'label',
      widthMm: 40,
      heightMm: 30,
      rotate: 270,
    });
  });

  it('survives garbage', () => {
    expect(parseTagMediaSettings('{nope', '80').kind).toBe('roll');
    expect(parseTagMediaSettings('{nope', '80').paper).toBe(80);
  });

  it('round-trips through the station, and keeps the old roll key answering', () => {
    saveTagMediaSettings({ kind: 'label', paper: 80, label: { widthMm: 43, heightMm: 25, rotate: 90 } });
    expect(localStorage.getItem(TAG_PAPER_KEY)).toBe('80');
    expect(JSON.parse(localStorage.getItem(TAG_MEDIA_KEY)!).kind).toBe('label');
    expect(loadTagMediaSettings().label).toEqual({ widthMm: 43, heightMm: 25, rotate: 90 });
    expect(loadTagMedia()).toEqual({ kind: 'label', widthMm: 43, heightMm: 25, rotate: 90 });
  });

  it('remembers the label while the roll is in use', () => {
    saveTagMediaSettings({ kind: 'roll', paper: 58, label: { widthMm: 70, heightMm: 40, rotate: 0 } });
    expect(loadTagMedia()).toEqual({ kind: 'roll', paper: 58 });
    expect(loadTagMediaSettings().label.widthMm).toBe(70);
  });
});
