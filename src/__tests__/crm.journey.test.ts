// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/crm.journey.test.ts — the visitor's journey as the server
// keeps it, and how a salesperson reads it (TechDocs/CRM_LEADS.md «Якорі»).
// Pure: no database.

import { describe, expect, it } from 'vitest';
import { cleanPath, cleanReferrer, sanitizeJourney } from '../crm/journey.js';
import { assistantOf, daysToLead, signalsOf, sourceOf } from '../crm/sources.js';
import { cleanLeadInput, normalizePhone } from '../crm/leads.service.js';

const NOW = Date.parse('2026-10-24T12:00:00Z');

describe('sanitizeJourney', () => {
  it('keeps what the site sends and nothing else', () => {
    const journey = sanitizeJourney(
      {
        first: {
          at: '2026-10-20T09:00:00Z',
          ref: 'https://www.google.com/search?q=каса+для+кафе&client=x',
          landing: '/pos/kafe?utm_source=google#pricing',
          utm: { source: 'google', medium: 'cpc', campaign: 'kafe', evil: 'x' },
          click: { gclid: 'abc', other: 'nope' },
          extra: 'dropped',
        },
        visits: 3,
        firstVisitAt: '2026-10-20T09:00:00Z',
        pages: [{ p: '/pos/kafe' }, { p: '//evil.example/' }, { p: 'no-slash' }, { p: '/dovidka/a', at: 'nonsense' }],
        ctas: [{ id: 'pricing-fix', p: '/pos' }, { id: 'BAD ID', p: '/pos' }],
        device: 'tablet',
        secret: { token: 'x' },
      },
      NOW
    );
    expect(journey).toEqual({
      first: {
        at: '2026-10-20T09:00:00.000Z',
        // The query — a search phrase, a token — never stays.
        ref: 'www.google.com/search',
        landing: '/pos/kafe',
        utm: { source: 'google', medium: 'cpc', campaign: 'kafe' },
        click: { gclid: 'abc' },
      },
      visits: 3,
      firstVisitAt: '2026-10-20T09:00:00.000Z',
      pages: [{ p: '/pos/kafe' }, { p: '/dovidka/a' }],
      ctas: [{ id: 'pricing-fix', p: '/pos' }],
    });
  });

  it('caps the lists at the last twenty steps and cuts long strings', () => {
    const pages = Array.from({ length: 50 }, (_, i) => ({ p: `/p${i}` }));
    const journey = sanitizeJourney({ pages, first: { utm: { campaign: 'x'.repeat(500) } } }, NOW);
    expect(journey.pages).toHaveLength(20);
    expect(journey.pages![0]!.p).toBe('/p30');
    expect(journey.first!.utm!.campaign).toHaveLength(100);
  });

  it('drops a date a year back or a day ahead, and a visit count that is not one', () => {
    const journey = sanitizeJourney(
      { firstVisitAt: '2024-01-01T00:00:00Z', last: { at: '2026-11-01T00:00:00Z' }, visits: -2 },
      NOW
    );
    expect(journey).toEqual({});
  });

  it('reads junk as an empty journey rather than refusing the lead', () => {
    for (const junk of [null, undefined, 'str', 42, [1, 2], { first: 'x', pages: 'x' }]) {
      expect(sanitizeJourney(junk, NOW)).toEqual({});
    }
  });

  it('strips control characters', () => {
    expect(sanitizeJourney({ first: { utm: { source: 'goo\u0000gle\n' } } }, NOW).first!.utm!.source).toBe('google');
  });

  it('reads a path and a referrer the way it stores them', () => {
    expect(cleanPath('/pos?x=1#y')).toBe('/pos');
    expect(cleanPath('https://x')).toBeUndefined();
    expect(cleanReferrer('t.me/liveshop?start=1')).toBe('t.me/liveshop');
    expect(cleanReferrer('https://chatgpt.com/')).toBe('chatgpt.com');
    expect(cleanReferrer('not a url at all with spaces')).toBeUndefined();
  });
});

