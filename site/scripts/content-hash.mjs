// What a page SAYS, for the sitemap's <lastmod> (scripts/prerender.mjs): the
// text, links and images of its <main>, its title and description, and its
// JSON-LD. Navigation, footer, the fields of the lead form and CSS classes are
// left out on purpose — a redesign, a new link in the footer or a new field in
// the form that sits on every page is not a change to any one page, and Google
// keeps reading lastmod only while it stays honest. The heading above a form
// is outside the <form> and still counts.
import { createHash } from 'node:crypto';

const ENTITIES = { '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&amp;': '&' };

function decode(s) {
  return s.replace(/&(?:quot|#x27|#39|lt|gt|nbsp|amp);/g, (m) => ENTITIES[m]);
}

/**
 * The site's own Organization rides on every page (as a block and as each
 * article's author and publisher); an edit to it is not any one page's news,
 * so it is reduced to its @id. /about still changes through its visible text.
 */
function withoutOrganization(value) {
  if (Array.isArray(value)) return value.map(withoutOrganization);
  if (value && typeof value === 'object') {
    const type = value['@type'];
    if (type === 'Organization' || (Array.isArray(type) && type.includes('Organization'))) {
      return { '@id': value['@id'] ?? value.name ?? 'organization' };
    }
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, withoutOrganization(v)]));
  }
  return value;
}

function structuredData(block) {
  try {
    return JSON.stringify(withoutOrganization(JSON.parse(block)));
  } catch {
    return block;
  }
}

/** The parts of a prerendered page that count as its content. */
export function contentSignature(out) {
  // Forms do not nest in HTML, so the shortest match is the whole form.
  const main = (out.match(/<main[\s>][\s\S]*?<\/main>/)?.[0] ?? out).replace(/<form[\s>][\s\S]*?<\/form>/g, ' ');
  const refs = [...main.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  const text = decode(main.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const title = decode(out.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const description = decode(out.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? '');
  const jsonLd = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => structuredData(m[1]));
  return [title, description, text, refs.join(' '), ...jsonLd].join('\n');
}

export function contentHash(out) {
  return createHash('sha256').update(contentSignature(out)).digest('hex').slice(0, 16);
}

/** Today on the shop's calendar — a stamp written at 01:00 in Kyiv is that day's, not yesterday's UTC. */
export function todayKyiv() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
