// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The tech card as a sheet for the kitchen: what goes into one portion, by
// weight, with no money on it — the cook needs the net, the storekeeper the
// gross, and neither needs the purchase prices on the wall by the stove.
//
// Pure: built from the recipe as it stands in the editor, saved or not, so
// what is printed is what is on screen. `techCardSheet.test.ts` pins it.

import type { ProductComponentInput } from '@pos/platform';
import type { CostIndex } from './recipeCost';
import { lossPercentText, netOf, recipeYield, yieldText } from './recipeLoss';

export interface TechCardSheetLine {
  caption: string;
  unit: string;
  gross: number;
  /** «20», «12,5», or «» when the line loses nothing. */
  loss: string;
  net: number;
  /** A recipe of its own inside this one — the cook makes it first. */
  prep: boolean;
}

export interface TechCardSheet {
  store: string;
  /** «Борщ український». */
  title: string;
  /** «M», «30 см» — or «» for a dish with one size. */
  size: string;
  /** «17.11.2026». */
  date: string;
  lines: TechCardSheetLine[];
  /** «≈ 350 г + Яйце × 2 шт», or «». */
  yield: string;
  /** Whether any line states a loss — a sheet without one prints a single weight column. */
  lossy: boolean;
}

export function buildTechCardSheet(input: {
  store: string;
  title: string;
  size: string;
  components: readonly ProductComponentInput[];
  index: CostIndex;
  now?: Date;
}): TechCardSheet {
  const lines: TechCardSheetLine[] = input.components
    .filter((line) => line.quantity > 0)
    .map((line) => {
      const node = input.index.get(line.component_variant_id);
      const loss = line.loss_bps ?? 0;
      return {
        caption: node?.caption ?? `Варіант ${line.component_variant_id}`,
        unit: node?.unit ?? '',
        gross: line.quantity,
        loss: lossPercentText(loss),
        net: netOf(line.quantity, loss),
        prep: Boolean(node?.recipe),
      };
    });
  const now = input.now ?? new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return {
    store: input.store,
    title: input.title,
    size: input.size,
    date: `${two(now.getDate())}.${two(now.getMonth() + 1)}.${now.getFullYear()}`,
    lines,
    yield: yieldText(recipeYield(input.index, input.components)),
    lossy: lines.some((line) => line.loss !== ''),
  };
}
