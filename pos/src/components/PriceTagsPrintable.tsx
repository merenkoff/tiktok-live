// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CSSProperties } from 'react';
import {
  EAN13_GUARD_BARS,
  EAN13_QUIET_LEFT,
  EAN13_TOTAL_MODULES,
  ean13Bars,
  isEan13,
} from '../lib/ean13';
import {
  TAG_BARCODE_BAR_MODULES,
  TAG_BARCODE_GUARD_MODULES,
  TAG_BARCODE_HRI_BASELINE,
  TAG_BARCODE_HRI_MODULES,
  TAG_BARCODE_VIEW_MODULES,
  tagStyleVars,
  type TagPaperWidth,
} from '../lib/priceTagLayout';
import { expandCopies, type PriceTag } from '../lib/priceTag';

export type { TagPaperWidth };

function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

/**
 * The symbol, as an SVG the print engine scales to the paper.
 *
 * `viewBox` is in modules and spans the **whole** symbol — both quiet zones
 * included — so the light margins scale with everything else and cannot be
 * squeezed out by a layout change. They were missing until now, which is the
 * one thing that stops a laser scanner cold: with no white run to calibrate
 * against, it never finds the start guard and simply stays silent, exactly as
 * if the tag had no barcode at all.
 *
 * `preserveAspectRatio="none"` stays: the horizontal scale is the one that
 * decodes, and filling the width exactly is what keeps the module width at the
 * value `moduleWidthMm` promises. A bar band one per cent short is nothing.
 *
 * `shapeRendering="crispEdges"` matters on a 1-bit printer: antialiasing turns
 * a bar edge into a grey column the head cannot reproduce, and the reader sees
 * a fuzzy boundary. It is on the bars alone — the digits below want their
 * normal rendering.
 */
function Ean13({ code }: { code: string }) {
  // `buildPriceTags` already refuses anything else; this is the belt, because
  // drawing a code whose check digit is wrong produces a tag that looks
  // perfect and that nothing will ever read.
  if (!isEan13(code)) return null;
  const digits = [...code];

  return (
    <svg
      className="price-tag-barcode"
      viewBox={`0 0 ${EAN13_TOTAL_MODULES} ${TAG_BARCODE_VIEW_MODULES}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={code}
    >
      {/* The paper. Explicit, so the quiet zones are white even if a tag ever
          ends up on a tinted background. */}
      <rect
        x={0}
        y={0}
        width={EAN13_TOTAL_MODULES}
        height={TAG_BARCODE_VIEW_MODULES}
        fill="#fff"
      />
      <g shapeRendering="crispEdges" fill="#000">
        {ean13Bars(code).map(([start, width]) => (
          <rect
            key={start}
            x={EAN13_QUIET_LEFT + start}
            y={0}
            width={width}
            height={
              EAN13_GUARD_BARS.includes(start)
                ? TAG_BARCODE_GUARD_MODULES
                : TAG_BARCODE_BAR_MODULES
            }
          />
        ))}
      </g>
      {/* The conventional EAN-13 reading line: the first digit out in the left
          light margin — which is what reserves that margin on a tag someone
          will later try to make tidier — then six under each half. All of it
          below the bars, so none of it is ink the scan line crosses. */}
      <g
        fill="#000"
        fontFamily="'Courier New', monospace"
        fontSize={TAG_BARCODE_HRI_MODULES}
        textAnchor="middle"
      >
        <text x={EAN13_QUIET_LEFT / 2} y={TAG_BARCODE_HRI_BASELINE}>
          {digits[0]}
        </text>
        {digits.slice(1, 7).map((d, i) => (
          <text key={`l${i}`} x={EAN13_QUIET_LEFT + 3 + i * 7 + 3.5} y={TAG_BARCODE_HRI_BASELINE}>
            {d}
          </text>
        ))}
        {digits.slice(7).map((d, i) => (
          <text key={`r${i}`} x={EAN13_QUIET_LEFT + 50 + i * 7 + 3.5} y={TAG_BARCODE_HRI_BASELINE}>
            {d}
          </text>
        ))}
      </g>
    </svg>
  );
}

/**
 * Rendered off-screen at all times; only the `@media print` rules in
 * `styles/tokens.css` make it visible, to the print engine alone — the same
 * arrangement `ReceiptPrintable` uses.
 *
 * Everything here is solid black on white. A thermal head has no greys, and a
 * hairline thinner than one dot at 203 dpi disappears entirely.
 *
 * The tag's width arrives as custom properties rather than through the
 * stylesheet: those `@media print` rules ship with the host page, while this
 * component is bundled into every module that prints a tag. A module built
 * before the tag got narrower sets no properties and keeps the old full-width
 * layout through the stylesheet's `var(..., 48mm)` fallbacks, instead of
 * inheriting half a layout.
 */
export function PriceTagsPrintable({
  tags,
  paperWidth,
}: {
  tags: PriceTag[] | null;
  paperWidth: TagPaperWidth;
}) {
  if (!tags) return null;

  return (
    <div
      className="price-tag-print-area"
      data-paper={paperWidth}
      style={tagStyleVars(paperWidth) as CSSProperties}
    >
      {expandCopies(tags).map((tag, i) => (
        <div className="price-tag" key={i}>
          <p className="price-tag-store">{tag.storeName}</p>
          <p className="price-tag-name">{tag.productName}</p>
          {tag.variantLabel && <p className="price-tag-variant">{tag.variantLabel}</p>}
          <p className="price-tag-price">{money(tag.priceCents)} ₴</p>
          {tag.barcode ? (
            <Ean13 code={tag.barcode} />
          ) : (
            <p className="price-tag-digits">без штрихкоду</p>
          )}
          {tag.sku && <p className="price-tag-sku">{tag.sku}</p>}
        </div>
      ))}
    </div>
  );
}
