// Built by `vite build --ssr` into dist-ssr/ and driven by scripts/prerender.mjs.
import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ROUTES, type SiteRoute } from './routes';
import { renderHeadHtml } from './lib/seo';
import {
  SITE_URL,
  ORG,
  PRODUCT,
  PRICING,
  FEATURES,
  POS_FEATURE_IDS,
  LIVE_FEATURE_IDS,
  VERTICALS,
  COMPETITOR_FACTS,
  ROADMAP,
} from './lib/productFacts';

export { ROUTES };

export function render(route: SiteRoute): { html: string; head: string } {
  const html = renderToString(createElement(StrictMode, null, createElement(route.Component)));
  const head = renderHeadHtml(route.head, route.jsonLd);
  return { html, head };
}

export function buildSitemap(): string {
  const entries = ROUTES.filter((r) => r.sitemap).map((r) => ({ path: r.path, lastmod: r.updatedAt }));
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
    `> LiveShop — POS-каса для чотирьох бізнесів в Україні (магазин одягу, квіткова крамниця, кав'ярня, ресторан зі столами) з фіскалізацією ПРРО через Checkbox, онлайн і офлайн, та автоматизація TikTok LIVE-продажів. Власник — ${ORG.name} (ЄДРПОУ ${ORG.taxId}).`,
    '',
    '## Продукти',
    '',
    `- **${PRODUCT.pos.name}** (${PRODUCT.pos.url}): ${PRODUCT.pos.description} Ціна: ${PRICING.pos.label.toLowerCase()}.`,
    features(POS_FEATURE_IDS),
    `- **${PRODUCT.live.name}** (${PRODUCT.live.url}): ${PRODUCT.live.description} Ціна для перших користувачів: ${PRICING.live.label.toLowerCase()}.`,
    features(LIVE_FEATURE_IDS),
    '',
    '## Тарифи POS',
    '',
    `- Зараз: ${PRICING.pos.launch.label.toLowerCase()}.`,
    ...PRICING.pos.plans.map(
      (plan) =>
        `- ${plan.name}: ${plan.price} ${PRICING.pos.currency}/міс за магазин до ${PRICING.pos.perStoreRegisters} кас. ${plan.note} Ціна закріплюється ${plan.lock}.${plan.status === 'coming' ? ' — у планах' : ''}`
    ),
    ...PRICING.pos.addons.map((addon) => `- ${addon.name}: +${addon.price} ${PRICING.pos.currency}/міс.`),
    `- ${PRICING.pos.billing} Для порівняння: ${COMPETITOR_FACTS.checkbox.name} з ${COMPETITOR_FACTS.checkbox.priceFromDate} піднімає ціну з ${COMPETITOR_FACTS.checkbox.priceNow} до ${COMPETITOR_FACTS.checkbox.priceFrom} грн/міс за касу і фіксує стару лише передплатою до ${COMPETITOR_FACTS.checkbox.lockBy} (максимум ${COMPETITOR_FACTS.checkbox.lockMaxMonths} місяців, не далі ${COMPETITOR_FACTS.checkbox.lockUntil}); джерело: ${COMPETITOR_FACTS.checkbox.source}, станом на ${COMPETITOR_FACTS.checkbox.checkedAt}.`,
    '',
    '## У планах (входить у тариф перших користувачів)',
    '',
    ...ROADMAP.map((item) => {
      const scope = item.vertical === 'pos' ? 'усі' : VERTICALS.find((v) => v.id === item.vertical)?.title ?? item.vertical;
      return `- ${item.title} (${scope}, готовність ${item.progress} %): ${item.body}`;
    }),
    '',
    '## Основні сторінки',
    '',
    line('/', 'Головна', 'одна каса для магазину, квітів, кафе і ресторану — і TikTok LIVE.'),
    line('/pos', 'POS каса', PRODUCT.pos.description),
    ...VERTICALS.map((v) => line(v.path, v.eyebrow, v.tagline)),
    line('/live', 'TikTok LIVE', PRODUCT.live.description),
    line('/yaku-kasu-obraty', 'Яку касу обрати для магазину одягу', 'чесне порівняння підходів до вибору POS-системи.'),
    line('/dovidka', 'Довідка', 'короткі відповіді про касу, ПРРО і TikTok LIVE.'),
    line('/about', 'Про сервіс', 'хто робить LiveShop, реквізити й умови.'),
    '',
    '## Довідка',
    '',
    ...articles.map((r) => line(r.path, r.head?.title ?? r.path, r.head?.description ?? '')),
    '',
  ].join('\n');
}
