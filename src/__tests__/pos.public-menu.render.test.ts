// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/__tests__/pos.public-menu.render.test.ts — the guest menu's pure half:
// the till's wording and money, the escaping, the category rules and the
// pages. No database. TechDocs/POS_QR_MENU.md.

import { describe, expect, it } from 'vitest';
import { deltaText, formatUahGuest, formatUahGuestCompact, groupHint } from '../pos/public-menu/format.js';
import {
  groupIntoCategories,
  safeImageUrl,
  type PublicMenu,
  type PublicMenuProduct,
} from '../pos/public-menu/menu.service.js';
import {
  MENU_PAGE_HEADERS,
  escapeHtml,
  qrSvg,
  renderMenuPage,
  renderQrCard,
  renderTablesSheet,
  renderUnavailable,
  tableLabel,
} from '../pos/public-menu/render.js';
import { tableMenuUrl } from '../pos/public-menu/menu.service.js';
import type { PosTag } from '../pos/tags.service.js';

describe('the guest reads the till’s figures', () => {
  // The cases `pos/src/lib/money.test.ts` pins — the two copies must agree.
  it('formats like the till: no-break thousands, comma, ₴', () => {
    expect(formatUahGuest(45000)).toBe('450,00 ₴');
    expect(formatUahGuest(5)).toBe('0,05 ₴');
    expect(formatUahGuest(0)).toBe('0,00 ₴');
    expect(formatUahGuest(-1250)).toBe('-12,50 ₴');
    expect(formatUahGuest(126875)).toBe('1 268,75 ₴');
    expect(formatUahGuest(123456789)).toBe('1 234 567,89 ₴');
    expect(formatUahGuest(99999)).toBe('999,99 ₴');
  });

  it('drops the kopiykas from a round sum, keeps them otherwise', () => {
    expect(formatUahGuestCompact(6000)).toBe('60 ₴');
    expect(formatUahGuestCompact(124000)).toBe('1 240 ₴');
    expect(formatUahGuestCompact(6050)).toBe('60,50 ₴');
  });

  it('writes a modifier delta with a true minus sign, and nothing for a free answer', () => {
    expect(deltaText(1500)).toBe('+15 ₴');
    expect(deltaText(-2000)).toBe('−20 ₴');
    expect(deltaText(0)).toBe('');
  });

  it('says what a group of answers allows, in the till’s words', () => {
    const three = [{}, {}, {}];
    expect(groupHint({ min_select: 1, max_select: 1, modifiers: three })).toBe('обовʼязково');
    expect(groupHint({ min_select: 1, max_select: 2, modifiers: three })).toBe('обовʼязково · до 2');
    expect(groupHint({ min_select: 0, max_select: 1, modifiers: three })).toBe('можна одне');
    expect(groupHint({ min_select: 0, max_select: 3, modifiers: three })).toBe('скільки завгодно');
    expect(groupHint({ min_select: 0, max_select: 2, modifiers: three })).toBe('до 2');
  });
});

describe('what may reach the markup', () => {
  it('escapes the five characters that open an attribute or a tag', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;'
    );
  });

  it('lets through a site path and https, nothing else', () => {
    expect(safeImageUrl('/pos-uploads/a.jpg')).toBe('/pos-uploads/a.jpg');
    expect(safeImageUrl('/demo-cafe/latte.svg')).toBe('/demo-cafe/latte.svg');
    expect(safeImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('data:image/svg+xml;base64,AAAA')).toBeNull();
    expect(safeImageUrl('http://cdn.example.com/a.png')).toBeNull();
    // A protocol-relative URL is an off-site URL wearing a path's clothes.
    expect(safeImageUrl('//evil.example/a.png')).toBeNull();
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl(null)).toBeNull();
  });
});

function product(over: Partial<PublicMenuProduct> & { id: number; name: string }): PublicMenuProduct {
  return {
    description: '',
    image_url: null,
    stopped: false,
    available: true,
    from_price_cents: 5000,
    variants: [{ id: over.id * 10, label: '', price_cents: 5000, available: true }],
    modifier_groups: [],
    ...over,
  };
}

function tag(id: number, name: string, over: Partial<PosTag> = {}): PosTag {
  return {
    id,
    store_id: 1,
    parent_id: null,
    name,
    sort_order: id,
    color: null,
    show_in_catalog_bar: true,
    station: null,
    ...over,
  } as PosTag;
}

