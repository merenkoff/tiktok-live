import type { Article } from './types';
import { zminaPrroZaminaKasy } from './zmina-prro-zamina-kasy';

/** Newest first — the index page and llms.txt list them in this order. */
export const ARTICLES: Article[] = [zminaPrroZaminaKasy];

export function findArticle(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.meta.slug === slug);
}
