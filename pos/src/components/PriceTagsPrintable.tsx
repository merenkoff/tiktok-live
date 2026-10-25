// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
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
import {
  LABEL_GAP_MM,
  LABEL_LINE_HEIGHT,
  labelLayout,
  labelPageRule,
  labelTransform,
  priceRowFonts,
  type LabelLayout,
} from '../lib/priceLabelLayout';
import type { TagMedia } from '../lib/priceTagMedia';
import { expandCopies, type PriceTag } from '../lib/priceTag';

export type { TagPaperWidth };

/** Below the bars, as on the roll: guards run 5 modules longer, digits sit 14 below. */
const GUARD_EXTRA = TAG_BARCODE_GUARD_MODULES - TAG_BARCODE_BAR_MODULES;
const HRI_BELOW = TAG_BARCODE_HRI_BASELINE - TAG_BARCODE_BAR_MODULES;
const VIEW_BELOW = TAG_BARCODE_VIEW_MODULES - TAG_BARCODE_BAR_MODULES;

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
 *
 * On a label the bars are as tall as the layout could spare (`barModules`),
 * not the roll's fixed 40 modules, and the size comes inline rather than from
 * the host's stylesheet — see `PriceLabel`.
 */
function Ean13({
  code,
  barModules = TAG_BARCODE_BAR_MODULES,
  className = 'price-tag-barcode',
  style,
}: {
  code: string;
  barModules?: number;
  className?: string;
  style?: CSSProperties;
}) {
  // `buildPriceTags` already refuses anything else; this is the belt, because
  // drawing a code whose check digit is wrong produces a tag that looks
  // perfect and that nothing will ever read.
  if (!isEan13(code)) return null;
  const digits = [...code];
  const viewHeight = barModules + VIEW_BELOW;
  const baseline = barModules + HRI_BELOW;

  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${EAN13_TOTAL_MODULES} ${viewHeight}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={code}
    >
      {/* The paper. Explicit, so the quiet zones are white even if a tag ever
          ends up on a tinted background. */}
      <rect x={0} y={0} width={EAN13_TOTAL_MODULES} height={viewHeight} fill="#fff" />
      <g shapeRendering="crispEdges" fill="#000">
        {ean13Bars(code).map(([start, width]) => (
          <rect
            key={start}
            x={EAN13_QUIET_LEFT + start}
            y={0}
            width={width}
            height={EAN13_GUARD_BARS.includes(start) ? barModules + GUARD_EXTRA : barModules}
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
        <text x={EAN13_QUIET_LEFT / 2} y={baseline}>
          {digits[0]}
        </text>
        {digits.slice(1, 7).map((d, i) => (
          <text key={`l${i}`} x={EAN13_QUIET_LEFT + 3 + i * 7 + 3.5} y={baseline}>
            {d}
          </text>
        ))}
        {digits.slice(7).map((d, i) => (
          <text key={`r${i}`} x={EAN13_QUIET_LEFT + 50 + i * 7 + 3.5} y={baseline}>
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
 * It puts itself at the end of `document.body`, rather than leaving that to
 * whoever renders it. Printing hides every other child of the body, so where
 * this lands in the tree decides whether anything comes out at all, and both
 * ways of getting it wrong had shipped: a caller that left it inside the app
 * printed a blank page, and a dialog that portalled itself out to escape a
 * stale transform printed the dialog. Neither is a decision a caller should be
 * making — the whole job of this component is to be visible to the print
 * engine and to nothing else.
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
 *
 * `media` says what the tags go on; without it they go on the roll
 * `paperWidth` names, as they always did. On labels each tag is one page
 * exactly the label's size — see `PriceLabel`.
 */
export function PriceTagsPrintable({
  tags,
  paperWidth = 58,
  media,
}: {
  tags: PriceTag[] | null;
  paperWidth?: TagPaperWidth;
  media?: TagMedia;
}) {
  if (!tags || typeof document === 'undefined') return null;

  if (media?.kind === 'label') {
    const layout = labelLayout(media);
    const all = expandCopies(tags);
    return createPortal(
      <div
        className="price-tag-print-area"
        data-media="label"
        data-label={`${layout.page.w}x${layout.page.h}@${layout.rotate}`}
      >
        {/* The page IS the label. The rule lives inside the print area, so it
            exists only while something is being printed and cannot reshape the
            next receipt; and it is a `<style>` rather than the host's
            stylesheet because the size is whatever the shop typed in. */}
        <style>{labelPageRule(layout)}</style>
        {all.map((tag, i) => (
          <PriceLabel key={i} tag={tag} layout={layout} last={i === all.length - 1} />
        ))}
      </div>,
      document.body
    );
  }

  return createPortal(
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
          {tag.compareAtCents != null && (
            <p className="price-tag-old">{money(tag.compareAtCents)} ₴</p>
          )}
          <p className="price-tag-price">
            {money(tag.priceCents)} ₴{tag.priceUnit ? `/${tag.priceUnit}` : ''}
          </p>
          {tag.perHundred && (
            <p className="price-tag-per">
              {money(tag.perHundred.cents)} ₴ {tag.perHundred.label}
            </p>
          )}
          {tag.barcode ? (
            <Ean13 code={tag.barcode} />
          ) : (
            <p className="price-tag-digits">без штрихкоду</p>
          )}
          {tag.sku && <p className="price-tag-sku">{tag.sku}</p>}
        </div>
      ))}
    </div>,
    document.body
  );
}

const LABEL_FONT = "'Helvetica Neue', Arial, sans-serif";
const LABEL_MONO = "'Courier New', monospace";

/** `mm` with the trailing noise trimmed — these end up in `style` attributes. */
function mm(value: number): string {
  return `${Math.round(value * 1000) / 1000}mm`;
}

/** One line of text that is cut short rather than wrapped onto the next. */
const ONE_LINE: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/**
 * One tag on one label.
 *
 * Every size here is inline, and nothing depends on the host's stylesheet
 * beyond the print area being shown: `@media print` ships with the host, this
 * component with every module that prints a tag, and a florist's till on an
 * older desktop build must still print a label that fits. The numbers come
 * from `labelLayout`; the line heights are the ones it budgeted with, which is
 * what keeps the price from being pushed off the bottom edge.
 *
 * The content is laid out in `layout.box` — the label already turned — and
 * the transform puts that box back onto the label as the printer feeds it.
 * The page itself is never rotated: the printer's driver only knows the size
 * of the paper, and a page it thought was 40×58 would be cut at 40.
 *
 * Also the dialog's preview, so what the owner sees is what is printed.
 */
export function PriceLabel({
  tag,
  layout,
  last = true,
}: {
  tag: PriceTag;
  layout: LabelLayout;
  last?: boolean;
}) {
  const { fonts, barcode } = layout;
  const landscape = layout.orientation === 'landscape';
  const price = `${money(tag.priceCents)} ₴${tag.priceUnit ? `/${tag.priceUnit}` : ''}`;
  const old = tag.compareAtCents != null ? `${money(tag.compareAtCents)} ₴` : null;
  // A label has no line to spare: a weighed good's price per 100 g shares the
  // caption's line, which is cut short rather than wrapped like it.
  const caption = tag.perHundred
    ? [tag.variantLabel, `${money(tag.perHundred.cents)} ₴ ${tag.perHundred.label}`].filter(Boolean).join(' · ')
    : tag.variantLabel;
  const row = priceRowFonts(layout, price, old, tag.sku);
  const gap = mm(LABEL_GAP_MM);
  const lh = LABEL_LINE_HEIGHT;

  return (
    <div
      className="price-label"
      style={{
        position: 'relative',
        width: mm(layout.page.w),
        height: mm(layout.page.h),
        overflow: 'hidden',
        boxSizing: 'border-box',
        background: '#fff',
        color: '#000',
        breakAfter: last ? 'auto' : 'page',
        pageBreakAfter: last ? 'auto' : 'always',
      }}
    >
      <div
        className="price-label-body"
        data-orientation={layout.orientation}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: mm(layout.box.w),
          height: mm(layout.box.h),
          padding: `${mm(layout.pad.y)} ${mm(layout.pad.x)}`,
          boxSizing: 'border-box',
          transform: labelTransform(layout),
          transformOrigin: '0 0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          fontFamily: LABEL_FONT,
          // Small, so no block's strut is taller than the lines it holds.
          fontSize: mm(fonts.sku),
          lineHeight: lh.text,
          textAlign: landscape ? 'left' : 'center',
        }}
      >
        <div>
          {layout.showStore && (
            <p
              className="price-label-store"
              style={{
                ...ONE_LINE,
                margin: `0 0 ${gap}`,
                fontSize: mm(fonts.store),
                lineHeight: lh.text,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}
            >
              {tag.storeName}
            </p>
          )}
          <p
            className="price-label-name"
            style={{
              margin: 0,
              fontSize: mm(fonts.name),
              lineHeight: lh.name,
              fontWeight: 700,
              display: '-webkit-box',
              WebkitLineClamp: layout.nameLines,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              maxHeight: mm(layout.nameLines * fonts.name * lh.name),
              overflowWrap: 'anywhere',
            }}
          >
            {tag.productName}
          </p>
          <p
            className="price-label-variant"
            style={{
              ...ONE_LINE,
              margin: `${gap} 0 0`,
              fontSize: mm(fonts.variant),
              lineHeight: lh.text,
              minHeight: mm(fonts.variant * lh.text),
            }}
          >
            {caption}
          </p>
        </div>

        <div>
          <div
            className="price-label-row"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: landscape ? 'space-between' : 'center',
              gap: mm(1),
              margin: `0 0 ${gap}`,
              fontSize: mm(row.price),
              lineHeight: lh.price,
            }}
          >
            {landscape && (
              <span
                className="price-label-sku"
                style={{
                  ...ONE_LINE,
                  flex: '1 1 auto',
                  minWidth: 0,
                  fontFamily: LABEL_MONO,
                  fontSize: mm(fonts.sku),
                }}
              >
                {tag.sku ?? ''}
              </span>
            )}
            <span style={{ flex: 'none', whiteSpace: 'nowrap' }}>
              {old && (
                <span
                  className="price-label-old"
                  style={{
                    fontSize: mm(row.old),
                    textDecoration: 'line-through',
                    marginRight: mm(row.old * 0.4),
                  }}
                >
                  {old}
                </span>
              )}
              <span className="price-label-price" style={{ fontWeight: 700 }}>
                {price}
              </span>
            </span>
          </div>

          <div
            style={{
              height: mm(barcode.heightMm),
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {tag.barcode ? (
              <Ean13
                code={tag.barcode}
                barModules={barcode.barModules}
                className="price-label-barcode"
                style={{ display: 'block', width: mm(barcode.widthMm), height: mm(barcode.heightMm) }}
              />
            ) : (
              <span style={{ fontFamily: LABEL_MONO, fontSize: mm(fonts.sku) }}>без штрихкоду</span>
            )}
          </div>

          {layout.skuOwnLine && (
            <p
              className="price-label-sku"
              style={{
                ...ONE_LINE,
                margin: `${gap} 0 0`,
                fontFamily: LABEL_MONO,
                fontSize: mm(fonts.sku),
                lineHeight: lh.text,
                minHeight: mm(fonts.sku * lh.text),
              }}
            >
              {tag.sku ?? ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
