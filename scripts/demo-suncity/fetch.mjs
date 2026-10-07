// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/demo-suncity/fetch.mjs — snapshots Sun City's menu (Malyn,
// https://suncitymalyn.com.ua, a Tilda shop) into `menu.json` beside this file
// and its photos into public/demo-suncity/. Run by hand, with network:
//
//   node scripts/demo-suncity/fetch.mjs            # menu.json + photos
//   node scripts/demo-suncity/fetch.mjs --no-images
//
// The migration (067, written by gen-migration.mjs) reads only menu.json, so a
// change on the site reaches the demo only through a re-run of this script and
// a reviewed diff — never at boot. TechDocs/POS_DEMO_SUNCITY.md has the why.
//
// What it normalises, and nothing more: names keep their spelling (capitals
// included), HTML is stripped from the composition, «30см» becomes «30 см»,
// «Піцца Сет» (0 ₴, a placeholder) is skipped, and a dish listed twice
// («Деруни») becomes one card in both categories. A pizza's 40 editions are
// folded into two sizes plus answers, after checking that every edition's
// price IS the size's price plus the answers' — the exceptions are typos on
// the site and are listed in `notes`.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT_JSON = path.join(HERE, 'menu.json');
const OUT_IMAGES = path.join(ROOT, 'public/demo-suncity');
const SITE = 'https://suncitymalyn.com.ua/';
const API =
  'https://store.tildaapi.one/api/getproductslist/?storepartuid=828660788011&getparts=true&getoptions=true&slice=1&size=500';
const LOGO = 'https://static.tildacdn.one/tild3333-6130-4138-b938-346361343466/LOGO___1.png';
const IMAGE_WIDTH = 480;

const withImages = !process.argv.includes('--no-images');

// ── text ────────────────────────────────────────────────────────────

function plain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i',
  ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e',
  ё: 'io', ъ: '', "'": '', '’': '', 'ʼ': '',
};

