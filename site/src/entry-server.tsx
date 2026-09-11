// Built by `vite build --ssr` into dist-ssr/ and driven by scripts/prerender.mjs.
import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ROUTES, STATIC_PAGES, type SiteRoute } from './routes';
import { renderHeadHtml } from './lib/seo';
import { SITE_URL, ORG, PRODUCT, PRICING, FEATURES, POS_FEATURE_IDS, LIVE_FEATURE_IDS } from './lib/productFacts';

export { ROUTES };

export function render(route: SiteRoute): { html: string; head: string } {
  const html = renderToString(createElement(StrictMode, null, createElement(route.Component)));
  const head = renderHeadHtml(route.head, route.jsonLd);
  return { html, head };
}

export function buildSitemap(): string {
  const entries = [
    ...ROUTES.filter((r) => r.sitemap).map((r) => ({ path: r.path, lastmod: r.updatedAt })),
    ...STATIC_PAGES.map((p) => ({ path: p.path, lastmod: p.updatedAt })),
  ];
  const urls = entries
    .map((e) => `  <url>\n    <loc>${SITE_URL}${e.path}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export interface LlmsPage {
  path: string;
  title: string;
  description: string;
}

/** llms.txt — the pages' titles/descriptions come from the prerendered HTML so nothing is duplicated here. */
export function buildLlmsTxt(pages: LlmsPage[]): string {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const line = (path: string, fallbackTitle: string, fallbackDescription: string) => {
    const p = byPath.get(path);
    return `- [${p?.title ?? fallbackTitle}](${SITE_URL}${path}): ${p?.description ?? fallbackDescription}`;
  };
  const features = (ids: typeof POS_FEATURE_IDS) =>
    ids.map((id) => `  - ${FEATURES[id].label}${FEATURES[id].status === 'coming' ? ' — у планах' : ''}`).join('\n');
  const articles = ROUTES.filter((r) => r.path.startsWith('/dovidka/'));

  return [
    '# The Live Shop',
    '',
    `> LiveShop — два продукти для продажу одягу в Україні: автоматизація TikTok LIVE-продажів та POS-каса для магазину з фіскалізацією ПРРО, онлайн і офлайн. Власник — ${ORG.name} (ЄДРПОУ ${ORG.taxId}).`,
    '',
    '## Продукти',
    '',
    `- **${PRODUCT.pos.name}** (${PRODUCT.pos.url}): ${PRODUCT.pos.description} Ціна: ${PRICING.pos.label.toLowerCase()}.`,
    features(POS_FEATURE_IDS),
    `- **${PRODUCT.live.name}** (${PRODUCT.live.url}): ${PRODUCT.live.description} Ціна для перших користувачів: ${PRICING.live.label.toLowerCase()}.`,
    features(LIVE_FEATURE_IDS),
    '',
    '## Основні сторінки',
    '',
    line('/', 'Головна', 'огляд обох продуктів — TikTok LIVE та POS каса.'),
    line('/live', 'TikTok LIVE', PRODUCT.live.description),
    line('/pos', 'POS каса', PRODUCT.pos.description),
    line('/yaku-kasu-obraty', 'Яку касу обрати для магазину одягу', 'чесне порівняння підходів до вибору POS-системи.'),
    line('/dovidka', 'Довідка', 'короткі відповіді про касу, ПРРО і TikTok LIVE.'),
    ...STATIC_PAGES.map((p) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`),
    '',
    '## Довідка',
    '',
    ...articles.map((r) => line(r.path, r.head?.title ?? r.path, r.head?.description ?? '')),
    '',
  ].join('\n');
}
