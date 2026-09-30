// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// scripts/normalize-store-sizes.mjs — bring a children's shop's size labels to one
// readable form (TechDocs/POS_CLOTHING.md, phase C1d).
//
// A baby-wear catalogue built by hand holds sizes written every way: «3-6»,
// «12-18» (months), «2-3», «4-5» (years), «2», «3», «4» (an age? a height?),
// «98/104», «98–104», «98-104». The matrix now writes an age with its unit and as
// a range — «3–6 міс», «3–4 роки» — so nobody has to guess; this tool does the
// same to what is already there:
//
//   · a height («86», «98-104») stays, only the separator is made one (`98/104` → `98-104`);
//   · a range of months or years gets its unit — «3-6» → «3–6 міс», «4-5» → «4–5 років»;
//   · an explicit age is re-worded the one way («3-6 міс.» → «3–6 міс»);
//   · a BARE small number («2», «3», «4») is an age — but «up to 4 years» or «a
//     four-year-old» is the owner's meaning, not ours: it is only listed, unless
//     `--bare-years=upper|lower` says how to read it (see below);
//   · anything else (letters, shoes, odd text) is left alone and listed.
//
// It runs as a DRY RUN: it reads the catalogue and prints «було → стане», writing
// nothing. `--apply` writes — only `attributes.size` of the listed variants
// (`PATCH /variants/:id`; the server rederives the label) — and afterwards reads
// the catalogue again and FAILS if anything but a size and its label changed.
//
// Nothing secret lives here: the API, the store slug and the owner's PIN come
// from the environment. Run with tsx (it reads the ladder from the same source
// the server uses, so the two cannot drift):
//
//   POS_STORE=<slug> POS_PIN=<owner pin> npx tsx scripts/normalize-store-sizes.mjs
//   … --bare-years=upper   «4» means «до 4 років»  → «3–4 роки»
//   … --bare-years=lower   «4» means a four-year-old → «4–5 років»
//   … --apply              actually write
//
// Flags: `--out=DIR` (where before/after snapshots and plan.json go; default a
// temp dir — it is the store's data, never the repository), `--selftest`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { monthsLabel, parseSize, yearsLabel } from '../src/pos/verticals/sizeLadder.ts';

// ── the classification (pure; exercised by --selftest) ─────────────────

