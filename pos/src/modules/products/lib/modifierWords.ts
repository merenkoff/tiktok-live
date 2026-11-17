// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// How the owner's screens SAY a modifier: the rule in a sentence, the answers
// in a line, where the question is asked, and which questions fit a product.
// Pure — the product card, the picker and the «Модифікатори» page all read
// these, so a question reads the same wherever it is met.

import type { ModifierGroup, Product } from '@pos/platform';

/** The slice of a group the words need — a draft in the editor has no id yet. */
type GroupRule = Pick<ModifierGroup, 'min_select' | 'max_select'>;

/** «+15 ₴», «−20 ₴», «+12,50 ₴»; nothing for a free answer. */
export function deltaText(cents: number): string {
  if (cents === 0) return '';
  const abs = Math.abs(cents);
  const whole = abs % 100 === 0;
  const amount = whole ? String(abs / 100) : (abs / 100).toFixed(2).replace('.', ',');
  return `${cents > 0 ? '+' : '−'}${amount} ₴`;
}

/** The rule as the cashier lives it: must they answer, and how many may they pick. */
export function ruleText(group: GroupRule): string {
  const required = group.min_select >= 1;
  if (group.max_select === 1) return required ? 'обовʼязково · одна відповідь' : 'за бажанням · одна відповідь';
  if (!required) return `за бажанням · до ${group.max_select}`;
  if (group.min_select === group.max_select) return `обовʼязково · рівно ${group.max_select}`;
  return `обовʼязково · від ${group.min_select} до ${group.max_select}`;
}

/** The same rule as one full sentence under the editor's switches. */
export function ruleSentence(group: GroupRule): string {
  const required = group.min_select >= 1;
  if (group.max_select === 1) {
    return required
      ? 'Каса не пробʼє позицію, доки касир не обере одну відповідь.'
      : 'Касир може обрати одну відповідь або не обирати жодної.';
  }
  if (!required) return `Касир може обрати до ${group.max_select} відповідей або жодної.`;
  if (group.min_select === group.max_select) {
    return `Касир має обрати рівно ${group.max_select} — без цього каса позицію не пробʼє.`;
  }
  return `Касир має обрати від ${group.min_select} до ${group.max_select} відповідей.`;
}

/**
 * The answers in one line — «звичайне · вівсяне +15 ₴ · кокосове +20 ₴ · ще 2».
 * Only what the till shows: a hidden answer is not part of the preview.
 */
export function answersPreview(group: Pick<ModifierGroup, 'modifiers'>, limit = 4): string {
  const shown = group.modifiers.filter((m) => m.is_active);
  const parts = shown.slice(0, limit).map((m) => [m.name, deltaText(m.price_delta_cents)].filter(Boolean).join(' '));
  if (shown.length > limit) parts.push(`ще ${shown.length - limit}`);
  return parts.join(' · ');
}

/** Ukrainian count forms: 1 страва, 2 страви, 5 страв. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** A café says «страва», every other shop «товар». */
export interface Noun {
  /** 1 страва / 2 страви / 5 страв. */
  count: readonly [string, string, string];
  /** в 1 страві / у 5 стравах. */
  inOne: string;
  inMany: string;
}

export const DISH: Noun = { count: ['страва', 'страви', 'страв'], inOne: 'страві', inMany: 'стравах' };
export const PRODUCT: Noun = { count: ['товар', 'товари', 'товарів'], inOne: 'товарі', inMany: 'товарах' };

export function nounFor(dish: boolean): Noun {
  return dish ? DISH : PRODUCT;
}

/** «12 страв». */
export function countText(n: number, noun: Noun): string {
  return `${n} ${plural(n, noun.count)}`;
}

/** «в 1 страві», «у 12 стравах». */
export function usageText(n: number, noun: Noun): string {
  return n === 1 ? `в 1 ${noun.inOne}` : `у ${n} ${noun.inMany}`;
}

/** «Латте, Капучино, Раф і ще 9» — the first names, then how many more. */
export function namesPreview(names: string[], limit = 3): string {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} і ще ${names.length - limit}`;
}

/** What is wrong with a question, for the page's filters and the amber marks. */
export type GroupProblem = 'no_answers' | 'unused' | 'off';

export function groupProblems(group: ModifierGroup): GroupProblem[] {
  const problems: GroupProblem[] = [];
  if (!group.is_active) problems.push('off');
  if (!group.modifiers.some((m) => m.is_active)) problems.push('no_answers');
  // A backend that predates `product_ids` says nothing about who asks — that
  // is «unknown», never «nobody».
  if (group.product_ids && group.product_ids.length === 0) problems.push('unused');
  return problems;
}

export const PROBLEM_WORDS: Record<GroupProblem, string> = {
  no_answers: 'немає відповідей',
  unused: 'ніде не питають',
  off: 'вимкнено',
};

function fold(text: string): string {
  return text.toLowerCase().replace(/[ʼ'`’]/g, '').trim();
}

/** The typed words, folded — every one must be found. */
export function queryWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** Does the text hold every typed word? An empty query matches everything. */
export function matchesWords(text: string, words: string[]): boolean {
  if (words.length === 0) return true;
  const hay = fold(text);
  return words.every((word) => hay.includes(word));
}

/** A question is found by its name or by any of its answers — «вівсяне» finds «Молоко». */
export function groupMatches(group: ModifierGroup, words: string[]): boolean {
  return matchesWords([group.name, ...group.modifiers.map((m) => m.name)].join(' '), words);
}

export interface GroupSuggestion {
  group: ModifierGroup;
  /** How many products with one of this product's tags ask the question… */
  asking: number;
  /** …out of how many such products there are. */
  outOf: number;
}

/**
 * The questions that probably belong on this product: the ones its
 * neighbours ask — the other sellable products under any of its tags. A
 * «Капучино» under «Кава» is offered «Молоко» and «Сироп» first because the
 * other coffees ask them, and nobody had to remember which of forty questions
 * were the coffee ones. Ranked by how many neighbours ask; one neighbour is
 * enough, a question nobody near asks is not a suggestion.
 */
export function suggestGroups(
  groups: ModifierGroup[],
  products: Product[],
  tagIds: number[],
  opts: { productId?: number; exclude?: number[] } = {}
): GroupSuggestion[] {
  if (tagIds.length === 0) return [];
  const mine = new Set(tagIds);
  const neighbours = products.filter(
    (p) => p.is_active && p.id !== opts.productId && p.tag_ids.some((id) => mine.has(id))
  );
  if (neighbours.length === 0) return [];
  const asking = new Map<number, number>();
  for (const product of neighbours) {
    for (const id of product.modifier_group_ids ?? []) asking.set(id, (asking.get(id) ?? 0) + 1);
  }
  const skip = new Set(opts.exclude ?? []);
  return groups
    .filter((g) => g.is_active && !skip.has(g.id) && (asking.get(g.id) ?? 0) > 0)
    .map((group) => ({ group, asking: asking.get(group.id) ?? 0, outOf: neighbours.length }))
    .sort((a, b) => b.asking - a.asking || a.group.name.localeCompare(b.group.name, 'uk'));
}

/** The products that ask a question, by name, in the alphabet's order. */
export function productsAsking(group: ModifierGroup, products: Product[]): Product[] {
  const ids = new Set(group.product_ids ?? []);
  return products
    .filter((p) => ids.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
}
