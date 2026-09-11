// Static prerender: runs after `vite build` (client, dist/) and
// `vite build --ssr` (dist-ssr/). For every route it renders the page to a
// string, injects it into the built template at <div id="root"></div> and the
// head markup at <!--app-head-->, and writes dist/<out>. Also emits
// sitemap.xml and llms.txt. Every check here fails the build on purpose: a
// page that ships without its content or schema is the bug this exists to
// prevent.
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const distSsr = fileURLToPath(new URL('../dist-ssr/', import.meta.url));

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

  const title = unescapeHtml(out.match(/<title>([^<]+)<\/title>/)[1]);
  const description = unescapeHtml(out.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? '');
  pages.push({ path: route.path, title, description });
  console.log(`[prerender] ${route.path} → ${route.out} (${Math.round(out.length / 1024)} KB)`);
}

await writeFile(join(dist, 'sitemap.xml'), buildSitemap());
await writeFile(join(dist, 'llms.txt'), buildLlmsTxt(pages));
await rm(join(dist, 'dovidka.html'), { force: true });
await rm(distSsr, { recursive: true, force: true });
console.log(`[prerender] ${ROUTES.length} pages, sitemap.xml, llms.txt`);
