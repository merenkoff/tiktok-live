// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { EAN13_MODULES, ean13Bars } from '../lib/ean13';
import { expandCopies, type PriceTag } from '../lib/priceTag';

export type TagPaperWidth = 58 | 80;

function money(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

/**
 * The bars, as an SVG the print engine scales to the paper.
 *
 * `viewBox` is in modules, so the browser decides the physical module width
 * from the CSS width — at 203 dpi and 48 mm of printable area on 58 mm paper
 * that lands around 4 dots per module, comfortably above the 2 needed to scan.
 * `shapeRendering="crispEdges"` matters on a 1-bit printer: antialiasing turns
 * a bar edge into a grey column the head cannot reproduce, and the reader sees
 * a fuzzy boundary.
 */
function Ean13({ code }: { code: string }) {
  return (
    <svg
      className="price-tag-barcode"
      viewBox={`0 0 ${EAN13_MODULES} 30`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {ean13Bars(code).map(([start, width]) => (
        <rect key={start} x={start} y={0} width={width} height={30} fill="#000" />
      ))}
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
    <div className="price-tag-print-area" data-paper={paperWidth}>
      {expandCopies(tags).map((tag, i) => (
        <div className="price-tag" key={i}>
          <p className="price-tag-store">{tag.storeName}</p>
          <p className="price-tag-name">{tag.productName}</p>
          {tag.variantLabel && <p className="price-tag-variant">{tag.variantLabel}</p>}
          <p className="price-tag-price">{money(tag.priceCents)} ₴</p>
          {tag.barcode ? (
            <>
              <Ean13 code={tag.barcode} />
              <p className="price-tag-digits">{tag.barcode}</p>
            </>
          ) : (
            <p className="price-tag-digits">без штрихкоду</p>
          )}
          {tag.sku && <p className="price-tag-sku">{tag.sku}</p>}
        </div>
      ))}
    </div>
  );
}
