// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Можливо, є в страві — перевірте» under a dish's allergen chips: what the
// recipe suggests the guest should be told about. A HINT and nothing more —
// it never ticks a chip, never unticks one, and says nothing at all when it
// has nothing to say, because «no allergens found» would read as «checked».
//
// Two sources, the first stronger than the second:
//   · the ingredient's own card — an owner who ticked «Молоко» on «Вершки 33 %»
//     said so; that is knowledge, not a guess;
//   · the ingredient's name — a dictionary of word stems («вершк» → milk).
//     It misses what the name does not say (soy sauce inside a «маринад»),
//     which the screen says out loud under the hint.
//
// A prep inside the recipe is walked into (the steak's demi-glace made with
// cream suggests milk), up to the café's three levels, through the catalogue
// the page already holds — no request of its own.

import type { Product } from '../../../types';
import { ALLERGENS } from '../components/allergens';
import { guestWord } from './guestComposition';

/**
 * Word stems per allergen, each matched at the START of a word of the
 * ingredient's name (lower case, apostrophes kept). A negative look-ahead keeps
 * a stem off a longer word that is something else («сир» but not «сироп»).
 */
const STEMS: Record<string, readonly RegExp[]> = {
  gluten: [
    /^борошн/, /^хліб/, /^лаваш/, /^паст[аиу]$/, /^макарон/, /^спагет/, /^локшин/, /^лапш/, /^панір/,
    /^сухар/, /^булк/, /^булоч/, /^тіст/, /^пшениц/, /^пшеничн/, /^житн/, /^ячм/, /^манк/, /^кускус/,
    /^булгур/, /^крутон/, /^тортил/, /^бриош/, /^круасан/, /^пиво$/, /^пива$/,
  ],
  crustaceans: [/^кревет/, /^краб/, /^лангуст/, /^омар/, /^рак(и|ів|ами)?$/],
  eggs: [/^яйц/, /^яєц/, /^яєч/, /^майонез/, /^жовтк/],
  fish: [
    /^риб/, /^лосос/, /^сьомг/, /^тун[еє]?ц/, /^оселед/, /^скумбр/, /^форел/, /^анчоус/, /^дорадо/, /^сибас/,
    /^тріск/, /^хек/, /^судак/, /^короп/, /^ікр/,
  ],
  peanuts: [/^арахіс/],
  soy: [/^со[яюї]$/, /^соєв/, /^тофу/, /^едамам/, /^місо$/],
  milk: [
    /^молок/, /^молоч/, /^вершк/, /^сир(?!оп)/, /^сметан/, /^йогурт/, /^кефір/, /^моцарел/, /^пармезан/,
    /^бринз/, /^фета$/, /^маскарпоне/, /^рікот/, /^згущ/, /^ряжан/, /^пломбір/, /^морозив/, /^чедер/, /^гауд/,
    /^камамбер/, /^бри$/, /^дорблю/, /^вершков/,
  ],
  nuts: [/^горіх/, /^горіш/, /^мигдал/, /^фундук/, /^кеш'?ю/, /^фісташ/, /^пекан/, /^макадам/, /^песто$/],
  celery: [/^селер/],
  mustard: [/^гірчиц/, /^дижонськ/],
  sesame: [/^кунжут/, /^тахін/, /^хумус/],
  sulphites: [/^вин(о|а|ом|і)$/, /^винн/, /^сухофрукт/, /^родзин/, /^курага/, /^чорнослив/],
  lupin: [/^люпин/],
  molluscs: [/^міді/, /^кальмар/, /^восьмин/, /^устриц/, /^гребінц/, /^равлик/],
};

const KNOWN = new Set(ALLERGENS.map((a) => a.code));

/** The allergens a name speaks of, by the dictionary above. */
export function allergensInName(name: string): string[] {
  const words = name
    .toLocaleLowerCase('uk')
    .replace(/[ʼ’`]/g, "'")
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
  const found: string[] = [];
  for (const allergen of ALLERGENS) {
    const stems = STEMS[allergen.code] ?? [];
    if (words.some((word) => stems.some((stem) => stem.test(word)))) found.push(allergen.code);
  }
  return found;
}

export interface AllergenHint {
  code: string;
  label: string;
  /** The ingredients that suggest it, as the guest would name them («вершки», «соус демі-глас»). */
  from: string[];
  /** True when an ingredient's own card says so — not a guess from its name. */
  fromCard: boolean;
}

/** How deep a recipe may nest — the café's limit (`maxCompositionDepth`). */
const MAX_DEPTH = 3;

/**
 * What the recipe of `product` suggests, in the list's own order, every size
 * of the dish together. `catalog` is what the page holds — every product,
 * ingredients and preps included, so a line can be traced to its card.
 */
export function allergenHints(
  product: Pick<Product, 'variants'> | null | undefined,
  catalog: readonly Product[]
): AllergenHint[] {
  const byVariant = new Map<number, { product: Product; variantIndex: number }>();
  for (const item of catalog) {
    item.variants?.forEach((variant, index) => byVariant.set(variant.id, { product: item, variantIndex: index }));
  }
  const found = new Map<string, { from: string[]; fromCard: boolean }>();
  const note = (code: string, word: string, fromCard: boolean) => {
    if (!KNOWN.has(code)) return;
    const entry = found.get(code) ?? { from: [], fromCard: false };
    if (word && !entry.from.includes(word)) entry.from.push(word);
    entry.fromCard ||= fromCard;
    found.set(code, entry);
  };

  type Line = { component_variant_id?: number; product_name?: string | null; label?: string | null };
  const walk = (lines: readonly Line[] | undefined, word: string | null, depth: number, seen: Set<number>) => {
    for (const line of lines ?? []) {
      // At the top a line names itself; inside a prep the prep's word stands for it.
      const own = guestWord(line);
      const said = word ?? own;
      for (const code of allergensInName(String(line.product_name ?? ''))) note(code, said, false);
      const id = Number(line.component_variant_id);
      const card = Number.isFinite(id) ? byVariant.get(id) : undefined;
      if (!card || seen.has(id)) continue;
      for (const code of card.product.allergens ?? []) note(code, said, true);
      if (depth + 1 >= MAX_DEPTH) continue;
      const inner = card.product.variants?.[card.variantIndex]?.components;
      if (inner?.length) walk(inner, said, depth + 1, new Set(seen).add(id));
    }
  };

  for (const variant of product?.variants ?? []) {
    if (variant.is_active === false) continue;
    walk(variant.components, null, 0, new Set());
  }

  return ALLERGENS.filter((a) => found.has(a.code)).map((a) => ({
    code: a.code,
    label: a.label,
    from: found.get(a.code)!.from,
    fromCard: found.get(a.code)!.fromCard,
  }));
}