/** Folds every dash and slash to a hyphen and tidies spaces — only for READING a label. */
function fold(text) {
  return String(text ?? '')
    .trim()
    .replace(/[–—/]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

const EXPLICIT_MONTHS = /^(\d{1,2})-(\d{1,2}) ?(?:міс|місяць|місяці|місяців)\.?$/i;
const EXPLICIT_YEARS = /^(\d{1,2})-(\d{1,2}) ?(?:р|рік|роки|років|рр)\.?$/i;
const HEIGHT = /^(\d{2,3})(?:-(\d{2,3}))?(?: ?см)?$/;
const SMALL_PAIR = /^(\d{1,2})-(\d{1,2})$/;
const BARE_AGE = /^(\d{1,2})$/;

/**
 * One size label → what to do with it.
 * `{ action: 'keep' | 'rename' | 'confirm' | 'unknown', to?, why }`.
 * `bareYears` is `'skip' | 'upper' | 'lower'` (what a bare «4» means).
 */
export function classifySize(label, bareYears = 'skip') {
  const text = String(label ?? '').trim();
  if (text === '') return { action: 'keep', why: 'без розміру' };
  const t = fold(text);

  const explicit = (to, why) => (to === text ? { action: 'keep', why: 'уже зрозуміло' } : { action: 'rename', to, why });

  let m = EXPLICIT_MONTHS.exec(t);
  if (m) return explicit(monthsLabel(Number(m[1]), Number(m[2])), 'місяці: одне написання');
  m = EXPLICIT_YEARS.exec(t);
  if (m) return explicit(yearsLabel(Number(m[1]), Number(m[2])), 'роки: одне написання');

  m = HEIGHT.exec(t);
  if (m) {
    const low = Number(m[1]);
    const high = m[2] === undefined ? low : Number(m[2]);
    if (low >= 50 && high <= 170 && low <= high && !(m[2] !== undefined && low === high)) {
      const canonical = m[2] === undefined ? String(low) : `${low}-${high}`;
      return canonical === text ? { action: 'keep', why: 'зріст' } : { action: 'rename', to: canonical, why: 'зріст: один розділювач' };
    }
  }

  m = SMALL_PAIR.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a < b && b <= 24 && (b - a === 3 || b - a === 6)) return { action: 'rename', to: monthsLabel(a, b), why: `діапазон ${a}–${b} = місяці` };
    if (b - a === 1 && b <= 14) return { action: 'rename', to: yearsLabel(a, b), why: `діапазон ${a}–${b} = роки` };
    return { action: 'unknown', why: `діапазон ${a}–${b}: не місяці й не роки` };
  }

  m = BARE_AGE.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (n > 14) return { action: 'unknown', why: `голе ${n}: схоже не на вік` };
    if (bareYears === 'upper' && n >= 2) return { action: 'rename', to: yearsLabel(n - 1, n), why: `«${n}» = до ${n} років` };
    if (bareYears === 'lower' && n >= 1) return { action: 'rename', to: yearsLabel(n, n + 1), why: `«${n}» = ${n}-річній дитині` };
    return { action: 'confirm', why: `голе «${n}»: вік? зріст? — потрібне підтвердження (--bare-years=upper|lower)` };
  }

  return { action: 'unknown', why: 'не схоже на розмір дитячого одягу' };
}

/** After the plan: two sizes of ONE product and colour that land on the same rung under different names. */
export function sameRungCollisions(rows) {
  const groups = new Map();
  for (const r of rows) {
    const target = r.action === 'rename' ? r.to : r.size;
    const parsed = parseSize(target);
    if (!parsed) continue;
    const key = `${r.productId}|${String(r.color).toLowerCase()}|${parsed.low}-${parsed.high}`;
    const list = groups.get(key) ?? [];
    list.push({ ...r, target });
    groups.set(key, list);
  }
  return [...groups.values()].filter((g) => new Set(g.map((x) => x.target)).size > 1);
}

// ── the before/after guard ─────────────────────────────────────────────

/** Anything that changed beyond a variant's size and its derived label (and updated_at). Empty = clean. */
export function unexpectedChanges(before, after) {
  const problems = [];
  const b = new Map(before.map((p) => [p.id, p]));
  const a = new Map(after.map((p) => [p.id, p]));
  for (const id of b.keys()) if (!a.has(id)) problems.push(`product ${id} disappeared`);
  for (const id of a.keys()) if (!b.has(id)) problems.push(`product ${id} appeared`);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  for (const [id, p0] of b) {
    const p1 = a.get(id);
    if (!p1) continue;
    for (const key of new Set([...Object.keys(p0), ...Object.keys(p1)])) {
      if (key === 'variants' || key === 'updated_at') continue;
      if (!same(p0[key], p1[key])) problems.push(`product ${id}: «${key}» changed`);
    }
    const v0 = new Map((p0.variants ?? []).map((v) => [v.id, v]));
    const v1 = new Map((p1.variants ?? []).map((v) => [v.id, v]));
    for (const vid of v0.keys()) if (!v1.has(vid)) problems.push(`variant ${vid} disappeared`);
    for (const vid of v1.keys()) if (!v0.has(vid)) problems.push(`variant ${vid} appeared`);
    for (const [vid, x0] of v0) {
      const x1 = v1.get(vid);
      if (!x1) continue;
      for (const key of new Set([...Object.keys(x0), ...Object.keys(x1)])) {
        if (key === 'updated_at' || key === 'label') continue;
        if (key === 'attributes') {
          const { size: _s0, ...rest0 } = x0.attributes ?? {};
          const { size: _s1, ...rest1 } = x1.attributes ?? {};
          if (!same(rest0, rest1)) problems.push(`variant ${vid}: an attribute other than «size» changed`);
          continue;
        }
        if (!same(x0[key], x1[key])) problems.push(`variant ${vid}: «${key}» changed`);
      }
    }
  }
  return problems;
}

