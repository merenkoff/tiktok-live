// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/site-journey.test.ts — the marketing site's journey rules
// (`site/src/lib/journeyCore.ts`), tested from here because `site/` has no
// test runner. What a visit counts as, what is kept, and that the browser half
// never keeps a referrer's query either (TechDocs/CRM_LEADS.md).

import { describe, expect, it } from 'vitest';
import {
  JOURNEY_KEY,
  MAX_STEPS,
  SESSION_GAP_MS,
  ctaIdForLink,
  forSubmit,
  parseStored,
  recordCta,
  recordPageView,
  touchFromLocation,
} from '../../site/src/lib/journeyCore';
import { sanitizeJourney } from '../crm/journey.js';
import { signalsOf, sourceOf } from '../crm/sources.js';

const T0 = new Date('2026-10-24T10:00:00Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const SITE = 'https://the-live.shop';

describe('touchFromLocation', () => {
  it('reads UTM tags and ad click ids from the address, and the referrer without its query', () => {
    const touch = touchFromLocation(
      `${SITE}/pos/kafe?utm_source=google&utm_campaign=kafe&gclid=abc&x=1`,
      'https://www.google.com/search?q=каса+для+кафе',
      T0
    );
    expect(touch).toEqual({
      at: T0.toISOString(),
      landing: '/pos/kafe',
      ref: 'www.google.com/search',
      utm: { source: 'google', campaign: 'kafe' },
      click: { gclid: 'abc' },
    });
  });

  it('treats our own pages as steps of the visit, not as where it came from', () => {
    expect(touchFromLocation(`${SITE}/pos`, `${SITE}/`, T0).ref).toBeUndefined();
    expect(touchFromLocation(`${SITE}/pos`, 'not a url', T0).ref).toBeUndefined();
  });
});

describe('recordPageView', () => {
  it('starts a journey on the first page, with that visit as both first and last touch', () => {
    const j = recordPageView(null, `${SITE}/pos/kafe?utm_source=fb`, 'https://l.facebook.com/', T0, 'mobile');
    expect(j).toMatchObject({
      visits: 1,
      firstVisitAt: T0.toISOString(),
      device: 'mobile',
      pages: [{ p: '/pos/kafe', at: T0.toISOString() }],
      ctas: [],
    });
    expect(j.first).toEqual(j.last);
  });

  it('counts pages inside a visit without counting a new visit, and skips a reload', () => {
    let j = recordPageView(null, `${SITE}/`, '', T0, 'desktop');
    j = recordPageView(j, `${SITE}/pos`, `${SITE}/`, later(60_000), 'desktop');
    j = recordPageView(j, `${SITE}/pos`, `${SITE}/pos`, later(70_000), 'desktop');
    expect(j.visits).toBe(1);
    expect(j.pages!.map((p) => p.p)).toEqual(['/', '/pos']);
  });

  it('starts a new visit after a long pause, or when someone arrives from somewhere, and keeps the first touch', () => {
    let j = recordPageView(null, `${SITE}/?utm_source=google`, '', T0, 'desktop');
    j = recordPageView(j, `${SITE}/live`, '', later(SESSION_GAP_MS + 1), 'desktop');
    expect(j.visits).toBe(2);
    j = recordPageView(j, `${SITE}/pos`, 'https://chatgpt.com/', later(SESSION_GAP_MS + 60_000), 'desktop');
    expect(j.visits).toBe(3);
    expect(j.first!.utm).toEqual({ source: 'google' });
    expect(j.last!.ref).toBe('chatgpt.com');
  });

  it('keeps only the last steps', () => {
    let j = recordPageView(null, `${SITE}/p0`, '', T0, 'desktop');
    for (let i = 1; i < 30; i++) j = recordPageView(j, `${SITE}/p${i}`, '', later(i * 1000), 'desktop');
    expect(j.pages).toHaveLength(MAX_STEPS);
    expect(j.pages![0]!.p).toBe('/p10');
  });
});

describe('stored journeys', () => {
  it('reads back what it wrote, and forgets one older than ninety days or one it cannot parse', () => {
    const j = recordPageView(null, `${SITE}/`, '', T0, 'desktop');
    expect(parseStored(JSON.stringify(j), later(1000))).toEqual(j);
    expect(parseStored(JSON.stringify(j), later(91 * 24 * 3600 * 1000))).toBeNull();
    expect(parseStored('{oops', T0)).toBeNull();
    expect(parseStored(null, T0)).toBeNull();
    expect(JOURNEY_KEY).toBe('tls_journey');
  });

  it('records a click only into a journey that exists, and sends it without our bookkeeping', () => {
    expect(recordCta(null, 'pricing-fix-price', '/pos', T0)).toBeNull();
    const j = recordCta(recordPageView(null, `${SITE}/pos`, '', T0, 'desktop'), 'pricing-fix-price', '/pos', later(5000))!;
    expect(j.ctas).toEqual([{ id: 'pricing-fix-price', p: '/pos', at: later(5000).toISOString() }]);
    const sent = forSubmit(j)!;
    expect(sent).not.toHaveProperty('lastSeenAt');
    expect(forSubmit(null)).toBeUndefined();
  });
});

describe('untagged links', () => {
  it('names the links the CRM reads even where nobody tagged them', () => {
    expect(ctaIdForLink('/m/demo-restaurant-menu')).toBe('demo-menu-restaurant');
    expect(ctaIdForLink('/pos#pricing')).toBe('pricing-link');
    expect(ctaIdForLink('/yaku-kasu-obraty')).toBe('compare-link');
    expect(ctaIdForLink('/dovidka')).toBeNull();
    expect(ctaIdForLink(null)).toBeNull();
  });
});

describe('the site and the server agree', () => {
  it('a journey the site builds survives the server unchanged, and reads as the salesperson needs', () => {
    let j = recordPageView(null, `${SITE}/pos/kafe?utm_source=google&utm_campaign=kafe`, 'https://www.google.com/', T0, 'desktop');
    j = recordCta(j, 'pricing-fix-price', '/pos/kafe', later(10_000))!;
    j = recordCta(j, 'download-windows', '/pos', later(20_000))!;
    j = recordPageView(j, `${SITE}/pos`, 'https://chatgpt.com/', later(SESSION_GAP_MS + 1), 'desktop');
    const sent = forSubmit(j);
    const kept = sanitizeJourney(JSON.parse(JSON.stringify(sent)), later(SESSION_GAP_MS + 2));
    expect(kept).toEqual(sent);
    expect(sourceOf(kept.first)).toBe('UTM: google / kafe');
    expect(sourceOf(kept.last)).toBe('AI-асистент: ChatGPT');
    expect(signalsOf(kept)).toEqual(['Дивився ціни', 'Завантажив касу (Windows)', '2-й візит', 'Прийшов з ChatGPT']);
  });
});
