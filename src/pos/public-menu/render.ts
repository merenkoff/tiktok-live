// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/public-menu/render.ts — the guest's pages as HTML strings.
//
// There is no template engine in this backend and the pages are small, so they
// are strings — which makes ONE rule non-negotiable: everything an owner types
// (the store's name, a dish, a description, a size, a modifier) goes through
// `escapeHtml` before it touches the markup, and nothing owner-typed is ever
// placed in a script. The page carries its data in `data-*` attributes and the
// JS that reads them lives in a static file, which is what lets the response's
// CSP say `script-src 'self'` and mean it.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-generator';
import { corkageFeeText, corkageMinText, deltaText, dishFactsParts, formatUahGuestCompact, groupHint, tableLabel } from './format.js';
import { phoneHref, socialUrl } from './profile.js';
import { BAD_TAGS, FEEDBACK_TAGS, GOOD_TAGS, type FeedbackTag } from '../guest-feedback.service.js';

export { tableLabel };
import {
  menuUrl,
  publicBaseUrl,
  tableMenuUrl,
  type MenuTable,
  type PublicMenu,
  type PublicMenuProduct,
  type PublicMenuStore,
} from './menu.service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** `public/` at the repo root — the same directory `api.ts` mounts at `/`. */
const PUBLIC_DIR = path.join(HERE, '..', '..', '..', 'public');

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The response headers for every guest page. The CSP is strict because it can
 * be: no inline script, no inline style, no framing, and images only from this
 * origin or https (an owner's picture may live elsewhere).
 */
export const MENU_PAGE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  // A stop-list that is minutes stale is the failure this page exists to avoid.
  'Cache-Control': 'no-store',
  // A menu is for the person standing at the counter, not for a search engine.
  // The AI crawlers in robots.txt have their own groups that ignore the `*`
  // Disallow, so the header and the meta tag are what actually say no.
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

let cachedVersion: string | null = null;

/** A cache-buster for the two static files: their mtimes, so an edit reaches phones without a manual bump. */
function assetVersion(): string {
  if (cachedVersion) return cachedVersion;
  let stamp = 0;
  for (const file of ['menu.css', 'menu.js']) {
    try {
      stamp = Math.max(stamp, Math.floor(fs.statSync(path.join(PUBLIC_DIR, 'menu-assets', file)).mtimeMs / 1000));
    } catch {
      // Not there (a test with no public/): an unversioned URL is still correct.
    }
  }
  cachedVersion = stamp ? String(stamp) : '0';
  return cachedVersion;
}

function shell(title: string, body: string, attrs = ''): string {
  const v = assetVersion();
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/menu-assets/menu.css?v=${v}">
</head>
<body${attrs}>
${body}
<script src="/menu-assets/menu.js?v=${v}" defer></script>
</body>
</html>
`;
}

// ── the menu ────────────────────────────────────────────────────────

/** The state a product is in, as the guest reads it. Stop wins over «немає», as on the till. */
function stateOf(product: PublicMenuProduct): 'ok' | 'stop' | 'out' {
  if (product.stopped) return 'stop';
  return product.available ? 'ok' : 'out';
}

const BADGE_TEXT = { ok: '', stop: 'стоп', out: 'немає' } as const;

function renderProduct(product: PublicMenuProduct, ordering = false): string {
  const state = stateOf(product);
  const multi = product.variants.length > 1;
  const price = multi
    ? `від ${formatUahGuestCompact(product.from_price_cents)}`
    : formatUahGuestCompact(product.from_price_cents);
  const sizes = multi
    ? `<ul class="sizes">${product.variants
        .map(
          (v) =>
            `<li data-variant="${v.id}" data-price="${v.price_cents}"${v.available ? '' : ' class="off"'}>` +
            `<span>${escapeHtml(v.label)}</span> <b>${formatUahGuestCompact(v.price_cents)}</b></li>`
        )
        .join('')}</ul>`
    : `<span hidden data-variant="${product.variants[0]!.id}" data-price="${product.variants[0]!.price_cents}"></span>`;
  const groups = product.modifier_groups.length
    ? `<details class="mods"><summary>Додатки</summary>${product.modifier_groups
        .map((g) => {
          const answers = g.modifiers
            .map((m) => {
              const delta = deltaText(m.price_delta_cents);
              // A size where the answer costs differently is named beside it:
              // «Філадельфія +80 ₴ (50 см +150 ₴)».
              const bySize = product.variants
                .filter((v) => (m.price_delta_by_variant?.[String(v.id)] ?? m.price_delta_cents) !== m.price_delta_cents)
                .map((v) => `${escapeHtml(v.label)} ${deltaText(m.price_delta_by_variant![String(v.id)]!) || '0 ₴'}`);
              return (
                escapeHtml(m.name) +
                (delta ? ` <b>${delta}</b>` : '') +
                (bySize.length ? ` (${bySize.join(', ')})` : '')
              );
            })
            .join(' · ');
          return `<div class="group"><h4>${escapeHtml(g.name)} <small>${escapeHtml(groupHint(g))}</small></h4><p>${answers}</p></div>`;
        })
        .join('')}</details>`
    : '';
  // The card's 88 px picture loads the thumbnail where there is one (F10) and
  // the photo itself otherwise; the sheet always loads the photo. The size
  // attributes keep the list from jumping while pictures arrive.
  const picture = product.image_url
    ? `<div class="pic"><img src="${escapeHtml(product.thumb_url ?? product.image_url)}" width="88" height="88" alt="" loading="lazy" decoding="async"></div>`
    : '';
  // The facts line under the price: one size (a dish by weight, «245 г» —
  // the sizes list is drawn only from two up, and a guest should still see
  // the weight ChoiceQR prints on every dish; F8, decision Д14), then the
  // owner's numbers (F14, Д34): «245 г · 420 ккал · готується ≈ 25 хв». A
  // dish with none of it prints nothing.
  const single = product.variants.length === 1 ? product.variants[0]!.label.trim() : '';
  const facts = [single, ...dishFactsParts(product)].filter((part) => part !== '');
  const sizeLine = facts.length ? `<p class="facts">${facts.map(escapeHtml).join(' · ')}</p>` : '';
  return (
    `<li class="item" data-product="${product.id}" data-state="${state}">` +
    picture +
    // The name is a real button (F8): a tap anywhere on the card opens the
    // dish's sheet, and this is what the keyboard and a screen reader reach.
    `<div class="body"><h3><button type="button" class="open" data-open="${product.id}" aria-haspopup="dialog">${escapeHtml(product.name)}</button> <span class="badge">${BADGE_TEXT[state]}</span></h3>` +
    // The owner's labels (F9) sit between the name and the description — on a
    // card nobody has reviewed too, since they are ticks, not internal text.
    renderLabels(product) +
    (product.description ? `<p class="desc">${escapeHtml(product.description)}</p>` : '') +
    // What is in it, in the owner's own words — and only the allergens they
    // ticked; a dish with none ticked prints nothing, which says «not said».
    (product.composition ? `<p class="comp"><b>Склад:</b> ${escapeHtml(product.composition)}</p>` : '') +
    (product.allergens.length
      ? `<ul class="allergens" aria-label="Містить алергени">${product.allergens
          .map((a) => `<li>${escapeHtml(a.label)}</li>`)
          .join('')}</ul>`
      : '') +
    `<p class="price">${price}</p>${sizeLine}${sizes}${groups}` +
    (ordering ? `<button type="button" class="add" data-add="${product.id}">Додати</button>` : '') +
    `</div></li>`
  );
}

/**
 * The place's own details under its name: the address (a map link built HERE
 * from the address text — an owner-typed URL is never trusted), the phone (a
 * `tel:` link built from its digits), and today's hours with the week folded
 * under them. Each line is there only if the owner filled it in; a bare menu
 * with none of them is exactly the header it always was.
 */
/**
 * Where «На карті» (and the address itself) points: the place's own Google
 * card when the owner gave one — it opens the right pin, with the photos and
 * the reviews — else a Maps search for the address text. Never an owner-typed
 * URL other than the checked Google one.
 */
function mapUrl(store: PublicMenuStore): string | null {
  if (store.google_url) return store.google_url;
  if (store.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
  return null;
}

/**
 * The 16 px glyphs of the links row, inline so the page needs no icon font
 * and no third-party file: the CSP allows images from https but scripts and
 * styles only from here, and an SVG in the markup is neither.
 */
const GLYPH = {
  map:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s5-4 5-8a5 5 0 0 0-10 0c0 4 5 8 5 8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg>',
  instagram:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="11.4" cy="4.6" r="1" fill="currentColor"/></svg>',
  facebook:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 15V9.4h1.9l.3-2.4H9.6V5.6c0-.7.2-1.2 1.2-1.2H12V2.2c-.3 0-1-.2-1.9-.2-1.9 0-3.1 1.2-3.1 3.3V7H5v2.4h2V15Z" fill="currentColor"/></svg>',
  tiktok:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5h2.3c.2 1.6 1.2 2.6 2.7 2.8v2.3a5 5 0 0 1-2.7-.9v4.5a4 4 0 1 1-4-4h.6v2.4h-.6a1.6 1.6 0 1 0 1.7 1.6Z" fill="currentColor"/></svg>',
  wine:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h8l-.6 5.3a3.4 3.4 0 0 1-6.8 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 10.4V14M5.5 14h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  mail:
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3.5" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m2.5 5.5 5.5 3.8 5.5-3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
} as const;

/**
 * The 14 px glyphs of a dish's labels (phase F9), one per code of
 * `menu-labels.ts`: a chili, a leaf, a sprout, a sparkle, a flame, a star.
 * Inline for the same reason as `GLYPH`; the dish's sheet clones them from
 * `<template>`s the server puts in its frame, never from an HTML string.
 */
const LABEL_GLYPH: Record<string, string> = {
  spicy:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.6 3.2c1 2.6.2 5.6-2.1 7.9-2.1 2.1-5.2 3-7.6 2.6 1.7-1.1 3-2.9 3.9-5.1 1-2.3 2.9-4.3 5.8-5.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12.6 3.2c-.2-1 .3-1.8 1.2-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  vegetarian:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 2.4C8.1 2.4 3.6 5.4 3.1 11c-.1 1.1.2 1.9.6 2.5C4.9 9.7 7.8 6.7 11.3 5.1 8.4 7.3 6 10.4 5 13.6c5.6.5 8.6-4.1 8.6-11.2Z" fill="currentColor"/></svg>',
  vegan:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5V8.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 8.2C8 5.3 6 3.6 2.8 3.6c0 3 2.1 4.6 5.2 4.6Z" fill="currentColor"/><path d="M8 8.2c0-2.9 2-4.6 5.2-4.6 0 3-2.1 4.6-5.2 4.6Z" fill="currentColor"/></svg>',
  new:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.7 6.3 14.5 8l-4.8 1.7L8 14.5 6.3 9.7 1.5 8l4.8-1.7Z" fill="currentColor"/></svg>',
  hit:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.6 1.5c.3 2.8 3 4.3 3 7.3a3.6 3.6 0 0 1-7.2 0c0-1.3.5-2.4 1.3-3.2.1 1.1.7 1.8 1.5 1.9C6.5 5.7 6.8 3.4 8.6 1.5Z" fill="currentColor"/></svg>',
  recommended:
    '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.6 1.9 4 4.4.6-3.2 3 .8 4.3L8 11.4l-3.9 2.1.8-4.3-3.2-3 4.4-.6Z" fill="currentColor"/></svg>',
};

/**
 * The chips under a dish's name — «Гостре», «Хіт»… — in the DTO's order;
 * nothing when there are none. The word comes from the DTO (escaped, as
 * everything is), the glyph and the colour from the code. A code this build
 * has no glyph for is skipped rather than drawn without one.
 */
function renderLabels(product: PublicMenuProduct): string {
  const chips = product.labels
    .filter((l) => LABEL_GLYPH[l.code])
    .map((l) => `<li class="label label-${l.code}">${LABEL_GLYPH[l.code]}<span>${escapeHtml(l.label)}</span></li>`);
  return chips.length ? `<ul class="labels" aria-label="Позначки страви">${chips.join('')}</ul>` : '';
}

/** The glyphs as `<template>`s for the dish's sheet to clone (F9; the F5 rule — no HTML strings in the script). */
function labelGlyphTemplates(): string {
  return Object.entries(LABEL_GLYPH)
    .map(([code, svg]) => `<template data-label-glyph="${code}">${svg}</template>`)
    .join('');
}

function chip(glyph: keyof typeof GLYPH, href: string, label: string, newTab = true): string {
  const target = newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<li class="l-${glyph}"><a href="${escapeHtml(href)}"${target}>${GLYPH[glyph]}<span>${escapeHtml(label)}</span></a></li>`;
}

/**
 * The row of buttons under the contacts (phase F1): the map, the networks the
 * owner named, the mailbox. Every address here is built from a checked HANDLE
 * (`socialUrl`) or is the checked Google link — an owner never types a URL
 * that lands in an `<a>` as typed. Nothing filled in, no row.
 */
function renderLinks(store: PublicMenuStore): string {
  const items: string[] = [];
  const map = mapUrl(store);
  if (map) items.push(chip('map', map, 'На карті'));
  if (store.instagram) items.push(chip('instagram', socialUrl('instagram', store.instagram), 'Instagram'));
  if (store.facebook) items.push(chip('facebook', socialUrl('facebook', store.facebook), 'Facebook'));
  if (store.tiktok) items.push(chip('tiktok', socialUrl('tiktok', store.tiktok), 'TikTok'));
  if (store.email) items.push(chip('mail', `mailto:${store.email}`, 'Пошта', false));
  return items.length ? `<ul class="links" aria-label="Посилання закладу">${items.join('')}</ul>` : '';
}

/**
 * The place's own-alcohol terms (phase F2), between the header and the first
 * category — so a guest sees them before the first dish, from the venue's QR
 * and a table's alike. The two figures are formatted here from kopecks; the
 * owner's note, several lines, sits behind «Умови» (`<details>`, no script)
 * and keeps its line breaks through `white-space: pre-line`, never `<br>`.
 */
function renderCorkage(store: PublicMenuStore): string {
  const c = store.corkage;
  if (!c) return '';
  const min = corkageMinText(c);
  const head =
    `${GLYPH.wine}<span class="corkage-text"><b>Свій алкоголь:</b> ${escapeHtml(corkageFeeText(c))}` +
    `${min ? ` · ${escapeHtml(min)}` : ''}</span>`;
  const body = c.note
    ? `<details class="corkage"><summary>${head}<span class="corkage-more">Умови</span></summary>` +
      `<p class="corkage-note">${escapeHtml(c.note)}</p></details>`
    : `<p class="corkage">${head}</p>`;
  return `<section class="rules" aria-label="Правила закладу">${body}</section>`;
}

function renderContacts(store: PublicMenuStore): string {
  const items: string[] = [];
  if (store.address) {
    const map = mapUrl(store)!;
    items.push(
      `<li class="c-addr"><a href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer">${escapeHtml(store.address)}</a></li>`
    );
  }
  const tel = phoneHref(store.phone);
  if (store.phone && tel) {
    items.push(`<li class="c-phone"><a href="${escapeHtml(tel)}">${escapeHtml(store.phone)}</a></li>`);
  }
  if (store.hours_today) {
    if (store.hours.length > 1) {
      const week = store.hours
        .map((row) => `<li><span>${escapeHtml(row.days)}</span><b>${escapeHtml(row.text)}</b></li>`)
        .join('');
      items.push(
        `<li class="c-hours"><details><summary>Сьогодні ${escapeHtml(store.hours_today)}</summary><ul class="week">${week}</ul></details></li>`
      );
    } else {
      const only = store.hours[0];
      items.push(`<li class="c-hours">${escapeHtml(only ? `${only.days} ${only.text}` : `Сьогодні ${store.hours_today}`)}</li>`);
    }
  }
  return (items.length ? `<ul class="contacts">${items.join('')}</ul>` : '') + renderLinks(store);
}

export interface MenuPageOptions {
  /**
   * The QR carried this table's key and the owner lets guests read the bill:
   * the page gets a «Рахунок» bar and a sheet the script fills from `/bill`.
   * Never true without a table — the bill is a table's.
   */
  bill?: boolean;
  /**
   * Same proof, and the owner lets guests send dishes to a waiter (phase Q6):
   * every available dish gets an «Додати» button, and the page a cart and a
   * list of the guest's own requests. Never true without a table.
   */
  ordering?: boolean;
  /**
   * Same proof, and the owner lets guests call a waiter or ask for the bill
   * (phase Q8): the page learns where to send a call. Never true without a table.
   */
  call?: boolean;
  /**
   * The owner's auto-send (phase Q9), only so the cart can say honestly what
   * will happen to an order before it is sent: `reorders` or `all`, and the
   * limit above which it waits for a waiter anyway. The server decides each
   * order itself; the page only describes. Ignored without ordering.
   */
  orderAuto?: { mode: 'reorders' | 'all'; limitCents: number } | null;
  /**
   * The owner takes feedback (phase F3): the page gets a «Як вам сьогодні?»
   * button in the dock, a card after the last category and the sheet itself.
   * Not tied to a table — a letter to the owner needs no key.
   */
  feedback?: boolean;
  /**
   * The QR proved the table (phase F5): the sheet also lists the dishes of
   * the table's bill with 👍/👎, fetched by the script from `/feedback/dishes`.
   * Never true without a table and without `feedback`.
   */
  feedbackDishes?: boolean;
}

export function renderMenuPage(
  menu: PublicMenu,
  token: string,
  table: MenuTable | null = null,
  options: MenuPageOptions = {}
): string {
  const showBill = Boolean(options.bill && table);
  const ordering = Boolean(options.ordering && table);
  const call = Boolean(options.call && table);
  const auto = ordering && options.orderAuto ? options.orderAuto : null;
  const feedback = options.feedback
    ? { storeName: menu.store.name, googleUrl: menu.store.google_url }
    : null;
  const feedbackDishes = Boolean(feedback && table && options.feedbackDishes);
  const tabs = menu.categories
    .map((c, i) => `<a href="#c-${c.id ?? 'other'}"${i === 0 ? ' class="on"' : ''}>${escapeHtml(c.name)}</a>`)
    .join('');
  const sections = menu.categories
    .map(
      (c) =>
        `<section class="cat" id="c-${c.id ?? 'other'}"><h2>${escapeHtml(c.name)}</h2>` +
        `<ul class="items">${c.products.map((p) => renderProduct(p, ordering)).join('')}</ul></section>`
    )
    .join('\n');
  const empty = menu.categories.length === 0 ? '<p class="empty">Меню поки порожнє.</p>' : '';
  // The dish's own sheet (F8) is one frame for the whole page, filled by the
  // script from the menu JSON; a page with no dish to open has none.
  const dishSheet = menu.categories.some((c) => c.products.length > 0) ? dishSheetMarkup() : '';
  // After the last dish: the quiet ask. The same sheet the dock button opens.
  const ask = feedback
    ? '<section class="ask" data-ask><h2>Як вам сьогодні?</h2><p>Оцініть одним дотиком — власник прочитає.</p>' +
      '<button type="button" class="ask-btn" data-feedback-open>Оцінити</button></section>'
    : '';
  // Said once, and only where there is something to be careful about: the
  // owner writes the composition and ticks the allergens, and a modifier's
  // answer (a different milk) is not part of either.
  const hasFacts = menu.categories.some((c) =>
    c.products.some((p) => p.composition !== '' || p.allergens.length > 0)
  );
  const factsNote = hasFacts
    ? '<p class="foot-note">Склад і алергени вказує заклад. Якщо у вас алергія — скажіть офіціанту.</p>'
    : '';
  const seat = table
    ? `<p class="at-table"><b>${escapeHtml(tableLabel(table.name))}</b> · ${escapeHtml(table.hall)}</p>`
    : '';
  // The size is in attributes, not a style: the page's CSP has no inline style.
  const logo = menu.store.logo_url
    ? `<img class="logo" src="${escapeHtml(menu.store.logo_url)}" width="56" height="56" alt="">`
    : '';
  // A cork fee is on the bill the guest reads (Q5) too — said there once, above the lines.
  const billCorkage =
    menu.store.corkage && menu.store.corkage.fee_cents > 0
      ? `Свій алкоголь: ${corkageFeeText(menu.store.corkage)} — додається до рахунку`
      : null;
  const body = `<header class="top"><div class="brand">${logo}<div><h1>${escapeHtml(menu.store.name)}</h1><p class="sub">Меню</p></div></div>${seat}${renderContacts(menu.store)}</header>
${renderCorkage(menu.store)}${tabs ? `<nav class="tabs" aria-label="Розділи меню">${tabs}</nav>` : ''}
<main>
${empty}${sections}${ask}
</main>${dishSheet}
<footer class="foot">${factsNote}<p>Стоп-лист і ціни оновлюються самі.</p><p><a href="${escapeHtml(publicBaseUrl())}/pos/kafe" rel="noopener">Меню працює на The Live Shop POS</a></p></footer>${showBill || ordering || call || feedback ? dockMarkup(table, showBill, ordering, call, billCorkage, feedback) : ''}`;
  return shell(
    `${menu.store.name} — меню`,
    body,
    ` data-menu-url="/api/pos/public/menu/${escapeHtml(token)}" data-store-day="${escapeHtml(menu.store_day)}"` +
      ` data-rev="${escapeHtml(menu.rev)}"` +
      (showBill ? ` data-bill-url="/api/pos/public/menu/${escapeHtml(token)}/bill"` : '') +
      (ordering ? ` data-order-url="/api/pos/public/menu/${escapeHtml(token)}/orders"` : '') +
      (auto
        ? ` data-order-auto="${auto.mode === 'all' ? 'all' : 'reorders'}" data-order-limit="${Math.trunc(auto.limitCents)}"`
        : '') +
      (call ? ` data-call-url="/api/pos/public/menu/${escapeHtml(token)}/calls"` : '') +
      // The Google card is the one owner-typed URL here, checked on the way in
      // and read back through the same check; the script puts it in an
      // `href` property, never in markup.
      (feedback
        ? ` data-feedback-url="/api/pos/public/menu/${escapeHtml(token)}/feedback"` +
          (feedback.googleUrl ? ` data-feedback-google="${escapeHtml(feedback.googleUrl)}"` : '') +
          (feedbackDishes ? ` data-feedback-dishes-url="/api/pos/public/menu/${escapeHtml(token)}/feedback/dishes"` : '')
        : '')
  );
}

/**
 * What is pinned to the bottom of the page and what opens over it. Only the
 * frames are server-rendered: the bill's lines come from `/bill` and the cart's
 * from the dishes the guest picked, and both are put in with `textContent`, so
 * nothing an owner typed is ever parsed as markup by the script. The table's
 * key is not here at all: the script reads it from the address bar, where the
 * QR put it.
 */
interface FeedbackSheet {
  storeName: string;
  googleUrl: string | null;
}

/**
 * The dish's own sheet (phase F8): the frame only. The script fills it from
 * the menu JSON with `textContent` — the photo at its real size (the same
 * file the card shows at 88 px), the name with its state, the price or the
 * sizes, the weight, the description, the composition, the allergens, the
 * modifiers — and, where ordering is on, the questions and «Додати» under
 * them. The whole card opens it; the name is the button a keyboard reaches.
 * The labels' row under the head (F9) is filled the same way, its glyphs
 * cloned from the `<template>`s at the end of the frame.
 */
function dishSheetMarkup(): string {
  return `
<div class="bill-sheet dish-sheet" data-dish-sheet hidden role="dialog" aria-modal="true" aria-labelledby="dish-title">
<div class="bill-panel dish-panel" data-dish-panel>
<button type="button" class="bill-close dish-close" data-dish-close aria-label="Закрити">×</button>
<div class="dish-photo" data-dish-photo hidden><img alt="" decoding="async" data-dish-img></div>
<div class="dish-head"><h2 id="dish-title" data-dish-title></h2><span class="badge" data-dish-badge></span></div>
<ul class="labels dish-labels" data-dish-labels aria-label="Позначки страви" hidden></ul>
<div class="dish-body" data-dish-body></div>
<div class="order-foot dish-foot" data-dish-foot hidden></div>
</div>
${labelGlyphTemplates()}
</div>`;
}

function dockMarkup(
  table: MenuTable | null,
  bill: boolean,
  ordering: boolean,
  call: boolean,
  corkage: string | null = null,
  feedback: FeedbackSheet | null = null
): string {
  // The bill, the cart and the calls are a table's; feedback is anyone's.
  const label = table ? escapeHtml(tableLabel(table.name)) : '';
  // The call row (phase Q8) is drawn with its words so it reads without the
  // script; the script only greys a button while its call is live and puts the
  // state («Офіціанта покликано» → «Офіціант іде») in the line above it.
  const calls = call
    ? '<div class="call-status" data-call-status aria-live="polite" hidden></div>' +
      '<div class="call-row" data-call-row>' +
      '<button type="button" class="call-btn" data-call="waiter">Покликати офіціанта</button>' +
      '<button type="button" class="call-btn" data-call="bill">Попросити рахунок</button>' +
      '</div>'
    : '';
  const bars =
    calls +
    (ordering ? '<button type="button" class="cart-bar" data-cart-open hidden></button>' : '') +
    (bill ? `<button type="button" class="bill-bar" data-bill-open>Рахунок · ${label}</button>` : '') +
    (feedback ? '<button type="button" class="fb-bar" data-feedback-open>Як вам сьогодні?</button>' : '');
  const billSheet = bill
    ? `
<div class="bill-sheet" data-bill-sheet hidden role="dialog" aria-modal="true" aria-labelledby="bill-title">
<div class="bill-panel">
<header class="bill-head"><h2 id="bill-title">Рахунок · ${label}</h2><button type="button" class="bill-close" data-bill-close aria-label="Закрити">×</button></header>
${corkage ? `<p class="bill-corkage">${GLYPH.wine}<span>${escapeHtml(corkage)}</span></p>\n` : ''}<div class="bill-body" data-bill-body aria-live="polite"></div>
${feedback ? '<p class="bill-ask"><button type="button" class="link-btn" data-feedback-open data-feedback-source="bill">Як вам сьогодні? Оцініть</button></p>\n' : ''}</div>
</div>`
    : '';
  const orderSheet = ordering
    ? `
<div class="bill-sheet" data-order-sheet hidden role="dialog" aria-modal="true" aria-labelledby="order-title">
<div class="bill-panel">
<header class="bill-head"><h2 id="order-title" data-order-title>Замовлення · ${label}</h2><button type="button" class="bill-close" data-order-close aria-label="Закрити">×</button></header>
<div class="bill-body" data-order-body aria-live="polite"></div>
<div class="order-foot" data-order-foot></div>
</div>
</div>`
    : '';
  return `\n<div class="dock">${bars}</div>${billSheet}${orderSheet}${feedback ? feedbackSheetMarkup(feedback) : ''}`;
}

// ── the feedback sheet (phase F3) ───────────────────────────────────

/** Five faces, 1 «Погано» … 5 «Чудово»: a circle, two eyes and a mouth that bends with the score. */
const MOUTH: Record<number, string> = {
  1: 'M15 35q9-10 18 0',
  2: 'M16 33q8-6 16 0',
  3: 'M16 31h16',
  4: 'M16 29q8 7 16 0',
  5: 'M14 27q10 12 20 0',
};
const FACE_WORDS: Record<number, string> = { 1: 'Погано', 2: 'Так собі', 3: 'Нормально', 4: 'Добре', 5: 'Чудово' };

export function faceSvg(score: number): string {
  return (
    '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="3"/>' +
    '<circle cx="17" cy="19" r="2.5" fill="currentColor"/><circle cx="31" cy="19" r="2.5" fill="currentColor"/>' +
    `<path d="${MOUTH[score]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`
  );
}

const THUMB_UP =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v11H3V10h4Zm2 11V10l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 18.7 21H9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const THUMB_DOWN =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 14V3h4v11h-4ZM15 3v11l-4 7a2 2 0 0 1-2-2v-4H4a2 2 0 0 1-2-2.3l1.3-7A2 2 0 0 1 5.3 3H15Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function tagChips(tags: readonly FeedbackTag[], set: 'good' | 'bad'): string {
  return (
    `<div class="fb-tags" data-fb-tags="${set}" hidden>` +
    tags.map((tag) => `<button type="button" class="fb-tag" data-tag="${tag}">${escapeHtml(FEEDBACK_TAGS[tag])}</button>`).join('') +
    '</div>'
  );
}

/**
 * The one sheet every «Як вам сьогодні?» opens. Only the frame and the fixed
 * words are here; the script fills in what the guest does. The store's name is
 * the only owner text on it, escaped. The chips of both moods are drawn and
 * the script shows the set the score asks for. The `website` field is a trap
 * no person sees (`.fb-hp`): filled in, the server says yes and writes nothing.
 */
function feedbackSheetMarkup(feedback: FeedbackSheet): string {
  const faces = [1, 2, 3, 4, 5]
    .map(
      (score) =>
        `<button type="button" class="fb-face" data-score="${score}" role="radio" aria-checked="false" aria-label="${FACE_WORDS[score]}">${faceSvg(score)}</button>`
    )
    .join('');
  return `
<div class="bill-sheet" data-feedback-sheet hidden role="dialog" aria-modal="true" aria-labelledby="fb-title">
<div class="bill-panel">
<header class="bill-head"><h2 id="fb-title">Як вам сьогодні?</h2><button type="button" class="bill-close" data-feedback-close aria-label="Закрити">×</button></header>
<form class="fb" data-feedback-form novalidate>
<p class="fb-sub">${escapeHtml(feedback.storeName)}</p>
<div class="fb-faces" role="radiogroup" aria-label="Оцінка">${faces}</div>
<div class="fb-ends" aria-hidden="true"><span>Погано</span><span>Чудово</span></div>
<div class="fb-more" data-fb-more hidden>
<p class="fb-q" data-fb-q></p>
${tagChips(GOOD_TAGS, 'good')}${tagChips(BAD_TAGS, 'bad')}
<div class="fb-dishes" data-fb-dishes hidden><p class="fb-q">Як страви? <small>необов’язково</small></p><ul class="fb-dish-list" data-fb-dish-list></ul></div>
<template data-fb-thumb="up">${THUMB_UP}</template><template data-fb-thumb="down">${THUMB_DOWN}</template>
<label class="fb-label"><span>Розкажіть більше <small>необов’язково</small></span><textarea name="comment" maxlength="600" rows="3" data-fb-comment></textarea></label>
<button type="button" class="link-btn fb-phone-toggle" data-fb-phone-toggle>Залишити телефон для дзвінка</button>
<label class="fb-label" data-fb-phone hidden><span>Телефон <small>власник зателефонує</small></span><input name="phone" type="tel" inputmode="tel" maxlength="32" autocomplete="tel" data-fb-phone-input></label>
<label class="fb-hp" aria-hidden="true">Сайт<input name="website" tabindex="-1" autocomplete="off" data-fb-hp></label>
</div>
<p class="error" data-fb-error hidden></p>
<div class="order-foot"><button type="submit" class="primary" data-fb-send disabled>Надіслати</button></div>
</form>
<div class="fb-done" data-fb-done hidden aria-live="polite"></div>
</div>
</div>`;
}

// ── the QR card ─────────────────────────────────────────────────────

/** The QR as an inline SVG. Built from our own URL (a validated token on our own base), never from owner text. */
export function qrSvg(url: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 4, scalable: true });
}

