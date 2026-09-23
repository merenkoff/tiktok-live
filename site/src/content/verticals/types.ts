import type { FaqItem } from '../../lib/faqJsonLd';
import type { VerticalId } from '../../lib/productFacts';

export interface Shot {
  src: string;
  alt: string;
}

export interface VerticalRow {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  shot?: Shot;
}

/** One landing page under /pos/<slug>; the facts (slug, path, title…) live in `VERTICALS`. */
export interface VerticalContent {
  id: VerticalId;
  head: { title: string; description: string };
  h1: string;
  lede: string;
  hero: Shot;
  rows: VerticalRow[];
  faq: FaqItem[];
  /** The Довідка guide for this business, linked under the FAQ; routes.tsx checks the slug exists. */
  guide?: { slug: string; label: string };
  updatedAt: string;
}
