import { SITE_URL } from './productFacts';
import { jsonLdScript } from './jsonLd/serialize';

export interface PageHead {
  title: string;
  description: string;
  path: string;
  ogImage: string;
  ogType?: 'website' | 'article';
  noindex?: boolean;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Head markup injected at the `<!--app-head-->` placeholder. The four original
 * page templates carry their own title/meta, so they pass `head: undefined`
 * and only get JSON-LD; the shared dovidka template has no SEO block of its
 * own and gets the full set.
 */
export function renderHeadHtml(head: PageHead | undefined, jsonLd: object[]): string {
  const parts: string[] = [];
  if (head) {
    const url = `${SITE_URL}${head.path}`;
    const image = `${SITE_URL}${head.ogImage}`;
    parts.push(
      `<title>${esc(head.title)}</title>`,
      `<meta name="description" content="${esc(head.description)}" />`,
      `<link rel="canonical" href="${url}" />`,
      `<meta name="robots" content="${head.noindex ? 'noindex, nofollow' : 'index, follow'}" />`,
      `<meta property="og:type" content="${head.ogType ?? 'website'}" />`,
      `<meta property="og:site_name" content="The Live Shop" />`,
      `<meta property="og:locale" content="uk_UA" />`,
      `<meta property="og:title" content="${esc(head.title)}" />`,
      `<meta property="og:description" content="${esc(head.description)}" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${esc(head.title)}" />`,
      `<meta name="twitter:description" content="${esc(head.description)}" />`,
      `<meta name="twitter:image" content="${image}" />`
    );
  }
  for (const data of jsonLd) parts.push(jsonLdScript(data));
  return parts.join('\n    ');
}
