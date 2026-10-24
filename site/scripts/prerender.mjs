// Static prerender: runs after `vite build` (client, dist/) and
// `vite build --ssr` (dist-ssr/). For every route it renders the page to a
// string, injects it into the built template at <div id="root"></div> and the
// head markup at <!--app-head-->, and writes dist/<out>. Also emits
// sitemap.xml and llms.txt. Every check here fails the build on purpose: a
// page that ships without its content or schema is the bug this exists to
// prevent.
//
// The sitemap's <lastmod> is not typed by hand: site/sitemap-lastmod.json
// keeps, per page, a hash of what the page says (scripts/content-hash.mjs) and
// the day that hash last changed. A page whose content no longer matches its
// hash has changed since the last `npm run sitemap:stamp` (which runs this with
// --stamp and writes today's date); CI sets SITEMAP_STRICT=1 and fails on it,
// any other build warns and uses today. Hand-kept dates went stale exactly
// where it hurt: /dovidka gained a dozen articles under a 2026-09-30 lastmod.
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentHash, todayKyiv } from './content-hash.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const distSsr = fileURLToPath(new URL('../dist-ssr/', import.meta.url));
const manifestPath = fileURLToPath(new URL('../sitemap-lastmod.json', import.meta.url));
const STAMP = process.argv.includes('--stamp');
const STRICT = process.env.SITEMAP_STRICT === '1';

const { ROUTES, render, buildSitemap, buildLlmsTxt } = await import(join(distSsr, 'entry-server.js'));

const ROOT = '<div id="root"></div>';
const HEAD = '<!--app-head-->';

function fail(route, message) {
  throw new Error(`[prerender] ${route.path} (${route.out}): ${message}`);
}

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const pages = [];

/** @type {Record<string, { lastmod: string; hash: string }>} */
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  // No manifest yet: every page counts as changed today.
}
const today = todayKyiv();
const lastmod = {};
const stamped = {};
const changed = [];

for (const route of ROUTES) {
  const template = await readFile(join(dist, route.template), 'utf8');
  if (!template.includes(ROOT)) fail(route, `template ${route.template} has no ${ROOT}`);
  if (!template.includes(HEAD)) fail(route, `template ${route.template} has no ${HEAD}`);

  const { html, head } = render(route);
  if (!html.trim()) fail(route, 'rendered empty markup');

  const out = template
    .replace(HEAD, () => head)
    .replace(ROOT, () => `<div id="root">${html}</div>`);

  if (!/<h1[\s>]/.test(out)) fail(route, 'no <h1> in output');
  if (route.jsonLd.length && !out.includes('application/ld+json')) fail(route, 'JSON-LD missing');
  if (/opacity:\s*0[;"]/.test(out)) fail(route, 'inline opacity:0 — content would be hidden for crawlers');
  if (!/<title>[^<]+<\/title>/.test(out)) fail(route, 'no <title>');

  for (const [, asset] of out.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) {
    try {
      await access(join(dist, 'assets', asset));
    } catch {
      fail(route, `references missing asset /assets/${asset}`);
    }
  }

  const target = join(dist, route.out);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, out);

  if (route.sitemap) {
    const hash = contentHash(out);
    const known = manifest[route.path];
    if (known && known.hash === hash) {
      stamped[route.path] = known;
    } else {
      changed.push(route.path);
      stamped[route.path] = { lastmod: today, hash };
    }
    lastmod[route.path] = stamped[route.path].lastmod;
  }

  const title = unescapeHtml(out.match(/<title>([^<]+)<\/title>/)[1]);
  const description = unescapeHtml(out.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? '');
  pages.push({ path: route.path, title, description });
  console.log(`[prerender] ${route.path} → ${route.out} (${Math.round(out.length / 1024)} KB)`);
}

// A page that left the site leaves the manifest too, on the next stamp.
const gone = Object.keys(manifest).filter((path) => !(path in stamped));
if (STAMP) {
  await writeFile(manifestPath, JSON.stringify(stamped, null, 2) + '\n');
  console.log(
    changed.length || gone.length
      ? `[sitemap] stamped ${today}: ${[...changed, ...gone.map((p) => `${p} (removed)`)].join(', ')}`
      : '[sitemap] every page matches its stamp'
  );
} else if (changed.length || gone.length) {
  const message =
    `[sitemap] changed since the last stamp: ${[...changed, ...gone.map((p) => `${p} (removed)`)].join(', ')}. ` +
    'Run `npm run sitemap:stamp` in site/ and commit site/sitemap-lastmod.json, so <lastmod> says when each page really changed.';
  if (STRICT) throw new Error(message);
  console.warn(`${message} Using ${today} for now.`);
}

await writeFile(join(dist, 'sitemap.xml'), buildSitemap(lastmod));
await writeFile(join(dist, 'llms.txt'), buildLlmsTxt(pages));
await rm(join(dist, 'dovidka.html'), { force: true });
await rm(join(dist, 'vertical.html'), { force: true });
await rm(distSsr, { recursive: true, force: true });
console.log(`[prerender] ${ROUTES.length} pages, sitemap.xml, llms.txt`);