export interface PrintOptions {
  /**
   * The key printed in the table's QR — passed only when the request carried a
   * valid print link. Without it the QR still opens the menu with the table's
   * name on it, but the guest cannot read the bill.
   */
  key?: string;
  /** The owner lets guests read the bill, yet this page was opened without a print link. */
  missingKey?: boolean;
  /** One small line about the cork fee (`corkageCardLine`), when the owner shows one — on the next print. */
  corkage?: string | null;
}

function ruleLine(options: PrintOptions): string {
  return options.corkage ? `<p class="rule">${escapeHtml(options.corkage)}</p>` : '';
}

const MISSING_KEY_NOTICE =
  'Ця сторінка відкрита без ключа столу: QR відкриє меню, але не рахунок. Відкрийте її кнопкою «QR для всіх столів» у «Налаштуваннях» або в «Залах і столах».';

function notice(options: PrintOptions): string {
  return options.missingKey ? `<p class="notice">${escapeHtml(MISSING_KEY_NOTICE)}</p>` : '';
}

export function renderQrCard(
  storeName: string,
  token: string,
  table: MenuTable | null = null,
  options: PrintOptions = {}
): string {
  const url = table ? tableMenuUrl(token, table.id, options.key) : menuUrl(token);
  const seat = table
    ? `<p class="seat"><b>${escapeHtml(tableLabel(table.name))}</b><span>${escapeHtml(table.hall)}</span></p>`
    : '';
  const body = `${table ? notice(options) : ''}<main class="card">
<h1>${escapeHtml(storeName)}</h1>
${seat}<p class="lead">Скануйте — меню на телефоні</p>
<div class="qr">${qrSvg(url)}</div>
<p class="url">${escapeHtml(url.replace(/^https?:\/\//, ''))}</p>
<p class="hint">Ціни, розміри й те, що сьогодні закінчилось, — актуальні.</p>
${ruleLine(options)}<button type="button" class="print" data-print>Друкувати</button>
</main>`;
  return shell(`QR-меню — ${storeName}`, body, ' class="qr-page"');
}

