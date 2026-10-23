import type { LeadIntent } from '../../hooks/useLeadSubmit';
import type { ComponentType } from 'react';
import type { FaqItem } from '../../lib/faqJsonLd';

export interface Heading {
  id: string;
  text: string;
  /** 2 or 3 — the table of contents nests level 3 under the level 2 before it. */
  level: number;
}

export interface ArticleMeta {
  slug: string;
  /** `guide` — a step-by-step manual from TechDocs/guides; `article` — a hand-written answer. */
  kind: 'article' | 'guide';
  /** The small label above the <h1>. */
  eyebrow: string;
  title: string;
  /** Label in the guide switcher and index cards («Касир»); guides only. */
  shortTitle?: string;
  /** Short SEO description — also the lead shown in the index list. */
  description: string;
  /** ISO dates; `updatedAt` feeds sitemap lastmod and dateModified. */
  publishedAt: string;
  updatedAt: string;
  ogImage: string;
  readingMinutes: number;
  faq: FaqItem[];
  /** Table of contents; only guides have one. */
  headings?: Heading[];
  /** The closing form's words, when the articles' default does not fit — an article about a «Скоро» feature collects a waiting list. */
  /**
   * The closing form's own copy. Every override so far is a «Записатися» list,
   * so the lead it sends is a `waitlist` unless `intent` says otherwise.
   */
  cta?: { heading: string; subheading: string; button: string; intent?: LeadIntent };
}

export interface Article {
  meta: ArticleMeta;
  Body: ComponentType;
}