describe('categories the way the till’s bar has them', () => {
  it('puts a product in the first bar tag its tags resolve to, and the rest in «Інше»', () => {
    const tags = [tag(1, 'Кава'), tag(2, 'Випічка'), tag(3, 'Інгредієнти', { show_in_catalog_bar: false })];
    const categories = groupIntoCategories(
      [
        { product: product({ id: 1, name: 'Латте' }), tagIds: [1] },
        { product: product({ id: 2, name: 'Круасан' }), tagIds: [2] },
        { product: product({ id: 3, name: 'Вода' }), tagIds: [] },
        // Tagged only with a shelf that is not a tab: it is not lost, it is «Інше».
        { product: product({ id: 4, name: 'Сироп' }), tagIds: [3] },
      ],
      tags
    );
    expect(categories.map((c) => [c.name, c.products.map((p) => p.name)])).toEqual([
      ['Кава', ['Латте']],
      ['Випічка', ['Круасан']],
      ['Інше', ['Вода', 'Сироп']],
    ]);
  });

  it('lists a product once even when it carries several tags', () => {
    const tags = [tag(1, 'Кава'), tag(2, 'Сніданки')];
    const categories = groupIntoCategories(
      [{ product: product({ id: 1, name: 'Флет вайт' }), tagIds: [2, 1] }],
      tags
    );
    // Tag order decides, not the order the product's tags happen to come in.
    expect(categories).toHaveLength(1);
    expect(categories[0]!.name).toBe('Кава');
  });

  it('files a product under the bar tag above a folder it is tagged with', () => {
    const tags = [tag(1, 'Кава'), tag(2, 'Холодна', { parent_id: 1, show_in_catalog_bar: false })];
    const categories = groupIntoCategories([{ product: product({ id: 1, name: 'Фрапе' }), tagIds: [2] }], tags);
    expect(categories.map((c) => c.name)).toEqual(['Кава']);
  });

  it('drops a tab with nothing to show', () => {
    const tags = [tag(1, 'Кава'), tag(2, 'Порожній')];
    const categories = groupIntoCategories([{ product: product({ id: 1, name: 'Еспресо' }), tagIds: [1] }], tags);
    expect(categories.map((c) => c.name)).toEqual(['Кава']);
  });

  it('survives a cycle in the tag parents', () => {
    const tags = [
      tag(1, 'A', { parent_id: 2, show_in_catalog_bar: false }),
      tag(2, 'B', { parent_id: 1, show_in_catalog_bar: false }),
    ];
    const categories = groupIntoCategories([{ product: product({ id: 1, name: 'X' }), tagIds: [1] }], tags);
    expect(categories.map((c) => c.name)).toEqual(['Інше']);
  });
});

const MENU: PublicMenu = {
  store: { name: 'Кав\'ярня "<Зерно>"' },
  store_day: '2026-09-30',
  generated_at: '2026-09-30T08:00:00.000Z',
  categories: [
    {
      id: 1,
      name: 'Кава <b>',
      products: [
        product({
          id: 7,
          name: '<script>alert(1)</script>',
          description: 'Ніжний "смак" & <i>аромат</i>',
          image_url: '/pos-uploads/a.jpg',
          from_price_cents: 5000,
          variants: [
            { id: 71, label: 'S', price_cents: 5000, available: true },
            { id: 72, label: 'M <x>', price_cents: 6000, available: false },
          ],
          modifier_groups: [
            {
              name: 'Молоко',
              min_select: 0,
              max_select: 1,
              modifiers: [
                { name: 'звичайне', price_delta_cents: 0, is_default: true },
                { name: 'вівсяне <b>', price_delta_cents: 1500, is_default: false },
              ],
            },
          ],
        }),
        product({ id: 8, name: 'Чай', stopped: true, available: false }),
        product({ id: 9, name: 'Сирник', available: false }),
      ],
    },
  ],
};

