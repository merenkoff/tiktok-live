// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * What producing `run` units of a made-in-advance composite takes of one
 * component — the server's arithmetic (`wholeShare` in
 * src/pos/composites.service.ts): the composition is for `perBatch` units (a
 * tech card's «вихід», migration 116; 1 when it says nothing), the share × the
 * run is made whole once and never below 1. 1900 г of a recipe written for
 * 1900 г takes exactly the batch.
 */
export function productionNeed(componentQty: number, run: number, perBatch = 1): number {
  if (run <= 0) return 0;
  return Math.max(1, Math.round((componentQty * run) / Math.max(1, perBatch)));
}

/** How many units the shelf allows from one component — the inverse of `productionNeed`. */
export function productionRuns(have: number, componentQty: number, perBatch = 1): number {
  return Math.floor((have * Math.max(1, perBatch)) / componentQty);
}