// ── the selftest ───────────────────────────────────────────────────────

function selftest() {
  const fail = [];
  const eq = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fail.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  };
  const c = (label, bare) => {
    const r = classifySize(label, bare);
    return [r.action, r.to ?? null];
  };

  // heights stay; a separator is made one
  eq('height', c('86'), ['keep', null]);
  eq('height pair hyphen', c('98-104'), ['keep', null]);
  eq('height pair slash', c('98/104'), ['rename', '98-104']);
  eq('height pair en dash', c('98–104'), ['rename', '98-104']);
  eq('height with см', c('92 см'), ['rename', '92']);
  // ranges get a unit
  eq('months 3-6', c('3-6'), ['rename', '3–6 міс']);
  eq('months 12-18', c('12-18'), ['rename', '12–18 міс']);
  eq('months 0-3', c('0-3'), ['rename', '0–3 міс']);
  eq('months en dash', c('9–12'), ['rename', '9–12 міс']);
  eq('years 2-3', c('2-3'), ['rename', '2–3 роки']);
  eq('years 4-5', c('4-5'), ['rename', '4–5 років']);
  eq('years 5-6', c('5-6'), ['rename', '5–6 років']);
  eq('odd range', c('2-4'), ['unknown', null]);
  // an explicit age is re-worded one way
  eq('explicit months dot', c('3-6 міс.'), ['rename', '3–6 міс']);
  eq('explicit months ok', c('3–6 міс'), ['keep', null]);
  eq('explicit years abbreviation', c('2-3 р.'), ['rename', '2–3 роки']);
  eq('explicit years ok', c('3–4 роки'), ['keep', null]);
  // a bare small number: the owner's meaning, never ours
  eq('bare skip', c('4'), ['confirm', null]);
  eq('bare skip explicit', c('4', 'skip'), ['confirm', null]);
  eq('bare upper 4', c('4', 'upper'), ['rename', '3–4 роки']);
  eq('bare upper 2', c('2', 'upper'), ['rename', '1–2 роки']);
  eq('bare upper 1 stays unsure', c('1', 'upper'), ['confirm', null]);
  eq('bare lower 4', c('4', 'lower'), ['rename', '4–5 років']);
  eq('bare lower 2', c('2', 'lower'), ['rename', '2–3 роки']);
  eq('bare lower 0 stays unsure', c('0', 'lower'), ['confirm', null]);
  eq('bare big is not an age', c('26'), ['unknown', null]);
  // the rest is left alone
  eq('letters', c('XL'), ['unknown', null]);
  eq('text', c('Універсальний'), ['unknown', null]);
  eq('empty', c(''), ['keep', null]);
  eq('null', c(null), ['keep', null]);

  // two names for one rung inside one product and colour
  const rows = [
    { productId: 1, color: 'блакитний', size: '86', action: 'keep' },
    { productId: 1, color: 'блакитний', size: '12-18', action: 'rename', to: '12–18 міс' },
    { productId: 1, color: 'рожевий', size: '12-18', action: 'rename', to: '12–18 міс' },
    { productId: 2, color: 'сірий', size: '62', action: 'keep' },
    { productId: 2, color: 'сірий', size: '3-6', action: 'rename', to: '3–6 міс' },
  ];
  eq('collisions', sameRungCollisions(rows).map((g) => g.map((x) => x.target)), [['86', '12–18 міс']]);

  // the guard
  const v = (over = {}, attrs = {}) => ({
    id: 10, sku: 's', barcode: '29', price_cents: 100, quantity: 1, is_active: true, label: 'x', updated_at: 't0',
    attributes: { color: 'c', size: '3-6', ...attrs }, ...over,
  });
  const p = (vars, over = {}) => ({ id: 1, name: 'A', image_url: '/u.png', updated_at: 't0', variants: vars, ...over });
  eq('guard clean', unexpectedChanges([p([v()])], [p([v({ label: 'c / 3–6 міс', updated_at: 't1' }, { size: '3–6 міс' })])]), []);
  eq('guard price', unexpectedChanges([p([v()])], [p([v({ price_cents: 101 })])]), ['variant 10: «price_cents» changed']);
  eq('guard barcode', unexpectedChanges([p([v()])], [p([v({ barcode: '30' })])]), ['variant 10: «barcode» changed']);
  eq('guard colour', unexpectedChanges([p([v()])], [p([v({}, { color: 'd' })])]), ['variant 10: an attribute other than «size» changed']);
  eq('guard name', unexpectedChanges([p([v()])], [p([v()], { name: 'B' })]), ['product 1: «name» changed']);
  eq('guard image', unexpectedChanges([p([v()])], [p([v()], { image_url: null })]), ['product 1: «image_url» changed']);
  eq('guard gone', unexpectedChanges([p([v()])], [p([])]), ['variant 10 disappeared']);

  if (fail.length) {
    console.error(fail.join('\n'));
    process.exit(1);
  }
  console.log('selftest ok');
}

