#!/usr/bin/env node
// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/backfill-store-catalog.mjs — fill the two things a shop owner forgets
// (TechDocs/POS_CLOTHING.md, phase C1): a barcode on every variant and a picture
// on every product. Talks to a store's own API as its owner, so it can do
// nothing the owner's screen cannot, and touches nothing else:
//
//   · barcodes — `POST /variants/internal-barcode` (the same generator the
//     «Згенерувати» button calls) + `PATCH /variants/:id { barcode }`. A
//     variant that already has one, and every SKU, is left alone;
//   · pictures — a schematic flat garment (`lib/kids-garments.mjs`, the look of
//     the demo store) rendered to PNG, `POST /uploads`, `PATCH /products/:id
//     { image_url }`. A product that already has a photo keeps it.
//
// Nothing here is store-specific and NOTHING secret lives in the repository: the
// API, the store slug and the owner's PIN come from the environment.
//
//   POS_API=https://the-live.shop POS_STORE=<slug> POS_PIN=<owner pin> \
//     node scripts/backfill-store-catalog.mjs --dry-run
//
// Flags
//   --dry-run        read, print the plan, write nothing (default is to write)
//   --only=barcodes|pictures   one step instead of both
//   --limit=N        at most N variants / N products per step (a trial run)
//   --preview=DIR    also write every rendered PNG (and the plan) into DIR
//   --out=DIR        where the before/after snapshots go (default: a temp dir —
//                    they are the store's data, never the repository)
//   --selftest       check the pure helpers offline and exit
//
// After writing, the catalogue is read again and compared with the snapshot
// taken before: the only fields allowed to differ are a variant's `barcode`
// (and `updated_at`) and a product's `image_url` (and `updated_at`). Anything
// else is reported and the exit code is 1.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyGarment, colourFromText, garmentSvg } from './lib/kids-garments.mjs';

