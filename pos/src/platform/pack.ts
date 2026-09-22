// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The purchase pack, as a screen that types a quantity in needs it (migration
// 054). Three modules ask the same question — the owner's product card and
// stock screens (`products`, `stock`) and the till's stock count (`stocktake`)
// — so the arithmetic is handed out from here rather than compiled into each
// of them. Same reason as `bouquet.ts`: a rule that lives in three bundles is
// a rule that drifts in two of them.
export {
  packOf,
  packToBase,
  baseToPack,
  quantityToBase,
  packHint,
  packCostToBase,
  baseCostToPack,
  defaultPackMode,
} from '../lib/pack';
export type { Pack, PackMode, VariantPack } from '../lib/pack';

/**
 * The «упаковки / базові» switch that sits on a quantity box, plus the line
 * saying what the typed number means in the other unit. It renders nothing at
 * all for a variant with no pack, so a clothing shop's screens are untouched.
 *
 * A component in the DATA barrel, against the usual rule that components live
 * in `@pos/platform/ui`, and deliberately: the till's count sheet imports
 * `@pos/platform/ui` lazily on purpose — `BarcodeScanner` drags ~500 KB of
 * `html5-qrcode` behind it, and a USB scanner is the common case. A static
 * import of the same specifier for this one small component merges the two
 * and the sheet's chunk goes from 17 KB to 528 KB. This barrel is external to
 * every module build, so from here the toggle costs a module nothing at all.
 * The split of `ui.ts` exists for a cycle through `Nav`, which this component
 * does not touch.
 */
export { QuantityUnitToggle } from '../components/QuantityUnitToggle';
