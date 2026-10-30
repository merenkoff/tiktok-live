// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.profile.test.ts — what the guest's menu says
// about the place itself: logo, address, phone, opening hours (migration 059,
// TechDocs/POS_QR_MENU.md phase Q3a). The first half is pure (validation, the
// hours arithmetic, the header markup); the second drives the real POS plugin.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';
import path from 'path';
import { rm } from 'fs/promises';
import type { FastifyInstance } from 'fastify';
import { pool } from '../db.js';
import {
  applyPosMigrations,
  auth,
  buildPosTestApp,
  createTestStore,
  dropTestStore,
  hasDb,
  type TestStore,
} from './helpers/pos-fixtures.js';
import { createProduct } from '../pos/products.service.js';
import { readMigration } from '../pos/migrations.js';
import { POS_UPLOADS_DIR } from '../pos/uploads.service.js';
import {
  invalidatePublicMenu,
  resetPublicMenuCache,
  type MenuTable,
  type PublicMenu,
} from '../pos/public-menu/menu.service.js';
import { corkageCardLine } from '../pos/public-menu/format.js';
import {
  ProfileError,
  groupHours,
  hoursTodayText,
  multiLine,
  normalizeAddress,
  normalizeCorkage,
  normalizeEmail,
  normalizeGoogleUrl,
  normalizeHandle,
  normalizeHours,
  normalizeLogoUrl,
  normalizePhone,
  normalizeProfilePatch,
  phoneHref,
  socialUrl,
  type WeekHours,
} from '../pos/public-menu/profile.js';
import { renderMenuPage, renderQrCard } from '../pos/public-menu/render.js';

const WEEK: WeekHours = {
  '1': { open: '08:00', close: '22:00' },
  '2': { open: '08:00', close: '22:00' },
  '3': { open: '08:00', close: '22:00' },
  '4': { open: '08:00', close: '22:00' },
  '5': { open: '08:00', close: '22:00' },
  '6': { open: '09:00', close: '23:00' },
  '7': { open: '09:00', close: '23:00' },
};

