// The browser half of the journey (TechDocs/CRM_LEADS.md): one page view per
// page, one entry per click on a `data-cta` element, kept in localStorage and
// sent only with a lead form. Started from `mount()`, so it runs once on every
// page and never during prerender. Every storage call is guarded: a blocked or
// full localStorage (private mode, a strict browser) costs the journey, never
// the page or the form.

import { track } from './analytics';
import {
  JOURNEY_KEY,
  type Journey,
  type StoredJourney,
  ctaIdForLink,
  forSubmit,
  parseStored,
  recordCta,
  recordPageView,
} from './journeyCore';

let started = false;

function read(now: Date): StoredJourney | null {
  try {
    return parseStored(window.localStorage.getItem(JOURNEY_KEY), now);
  } catch {
    return null;
  }
}

function write(journey: StoredJourney | null): void {
  if (!journey) return;
  try {
    window.localStorage.setItem(JOURNEY_KEY, JSON.stringify(journey));
  } catch {
    // Storage refused: the page works, the journey is just not kept.
  }
}

function deviceOf(): 'mobile' | 'desktop' {
  try {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768 ? 'mobile' : 'desktop';
  } catch {
    return 'desktop';
  }
}

/** Record this page and listen for CTA clicks. Safe to call more than once. */
export function startJourney(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const now = new Date();
  write(recordPageView(read(now), window.location.href, document.referrer, now, deviceOf()));

  // One listener for the whole page, in the capture phase so a link that
  // navigates away still records its click first.
  document.addEventListener(
    'click',
    (event) => {
      const element = event.target instanceof Element ? event.target : null;
      const tagged = element?.closest('[data-cta]');
      const id = tagged?.getAttribute('data-cta') ?? ctaIdForLink(element?.closest('a')?.getAttribute('href') ?? null);
      if (!id) return;
      const at = new Date();
      write(recordCta(read(at), id, window.location.pathname, at));
      track('cta_click', { cta_id: id, page_path: window.location.pathname });
    },
    { capture: true }
  );
}

/** The journey to send with a lead form, or nothing if none was kept. */
export function journeySnapshot(): Journey | undefined {
  if (typeof window === 'undefined') return undefined;
  return forSubmit(read(new Date()));
}