// ── API ────────────────────────────────────────────────────────────────

async function call(api, token, method, route, json) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${api}/api/pos${route}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${data?.error ?? data?.raw ?? ''}`.trim());
  return data;
}

async function login(api, store, pin) {
  const res = await fetch(`${api}/api/pos/auth/staff/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_slug: store, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`login → ${res.status} ${data.error ?? ''}`.trim());
  if (data.staff?.role !== 'owner') throw new Error("this tool needs the owner's PIN (products are owner-only)");
  return data;
}

// ── main ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = { apply: false, bareYears: 'skip', out: null, selftest: false };
  for (const arg of argv) {
    if (arg === '--apply') flags.apply = true;
    else if (arg === '--selftest') flags.selftest = true;
    else if (arg.startsWith('--bare-years=')) flags.bareYears = arg.slice(13);
    else if (arg.startsWith('--out=')) flags.out = arg.slice(6);
    else throw new Error(`unknown flag ${arg}`);
  }
  if (!['skip', 'upper', 'lower'].includes(flags.bareYears)) throw new Error('--bare-years is skip, upper or lower');
  return flags;
}

function plural(n, one, few, many) {
  const abs = Math.abs(n);
  if (abs % 100 >= 11 && abs % 100 <= 14) return many;
  if (abs % 10 === 1) return one;
  if (abs % 10 >= 2 && abs % 10 <= 4) return few;
  return many;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.selftest) return selftest();

  const api = (process.env.POS_API ?? 'https://the-live.shop').replace(/\/+$/, '');
  const store = process.env.POS_STORE;
  const pin = process.env.POS_PIN;
  if (!store || !pin) throw new Error('set POS_STORE and POS_PIN (and POS_API if not production)');

  const session = await login(api, store, pin);
  const token = session.token;
  console.log(`вхід: ${session.store?.name ?? store} (${session.staff?.role}), vertical=${session.store?.vertical?.id ?? '?'}`);

  const outDir = flags.out ?? fs.mkdtempSync(path.join(os.tmpdir(), 'sizes-'));
  fs.mkdirSync(outDir, { recursive: true });
  const before = await call(api, token, 'GET', '/products');
  fs.writeFileSync(path.join(outDir, 'before.json'), JSON.stringify(before, null, 2));

  const rows = [];
  for (const product of before) {
    for (const v of product.variants ?? []) {
      const size = v.attributes?.size;
      if (size === undefined || size === null) continue;
      const verdict = classifySize(size, flags.bareYears);
      rows.push({
        productId: product.id,
        product: product.name,
        variantId: v.id,
        active: v.is_active !== false,
        color: v.attributes?.color ?? '',
        attributes: v.attributes,
        size: String(size),
        ...verdict,
      });
    }
  }

  const by = (action) => rows.filter((r) => r.action === action);
  console.log(`варіантів із розміром: ${rows.length}`);
  console.log(`  без змін: ${by('keep').length}, перейменувати: ${by('rename').length}, потрібне підтвердження: ${by('confirm').length}, не чіпаю: ${by('unknown').length}`);

  if (by('rename').length) {
    console.log('\nПЕРЕЙМЕНУВАННЯ (було → стане):');
    for (const r of by('rename')) console.log(`  ${String(r.variantId).padStart(4)} ${r.product} · ${r.color || '—'} · «${r.size}» → «${r.to}»   (${r.why})`);
  }
  if (by('confirm').length) {
    const counts = {};
    for (const r of by('confirm')) counts[r.size] = (counts[r.size] ?? 0) + 1;
    console.log('\nПОТРІБНЕ ПІДТВЕРДЖЕННЯ — голі цифри (що означає «4»: «до 4 років» чи чотирирічній?):');
    console.log('  ' + Object.entries(counts).map(([k, n]) => `«${k}» ×${n}`).join(', '));
    for (const r of by('confirm')) console.log(`  ${String(r.variantId).padStart(4)} ${r.product} · ${r.color || '—'} · «${r.size}»`);
    console.log('  → --bare-years=upper  («4» = до 4 років → «3–4 роки»)  або  --bare-years=lower  («4» = чотирирічній → «4–5 років»)');
  }
  if (by('unknown').length) {
    console.log('\nНЕ ЧІПАЮ (не схоже на дитячий розмір):');
    for (const r of by('unknown')) console.log(`  ${String(r.variantId).padStart(4)} ${r.product} · ${r.color || '—'} · «${r.size}»   (${r.why})`);
  }
  const collisions = sameRungCollisions(rows);
  if (collisions.length) {
    console.log('\nОДНА СХОДИНКА ПІД ДВОМА ІМЕНАМИ в межах товару й кольору (лише звіт; об\'єднання — рішення власниці):');
    for (const g of collisions) console.log(`  ${g[0].product} · ${g[0].color || '—'}: ${g.map((x) => `«${x.target}»`).join(' і ')}`);
  }

  fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify(rows, null, 2));
  console.log(`\nзнімок «до» і план: ${outDir}`);

  const toWrite = by('rename');
  if (!flags.apply) {
    console.log(`--apply не вказано: нічого не записано (було б перейменовано ${toWrite.length} ${plural(toWrite.length, 'розмір', 'розміри', 'розмірів')})`);
    return;
  }

  let done = 0;
  for (const r of toWrite) {
    // The attribute bag is replaced wholesale by the server: send every attribute, changing only the size.
    await call(api, token, 'PATCH', `/variants/${r.variantId}`, { attributes: { ...r.attributes, size: r.to } });
    done++;
    if (done % 10 === 0 || done === toWrite.length) console.log(`  записано: ${done}/${toWrite.length}`);
  }

  const after = await call(api, token, 'GET', '/products');
  fs.writeFileSync(path.join(outDir, 'after.json'), JSON.stringify(after, null, 2));
  const problems = unexpectedChanges(before, after);
  const written = new Map(after.flatMap((p) => (p.variants ?? []).map((v) => [v.id, v.attributes?.size])));
  const wrong = toWrite.filter((r) => written.get(r.variantId) !== r.to);
  if (problems.length || wrong.length) {
    console.error(`ПОМИЛКА ПЕРЕВІРКИ:\n  ${[...problems, ...wrong.map((r) => `variant ${r.variantId}: size is «${written.get(r.variantId)}», wanted «${r.to}»`)].join('\n  ')}`);
    process.exit(1);
  }
  console.log('перевірка «до/після»: змінилися лише розміри (і похідні підписи)');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
