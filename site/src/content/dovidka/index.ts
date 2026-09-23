import type { Article } from './types';
import { zminaPrroZaminaKasy } from './zmina-prro-zamina-kasy';
import { GUIDE_ARTICLES } from './guides';

/** Hand-written answers, newest first. */
const STANDALONE: Article[] = [zminaPrroZaminaKasy];

/** Guides first (in reading order), then the articles — the index page and llms.txt list them this way. */
export const ARTICLES: Article[] = [...GUIDE_ARTICLES, ...STANDALONE];

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.meta.slug === slug);
}
