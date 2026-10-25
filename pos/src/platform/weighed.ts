// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Weighed goods (migration 075, TechDocs/grocery/G4_WEIGHED.md), for a module
// that shows or rings one — a grocery catalog opening the weight pad, the
// debts module writing a weighed line «під запис». Exported here rather than
// copied into a module for the reason `cashRounding.ts` is: the sum on the
// screen and the sum the server stores have to agree to the kopeck, and one
// table of cases pins both.
export { lineAmountCents } from '../lib/lineMoney';
export {
  MANUAL_WEIGHT_NOTE,
  MAX_WEIGHED_QUANTITY,
  WEIGHED_PRICE_PER,
  displayUnit,
  formatQuantity,
  isWeighed,
  parseWeightInput,
  unitPriceLabel,
  weighedLineCaption,
  weightPadInput,
  weightProblem,
  weightToPadText,
  type WeightPadKey,
  type WeightSource,
} from '../lib/weighed';