describe('the menu page', () => {
  const html = renderMenuPage(MENU, 'tok_ABCdef12');

  it('escapes everything an owner types, wherever it lands', () => {
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Кав&#39;ярня &quot;&lt;Зерно&gt;&quot;');
    expect(html).toContain('Ніжний &quot;смак&quot; &amp; &lt;i&gt;аромат&lt;/i&gt;');
    expect(html).toContain('вівсяне &lt;b&gt;');
    expect(html).not.toMatch(/<b>[^<]*вівсяне/);
    // The only script tag on the page is the static file.
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('<script src="/menu-assets/menu.js');
  });

  it('greys a stopped dish with «стоп», an unavailable one with «немає», and strikes a size that is out', () => {
    expect(html).toMatch(/data-product="8" data-state="stop">[\s\S]*?<span class="badge">стоп<\/span>/);
    expect(html).toMatch(/data-product="9" data-state="out">[\s\S]*?<span class="badge">немає<\/span>/);
    expect(html).toMatch(/data-product="7" data-state="ok">/);
    expect(html).toMatch(/<li data-variant="72" data-price="6000" class="off">/);
    expect(html).toMatch(/<li data-variant="71" data-price="5000">/);
  });

  it('shows «від» for sizes, the answers with their deltas, and the till’s group hint', () => {
    expect(html).toContain('від 50 ₴');
    expect(html).toContain('можна одне');
    expect(html).toContain('<b>+15 ₴</b>');
  });

  it('carries the poll address and the store day, not any data', () => {
    expect(html).toContain('data-menu-url="/api/pos/public/menu/tok_ABCdef12"');
    expect(html).toContain('data-store-day="2026-09-30"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('says the menu is empty rather than showing a blank page', () => {
    const empty = renderMenuPage({ ...MENU, categories: [] }, 'tok_ABCdef12');
    expect(empty).toContain('Меню поки порожнє');
    expect(empty).not.toContain('class="tabs"');
  });
});

describe('the QR card', () => {
  it('draws an inline QR for the menu address and prints the address as text', () => {
    const html = renderQrCard('Зерно <b>', 'tok_ABCdef12');
    expect(html).toContain('<svg');
    expect(html).toContain('/m/tok_ABCdef12');
    expect(html).toContain('Зерно &lt;b&gt;');
    expect(html).toContain('data-print');
  });
});

describe('a table on the guest’s screen', () => {
  it('reads «Стіл 5», and does not say «Стіл» twice', () => {
    expect(tableLabel('5')).toBe('Стіл 5');
    expect(tableLabel(' VIP ')).toBe('Стіл VIP');
    expect(tableLabel('Стіл біля вікна')).toBe('Стіл біля вікна');
    expect(tableLabel('стіл 3')).toBe('стіл 3');
  });

  it('is a caption on the menu page, escaped, and absent without a table', () => {
    const at = renderMenuPage(MENU, 'tok_ABCdef12', { id: 5, name: '<b>5</b>', hall: 'Зал & тераса' });
    expect(at).toContain('<p class="at-table"><b>Стіл &lt;b&gt;5&lt;/b&gt;</b> · Зал &amp; тераса</p>');
    expect(at).not.toContain('<b>5</b>');
    expect(renderMenuPage(MENU, 'tok_ABCdef12')).not.toContain('at-table');
  });

  it('puts the table into the address the card’s QR holds', () => {
    const html = renderQrCard('Зерно', 'tok_ABCdef12', { id: 42, name: '7', hall: 'Тераса' });
    expect(html).toContain('<b>Стіл 7</b><span>Тераса</span>');
    expect(html).toContain('the-live.shop/m/tok_ABCdef12?t=42');
    expect(html).toContain(qrSvg(tableMenuUrl('tok_ABCdef12', 42)));
  });

  it('draws the sheet: a card and its own QR per table, the count in the head', () => {
    const tables = [
      { id: 1, name: '1', hall: 'Зал' },
      { id: 2, name: '2', hall: 'Зал' },
      { id: 3, name: 'Т<1>', hall: 'Тераса' },
    ];
    const html = renderTablesSheet('Зерно', 'tok_ABCdef12', tables);
    expect(html).toContain('столів: 3');
    expect(html.match(/class="card table-card"/g)).toHaveLength(3);
    for (const t of tables) expect(html).toContain(qrSvg(tableMenuUrl('tok_ABCdef12', t.id)));
    expect(html).toContain('Стіл Т&lt;1&gt;');
    expect(html).not.toContain('Т<1>');
    expect(html).toContain('data-print');
  });

  it('says there are no tables, with nothing to print', () => {
    const html = renderTablesSheet('Зерно', 'tok_ABCdef12', []);
    expect(html).toContain('Столів ще немає');
    expect(html).not.toContain('data-print');
    expect(html).not.toContain('<svg');
  });
});

describe('the «unavailable» page', () => {
  it('names nothing: no store, no token, no link into the product', () => {
    const html = renderUnavailable();
    expect(html).toContain('Меню недоступне');
    expect(html).not.toContain('<a ');
  });
});

describe('response headers', () => {
  it('forbid inline script and style, framing, caching and indexing', () => {
    const csp = MENU_PAGE_HEADERS['Content-Security-Policy']!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(MENU_PAGE_HEADERS['Cache-Control']).toBe('no-store');
    expect(MENU_PAGE_HEADERS['X-Robots-Tag']).toBe('noindex, nofollow');
  });
});
