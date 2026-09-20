// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * Does the printed tag scan?
 *
 * Not "does the encoder round-trip" — `ean13.test.ts` answers that, and it
 * answered it happily the whole time the tags coming off the roll were
 * unreadable. These tests take what the component actually draws, lay it down
 * as printer dots and sweep an independent reader across it
 * (`test/scannerSim.ts`). Everything that makes a real tag fail — a missing
 * light margin, modules too narrow for the head, ink spreading over the gaps —
 * is visible here and nowhere else.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceTagsPrintable } from './PriceTagsPrintable';
import { buildPriceTags } from '../lib/priceTag';
import {
  EAN13_MIN_QUIET_LEFT,
  EAN13_MIN_QUIET_RIGHT,
  EAN13_QUIET_LEFT,
  EAN13_TOTAL_MODULES,
} from '../lib/ean13';
import {
  TAG_PAPER_WIDTHS,
  magnification,
  moduleWidthMm,
  tagWidthMm,
} from '../lib/priceTagLayout';
import { rasterize, scanEan13, type PrintedBar } from '../test/scannerSim';

/** A thermal receipt head; 300 is what a laser or an office printer does. */
const THERMAL_DPI = 203;

const CODE = '4820270362877';

function tags(barcode: string | null = CODE) {
  return buildPriceTags('Demo Boutique', [
    {
      product: { name: 'Піжама' },
      variant: {
        id: 1,
        label: 'Рожевий · 98/104',
        unit: 'шт',
        price_cents: 45000,
        sku: '068-130',
        barcode,
        quantity: 1,
      },
      copies: 1,
    },
  ]);
}

/**
 * Pull the bars back out of the rendered SVG, in modules.
 *
 * Reading the DOM rather than calling `ean13Bars` is the point: what is
 * asserted is the thing the print engine is handed.
 */
function printedBars(container: HTMLElement): { bars: PrintedBar[]; viewWidth: number } {
  const svg = container.querySelector('svg.price-tag-barcode');
  if (!svg) throw new Error('no barcode was drawn');
  const [, , viewWidth] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number) as number[];
  const bars = [...svg.querySelectorAll('rect')]
    // The first rect is the paper.
    .filter((r) => r.getAttribute('fill') !== '#fff')
    .map((r) => ({ start: Number(r.getAttribute('x')), width: Number(r.getAttribute('width')) }))
    .sort((a, b) => a.start - b.start);
  return { bars, viewWidth: viewWidth! };
}

function scanTag(
  paper: (typeof TAG_PAPER_WIDTHS)[number],
  opts: { dpi?: number; barGrowth?: number; code?: string } = {}
): string {
  const { container } = render(
    <PriceTagsPrintable tags={tags(opts.code ?? CODE)} paperWidth={paper} />
  );
  const { bars, viewWidth } = printedBars(container);
  return scanEan13(
    rasterize(bars, {
      totalModules: viewWidth,
      moduleMm: moduleWidthMm(paper),
      dpi: opts.dpi ?? THERMAL_DPI,
      barGrowth: opts.barGrowth ?? 0,
    })
  );
}

describe('the printed tag, read by a scanner', () => {
  it.each(TAG_PAPER_WIDTHS)('decodes off %i mm paper at 203 dpi', (paper) => {
    expect(scanTag(paper)).toBe(CODE);
  });

  it.each(TAG_PAPER_WIDTHS)('decodes off %i mm paper at 300 dpi', (paper) => {
    expect(scanTag(paper, { dpi: 300 })).toBe(CODE);
  });

  it.each(TAG_PAPER_WIDTHS)('survives a fat print on %i mm paper', (paper) => {
    // A hot head spreads the bars into the gaps. Reading between similar edges
    // is what makes that survivable, and this is the test that says so.
    expect(scanTag(paper, { barGrowth: 0.3 })).toBe(CODE);
  });

  it.each(TAG_PAPER_WIDTHS)('survives a starved print on %i mm paper', (paper) => {
    expect(scanTag(paper, { barGrowth: -0.3 })).toBe(CODE);
  });

  it.each(TAG_PAPER_WIDTHS)('gives up on a badly over-inked %i mm print', (paper) => {
    // The reader above is not simply agreeable: past roughly six tenths of a
    // module of growth it stops reading, which is where a real one goes too.
    // Without this the "survives" tests above would prove nothing.
    expect(() => scanTag(paper, { barGrowth: 1 })).toThrow();
  });

  it('reads every code the shop can put on a tag', () => {
    // One per first digit, so every parity pattern is exercised — that is the
    // only thing carrying digit one, and a tag that loses it is off by a digit
    // rather than unreadable, which is worse.
    const codes = ['2900000000018', '5901234123457', '0000000000000', '9999999999994'];
    for (let d = 0; d < 10; d += 1) {
      const twelve = `${d}90123412345`;
      let sum = 0;
      for (let i = 0; i < 12; i += 1) sum += (twelve.charCodeAt(i) - 48) * (i % 2 === 0 ? 1 : 3);
      codes.push(twelve + String((10 - (sum % 10)) % 10));
    }
    for (const code of codes) {
      expect(scanTag(58, { code })).toBe(code);
    }
  });
});

