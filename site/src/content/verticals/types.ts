import type { FaqItem } from '../../lib/faqJsonLd';
import type { VerticalId } from '../../lib/productFacts';
import type { Glyph } from '../../components/glyphs';

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
  /** A drawn mockup instead of a screenshot (e.g. the bot's Telegram chat), used when `shot` is absent. */
  mockup?: () => JSX.Element;
  /** «Read more» under the bullets. */
  link?: { href: string; label: string };
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

/**
 * Who does what, side by side, right under the hero — for a business where
 * two people use the till at once (the waiter and the guest). It is where the
 * hero's long version lives, so the lede itself can stay two sentences: every
 * claim the lede used to make is an item here, still visible text.
 */
export interface VerticalSides {
  title: string;
  columns: Array<{
    title: string;
    caption: string;
    /** A colour glyph drawn at 48 px. */
    icon: Glyph;
    /** Each with a colour glyph drawn at 24 px. */
    items: Array<{ icon: Glyph; text: string }>;
  }>;
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
  sides?: VerticalSides;
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
