import type { VerticalContent } from './types';
import { VERTICALS, type VerticalFact } from '../../lib/productFacts';
import { odyah } from './odyah';
import { kvity } from './kvity';
import { kafe } from './kafe';
import { restoran } from './restoran';

export type { VerticalContent, VerticalRow, Shot } from './types';

const CONTENT: Record<VerticalFact['id'], VerticalContent> = {
  clothing: odyah,
  flowers: kvity,
  cafe: kafe,
  restaurant: restoran,
};

export interface VerticalPageData {
  fact: VerticalFact;
  content: VerticalContent;
}

/** Every landing, in the order the cards and the menu show them. */
export const VERTICAL_PAGES: VerticalPageData[] = VERTICALS.map((fact) => ({
  fact,
  content: CONTENT[fact.id],
}));

export function findVerticalPage(slug: string): VerticalPageData | undefined {
  return VERTICAL_PAGES.find((page) => page.fact.slug === slug);
}
