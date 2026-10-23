// The visitor's path to a lead form, as rules with no DOM in them, so they can
// be tested (`src/__tests__/site-journey.test.ts`) and so `journey.ts` stays a
// thin shell around localStorage and the click listener. TechDocs/CRM_LEADS.md.
//
// Nothing here leaves the visitor's browser by itself: the journey rides only
// with a lead form the visitor sends. The server cleans it again
// (`src/crm/journey.ts`) and is the one that decides what is kept.

export const JOURNEY_KEY = 'tls_journey';
/** A pause this long starts a new visit, as in GA4's session. */
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** A journey older than this is a different decision: start over. */
export const MAX_AGE_MS = 90 * 24 * 3600 * 1000;
export const MAX_STEPS = 20;

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
const CLICK_KEYS = ['gclid', 'fbclid', 'ttclid'] as const;

export interface Touch {
  at: string;
  /** Referrer as `host/path` — never its query, which can carry a search phrase or a token. */
  ref?: string;
  landing?: string;
  utm?: Partial<Record<(typeof UTM_KEYS)[number], string>>;
  click?: Partial<Record<(typeof CLICK_KEYS)[number], string>>;
}

export interface Journey {
  first?: Touch;
  last?: Touch;
  visits?: number;
  firstVisitAt?: string;
  pages?: Array<{ p: string; at: string }>;
  ctas?: Array<{ id: string; p: string; at: string }>;
  device?: 'mobile' | 'desktop';
}

/** What localStorage holds: the journey plus when we last saw the visitor. */
export interface StoredJourney extends Journey {
  lastSeenAt: string;
}

function cut(value: string | null | undefined, max: number): string | undefined {
  const clean = value?.trim();
  return clean ? clean.slice(0, max) : undefined;
}

function hostAndPath(url: URL): string {
  return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.slice(0, 200);
}

/** The visit as the address bar and `document.referrer` describe it. */
export function touchFromLocation(href: string, referrer: string, now: Date): Touch {
  const here = new URL(href);
  const touch: Touch = { at: now.toISOString(), landing: here.pathname.slice(0, 200) };
  if (referrer) {
    try {
      const from = new URL(referrer);
      // Our own pages are steps of the same visit, not where it came from.
      if (from.hostname && from.hostname !== here.hostname) touch.ref = hostAndPath(from);
    } catch {
      // A referrer we cannot parse says nothing.
    }
  }
  const utm: Touch['utm'] = {};
  for (const key of UTM_KEYS) {
    const value = cut(here.searchParams.get(`utm_${key}`), 100);
    if (value) utm[key] = value;
  }
  if (Object.keys(utm).length) touch.utm = utm;
  const click: Touch['click'] = {};
  for (const key of CLICK_KEYS) {
    const value = cut(here.searchParams.get(key), 200);
    if (value) click[key] = value;
  }
  if (Object.keys(click).length) touch.click = click;
  return touch;
}

/** A touch that says where the visitor came from — not just «typed the address». */
function hasOrigin(touch: Touch): boolean {
  return Boolean(touch.ref || touch.utm || touch.click);
}

export function parseStored(raw: string | null, now: Date): StoredJourney | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredJourney;
    if (!value || typeof value !== 'object' || typeof value.lastSeenAt !== 'string') return null;
    const started = Date.parse(value.firstVisitAt ?? value.lastSeenAt);
    if (!Number.isFinite(started) || now.getTime() - started > MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}

function pushCapped<T>(list: T[] | undefined, item: T): T[] {
  return [...(list ?? []), item].slice(-MAX_STEPS);
}

/**
 * One page view. A new visit — the first one, one after a long pause, or one
 * that arrived from somewhere (a referrer, a campaign, an ad click) — counts
 * a visit and becomes the «last» touch; the very first one is kept as «first»
 * for as long as the journey lives.
 */
export function recordPageView(
  prev: StoredJourney | null,
  href: string,
  referrer: string,
  now: Date,
  device: 'mobile' | 'desktop'
): StoredJourney {
  const touch = touchFromLocation(href, referrer, now);
  const gap = prev ? now.getTime() - Date.parse(prev.lastSeenAt) : Infinity;
  const newVisit = !prev || !(gap < SESSION_GAP_MS) || hasOrigin(touch);
  const path = touch.landing ?? '/';
  const pages = prev?.pages ?? [];
  const samePage = pages.length > 0 && pages[pages.length - 1]!.p === path && !newVisit;
  return {
    first: prev?.first ?? touch,
    last: newVisit ? touch : prev?.last ?? touch,
    visits: newVisit ? (prev?.visits ?? 0) + 1 : prev?.visits ?? 1,
    firstVisitAt: prev?.firstVisitAt ?? touch.at,
    pages: samePage ? pages : pushCapped(pages, { p: path, at: touch.at }),
    ctas: prev?.ctas ?? [],
    device,
    lastSeenAt: now.toISOString(),
  };
}

/** One click on a `data-cta` element. */
export function recordCta(prev: StoredJourney | null, id: string, path: string, now: Date): StoredJourney | null {
  if (!prev) return null;
  return {
    ...prev,
    ctas: pushCapped(prev.ctas, { id: id.slice(0, 80), p: path.slice(0, 200), at: now.toISOString() }),
    lastSeenAt: now.toISOString(),
  };
}

/** What a lead form sends: the journey without our bookkeeping. */
export function forSubmit(stored: StoredJourney | null): Journey | undefined {
  if (!stored) return undefined;
  const { lastSeenAt: _seen, ...journey } = stored;
  return journey;
}

/**
 * An id for a link nobody tagged — the demo-menu and pricing links inside
 * Довідка articles live in hand-written TSX bodies, and tagging each one would
 * be the first thing a new article forgets. Only patterns the CRM reads.
 */
export function ctaIdForLink(href: string | null): string | null {
  if (!href) return null;
  const demo = /^\/m\/demo-([a-z]+)-menu/.exec(href);
  if (demo) return `demo-menu-${demo[1]}`;
  if (/#pricing$/.test(href)) return 'pricing-link';
  if (/^\/yaku-kasu-obraty/.test(href)) return 'compare-link';
  return null;
}