describe('profile validation', () => {
  describe('opening hours', () => {
    it('accepts a full week, and a close after midnight', () => {
      expect(normalizeHours(WEEK)).toEqual(WEEK);
      expect(normalizeHours({ '5': { open: '18:00', close: '02:00' } })).toEqual({ '5': { open: '18:00', close: '02:00' } });
    });

    it('reads null, an empty week and an all-null week as «no hours»', () => {
      expect(normalizeHours(null)).toBeNull();
      expect(normalizeHours({})).toBeNull();
      expect(normalizeHours({ '1': null, '2': null })).toBeNull();
    });

    it('drops a day sent as null: that day is closed', () => {
      expect(normalizeHours({ '1': { open: '08:00', close: '20:00' }, '2': null })).toEqual({
        '1': { open: '08:00', close: '20:00' },
      });
    });

    it.each([
      ['an unknown day', { '8': { open: '08:00', close: '20:00' } }],
      ['day zero', { '0': { open: '08:00', close: '20:00' } }],
      ['a time without its leading zero', { '1': { open: '8:00', close: '20:00' } }],
      ['hour 24', { '1': { open: '08:00', close: '24:00' } }],
      ['minute 60', { '1': { open: '08:60', close: '20:00' } }],
      ['open equal to close', { '1': { open: '08:00', close: '08:00' } }],
      ['a day with no times', { '1': {} }],
      ['a day that is a string', { '1': '08:00-20:00' }],
      ['an array for the week', []],
      ['a string for the week', '08:00-20:00'],
    ])('refuses %s', (_label, value) => {
      expect(() => normalizeHours(value)).toThrow(ProfileError);
    });

    it('names today by the STORE’s calendar, not the server’s', () => {
      // 00:30 on Monday 28 September in Kyiv (UTC+3) is still Sunday evening in UTC.
      const at = new Date('2026-09-27T21:30:00Z');
      const hours: WeekHours = { '1': { open: '08:00', close: '22:00' } };
      expect(hoursTodayText(hours, at, 'Europe/Kyiv')).toBe('08:00–22:00');
      expect(hoursTodayText(hours, at, 'UTC')).toBe('зачинено');
    });

    it('says nothing when the owner gave no hours, and falls back to Kyiv for an unknown zone', () => {
      const at = new Date('2026-09-27T21:30:00Z');
      expect(hoursTodayText(null, at, 'Europe/Kyiv')).toBeNull();
      expect(hoursTodayText({ '1': { open: '08:00', close: '22:00' } }, at, 'Mars/Olympus')).toBe('08:00–22:00');
    });

    it('folds neighbouring days with the same hours into one row', () => {
      expect(groupHours(WEEK)).toEqual([
        { days: 'Пн–Пт', text: '08:00–22:00' },
        { days: 'Сб–Нд', text: '09:00–23:00' },
      ]);
    });

    it('says «Щодня» for a week that never changes, and names a lone day', () => {
      const every: WeekHours = Object.fromEntries(
        ['1', '2', '3', '4', '5', '6', '7'].map((k) => [k, { open: '10:00', close: '20:00' }])
      );
      expect(groupHours(every)).toEqual([{ days: 'Щодня', text: '10:00–20:00' }]);
      expect(groupHours({ '6': { open: '10:00', close: '14:00' } })).toEqual([
        { days: 'Пн–Пт', text: 'зачинено' },
        { days: 'Сб', text: '10:00–14:00' },
        { days: 'Нд', text: 'зачинено' },
      ]);
      expect(groupHours(null)).toEqual([]);
    });

    it('does not treat Sunday and Monday as neighbours', () => {
      const hours: WeekHours = { '1': { open: '10:00', close: '18:00' }, '7': { open: '10:00', close: '18:00' } };
      expect(groupHours(hours)).toEqual([
        { days: 'Пн', text: '10:00–18:00' },
        { days: 'Вт–Сб', text: 'зачинено' },
        { days: 'Нд', text: '10:00–18:00' },
      ]);
    });
  });

  describe('phone', () => {
    it.each(['+380 44 123-45-67', '(044) 123 45 67', '0441234567', '+380441234567', '044.123.45.67'])(
      'keeps %s as typed',
      (phone) => {
        expect(normalizePhone(phone)).toBe(phone);
      }
    );

    it('collapses inner whitespace and reads blank as «none»', () => {
      expect(normalizePhone('  +380   44  123 ')).toBe('+380 44 123');
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
    });

    it.each(['12345', 'call me', '+380 44 12x45', '38+0441234567', '<b>0441234567</b>', '+1234567890123456', 123])(
      'refuses %s',
      (phone) => {
        expect(() => normalizePhone(phone)).toThrow(ProfileError);
      }
    );

    it('builds the tel: address from the digits and a leading plus, nothing else', () => {
      expect(phoneHref('+380 44 123-45-67')).toBe('tel:+380441234567');
      expect(phoneHref('(044) 123 45 67')).toBe('tel:0441234567');
      expect(phoneHref('  +380 44 123 45 67')).toBe('tel:+380441234567');
      expect(phoneHref('call me')).toBeNull();
      expect(phoneHref(null)).toBeNull();
    });
  });

  describe('address', () => {
    it('is one line: breaks and control characters become spaces', () => {
      expect(normalizeAddress('  вул. Прикладна, 1\n\tКиїв\u0000  ')).toBe('вул. Прикладна, 1 Київ');
    });

    it('reads blank as «none», refuses a novel and a non-string', () => {
      expect(normalizeAddress('  ')).toBeNull();
      expect(normalizeAddress(null)).toBeNull();
      expect(() => normalizeAddress('а'.repeat(201))).toThrow(ProfileError);
      expect(normalizeAddress('а'.repeat(200))).toHaveLength(200);
      expect(() => normalizeAddress(5)).toThrow(ProfileError);
    });
  });

  describe('logo', () => {
    it('takes only a path this backend issued', () => {
      expect(normalizeLogoUrl('/pos-uploads/0b0f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png')).toBe(
        '/pos-uploads/0b0f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png'
      );
      expect(normalizeLogoUrl(null)).toBeNull();
    });

    it.each([
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'https://evil.example/logo.png',
      '//evil.example/logo.png',
      '/pos-uploads/../secret.png',
      '/pos-uploads/a/b.png',
      '/pos-uploads/no-extension',
      '/demo-cafe/logo.svg',
      '',
      42,
    ])('refuses %s', (value) => {
      expect(() => normalizeLogoUrl(value)).toThrow(ProfileError);
    });
  });

  describe('email', () => {
    it('keeps an address as typed, trimmed, and reads blank as «none»', () => {
      expect(normalizeEmail('  Privit@Zaklad.UA ')).toBe('Privit@Zaklad.UA');
      expect(normalizeEmail('   ')).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });

    it.each(['privit', 'privit@', '@zaklad.ua', 'privit@zaklad', 'a b@zaklad.ua', 'x@'.padEnd(121, 'a') + '.ua', 7])(
      'refuses %s',
      (value) => {
        expect(() => normalizeEmail(value)).toThrow(ProfileError);
      }
    );
  });

  describe('social handles', () => {
    it('reads «@нік», «нік» and the profile’s own address all as the handle', () => {
      expect(normalizeHandle('shablya.cafe', 'instagram')).toBe('shablya.cafe');
      expect(normalizeHandle('@shablya.cafe', 'instagram')).toBe('shablya.cafe');
      expect(normalizeHandle('https://www.instagram.com/shablya.cafe/', 'instagram')).toBe('shablya.cafe');
      expect(normalizeHandle('https://instagram.com/shablya.cafe?igsh=abc', 'instagram')).toBe('shablya.cafe');
      expect(normalizeHandle('https://www.facebook.com/shablya.cafe/', 'facebook')).toBe('shablya.cafe');
      expect(normalizeHandle('https://m.facebook.com/Shablya-Cafe', 'facebook')).toBe('Shablya-Cafe');
      expect(normalizeHandle('https://www.tiktok.com/@shablya.cafe', 'tiktok')).toBe('shablya.cafe');
      expect(normalizeHandle('@shablya.cafe', 'tiktok')).toBe('shablya.cafe');
      expect(normalizeHandle('  ', 'instagram')).toBeNull();
      expect(normalizeHandle('@', 'instagram')).toBeNull();
      expect(normalizeHandle(null, 'tiktok')).toBeNull();
    });

    it.each([
      ['instagram', 'нік'],
      ['instagram', 'a'.repeat(31)],
      ['instagram', 'has space'],
      ['instagram', 'https://evil.example/instagram.com/x'],
      ['instagram', 'javascript:alert(1)'],
      ['facebook', 'profile.php?id=123'],
      ['facebook', 'a'.repeat(81)],
      ['tiktok', 'a'.repeat(25)],
      ['tiktok', 'x/y'],
      ['instagram', 5],
    ] as const)('refuses %s %s', (network, value) => {
      expect(() => normalizeHandle(value, network)).toThrow(ProfileError);
    });

    it('builds the profile address from the handle, never the other way round', () => {
      expect(socialUrl('instagram', 'shablya.cafe')).toBe('https://www.instagram.com/shablya.cafe/');
      expect(socialUrl('facebook', 'Shablya-Cafe')).toBe('https://www.facebook.com/Shablya-Cafe');
      expect(socialUrl('tiktok', 'shablya.cafe')).toBe('https://www.tiktok.com/@shablya.cafe');
    });
  });

  describe('the Google card link', () => {
    it.each([
      'https://share.google/49kQb5FHbjSlkT7q6',
      'https://maps.app.goo.gl/AbCdEf123',
      'https://www.google.com/maps/place/Шабля/@50.5,29.2,17z/data=!3m1',
      'https://google.com/maps?cid=123',
      'https://search.google.com/local/writereview?placeid=ChIJ123',
      'https://g.page/shablya/review',
      'https://goo.gl/maps/abc',
      'https://www.google.com.ua/maps/place/x',
    ])('takes %s', (url) => {
      expect(normalizeGoogleUrl(` ${url} `)).toBe(url);
    });

    it.each([
      'http://maps.app.goo.gl/AbCdEf123',
      'https://google.com.evil/maps',
      'https://evilgoogle.com/maps',
      'https://notgoogle.com/maps',
      'https://google.evil/maps',
      'https://user:pw@google.com/maps',
      'javascript:alert(1)',
      'maps.app.goo.gl/AbCdEf123',
      'https://google.com/' + 'a'.repeat(300),
      9,
    ])('refuses %s', (value) => {
      expect(() => normalizeGoogleUrl(value)).toThrow(ProfileError);
    });

    it('reads blank as «none»', () => {
      expect(normalizeGoogleUrl('')).toBeNull();
      expect(normalizeGoogleUrl(null)).toBeNull();
    });
  });

  describe('the cork fee', () => {
    it('keeps the two figures as kopecks, reads a zero minimum as none, and tidies the note line by line', () => {
      expect(
        normalizeCorkage({ fee_cents: 10000, min_food_cents: 70000, note: '  Келихи  наші. \r\n\n\n Поважайте\tкоманду ❤️ \n ' })
      ).toEqual({ fee_cents: 10000, min_food_cents: 70000, note: 'Келихи наші.\nПоважайте команду ❤️' });
      expect(normalizeCorkage({ fee_cents: 0, min_food_cents: 0, note: '   ' })).toEqual({
        fee_cents: 0,
        min_food_cents: null,
        note: null,
      });
      expect(normalizeCorkage({ fee_cents: 5000 })).toEqual({ fee_cents: 5000, min_food_cents: null, note: null });
      expect(normalizeCorkage(null)).toBeNull();
      expect(multiLine('a\n\n\nb\r\n  c  ')).toBe('a\nb\nc');
    });

    it.each([
      [{ fee_cents: '100' }, 'a fee as text'],
      [{ fee_cents: 100.5 }, 'a fee with a fraction'],
      [{ fee_cents: -1 }, 'a negative fee'],
      [{ fee_cents: 1_000_001 }, 'a fee over 10 000 ₴'],
      [{ fee_cents: 100, min_food_cents: 'x' }, 'a minimum as text'],
      [{ fee_cents: 100, min_food_cents: 10_000_001 }, 'a minimum over 100 000 ₴'],
      [{ fee_cents: 100, note: 7 }, 'a note that is not text'],
      [{ fee_cents: 100, note: 'а'.repeat(601) }, 'a note over 600'],
      [{}, 'no fee at all'],
      ['100', 'a bare string'],
      [[100], 'a list'],
    ])('refuses %o (%s)', (value) => {
      expect(() => normalizeCorkage(value)).toThrow(ProfileError);
    });

    it('words the figures for the page and the printed card', () => {
      expect(corkageCardLine({ fee_cents: 10000, min_food_cents: 70000, note: null })).toBe(
        'Свій алкоголь — корковий збір 100 ₴ за пляшку, страви від 700 ₴ на гостя'
      );
      expect(corkageCardLine({ fee_cents: 0, min_food_cents: null, note: null })).toBe('Свій алкоголь — без коркового збору');
      expect(corkageCardLine(null)).toBeNull();
    });
  });

  describe('the patch', () => {
    it('carries only the fields that were sent: absent = leave, null = clear', () => {
      expect(normalizeProfilePatch({})).toEqual({});
      expect(normalizeProfilePatch({ phone: '+380 44 123 45 67' })).toEqual({ phone: '+380 44 123 45 67' });
      expect(normalizeProfilePatch({ address: null, hours: null, logo_url: null, phone: null })).toEqual({
        address: null,
        hours: null,
        logo_url: null,
        phone: null,
      });
      expect(
        normalizeProfilePatch({ email: null, instagram: '@x', facebook: null, tiktok: null, google_url: null })
      ).toEqual({ email: null, instagram: 'x', facebook: null, tiktok: null, google_url: null });
    });

    it('refuses the whole patch when one field is bad', () => {
      expect(() => normalizeProfilePatch({ address: 'ok', phone: 'nope' })).toThrow(ProfileError);
      expect(() => normalizeProfilePatch({ email: 'ok@zaklad.ua', google_url: 'https://evil.example' })).toThrow(
        ProfileError
      );
    });
  });
});