function slugOf(name) {
  return [...name.toLowerCase()]
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** «30см» → «30 см»; anything else as the site wrote it, spaces collapsed. */
function sizeLabel(value) {
  return String(value).replace(/\s+/g, ' ').trim().replace(/^(\d+)\s*см$/, '$1 см');
}

const cents = (price) => Math.round(Number(price) * 100);

// ── fetch ───────────────────────────────────────────────────────────

async function getJson(url) {
  const res = await fetch(url, { headers: { Referer: SITE } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const data = await getJson(API);
const parts = [...data.parts].sort((a, b) => Number(a.sort) - Number(b.sort));
const categoryOf = new Map(parts.map((p) => [String(p.uid), p.title.trim()]));
const categories = parts.map((p) => p.title.trim());

// ── pizzas: editions → sizes + answers ──────────────────────────────

const SIZE = 'Розмір';
const CRUST = 'Бортики';
const SAUCE = 'Соус';
const NONE = new Set(['', '—', '-']);

/** One pizza's editions read as base price per size and delta per (size, answer). */
function foldEditions(product) {
  const base = new Map();
  const crust = new Map();
  const sauce = new Map();
  const editions = product.editions.map((e) => ({
    size: sizeLabel(e[SIZE]),
    crust: NONE.has(e[CRUST] ?? '') ? null : e[CRUST],
    sauce: NONE.has(e[SAUCE] ?? '') ? null : e[SAUCE],
    price_cents: cents(e.price),
  }));
  for (const e of editions) if (!e.crust && !e.sauce) base.set(e.size, e.price_cents);
  for (const e of editions) {
    if (e.crust && !e.sauce) crust.set(`${e.size}|${e.crust}`, e.price_cents - base.get(e.size));
    if (e.sauce && !e.crust) sauce.set(`${e.size}|${e.sauce}`, e.price_cents - base.get(e.size));
  }
  return { base, crust, sauce, editions };
}

const pizzas = data.products.filter(
  (p) => (p.editions?.length ?? 0) > 1 && JSON.parse(p.json_options || '[]').some((o) => o.title === CRUST)
);
const folded = pizzas.map((p) => ({ product: p, ...foldEditions(p) }));

// The answers must cost the same on every pizza for one shared group to
// describe them; the first pizza is the reference and every other must agree.
const [reference] = folded;
for (const f of folded) {
  for (const [key, delta] of [...f.crust, ...f.sauce]) {
    const expected = reference.crust.get(key) ?? reference.sauce.get(key);
    if (expected !== delta) {
      throw new Error(`${f.product.title}: ${key} коштує ${delta}, а в ${reference.product.title} — ${expected}`);
    }
  }
}

const sizes = [...reference.base.keys()];
const crustNames = JSON.parse(reference.product.json_options)
  .find((o) => o.title === CRUST)
  .values.filter((v) => !NONE.has(v));
const sauceNames = JSON.parse(reference.product.json_options)
  .find((o) => o.title === SAUCE)
  .values.filter((v) => !NONE.has(v));

/** An answer: its price on the first size, and any size where it costs differently. */
function answer(name, deltas) {
  const [first] = sizes;
  const price = deltas.get(`${first}|${name}`);
  const labelDeltas = sizes
    .filter((size) => deltas.get(`${size}|${name}`) !== price)
    .map((size) => ({ label: size, price_delta_cents: deltas.get(`${size}|${name}`) }));
  return { name, price_delta_cents: price, label_deltas: labelDeltas };
}

const modifierGroups = [
  { key: 'crust', name: CRUST, min_select: 0, max_select: 1, answers: crustNames.map((n) => answer(n, reference.crust)) },
  { key: 'sauce', name: SAUCE, min_select: 0, max_select: 1, answers: sauceNames.map((n) => answer(n, reference.sauce)) },
];

// Every edition must be the size plus its answers; the ones that are not are
// typos on the site, listed rather than silently «fixed».
const notes = [];
for (const f of folded) {
  for (const e of f.editions) {
    const expected =
      f.base.get(e.size) +
      (e.crust ? reference.crust.get(`${e.size}|${e.crust}`) : 0) +
      (e.sauce ? reference.sauce.get(`${e.size}|${e.sauce}`) : 0);
    if (expected !== e.price_cents) {
      notes.push(
        `${f.product.title}, ${e.size}${e.crust ? ` + ${e.crust}` : ''}${e.sauce ? ` + ${e.sauce}` : ''}: ` +
          `на сайті ${e.price_cents / 100} ₴, адитивно ${expected / 100} ₴`
      );
    }
  }
}

// ── products ────────────────────────────────────────────────────────

const pizzaById = new Map(folded.map((f) => [f.product.uid, f]));
const byName = new Map();
const products = [];
const slugs = new Set();

for (const p of [...data.products].sort((a, b) => Number(a.sort) - Number(b.sort))) {
  const name = p.title.replace(/\s+/g, ' ').trim();
  if (cents(p.price) === 0 && !(p.editions?.length > 1)) {
    notes.push(`«${name}» пропущено: 0 ₴ на сайті`);
    continue;
  }
  const cats = JSON.parse(p.partuids || '[]')
    .map((uid) => categoryOf.get(String(uid)))
    .filter(Boolean);
  const key = name.toLowerCase();
  const twin = byName.get(key);
  if (twin) {
    // Listed twice on the site (two Tilda products): one card in both places.
    for (const c of cats) if (!twin.categories.includes(c)) twin.categories.push(c);
    notes.push(`«${name}» на сайті двічі — одна картка`);
    continue;
  }

  let slug = slugOf(name) || `dish-${p.uid}`;
  for (let n = 2; slugs.has(slug); n++) slug = `${slugOf(name)}-${n}`;
  slugs.add(slug);

  const pizza = pizzaById.get(p.uid);
  const options = JSON.parse(p.json_options || '[]');
  const onlySize = options.find((o) => o.title === SIZE && o.values.length === 1)?.values[0];
  const variants = pizza
    ? sizes.map((size) => ({ size, price_cents: pizza.base.get(size) }))
    : [{ size: onlySize ? sizeLabel(onlySize) : null, price_cents: cents(p.editions?.[0]?.price ?? p.price) }];

  const descr = plain(p.descr);
  const text = plain(p.text);
  const gallery = JSON.parse(p.gallery || '[]');
  const product = {
    name,
    slug,
    categories: cats,
    // The ingredients as the site lists them; `descr` is the cleaner list where both exist.
    composition: (descr || text).slice(0, 400),
    weight_g: Number(p.pack_m) > 0 ? Number(p.pack_m) : null,
    image_source: gallery[0]?.img ?? null,
    image: null,
    variants,
    ...(pizza
      ? {
          modifier_groups: modifierGroups.map((g) => g.key),
          site_editions: pizza.editions,
        }
      : {}),
  };
  byName.set(key, product);
  products.push(product);
}

// ── photos ──────────────────────────────────────────────────────────

function thumbUrl(source) {
  // static.tildacdn.one/<dir>/<file> → thb.tildacdn.one/<dir>/-/resize/480x/<file>
  const url = new URL(source);
  const [, dir, file] = url.pathname.split('/');
  return `https://thb.tildacdn.one/${dir}/-/resize/${IMAGE_WIDTH}x/${file}`;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function download(url, base) {
  const res = await fetch(url, { headers: { Referer: SITE } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const ext = EXT[(res.headers.get('content-type') ?? '').split(';')[0]];
  if (!ext) throw new Error(`${url}: ${res.headers.get('content-type')}`);
  const file = `${base}.${ext}`;
  writeFileSync(path.join(OUT_IMAGES, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

if (withImages) {
  mkdirSync(OUT_IMAGES, { recursive: true });
  const queue = products.filter((p) => p.image_source);
  const workers = Array.from({ length: 8 }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      p.image = await download(thumbUrl(p.image_source), p.slug);
    }
  });
  await Promise.all(workers);
  await download(LOGO, 'logo');
} else {
  for (const p of products) p.image = p.image_source ? `${p.slug}.jpg` : null;
}

// ── write ───────────────────────────────────────────────────────────

const menu = {
  source: { site: SITE, api: API, fetched_on: new Date().toISOString().slice(0, 10) },
  store: {
    name: 'Sun City',
    address: 'вул. 10 ОГШБ 52а, м. Малин',
    phone: '+380684868060',
    hours: { open: '11:00', close: '22:30' },
    logo: 'logo.png',
  },
  categories,
  modifier_groups: modifierGroups,
  products,
  notes,
};
writeFileSync(OUT_JSON, `${JSON.stringify(menu, null, 2)}\n`);
console.log(
  `${products.length} страв, ${categories.length} категорій, ${folded.length} піц; приміток: ${notes.length}`
);
for (const note of notes) console.log(`  · ${note}`);
