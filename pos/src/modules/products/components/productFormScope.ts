// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the product form asks, by what the store sells (TechDocs/POS_CLOTHING.md,
// phase C0). The form grew its café and florist questions — «Що це за товар»
// (a composite: a bouquet, a tech card) and a dish's composition and allergens —
// and showed them to every store, so a boutique owner adding a shirt was asked
// what a composite is. The vertical already said which shapes it allows
// (`productKinds`) and whether it has a guest menu; nothing read it.

interface VerticalScope {
  productKinds?: ReadonlyArray<'simple' | 'composite'>;
  dishFacts?: boolean;
}

export interface ProductFormScope {
  /** Offer «Що це за товар» (simple / composite at all). */
  canComposite: boolean;
  /** Ask for a dish's composition and allergens. */
  askDishFacts: boolean;
}

/**
 * Both default to «yes» when the vertical does not say: an auth cached before
 * these fields were on the wire has neither, and the form then behaves exactly
 * as it always did rather than losing questions a florist or a café needs.
 */
export function productFormScope(vertical: VerticalScope): ProductFormScope {
  return {
    canComposite: vertical.productKinds ? vertical.productKinds.includes('composite') : true,
    askDishFacts: vertical.dishFacts !== false,
  };
}