describe('the guest page header', () => {
  const store = {
    name: 'Кава <Тут>',
    logo_url: '/pos-uploads/abc.png',
    address: 'вул. Прикладна, 1 & Київ',
    phone: '+380 44 123-45-67',
    hours_today: '08:00–22:00',
    hours: [
      { days: 'Пн–Пт', text: '08:00–22:00' },
      { days: 'Сб–Нд', text: '09:00–23:00' },
    ],
    email: null,
    instagram: null,
    facebook: null,
    tiktok: null,
    google_url: null,
    corkage: null,
    feedback_enabled: false,
  };
  const menuOf = (over: Partial<PublicMenu['store']> = {}): PublicMenu => ({
    store: { ...store, ...over },
    rev: 'a1b2c3d4e5f6',
    store_day: '2026-09-28',
    generated_at: '2026-09-28T10:00:00.000Z',
    categories: [],
  });

  it('shows the logo, the address as a map link, the phone as a tel: link and today’s hours', () => {
    const html = renderMenuPage(menuOf(), 'tok_12345678');
    expect(html).toContain('<img class="logo" src="/pos-uploads/abc.png" width="56" height="56" alt="">');
    // The map link is built by us from the address text, encoded, then escaped for the attribute.
    expect(html).toContain(
      'href="https://www.google.com/maps/search/?api=1&amp;query=%D0%B2%D1%83%D0%BB.%20' // «вул. »
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('вул. Прикладна, 1 &amp; Київ</a>');
    expect(html).toContain('<a href="tel:+380441234567">+380 44 123-45-67</a>');
    expect(html).toContain('<summary>Сьогодні 08:00–22:00</summary>');
    expect(html).toContain('<li><span>Пн–Пт</span><b>08:00–22:00</b></li>');
    expect(html).toContain('<li><span>Сб–Нд</span><b>09:00–23:00</b></li>');
    // The store name still leads, escaped.
    expect(html).toContain('<h1>Кава &lt;Тут&gt;</h1>');
  });

  it('escapes what an owner typed — and a phone can only ever be digits in the link', () => {
    const html = renderMenuPage(
      menuOf({ address: '<script>alert(1)</script>', phone: '"><b>+38 044 1234567', logo_url: '/x.png?"onerror="alert(1)' }),
      'tok_12345678'
    );
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // Only a LEADING «+» survives into the link; this one is mid-string, junk before it is dropped.
    expect(html).toContain('href="tel:380441234567"');
    expect(html).not.toContain('"><b>');
    expect(html).not.toContain('onerror="alert');
    expect(html.match(/<script/g)).toHaveLength(1); // only the static menu.js
  });

  it('prints nothing for what the owner left empty, and the bare header is what it always was', () => {
    const html = renderMenuPage(
      menuOf({ logo_url: null, address: null, phone: null, hours_today: null, hours: [] }),
      'tok_12345678'
    );
    expect(html).not.toContain('class="logo"');
    expect(html).not.toContain('class="contacts"');
    expect(html).toContain('<h1>Кава &lt;Тут&gt;</h1><p class="sub">Меню</p>');
  });

  it('says «зачинено» today without hiding the week', () => {
    const html = renderMenuPage(menuOf({ hours_today: 'зачинено' }), 'tok_12345678');
    expect(html).toContain('<summary>Сьогодні зачинено</summary>');
  });

  it('prints a week that never changes as one line, with no fold-out', () => {
    const html = renderMenuPage(
      menuOf({ hours_today: '10:00–20:00', hours: [{ days: 'Щодня', text: '10:00–20:00' }] }),
      'tok_12345678'
    );
    expect(html).toContain('<li class="c-hours">Щодня 10:00–20:00</li>');
    expect(html).not.toContain('<details><summary>Сьогодні');
  });

  it('draws the links row from handles and the mailbox, and «На карті» from the address when there is no Google card', () => {
    const html = renderMenuPage(
      menuOf({ email: 'privit@zaklad.ua', instagram: 'shablya.cafe', facebook: 'Shablya-Cafe', tiktok: 'shablya' }),
      'tok_12345678'
    );
    expect(html).toContain('<ul class="links" aria-label="Посилання закладу">');
    // The map chip and the address link point at the same place.
    expect(html).toContain(
      '<li class="l-map"><a href="https://www.google.com/maps/search/?api=1&amp;query=%D0%B2%D1%83%D0%BB.%20'
    );
    expect(html).toContain('<li class="l-instagram"><a href="https://www.instagram.com/shablya.cafe/" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain('<li class="l-facebook"><a href="https://www.facebook.com/Shablya-Cafe" target="_blank" rel="noopener noreferrer">');
    expect(html).toContain('<li class="l-tiktok"><a href="https://www.tiktok.com/@shablya" target="_blank" rel="noopener noreferrer">');
    // The mailbox opens the mail app in place, so no new tab.
    expect(html).toContain('<li class="l-mail"><a href="mailto:privit@zaklad.ua"><svg');
    expect(html).toContain('<span>На карті</span>');
    expect(html).toContain('<span>Пошта</span>');
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('points «На карті» and the address at the Google card when the owner gave one', () => {
    const html = renderMenuPage(menuOf({ google_url: 'https://maps.app.goo.gl/AbC123' }), 'tok_12345678');
    expect(html).toContain('<li class="c-addr"><a href="https://maps.app.goo.gl/AbC123" target="_blank"');
    expect(html).toContain('<li class="l-map"><a href="https://maps.app.goo.gl/AbC123" target="_blank"');
    expect(html).not.toContain('maps/search/?api=1');
    // A card and no address still gives the map chip.
    const bare = renderMenuPage(
      menuOf({ address: null, phone: null, hours_today: null, hours: [], logo_url: null, google_url: 'https://g.page/x' }),
      'tok_12345678'
    );
    expect(bare).not.toContain('class="contacts"');
    expect(bare).toContain('<li class="l-map"><a href="https://g.page/x"');
  });

  it('puts the cork fee between the header and the first category, with the note behind «Умови»', () => {
    const corkage = { fee_cents: 10000, min_food_cents: 70000, note: 'Келихи <наші>.\nПоважайте команду ❤️' };
    const html = renderMenuPage(menuOf({ corkage }), 'tok_12345678');
    const rules = html.indexOf('<section class="rules" aria-label="Правила закладу">');
    expect(rules).toBeGreaterThan(html.indexOf('</header>'));
    expect(rules).toBeLessThan(html.indexOf('<main>'));
    expect(html).toContain(
      '<span class="corkage-text"><b>Свій алкоголь:</b> +100 ₴ за пляшку · страви від 700 ₴ на гостя</span><span class="corkage-more">Умови</span></summary>'
    );
    // The note keeps its line break as text (pre-line), never as markup; what the owner typed is escaped.
    expect(html).toContain('<p class="corkage-note">Келихи &lt;наші&gt;.\nПоважайте команду ❤️</p>');
    expect(html).not.toContain('<br');
  });

  it('draws the fee without a fold-out when there is no note, says «без збору» for a free one, and nothing when there is none', () => {
    const plain = renderMenuPage(menuOf({ corkage: { fee_cents: 5000, min_food_cents: null, note: null } }), 'tok_12345678');
    expect(plain).toContain('<p class="corkage"><svg');
    expect(plain).toContain('<b>Свій алкоголь:</b> +50 ₴ за пляшку</span></p>');
    expect(plain).not.toContain('<details class="corkage">');
    const free = renderMenuPage(menuOf({ corkage: { fee_cents: 0, min_food_cents: 50000, note: null } }), 'tok_12345678');
    expect(free).toContain('<b>Свій алкоголь:</b> без збору · страви від 500 ₴ на гостя</span>');
    expect(renderMenuPage(menuOf(), 'tok_12345678')).not.toContain('class="rules"');
  });

  it('says once in the table’s bill that the fee is added, and only when there is a fee', () => {
    const table: MenuTable = { id: 5, name: '5', hall: 'Зал' };
    const paid = renderMenuPage(
      menuOf({ corkage: { fee_cents: 10000, min_food_cents: null, note: null } }),
      'tok_12345678',
      table,
      { bill: true }
    );
    expect(paid).toContain('<p class="bill-corkage"><svg');
    expect(paid).toContain('<span>Свій алкоголь: +100 ₴ за пляшку — додається до рахунку</span></p>');
    const free = renderMenuPage(
      menuOf({ corkage: { fee_cents: 0, min_food_cents: null, note: null } }),
      'tok_12345678',
      table,
      { bill: true }
    );
    expect(free).not.toContain('bill-corkage');
    expect(renderMenuPage(menuOf(), 'tok_12345678', table, { bill: true })).not.toContain('bill-corkage');
  });

  it('prints one small line about the fee on the QR card when asked to, escaped', () => {
    const card = renderQrCard('Кафе', 'tok_12345678', null, { corkage: 'Свій алкоголь — корковий збір 100 ₴ за пляшку <b>' });
    expect(card).toContain('<p class="rule">Свій алкоголь — корковий збір 100 ₴ за пляшку &lt;b&gt;</p>');
    expect(renderQrCard('Кафе', 'tok_12345678')).not.toContain('class="rule"');
  });

  it('draws «На карті» alone for a store with only an address, and no row at all without one', () => {
    const withAddress = renderMenuPage(menuOf(), 'tok_12345678');
    expect(withAddress).toContain('<ul class="links" aria-label="Посилання закладу"><li class="l-map">');
    expect(withAddress.match(/<li class="l-/g)).toHaveLength(1);
    const html = renderMenuPage(menuOf({ address: null }), 'tok_12345678');
    expect(html).not.toContain('class="links"');
  });
});

describe.skipIf(!hasDb)('POS store profile through the API', () => {
  let app: FastifyInstance;
  let cafe: TestStore;
  let boutique: TestStore;
  let token = '';
  const uploaded: string[] = [];

  const profile = (bearer: string) =>
    app.inject({ method: 'GET', url: '/api/pos/store/profile', headers: auth(bearer) });
  const patch = (payload: Record<string, unknown>, bearer = cafe.ownerToken) =>
    app.inject({ method: 'PATCH', url: '/api/pos/store/profile', headers: auth(bearer), payload });
  const menu = async () =>
    (await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` })).json() as PublicMenu;
  const page = () => app.inject({ method: 'GET', url: `/m/${token}` });
  const upload = (bearer: string, body: Buffer, contentType = 'image/png', filename = 'logo.png') => {
    const boundary = '----profileTestBoundary1234';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`
    );
    return app.inject({
      method: 'POST',
      url: '/api/pos/store/logo',
      headers: { ...auth(bearer), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([head, body, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    });
  };

  beforeAll(async () => {
    await applyPosMigrations();
    app = await buildPosTestApp();
    cafe = await createTestStore('profile');
    boutique = await createTestStore('profile2');
    await pool.query(`UPDATE pos_stores SET vertical = 'cafe' WHERE id = $1`, [cafe.storeId]);
    await createProduct(cafe.storeId, {
      name: 'Чай',
      variants: [{ attributes: {}, price_cents: 4000, quantity: 10 }],
    });
    const on = await app.inject({
      method: 'PATCH',
      url: '/api/pos/store/public-menu',
      headers: auth(cafe.ownerToken),
      payload: { enabled: true },
    });
    token = on.json().token;
  }, 60000);

  afterAll(async () => {
    await app?.close();
    for (const store of [cafe, boutique]) if (store) await dropTestStore(store.storeId);
    await Promise.all(uploaded.map((f) => rm(path.join(POS_UPLOADS_DIR, f), { force: true })));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('who may', () => {
    it('lets only the owner read or write it', async () => {
      expect((await profile(cafe.sellerToken)).statusCode).toBe(403);
      expect((await patch({ phone: '+380 44 123 45 67' }, cafe.sellerToken)).statusCode).toBe(403);
      expect((await upload(cafe.sellerToken, Buffer.from('x'))).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/pos/store/profile' })).statusCode).toBe(401);
    });

    it('starts empty, and says whether this kind of store has a menu to put it on', async () => {
      expect((await profile(cafe.ownerToken)).json()).toEqual({
        available: true,
        logo_url: null,
        address: null,
        phone: null,
        hours: null,
        email: null,
        instagram: null,
        facebook: null,
        tiktok: null,
        google_url: null,
        corkage: null,
      });
      expect((await profile(boutique.ownerToken)).json().available).toBe(false);
    });

    it('refuses to write a store that has no kitchen, with the menu’s own 409', async () => {
      const res = await patch({ address: 'вул. Одягова, 1' }, boutique.ownerToken);
      expect(res.statusCode).toBe(409);
      const row = await pool.query(`SELECT public_address FROM pos_stores WHERE id = $1`, [boutique.storeId]);
      expect(row.rows[0].public_address).toBeNull();
    });
  });

  describe('saving', () => {
    it('refuses an empty body and every bad value with a 400 the card can show', async () => {
      expect((await patch({})).statusCode).toBe(400);
      for (const bad of [
        { phone: 'call me' },
        { address: 'а'.repeat(201) },
        { hours: { '1': { open: '9', close: '10' } } },
        { logo_url: 'https://evil.example/x.png' },
        { logo_url: 'javascript:alert(1)' },
      ]) {
        const res = await patch(bad);
        expect(res.statusCode, JSON.stringify(bad)).toBe(400);
        expect(typeof res.json().error).toBe('string');
      }
    });

    it('writes nothing when one field of the patch is bad', async () => {
      const res = await patch({ address: 'вул. Не збережена, 9', phone: 'nope' });
      expect(res.statusCode).toBe(400);
      expect((await profile(cafe.ownerToken)).json().address).toBeNull();
    });

    it('round-trips every field, leaves the unsent ones alone and clears on null', async () => {
      const saved = await patch({
        address: '  м. Київ,   вул. Прикладна, 1 ',
        phone: '+380 44 123-45-67',
        hours: WEEK,
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toEqual({
        available: true,
        logo_url: null,
        address: 'м. Київ, вул. Прикладна, 1',
        phone: '+380 44 123-45-67',
        hours: WEEK,
        email: null,
        instagram: null,
        facebook: null,
        tiktok: null,
        google_url: null,
        corkage: null,
      });

      // A card that only changed the phone must not wipe the rest by not mentioning it.
      const phoneOnly = await patch({ phone: '+380 44 999-99-99' });
      expect(phoneOnly.json()).toMatchObject({
        address: 'м. Київ, вул. Прикладна, 1',
        phone: '+380 44 999-99-99',
        hours: WEEK,
      });

      const cleared = await patch({ address: null, hours: null });
      expect(cleared.json()).toMatchObject({ address: null, hours: null, phone: '+380 44 999-99-99' });
      expect((await profile(cafe.ownerToken)).json()).toEqual(cleared.json());

      await patch({ phone: null });
      expect((await profile(cafe.ownerToken)).json()).toMatchObject({ phone: null });
    });

    it('round-trips the mailbox, the handles (read down from pasted addresses) and the Google card', async () => {
      const saved = await patch({
        email: ' privit@zaklad.ua ',
        instagram: 'https://www.instagram.com/shablya.cafe/',
        facebook: '@Shablya-Cafe',
        tiktok: 'https://www.tiktok.com/@shablya',
        google_url: 'https://share.google/49kQb5FHbjSlkT7q6',
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({
        email: 'privit@zaklad.ua',
        instagram: 'shablya.cafe',
        facebook: 'Shablya-Cafe',
        tiktok: 'shablya',
        google_url: 'https://share.google/49kQb5FHbjSlkT7q6',
      });
      const guest = (await menu()).store;
      expect(guest).toMatchObject({
        email: 'privit@zaklad.ua',
        instagram: 'shablya.cafe',
        facebook: 'Shablya-Cafe',
        tiktok: 'shablya',
        google_url: 'https://share.google/49kQb5FHbjSlkT7q6',
      });
      const html = (await page()).body;
      expect(html).toContain('<li class="l-map"><a href="https://share.google/49kQb5FHbjSlkT7q6"');
      expect(html).toContain('href="https://www.instagram.com/shablya.cafe/"');
      expect(html).toContain('href="mailto:privit@zaklad.ua"');

      // One bad value refuses the whole patch, in the card's words.
      const bad = await patch({ email: 'ok@zaklad.ua', google_url: 'https://evil.example/maps' });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toContain('Google');
      expect((await profile(cafe.ownerToken)).json().email).toBe('privit@zaklad.ua');

      const cleared = await patch({ email: null, instagram: null, facebook: null, tiktok: null, google_url: null });
      expect(cleared.json()).toMatchObject({ email: null, instagram: null, facebook: null, tiktok: null, google_url: null });
      expect((await page()).body).not.toContain('class="links"');
    });

    it('round-trips the cork fee, shows it to the guest at once, refuses a bad one whole and clears on null', async () => {
      const saved = await patch({
        corkage: { fee_cents: 10000, min_food_cents: 70000, note: ' Келихи наші. \n\n Поважайте команду ❤️ ' },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().corkage).toEqual({
        fee_cents: 10000,
        min_food_cents: 70000,
        note: 'Келихи наші.\nПоважайте команду ❤️',
      });
      expect((await menu()).store.corkage).toEqual(saved.json().corkage);
      const html = (await page()).body;
      expect(html).toContain('<b>Свій алкоголь:</b> +100 ₴ за пляшку · страви від 700 ₴ на гостя</span>');
      expect(html).toContain('<p class="corkage-note">Келихи наші.\nПоважайте команду ❤️</p>');
      // The printed cards carry it on their next print.
      const card = await app.inject({ method: 'GET', url: `/m/${token}/qr` });
      expect(card.body).toContain('<p class="rule">Свій алкоголь — корковий збір 100 ₴ за пляшку, страви від 700 ₴ на гостя</p>');

      const bad = await patch({ email: 'ok@zaklad.ua', corkage: { fee_cents: -5 } });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error).toContain('Корковий збір');
      expect((await profile(cafe.ownerToken)).json().corkage?.fee_cents).toBe(10000);

      const off = await patch({ corkage: null });
      expect(off.json().corkage).toBeNull();
      expect((await page()).body).not.toContain('class="rules"');
      expect((await app.inject({ method: 'GET', url: `/m/${token}/qr` })).body).not.toContain('class="rule"');
    });

    it('reads a hand-written row that no longer passes as «not shown»', async () => {
      await pool.query(`UPDATE pos_stores SET public_corkage = '{"fee_cents":"a lot"}'::jsonb WHERE id = $1`, [cafe.storeId]);
      invalidatePublicMenu(cafe.storeId);
      expect((await menu()).store.corkage).toBeNull();
      expect((await profile(cafe.ownerToken)).json().corkage).toBeNull();
      await pool.query(`UPDATE pos_stores SET public_corkage = NULL WHERE id = $1`, [cafe.storeId]);
      invalidatePublicMenu(cafe.storeId);
    });

    it('never puts a hand-written row’s bad Google link on the page', async () => {
      await pool.query(`UPDATE pos_stores SET public_google_url = 'javascript:alert(1)' WHERE id = $1`, [cafe.storeId]);
      invalidatePublicMenu(cafe.storeId);
      expect((await menu()).store.google_url).toBeNull();
      expect((await page()).body).not.toContain('javascript:');
      await pool.query(`UPDATE pos_stores SET public_google_url = NULL WHERE id = $1`, [cafe.storeId]);
      invalidatePublicMenu(cafe.storeId);
    });
  });

  describe('the logo', () => {
    it('stores an upload without making it the logo until the profile says so', async () => {
      const res = await upload(cafe.ownerToken, Buffer.from('fake-png-bytes'));
      expect(res.statusCode).toBe(201);
      const { url, filename } = res.json();
      uploaded.push(filename);
      expect(url).toBe(`/pos-uploads/${filename}`);
      expect((await profile(cafe.ownerToken)).json().logo_url).toBeNull();

      const saved = await patch({ logo_url: url });
      expect(saved.json().logo_url).toBe(url);
      expect((await menu()).store.logo_url).toBe(url);
      expect((await page()).body).toContain(`<img class="logo" src="${url}" width="56" height="56" alt="">`);

      await patch({ logo_url: null });
      expect((await menu()).store.logo_url).toBeNull();
    });

    it('refuses what is not a picture, and a request with no file', async () => {
      expect((await upload(cafe.ownerToken, Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg')).statusCode).toBe(400);
      expect((await upload(cafe.ownerToken, Buffer.from('x'), 'text/html', 'x.html')).statusCode).toBe(400);
      const none = await app.inject({
        method: 'POST',
        url: '/api/pos/store/logo',
        headers: { ...auth(cafe.ownerToken), 'content-type': 'multipart/form-data; boundary=x' },
        payload: '--x--\r\n',
      });
      expect(none.statusCode).toBe(400);
    });
  });

  describe('on the guest’s page', () => {
    it('has no profile until the owner writes one, and the header is as it was', async () => {
      const bare = await menu();
      const stored = await pool.query(`SELECT name FROM pos_stores WHERE id = $1`, [cafe.storeId]);
      expect(bare.store).toEqual({
        name: stored.rows[0].name,
        logo_url: null,
        address: null,
        phone: null,
        hours_today: null,
        hours: [],
        email: null,
        instagram: null,
        facebook: null,
        tiktok: null,
        google_url: null,
        corkage: null,
        feedback_enabled: false,
      });
      const html = (await page()).body;
      expect(html).not.toContain('class="contacts"');
      expect(html).not.toContain('class="links"');
      expect(html).not.toContain('class="logo"');
    });

    it('names exactly these keys in the store, and nothing internal', async () => {
      await patch({ address: 'вул. Ключова, 1', phone: '+380 44 123 45 67', hours: WEEK });
      const res = await app.inject({ method: 'GET', url: `/api/pos/public/menu/${token}` });
      const body = res.json() as PublicMenu;
      expect(Object.keys(body.store).sort()).toEqual([
        'address',
        'corkage',
        'email',
        'facebook',
        'feedback_enabled',
        'google_url',
        'hours',
        'hours_today',
        'instagram',
        'logo_url',
        'name',
        'phone',
        'tiktok',
      ]);
      expect(res.body).not.toContain('public_');
      expect(res.body).not.toContain('secret');
      expect(res.body).not.toContain('timezone');
    });

    it('shows a change at once — the 15 s cache is dropped by the save', async () => {
      await patch({ address: 'вул. Стара, 1' });
      expect((await menu()).store.address).toBe('вул. Стара, 1');
      await patch({ address: 'вул. Нова, 2' });
      expect((await menu()).store.address).toBe('вул. Нова, 2');
      expect((await page()).body).toContain('вул. Нова, 2</a>');
    });

    it('shows a renamed store at once as well: PATCH /store drops the cache too', async () => {
      await menu();
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/pos/store',
        headers: auth(cafe.ownerToken),
        payload: { name: 'Перейменована кав’ярня' },
      });
      expect(res.statusCode).toBe(200);
      expect((await menu()).store.name).toBe('Перейменована кав’ярня');
      expect((await page()).body).toContain('<h1>Перейменована кав’ярня</h1>');
    });

    it('escapes what an owner typed, links the phone by its digits and builds the map link itself', async () => {
      await patch({ address: '<script>alert(1)</script> "x"', phone: '+380 (44) 123-45-67' });
      const html = (await page()).body;
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot;');
      expect(html).toContain('href="tel:+380441234567"');
      expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=');
      expect(html.match(/<script/g)).toHaveLength(1);
    });

    it('computes today’s hours on the store’s calendar', async () => {
      await pool.query(`UPDATE pos_stores SET timezone = 'Europe/Kyiv' WHERE id = $1`, [cafe.storeId]);
      await patch({ hours: { '1': { open: '08:00', close: '22:00' } } });
      invalidatePublicMenu(cafe.storeId);
      vi.useFakeTimers({ toFake: ['Date'] });
      // Monday 00:30 in Kyiv is still Sunday in UTC.
      vi.setSystemTime(new Date('2026-09-27T21:30:00Z'));
      expect((await menu()).store.hours_today).toBe('08:00–22:00');
      vi.useRealTimers();

      resetPublicMenuCache();
      await pool.query(`UPDATE pos_stores SET timezone = 'UTC' WHERE id = $1`, [cafe.storeId]);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-27T21:30:00Z'));
      expect((await menu()).store.hours_today).toBe('зачинено');
      await pool.query(`UPDATE pos_stores SET timezone = 'Europe/Kyiv' WHERE id = $1`, [cafe.storeId]);
    });
  });

  describe('migration 059', () => {
    it('is safe to apply again and leaves what an owner wrote alone', async () => {
      await patch({ address: 'вул. Власна, 7' });
      await pool.query(readMigration('059_pos_store_public_profile.sql'));
      await pool.query(readMigration('059_pos_store_public_profile.sql'));
      expect((await profile(cafe.ownerToken)).json().address).toBe('вул. Власна, 7');
    });

    it('fills a demo café that has said nothing yet — once — and never over its owner’s words', async () => {
      const demo = await pool.query(
        `SELECT id, public_logo_url, public_address, public_phone, public_hours FROM pos_stores WHERE slug = 'demo-cafe'`
      );
      if (demo.rows.length === 0) return;
      const original = demo.rows[0];
      try {
        await pool.query(
          `UPDATE pos_stores SET public_logo_url = NULL, public_address = NULL, public_phone = NULL, public_hours = NULL WHERE id = $1`,
          [original.id]
        );
        await pool.query(readMigration('059_pos_store_public_profile.sql'));
        const filled = await pool.query(
          `SELECT public_logo_url, public_address, public_phone, public_hours FROM pos_stores WHERE id = $1`,
          [original.id]
        );
        expect(filled.rows[0].public_logo_url).toBe('/demo-cafe/logo.svg');
        expect(filled.rows[0].public_address).toBeTruthy();
        expect(normalizeHours(filled.rows[0].public_hours)).not.toBeNull();

        await pool.query(`UPDATE pos_stores SET public_address = 'вул. Власника, 3', public_phone = NULL WHERE id = $1`, [
          original.id,
        ]);
        await pool.query(readMigration('059_pos_store_public_profile.sql'));
        const kept = await pool.query(`SELECT public_address, public_phone FROM pos_stores WHERE id = $1`, [original.id]);
        expect(kept.rows[0]).toEqual({ public_address: 'вул. Власника, 3', public_phone: null });
      } finally {
        await pool.query(
          `UPDATE pos_stores SET public_logo_url = $2, public_address = $3, public_phone = $4, public_hours = $5 WHERE id = $1`,
          [original.id, original.public_logo_url, original.public_address, original.public_phone, original.public_hours]
        );
        invalidatePublicMenu(Number(original.id));
      }
    });
  });

  describe('migration 082', () => {
    it('is safe to apply again and leaves what an owner wrote alone', async () => {
      await patch({ instagram: 'vlasnyk' });
      await pool.query(readMigration('082_pos_store_public_socials.sql'));
      await pool.query(readMigration('082_pos_store_public_socials.sql'));
      expect((await profile(cafe.ownerToken)).json().instagram).toBe('vlasnyk');
      await patch({ instagram: null });
    });

    it('gives a demo café that has said nothing an email and a handle — and never over its owner’s words', async () => {
      const demo = await pool.query(
        `SELECT id, public_email, public_instagram, public_facebook, public_tiktok, public_google_url
           FROM pos_stores WHERE slug = 'demo-cafe'`
      );
      if (demo.rows.length === 0) return;
      const original = demo.rows[0];
      const restore = () =>
        pool.query(
          `UPDATE pos_stores SET public_email = $2, public_instagram = $3, public_facebook = $4, public_tiktok = $5,
                  public_google_url = $6 WHERE id = $1`,
          [
            original.id,
            original.public_email,
            original.public_instagram,
            original.public_facebook,
            original.public_tiktok,
            original.public_google_url,
          ]
        );
      try {
        await pool.query(
          `UPDATE pos_stores SET public_email = NULL, public_instagram = NULL, public_facebook = NULL,
                  public_tiktok = NULL, public_google_url = NULL WHERE id = $1`,
          [original.id]
        );
        await pool.query(readMigration('082_pos_store_public_socials.sql'));
        const filled = await pool.query(`SELECT public_email, public_instagram FROM pos_stores WHERE id = $1`, [original.id]);
        expect(filled.rows[0]).toEqual({ public_email: 'demo-cafe@the-live.shop', public_instagram: 'demo_cafe_the_live_shop' });

        await pool.query(`UPDATE pos_stores SET public_instagram = NULL, public_tiktok = 'vlasnyk' WHERE id = $1`, [original.id]);
        await pool.query(readMigration('082_pos_store_public_socials.sql'));
        const kept = await pool.query(`SELECT public_instagram, public_tiktok FROM pos_stores WHERE id = $1`, [original.id]);
        expect(kept.rows[0]).toEqual({ public_instagram: null, public_tiktok: 'vlasnyk' });
      } finally {
        await restore();
        invalidatePublicMenu(Number(original.id));
      }
    });
  });

  // No «apply 083 again» case HERE: that file alters two tables in one
  // statement (pos_products, then pos_stores), and re-applying it on the
  // shared database while another file's sale holds a row lock on both is a
  // deadlock, not a wait (CI, 2026-10-30). Re-application and the one-time
  // «Шабля» fill are proven on the scratch database by
  // pos.migrations-idempotent.test.ts.
});