describe('the light margins', () => {
  // The regression this whole file exists for: the symbol used to be drawn
  // 95 modules wide across the full width of the tag, so it ran from paper
  // edge to paper edge with no white on either side. A reader has nothing to
  // calibrate against then and simply stays silent — which at the counter
  // looks exactly like a broken scanner.
  it.each(TAG_PAPER_WIDTHS)('clears the GS1 minimum on both sides of %i mm paper', (paper) => {
    const { container } = render(<PriceTagsPrintable tags={tags()} paperWidth={paper} />);
    const { bars, viewWidth } = printedBars(container);
    const first = bars[0]!;
    const last = bars[bars.length - 1]!;

    expect(first.start).toBeGreaterThanOrEqual(EAN13_MIN_QUIET_LEFT);
    expect(viewWidth - (last.start + last.width)).toBeGreaterThanOrEqual(EAN13_MIN_QUIET_RIGHT);
    expect(viewWidth).toBe(EAN13_TOTAL_MODULES);
  });

  it('refuses to decode a symbol printed hard against the paper edge', () => {
    // Proof the reader above is not simply generous: strip the margins and it
    // stops reading, exactly as the shop's scanner did.
    const { container } = render(<PriceTagsPrintable tags={tags()} paperWidth={58} />);
    const { bars } = printedBars(container);
    const trimmed = bars.map((b) => ({ ...b, start: b.start - EAN13_QUIET_LEFT }));
    expect(() =>
      scanEan13(
        rasterize(trimmed, {
          totalModules: 95,
          moduleMm: moduleWidthMm(58),
          dpi: THERMAL_DPI,
        })
      )
    ).toThrow(/quiet zone/);
  });
});

describe('what the tag refuses to draw', () => {
  it('draws no bars for a code whose check digit is wrong', () => {
    // '4820270362870' is the shop's code with the last digit mistyped. It is
    // thirteen digits, it used to print a symbol that looks perfect, and no
    // reader on earth accepts it.
    const { container } = render(
      <PriceTagsPrintable tags={tags('4820270362870')} paperWidth={58} />
    );
    expect(container.querySelector('svg.price-tag-barcode')).toBeNull();
    expect(container.textContent).toContain('без штрихкоду');
  });

  it('prints the digits where the standard puts them, out of the scan band', () => {
    const { container } = render(<PriceTagsPrintable tags={tags()} paperWidth={58} />);
    const svg = container.querySelector('svg.price-tag-barcode')!;
    const texts = [...svg.querySelectorAll('text')];
    expect(texts.map((t) => t.textContent).join('')).toBe(CODE);
    // The first digit sits out in the left light margin — which is what keeps
    // that margin from being "tidied away" by a later layout change.
    expect(Number(texts[0]!.getAttribute('x'))).toBeLessThan(EAN13_QUIET_LEFT);
    // Every digit is below the bars, so none of it is ink the scan line crosses.
    const barBottom = Math.max(
      ...[...svg.querySelectorAll('rect')]
        .filter((r) => r.getAttribute('fill') !== '#fff')
        .map((r) => Number(r.getAttribute('height')))
    );
    for (const t of texts) expect(Number(t.getAttribute('y'))).toBeGreaterThan(barBottom);
  });
});

describe('the tag on the roll', () => {
  it('takes half of 80 mm paper and three quarters of 58 mm', () => {
    expect(tagWidthMm(80)).toBe(40);
    expect(tagWidthMm(58)).toBe(43.5);
  });

  it('carries the width to the stylesheet as a custom property', () => {
    const { container } = render(<PriceTagsPrintable tags={tags()} paperWidth={80} />);
    const area = container.querySelector<HTMLElement>('.price-tag-print-area')!;
    expect(area.style.getPropertyValue('--tag-w')).toBe('40mm');
    expect(area.style.getPropertyValue('--tag-barcode-h')).toBe('19.145mm');
  });

  it.each(TAG_PAPER_WIDTHS)('stays inside GS1 magnification on %i mm paper', (paper) => {
    // 80 %–200 % of the 0.33 mm nominal module. Below the floor the bars are
    // thinner than the head can lay down; above it a hand scanner's window no
    // longer spans the symbol.
    expect(magnification(paper)).toBeGreaterThanOrEqual(0.8);
    expect(magnification(paper)).toBeLessThanOrEqual(2);
  });

  it.each(TAG_PAPER_WIDTHS)('keeps a module at two printer dots or more (%i mm)', (paper) => {
    expect(moduleWidthMm(paper) * (THERMAL_DPI / 25.4)).toBeGreaterThanOrEqual(2);
  });
});
