// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Recipe calls the host's `api` object has no method for — through
// `api.posRequest`, the `markdownsApi.ts` shape, so nothing here is a new
// export of `@pos/platform` and the platform stays where it is.

import { api } from '@pos/platform';

export interface ReplaceIngredientInput {
  from_variant_id: number;
  to_variant_id: number;
  /** Every quantity is multiplied by it and rounded to a whole unit; never empty. */
  factor: number;
  /** Also the modifier answers that write the old ingredient off. */
  include_modifiers: boolean;
}

export interface ReplaceIngredientResult {
  /** Recipes (variants) whose lines changed. */
  recipes: number;
  /** Cards those recipes belong to. */
  products: number;
  /** Modifier answers repointed. */
  modifiers: number;
}

/** Swap one ingredient for another in every recipe — one transaction on the server. */
export function replaceIngredient(input: ReplaceIngredientInput): Promise<ReplaceIngredientResult> {
  // Called as a METHOD of `api`, never detached: it reaches its axios client through `this`.
  return api.posRequest<ReplaceIngredientResult>('post', '/products/components/replace', input);
}
