// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { describe, expect, it } from 'vitest';
import {
  LABEL_COMFORT_BAR_MM,
  LABEL_MAX_MODULE_MM,
  LABEL_MIN_BAR_MM,
  labelContentHeightMm,
  labelLayout,
  labelTransform,
  priceRowFonts,
  textWidthEm,
} from './priceLabelLayout';
import { EAN13_MIN_MODULE_MM } from './priceTagLayout';
import { LABEL_PRESETS, type TagRotation } from './priceTagMedia';

/** A thermal label head. */
const DOT_MM = 25.4 / 203;

function inner(layout: ReturnType<typeof labelLayout>) {
  return { w: layout.box.w - 2 * layout.pad.x, h: layout.box.h - 2 * layout.pad.y };
}

describe('every label size the dialog offers', () => {
  const presets = LABEL_PRESETS.map((p) => [`${p.widthMm}×${p.heightMm}`, p] as const);

  it.each(presets)('%s fits its content, upright', (_, p) => {
    const layout = labelLayout({ ...p, rotate: 0 });
    expect(layout.warnings).toEqual([]);
    expect(labelContentHeightMm(layout)).toBeLessThanOrEqual(inner(layout).h + 0.01);
  });

  it.each(presets)('%s draws a barcode within GS1 and at two dots a module or more', (_, p) => {
    const { barcode } = labelLayout({ ...p, rotate: 0 });
    expect(barcode.moduleMm).toBeGreaterThanOrEqual(EAN13_MIN_MODULE_MM);
    expect(barcode.moduleMm).toBeLessThanOrEqual(LABEL_MAX_MODULE_MM);
    expect(barcode.moduleMm / DOT_MM).toBeGreaterThanOrEqual(2);
    expect(barcode.barMm).toBeGreaterThanOrEqual(LABEL_MIN_BAR_MM);
  });

  it.each(presets)('%s keeps the symbol inside the label, light margins included', (_, p) => {
    const layout = labelLayout({ ...p, rotate: 0 });
    expect(layout.barcode.widthMm).toBeLessThanOrEqual(inner(layout).w + 0.001);
  });
});

describe('a label turned 90°', () => {
  it('lays out across the roll what is along it, and swaps the margins with it', () => {
    // The reason the setting exists: labels that run narrow side first
    // through the printer, read wide once stuck on.
    const upright = labelLayout({ widthMm: 40, heightMm: 58, rotate: 0 });
    const turned = labelLayout({ widthMm: 40, heightMm: 58, rotate: 90 });
    expect(upright.orientation).toBe('portrait');
    expect(turned.box).toEqual({ w: 58, h: 40 });
    expect(turned.orientation).toBe('landscape');
    expect(turned.pad).toEqual({ x: upright.pad.y, y: upright.pad.x });
    expect(turned.warnings).toEqual([]);
  });

  it('is the same layout at 90° and at 270° — only the direction differs', () => {
    const a = labelLayout({ widthMm: 40, heightMm: 58, rotate: 90 });
    const b = labelLayout({ widthMm: 40, heightMm: 58, rotate: 270 });
    expect({ ...a, rotate: 0 }).toEqual({ ...b, rotate: 0 });
  });

  it('warns when the turned label is too narrow for an EAN-13', () => {
    // 58×30 turned leaves about 26 mm across for a 117-module symbol.
    const layout = labelLayout({ widthMm: 58, heightMm: 30, rotate: 90 });
    expect(layout.warnings).toContain('barcode_small');
  });
});

describe('giving things up when the label is short', () => {
  it('keeps everything on a 58×40, with comfortable bars', () => {
    const layout = labelLayout({ widthMm: 58, heightMm: 40, rotate: 0 });
    expect(layout.showStore).toBe(true);
    expect(layout.nameLines).toBe(2);
    expect(layout.barcode.barMm).toBeGreaterThanOrEqual(LABEL_COMFORT_BAR_MM);
  });

  it('drops the store, then shortens the bars, then the name on a 40×25 — never the caption or the price', () => {
    const layout = labelLayout({ widthMm: 40, heightMm: 25, rotate: 0 });
    expect(layout.showStore).toBe(false);
    expect(layout.nameLines).toBe(1);
    expect(layout.barcode.barMm).toBe(LABEL_MIN_BAR_MM);
    expect(layout.fonts.variant).toBeGreaterThan(0);
    expect(layout.fonts.price).toBeGreaterThan(layout.fonts.name);
    expect(layout.warnings).toEqual([]);
  });

  it('says so when a label is too small for the tag at all', () => {
    const layout = labelLayout({ widthMm: 30, heightMm: 20, rotate: 0 });
    expect(layout.warnings).toEqual(expect.arrayContaining(['barcode_small']));
  });

  it('puts the article on its own line only when the label stands upright', () => {
    expect(labelLayout({ widthMm: 58, heightMm: 40, rotate: 0 }).skuOwnLine).toBe(false);
    expect(labelLayout({ widthMm: 58, heightMm: 40, rotate: 90 }).skuOwnLine).toBe(true);
  });
});

describe('the margins', () => {
  it('keeps 4.5 mm on each side of an 80 mm label — the receipt head prints 72', () => {
    expect(labelLayout({ widthMm: 80, heightMm: 40, rotate: 0 }).pad.x).toBe(4.5);
    expect(labelLayout({ widthMm: 58, heightMm: 40, rotate: 0 }).pad.x).toBe(2);
  });
});

describe('the transform onto the label', () => {
  const page = { w: 40, h: 58 };
  it.each<[TagRotation, string | undefined]>([
    [0, undefined],
    [90, 'translateX(40mm) rotate(90deg)'],
    [180, 'translate(40mm, 58mm) rotate(180deg)'],
    [270, 'translateY(58mm) rotate(270deg)'],
  ])('%i°', (rotate, transform) => {
    expect(labelTransform({ page, rotate })).toBe(transform);
  });
});

describe('the price row', () => {
  const layout = labelLayout({ widthMm: 40, heightMm: 30, rotate: 0 });

  it('sets an ordinary price at the layout size', () => {
    expect(priceRowFonts(layout, '450 ₴', null, null).price).toBe(layout.fonts.price);
  });

  it('sets a long price with an old one beside it smaller, not clipped, and no smaller than 60 %', () => {
    const { price, old } = priceRowFonts(layout, '12990.50 ₴', '15990.50 ₴', '068-130-ZZ');
    const room = layout.box.w - 2 * layout.pad.x;
    expect(price).toBeLessThan(layout.fonts.price);
    expect(price).toBeGreaterThanOrEqual(layout.fonts.price * 0.6 - 0.001);
    expect(old).toBeLessThan(layout.fonts.old);
    expect(textWidthEm('12990.50 ₴') * price).toBeLessThanOrEqual(room);
  });

  it('leaves the article room in landscape only', () => {
    const wide = labelLayout({ widthMm: 58, heightMm: 30, rotate: 0 });
    const tall = labelLayout({ widthMm: 40, heightMm: 58, rotate: 0 });
    const price = '2490 ₴';
    const old = '3290 ₴';
    expect(priceRowFonts(wide, price, old, 'ARTICLE-0001').price).toBeLessThanOrEqual(
      priceRowFonts(wide, price, old, null).price
    );
    expect(priceRowFonts(tall, price, old, 'ARTICLE-0001')).toEqual(
      priceRowFonts(tall, price, old, null)
    );
  });
});