/**
 * One sheet with a QR card for every table, ready to print and cut: the owner
 * lays out the room once and prints it once. Reachable by the same token as
 * the menu — the names of the tables are what is printed on the tables — and
 * it carries no bill, no seat count and no layout. The tables' KEYS go into
 * the QR codes only when the request brought a valid print link (`options.keys`).
 */
export function renderTablesSheet(
  storeName: string,
  token: string,
  tables: MenuTable[],
  options: PrintOptions & { keys?: Map<number, string> } = {}
): string {
  const cards = tables
    .map(
      (table) => `<article class="card table-card">
<h2>${escapeHtml(storeName)}</h2>
<p class="seat"><b>${escapeHtml(tableLabel(table.name))}</b><span>${escapeHtml(table.hall)}</span></p>
<div class="qr">${qrSvg(tableMenuUrl(token, table.id, options.keys?.get(table.id)))}</div>
<p class="hint">Скануйте — меню на телефоні</p>
${ruleLine(options)}</article>`
    )
    .join('\n');
  const body = `<header class="sheet-head">
<div><h1>QR для столів</h1><p>${escapeHtml(storeName)} · столів: ${tables.length}</p></div>
${tables.length ? '<button type="button" class="print" data-print>Друкувати</button>' : ''}
</header>
${tables.length ? notice(options) : ''}<main class="sheet">
${cards || '<p class="empty">Столів ще немає. Додайте зали й столи в розділі «Зали і столи» — і QR для кожного з’явиться тут.</p>'}
</main>`;
  return shell(`QR для столів — ${storeName}`, body, ' class="sheet-page"');
}

// ── nothing here ────────────────────────────────────────────────────

/**
 * The one answer for an unknown, disabled, rotated or malformed token — the
 * same page for all four, so it never tells a scanner which tokens exist.
 */
export function renderUnavailable(): string {
  return shell(
    'Меню недоступне',
    `<main class="gone"><h1>Меню недоступне</h1><p>Це посилання більше не діє. Попросіть актуальне меню в закладі.</p></main>`
  );
}
