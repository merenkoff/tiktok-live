// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/crm/journey.ts — what a visitor's path to the lead form may say, and
// nothing more (TechDocs/CRM_LEADS.md «Якорі»).
//
// The site keeps the journey in the visitor's own localStorage
// (`site/src/lib/journey.ts`) and sends it only together with a form, so this
// is an unauthenticated body from anyone's browser: every key is on a white
// list, every list is capped, every string is cut, a referrer keeps its host
// and path but never its query (a search query or a token can ride there), and
// anything that does not fit is dropped rather than refused — a broken journey
// must never cost us the phone number it came with.

/** Where a visit came from: one per «first» and «last» touch. */
export interface JourneyTouch {
  /** ISO time of the visit. */
  at?: string;
  /** Referrer as `host/path`, no scheme and no query. */
  ref?: string;
  /** The page the visit started on. */
  landing?: string;
  utm?: Partial<Record<UtmKey, string>>;
  click?: Partial<Record<ClickKey, string>>;
}

export interface JourneyStep {
  /** Page path. */
  p: string;
  at?: string;
}

export interface JourneyCta {
  /** The button's `data-cta` id (`site/src/lib/ctaIds.ts`). */
  id: string;
  /** The page it was clicked on. */
  p?: string;
  at?: string;
}

export interface Journey {
  first?: JourneyTouch;
  last?: JourneyTouch;
  /** How many visits, counting this one. */
  visits?: number;
  firstVisitAt?: string;
  /** The last pages seen, oldest first. */
  pages?: JourneyStep[];
  /** The last buttons clicked, oldest first. */
  ctas?: JourneyCta[];
  device?: 'mobile' | 'desktop';
}

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;
const CLICK_KEYS = ['gclid', 'fbclid', 'ttclid'] as const;
type UtmKey = (typeof UTM_KEYS)[number];
type ClickKey = (typeof CLICK_KEYS)[number];

export const MAX_STEPS = 20;
const MAX_TEXT = 200;
const MAX_UTM = 100;
const CTA_ID = /^[a-z0-9][a-z0-9:_.-]{0,79}$/;
/** A visit dated more than a year back or a day ahead is a broken clock or a forgery. */
const MAX_AGE_MS = 366 * 24 * 3600 * 1000;
const MAX_SKEW_MS = 24 * 3600 * 1000;

function text(raw: unknown, max = MAX_TEXT): string | undefined {
  if (typeof raw !== 'string') return undefined;
  // Control characters have no business in a path or a campaign name.
  const clean = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim();
  return clean ? clean.slice(0, max) : undefined;
}

function time(raw: unknown, now: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || ms < now - MAX_AGE_MS || ms > now + MAX_SKEW_MS) return undefined;
  return new Date(ms).toISOString();
}

/** A site path: starts with `/`, no query and no fragment. */
export function cleanPath(raw: unknown): string | undefined {
  const value = text(raw);
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  return value.split(/[?#]/)[0]!.slice(0, MAX_TEXT) || undefined;
}

/** `https://www.google.com/search?q=…` → `www.google.com/search`. */
export function cleanReferrer(raw: unknown): string | undefined {
  const value = text(raw, 2048);
  if (!value) return undefined;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!url.hostname) return undefined;
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.hostname.toLowerCase()}${path}`.slice(0, MAX_TEXT);
  } catch {
    return undefined;
  }
}

function record<K extends string>(raw: unknown, keys: readonly K[], max: number): Partial<Record<K, string>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = text((raw as Record<string, unknown>)[key], max);
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function touch(raw: unknown, now: number): JourneyTouch | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const out: JourneyTouch = {
    at: time(row.at, now),
    ref: cleanReferrer(row.ref),
    landing: cleanPath(row.landing),
    utm: record(row.utm, UTM_KEYS, MAX_UTM),
    click: record(row.click, CLICK_KEYS, MAX_TEXT),
  };
  return compact(out);
}

function compact<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

function list<T>(raw: unknown, read: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  // The newest steps are the ones that matter: keep the tail.
  const items = raw.slice(-MAX_STEPS).map(read).filter((x): x is T => x !== undefined);
  return items.length ? items : undefined;
}

/**
 * The journey as the database keeps it. Never throws: junk reads as `{}`.
 * `now` is a parameter so tests can pin the clock.
 */
export function sanitizeJourney(raw: unknown, now = Date.now()): Journey {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const visits = typeof row.visits === 'number' && Number.isInteger(row.visits) && row.visits > 0
    ? Math.min(row.visits, 10_000)
    : undefined;
  const out: Journey = {
    first: touch(row.first, now),
    last: touch(row.last, now),
    visits,
    firstVisitAt: time(row.firstVisitAt, now),
    pages: list(row.pages, (item) => {
      const step = (item ?? {}) as Record<string, unknown>;
      const p = cleanPath(step.p);
      return p ? compact({ p, at: time(step.at, now) }) : undefined;
    }),
    ctas: list(row.ctas, (item) => {
      const step = (item ?? {}) as Record<string, unknown>;
      const id = typeof step.id === 'string' && CTA_ID.test(step.id) ? step.id : undefined;
      return id ? compact({ id, p: cleanPath(step.p), at: time(step.at, now) }) : undefined;
    }),
    device: row.device === 'mobile' || row.device === 'desktop' ? row.device : undefined,
  };
  return compact(out) ?? {};
}
