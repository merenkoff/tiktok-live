import type { FaqItem } from '../../lib/faqJsonLd';
import type { VerticalId } from '../../lib/productFacts';

export interface Shot {
  src: string;
  alt: string;
  /** A phone screen (a guest's view): framed as a phone, not as a browser window. */
  phone?: boolean;
}

export interface VerticalRow {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  shot?: Shot;
}

/**
 * The answer-first block under the hero: a two-sentence definition plus the
 * facts a person (or an answer engine) asks first. It is visible text on
 * purpose — a snippet or an AI answer can only quote what is on the page.
 */
export interface VerticalOverview {
  title: string;
  body: string;
  facts: Array<{ label: string; value: string }>;
}

/** A Довідка article a landing links to; routes.tsx checks the slug exists. */
export interface VerticalArticleLink {
  slug: string;
  title: string;
  blurb: string;
}

/** One landing page under /pos/<slug>; the facts (slug, path, title…) live in `VERTICALS`. */
export interface VerticalContent {
  id: VerticalId;
  head: { title: string; description: string };
  h1: string;
  lede: string;
  hero: Shot;
  overview?: VerticalOverview;
  rows: VerticalRow[];
  faq: FaqItem[];
  /** A live page worth opening from the hero — the demo café's guest menu. */
  demoLink?: { href: string; label: string };
  /** The Довідка guide for this business, linked under the FAQ; routes.tsx checks the slug exists. */
  guide?: { slug: string; label: string };
  /** «Читайте також»: the articles that answer this business's search questions. */
  articles?: VerticalArticleLink[];
  updatedAt: string;
}
