import type { ComponentType } from 'react';
import type { FaqItem } from '../../lib/faqJsonLd';

export interface ArticleMeta {
  slug: string;
  title: string;
  /** Short SEO description — also the lead shown in the index list. */
  description: string;
  /** ISO dates; `updatedAt` feeds sitemap lastmod and dateModified. */
  publishedAt: string;
  updatedAt: string;
  ogImage: string;
  readingMinutes: number;
  faq: FaqItem[];
}

export interface Article {
  meta: ArticleMeta;
  Body: ComponentType;
}