describe('sourceOf', () => {
  it('names a paid click first, then a campaign, then the referrer', () => {
    expect(sourceOf({ click: { gclid: 'g' }, utm: { source: 'newsletter' } })).toBe('Google Ads');
    expect(sourceOf({ click: { ttclid: 't' } })).toBe('TikTok (реклама)');
    expect(sourceOf({ utm: { source: 'fb', campaign: 'kafe-oct' } })).toBe('UTM: fb / kafe-oct');
    expect(sourceOf({ click: { fbclid: 'f' } })).toBe('Facebook / Instagram');
    expect(sourceOf({ ref: 'www.google.com.ua/search' })).toBe('Google (пошук)');
    expect(sourceOf({ ref: 'l.instagram.com' })).toBe('Facebook / Instagram');
    expect(sourceOf({ ref: 't.me/somechannel' })).toBe('Telegram');
    expect(sourceOf({ ref: 'forum.example.com/thread' })).toBe('Сайт: forum.example.com');
  });

  it('tells an AI assistant from a search engine — Gemini lives on google.com', () => {
    expect(sourceOf({ ref: 'chatgpt.com' })).toBe('AI-асистент: ChatGPT');
    expect(sourceOf({ ref: 'gemini.google.com/app' })).toBe('AI-асистент: Gemini');
    expect(sourceOf({ ref: 'www.perplexity.ai/search' })).toBe('AI-асистент: Perplexity');
    expect(assistantOf('www.google.com')).toBeUndefined();
  });

  it('reads our own pages and no referrer as a direct visit', () => {
    expect(sourceOf({ ref: 'the-live.shop/pos' })).toBe('Пряме');
    expect(sourceOf({ landing: '/pos' })).toBe('Пряме');
    expect(sourceOf(undefined)).toBe('Невідомо');
  });
});

describe('signalsOf', () => {
  it('turns what the visitor did into chips worth a call first', () => {
    expect(
      signalsOf({
        first: { ref: 'chatgpt.com' },
        visits: 3,
        pages: [{ p: '/pos/kafe' }, { p: '/dovidka/kavapp-chy-liveshop-dlya-kavyarni' }],
        ctas: [
          { id: 'pricing-fix-price' },
          { id: 'download-windows' },
          { id: 'download-windows' },
          { id: 'demo-menu-kafe' },
        ],
      })
    ).toEqual([
      'Дивився ціни',
      'Порівнював з конкурентами',
      'Завантажив касу (Windows)',
      'Відкривав демо-меню',
      '3-й візит',
      'Прийшов з ChatGPT',
    ]);
  });

  it('says nothing about a visitor who did nothing', () => {
    expect(signalsOf({ visits: 1, pages: [{ p: '/pos' }] })).toEqual([]);
  });

  it('counts the comparison page itself', () => {
    expect(signalsOf({ pages: [{ p: '/yaku-kasu-obraty' }] })).toEqual(['Порівнював з конкурентами']);
  });
});

describe('daysToLead', () => {
  it('counts whole days from the first visit, and null when unknown', () => {
    const sent = new Date('2026-10-24T12:00:00Z');
    expect(daysToLead({ firstVisitAt: '2026-10-20T13:00:00Z' }, sent)).toBe(3);
    expect(daysToLead({ first: { at: '2026-10-24T11:00:00Z' } }, sent)).toBe(0);
    expect(daysToLead({}, sent)).toBeNull();
  });
});

describe('cleanLeadInput', () => {
  it('refuses only a phone it cannot read; everything else degrades to null', () => {
    expect(() => cleanLeadInput({ phone: '12' })).toThrow(/Невірний формат номера/);
    expect(cleanLeadInput({ phone: '067 123 45 67', form_id: 'BAD ID', intent: 'buy', product: 'cars' })).toMatchObject({
      phone: '+380671234567',
      name: null,
      formId: 'unknown',
      intent: null,
      product: null,
      business: null,
      pagePath: null,
      journey: {},
    });
    expect(
      cleanLeadInput({
        phone: '+380671234567',
        name: '  Сергій   Петрович ',
        form_id: 'vertical-kafe',
        intent: 'demo',
        product: 'kafe',
        business: 'other',
        page_path: '/pos/kafe?x=1',
      })
    ).toMatchObject({
      name: 'Сергій Петрович',
      formId: 'vertical-kafe',
      intent: 'demo',
      product: 'kafe',
      business: 'other',
      pagePath: '/pos/kafe',
    });
  });

  it('refuses a name longer than a name', () => {
    expect(() => cleanLeadInput({ phone: '0671234567', name: 'x'.repeat(81) })).toThrow(/довше за 80/);
  });

  it('reads Ukrainian phones however they are typed', () => {
    expect(normalizePhone('0671234567')).toBe('+380671234567');
    expect(normalizePhone('80671234567')).toBe('+380671234567');
    expect(normalizePhone('+38 (067) 123-45-67')).toBe('+380671234567');
    expect(normalizePhone('12345')).toBeNull();
  });
});