// ── small pure helpers (exercised by --selftest) ────────────────────────

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code) {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** The colour a product should be drawn in: its first live variant's own colour, else its label's first part. */
export function productColour(product) {
  const variants = (product.variants ?? []).slice().sort((a, b) => Number(b.is_active) - Number(a.is_active));
  for (const v of variants) {
    const colour = v.attributes?.color;
    if (colour && String(colour).trim()) return String(colour);
  }
  for (const v of variants) {
    const first = String(v.label ?? '').split(/\s*[/·]\s*/)[0];
    if (first && colourFromText(first).known) return first;
  }
  return '';
}

/** What will be drawn for a product — printed in the plan so the owner can see it before anything is written. */
export function describePicture(product) {
  const colour = productColour(product);
  return { garment: classifyGarment(product.name), colour, known: colourFromText(colour).known };
}

// ── API ─────────────────────────────────────────────────────────────────

function client({ api, token }) {
  async function call(method, route, { json, form } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const res = await fetch(`${api}/api/pos${route}`, { method, headers, body });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      const err = new Error(`${method} ${route} → ${res.status} ${data?.error ?? data?.raw ?? ''}`.trim());
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return { call };
}

async function login({ api, store, pin }) {
  const res = await fetch(`${api}/api/pos/auth/staff/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_slug: store, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`login → ${res.status} ${data.error ?? ''}`.trim());
  if (data.staff?.role !== 'owner') throw new Error('this tool needs the owner\'s PIN (products are owner-only)');
  return data;
}

// ── rendering ───────────────────────────────────────────────────────────

async function openRenderer() {
  // Playwright lives in pos/ (its dev dependency); the browser is the one the
  // environment already has, never a fresh download.
  const candidates = [
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'pos', 'node_modules', 'playwright', 'index.mjs'),
    'playwright',
  ];
  let chromium;
  for (const c of candidates) {
    try {
      ({ chromium } = await import(c.startsWith('/') ? pathToFileURL(c).href : c));
      break;
    } catch {
      /* try the next */
    }
  }
  if (!chromium) throw new Error('playwright not found (npm --prefix pos install)');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1 });
  return {
    /** SVG text → PNG bytes, 480×480, corners transparent (the card's own rounded rect shows). */
    async png(svg) {
      const sized = svg.replace('width="240" height="240"', 'width="480" height="480"');
      await page.setContent(`<body style="margin:0;background:transparent">${sized}</body>`);
      return page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: 480, height: 480 } });
    },
    close: () => browser.close(),
  };
}

// ── snapshots and the before/after check ────────────────────────────────

const PRODUCT_MAY_CHANGE = new Set(['image_url', 'updated_at']);
const VARIANT_MAY_CHANGE = new Set(['barcode', 'updated_at']);

function diffFields(before, after, allowed) {
  const out = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (allowed.has(key) || key === 'variants') continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out.push(key);
  }
  return out;
}

/** Everything that changed outside what this tool is allowed to write. Empty = clean. */
export function unexpectedChanges(before, after) {
  const problems = [];
  const b = new Map(before.map((p) => [p.id, p]));
  const a = new Map(after.map((p) => [p.id, p]));
  for (const id of b.keys()) if (!a.has(id)) problems.push(`product ${id} disappeared`);
  for (const id of a.keys()) if (!b.has(id)) problems.push(`product ${id} appeared`);
  for (const [id, p0] of b) {
    const p1 = a.get(id);
    if (!p1) continue;
    for (const f of diffFields(p0, p1, PRODUCT_MAY_CHANGE)) problems.push(`product ${id}: «${f}» changed`);
    const v0 = new Map((p0.variants ?? []).map((v) => [v.id, v]));
    const v1 = new Map((p1.variants ?? []).map((v) => [v.id, v]));
    for (const vid of v0.keys()) if (!v1.has(vid)) problems.push(`variant ${vid} disappeared`);
    for (const vid of v1.keys()) if (!v0.has(vid)) problems.push(`variant ${vid} appeared`);
    for (const [vid, x0] of v0) {
      const x1 = v1.get(vid);
      if (!x1) continue;
      for (const f of diffFields(x0, x1, VARIANT_MAY_CHANGE)) problems.push(`variant ${vid}: «${f}» changed`);
    }
  }
  return problems;
}

// ── selftest ────────────────────────────────────────────────────────────

function selftest() {
  const fail = [];
  const eq = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fail.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };

  // EAN-13: the internal codes the server mints are «29» + counter + check digit.
  eq('ean check 400638133393', ean13CheckDigit('400638133393'), 1);
  eq('ean valid', isValidEan13('4006381333931'), true);
  eq('ean bad digit', isValidEan13('4006381333932'), false);
  eq('ean short', isValidEan13('29000000001'), false);

  eq('garment костюмчик', classifyGarment('Костюмчик Зайчик'), 'set');
  eq('garment комплект', classifyGarment('Комплект нарядний'), 'set');
  eq('garment чоловічок', classifyGarment('Чоловічок нарядний'), 'romper');
  eq('garment боді', classifyGarment('Боді з довгим рукавом'), 'romper');
  eq('garment сукня', classifyGarment('Сукня Свято'), 'dress');
  eq('garment реглан', classifyGarment('Реглан'), 'top');
  eq('garment бомбер', classifyGarment('Бомбер Міні'), 'jacket');
  eq('garment жилетка', classifyGarment('Костюм Желетка КЕЕР'), 'set');
  eq('garment unknown → top', classifyGarment('Щось'), 'top');

  eq('colour plain', colourFromText('блакитний').known, true);
  eq('colour case-insensitive', colourFromText('Малиновий').base, colourFromText('малиновий').base);
  eq('colour typo', colourFromText('МІН св щоколад').known, true);
  eq('colour compound has accent', colourFromText('біло-блакитний').accent !== null, true);
  eq('colour dots', colourFromText('рожевий в горошок').dots, true);
  eq('colour unknown → fallback', colourFromText('МІН').known, false);
  eq('colour empty → fallback', colourFromText('').known, false);
  eq('light is lighter', colourFromText('світло-синій').base !== colourFromText('синій').base, true);

  for (const g of ['top', 'romper', 'dress', 'jacket', 'set']) {
    const svg = garmentSvg({ garment: g, colour: 'рожевий в горошок' });
    if (!svg.startsWith('<svg ') || !svg.includes('viewBox="0 0 240 240"') || svg.includes('undefined') || svg.includes('NaN')) {
      fail.push(`svg ${g}: malformed`);
    }
  }

  eq(
    'colour from attributes',
    productColour({ variants: [{ is_active: false, attributes: { color: 'старий' } }, { is_active: true, attributes: { color: 'новий' } }] }),
    'новий'
  );
  eq('colour from label', productColour({ variants: [{ is_active: true, attributes: {}, label: 'блакитний / 98-104' }] }), 'блакитний');

  // The guard: only barcode / image_url may differ.
  const p = (over = {}, vover = {}) => ({
    id: 1, name: 'A', image_url: null, updated_at: 't0',
    variants: [{ id: 10, label: 'x', barcode: null, sku: 's', price_cents: 100, updated_at: 't0', ...vover }], ...over,
  });
  eq('guard: clean', unexpectedChanges([p()], [p({ image_url: '/u.png', updated_at: 't1' }, { barcode: '29', updated_at: 't1' })]), []);
  eq('guard: sku', unexpectedChanges([p()], [p({}, { sku: 'other' })]), ['variant 10: «sku» changed']);
  eq('guard: name', unexpectedChanges([p()], [p({ name: 'B' })]), ['product 1: «name» changed']);
  eq('guard: price', unexpectedChanges([p()], [p({}, { price_cents: 101 })]), ['variant 10: «price_cents» changed']);
  eq('guard: variant gone', unexpectedChanges([p()], [p({ variants: [] })]), ['variant 10 disappeared']);

  if (fail.length) {
    console.error(fail.join('\n'));
    process.exit(1);
  }
  console.log('selftest ok');
}

// ── main ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { dryRun: false, only: null, limit: Infinity, preview: null, out: null, selftest: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--selftest') flags.selftest = true;
    else if (arg.startsWith('--only=')) flags.only = arg.slice(7);
    else if (arg.startsWith('--limit=')) flags.limit = Number(arg.slice(8));
    else if (arg.startsWith('--preview=')) flags.preview = arg.slice(10);
    else if (arg.startsWith('--out=')) flags.out = arg.slice(6);
    else throw new Error(`unknown flag ${arg}`);
  }
  if (flags.only && !['barcodes', 'pictures'].includes(flags.only)) throw new Error('--only is barcodes or pictures');
  if (!(flags.limit > 0)) throw new Error('--limit must be a positive number');
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.selftest) return selftest();

  const api = (process.env.POS_API ?? 'https://the-live.shop').replace(/\/+$/, '');
  const store = process.env.POS_STORE;
  const pin = process.env.POS_PIN;
  if (!store || !pin) throw new Error('set POS_STORE and POS_PIN (and POS_API if not production)');

  const session = await login({ api, store, pin });
  const http = client({ api, token: session.token });
  console.log(`вхід: ${session.store?.name ?? store} (${session.staff?.role}), vertical=${session.store?.vertical?.id ?? session.store?.vertical ?? "?"}`);

  const outDir = flags.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
  fs.mkdirSync(outDir, { recursive: true });
  const before = await http.call('GET', '/products');
  fs.writeFileSync(path.join(outDir, 'before.json'), JSON.stringify(before, null, 2));

  const doBarcodes = flags.only !== 'pictures';
  const doPictures = flags.only !== 'barcodes';

  const needBarcode = before.flatMap((p) => (p.variants ?? []).filter((v) => !v.barcode).map((v) => ({ p, v })));
  const needPicture = before.filter((p) => !p.image_url);
  const barcodeWork = needBarcode.slice(0, flags.limit);
  const pictureWork = needPicture.slice(0, flags.limit);

  console.log(`товарів: ${before.length}, варіантів: ${before.reduce((n, p) => n + (p.variants?.length ?? 0), 0)}`);
  console.log(`без штрихкоду: ${needBarcode.length}${doBarcodes ? `, візьму ${barcodeWork.length}` : ' (пропускаю)'}`);
  console.log(`без фото: ${needPicture.length}${doPictures ? `, візьму ${pictureWork.length}` : ' (пропускаю)'}`);

  const shapeCount = {};
  const unknownColour = [];
  for (const p of pictureWork) {
    const d = describePicture(p);
    shapeCount[d.garment] = (shapeCount[d.garment] ?? 0) + 1;
    if (!d.known) unknownColour.push(`${p.id} «${p.name}» колір «${d.colour}»`);
  }
  if (doPictures) {
    console.log('малюнки:', JSON.stringify(shapeCount));
    if (unknownColour.length) console.log(`колір не розпізнано (нейтральний беж) у ${unknownColour.length}:\n  ${unknownColour.join('\n  ')}`);
  }
  console.log(`знімок «до»: ${path.join(outDir, 'before.json')}`);
  if (flags.dryRun) {
    // A dry run with --preview still draws the pictures — locally, so they can
    // be looked at before a single one is uploaded.
    if (flags.preview && doPictures && pictureWork.length) {
      const renderer = await openRenderer();
      fs.mkdirSync(flags.preview, { recursive: true });
      try {
        for (const p of pictureWork) {
          const d = describePicture(p);
          fs.writeFileSync(path.join(flags.preview, `${String(p.id).padStart(4, '0')}-${d.garment}.png`), await renderer.png(garmentSvg(d)));
        }
      } finally {
        await renderer.close();
      }
      console.log(`--preview: ${pictureWork.length} PNG у ${flags.preview}`);
    }
    console.log('--dry-run: нічого не записано');
    return;
  }

  if (doBarcodes) {
    let done = 0;
    for (const { p, v } of barcodeWork) {
      const { barcode } = await http.call('POST', '/variants/internal-barcode');
      if (!isValidEan13(barcode)) throw new Error(`the server minted an invalid EAN-13: ${barcode}`);
      await http.call('PATCH', `/variants/${v.id}`, { json: { barcode } });
      done++;
      if (done % 10 === 0 || done === barcodeWork.length) console.log(`  штрихкоди: ${done}/${barcodeWork.length}`);
    }
  }

  if (doPictures && pictureWork.length) {
    const renderer = await openRenderer();
    if (flags.preview) fs.mkdirSync(flags.preview, { recursive: true });
    try {
      let done = 0;
      for (const p of pictureWork) {
        const d = describePicture(p);
        const png = await renderer.png(garmentSvg({ garment: d.garment, colour: d.colour }));
        if (flags.preview) fs.writeFileSync(path.join(flags.preview, `${String(p.id).padStart(4, '0')}-${d.garment}.png`), png);
        const form = new FormData();
        form.append('file', new Blob([png], { type: 'image/png' }), `product-${p.id}.png`);
        const saved = await http.call('POST', '/uploads', { form });
        if (!/^\/pos-uploads\/[\w-]+\.png$/.test(saved?.url ?? '')) throw new Error(`unexpected upload answer for product ${p.id}`);
        await http.call('PATCH', `/products/${p.id}`, { json: { image_url: saved.url } });
        done++;
        if (done % 10 === 0 || done === pictureWork.length) console.log(`  фото: ${done}/${pictureWork.length}`);
      }
    } finally {
      await renderer.close();
    }
  }

  const after = await http.call('GET', '/products');
  fs.writeFileSync(path.join(outDir, 'after.json'), JSON.stringify(after, null, 2));

  const problems = unexpectedChanges(before, after);
  const barcodes = after.flatMap((p) => (p.variants ?? []).map((v) => v.barcode).filter(Boolean));
  const dup = barcodes.length - new Set(barcodes).size;
  const badEan = barcodes.filter((b) => /^29\d{11}$/.test(b) && !isValidEan13(b));
  const stillNoBarcode = after.flatMap((p) => p.variants ?? []).filter((v) => !v.barcode).length;
  const stillNoPicture = after.filter((p) => !p.image_url).length;
  console.log(`після: без штрихкоду ${stillNoBarcode}, без фото ${stillNoPicture}, дублів штрихкодів ${dup}, хибних контрольних цифр ${badEan.length}`);
  if (problems.length || dup || badEan.length) {
    console.error(`ПОМИЛКА ПЕРЕВІРКИ:\n  ${[...problems, dup ? `${dup} duplicate barcodes` : '', ...badEan.map((b) => `bad EAN ${b}`)].filter(Boolean).join('\n  ')}`);
    process.exit(1);
  }
  console.log('перевірка «до/після»: змінилися лише barcode і image_url');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
