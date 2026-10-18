// Built by `vite build --ssr` into dist-ssr/ and driven by scripts/prerender.mjs.
import { StrictMode, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ROUTES, type SiteRoute } from './routes';
import { renderHeadHtml } from './lib/seo';
import {
  SITE_URL,
  COMPANY_URL,
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
  const cafe = VERTICALS.find((v) => v.id === 'cafe');
  const kavapp = COMPETITOR_FACTS.kavapp;
  const expirenza = COMPETITOR_FACTS.expirenza;
  const choiceqr = COMPETITOR_FACTS.choiceqr;
  const restoapp = COMPETITOR_FACTS.restoapp;
  const posterqr = COMPETITOR_FACTS.posterqr;
  const restaurant = VERTICALS.find((v) => v.id === 'restaurant');
  const [kS, kM, kL] = kavapp.plans;

  return [
    '# The Live Shop',
    '',
    `> LiveShop — POS-каса для чотирьох бізнесів в Україні (магазин одягу, квіткова крамниця, кав'ярня, ресторан зі столами) з фіскалізацією ПРРО через Checkbox, онлайн і офлайн, та автоматизація TikTok LIVE-продажів. Власник — ${ORG.name} (ЄДРПОУ ${ORG.taxId}), сайт компанії — ${COMPANY_URL}.`,
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
    "## Програма для кав'ярні",
    '',
    cafe
      ? `- ${PRODUCT.pos.name} для кав'ярні (${SITE_URL}${cafe.path}): ${cafe.tagline} Ціна: ${PRICING.pos.label.toLowerCase()}.`
      : '',
    cafe ? features(cafe.featureIds) : '',
    `- Kavapp для порівняння (станом на ${kavapp.checkedAt}): $${kS.priceUsd.toFixed(2)} / $${kM.priceUsd.toFixed(2)} / $${kL.priceUsd.toFixed(2)} за торгову точку на місяць (тарифи S / M / L); ПРРО входить у всі тарифи; модифікатори напоїв і QR-меню — лише в тарифі L; розрахунок собівартості — з тарифу M. Джерело: ${kavapp.sources.tariffs}. Різниця з ${PRODUCT.pos.name}: ${SITE_URL}/dovidka/kavapp-chy-liveshop-dlya-kavyarni.`,
    '',
    '## Програма для ресторану',
    '',
    restaurant
      ? `- ${PRODUCT.pos.name} для ресторану (${SITE_URL}${restaurant.path}): ${restaurant.tagline} Ціна: ${PRICING.pos.label.toLowerCase()}.`
      : '',
    restaurant ? features(restaurant.featureIds) : '',
    `- ${expirenza.name} для порівняння (станом на ${expirenza.checkedAt}): сервіс для гостя за QR — цифрове меню, рахунок, оплата, чайові, відгуки, бронювання; рахунки бере з POS-системи закладу; ${expirenza.establishments}+ закладів у ${expirenza.cities} містах; комісія за оплату ${String(expirenza.commissionUaCardsPercent).replace('.', ',')} % за картками українських банків і ${expirenza.commissionForeignCardsPercent} % за закордонними, щомісячне обслуговування безкоштовне, у рядку «Чайові» — ${expirenza.tipsRowPercent} %; працює з касовими програмами ${expirenza.posIntegrations.join(', ')}; замовлення страв зі столу й виклик офіціанта на сторінці не згадано. Джерело: ${expirenza.sources.service}. Різниця з ${PRODUCT.pos.name}: ${SITE_URL}/dovidka/expirenza-chy-liveshop-dlya-restoranu.`,
    `- ${choiceqr.name} для порівняння (станом на ${choiceqr.checkedAt}): QR-меню, замовлення до столу, оплата по QR-коду, інтеграції з ${choiceqr.posIntegrations.join(', ')}; ${choiceqr.establishments}+ закладів у ${choiceqr.countries}+ країнах; тарифи для однієї локації: Basic безкоштовно (мінімум 100 замовлень/міс), ${choiceqr.plans.filter((p) => p.monthlyUah > 0).map((p) => `${p.id} ${p.monthlyUah} грн/міс (${p.annualUah} при оплаті за рік)`).join(', ')}; замовлення до столу — з ${choiceqr.plans.find((p) => p.tableOrders)?.id} або за ${choiceqr.tableOrdersAddonUah} грн/міс у Basic; виклик офіціанта на сторінках не згадано. Джерела: ${choiceqr.sources.ua}, ${choiceqr.sources.tariffs}. Різниця з ${PRODUCT.pos.name}: ${SITE_URL}/dovidka/choiceqr-chy-liveshop-dlya-restoranu.`,
    `- ${restoapp.name} (${restoapp.vendor}) для порівняння (станом на ${restoapp.checkedAt}): QR-меню в залі, меню на Google Maps і в соцмережах, оплата й чайові в телефоні, замовлення без офіціанта, виклик офіціанта, доставка, з собою, відгуки, аналітика замовлень; з касових програм названо ${restoapp.posIntegrations.join(', ')}; ${restoapp.priceUah} грн/міс за заклад, +${restoapp.giftMonths} місяці в подарунок при підключенні першого, −${restoapp.diiaDiscountPercent} % за промокодом Diia; фіскальний чек ПРРО, склад і техкарти на сторінках не згадано. Джерела: ${restoapp.sources.site}, ${restoapp.sources.diia}. Різниця з ${PRODUCT.pos.name}: ${SITE_URL}/dovidka/restoapp-chy-liveshop-dlya-restoranu.`,
    `- ${posterqr.name} (${posterqr.vendor}) для порівняння (станом на ${posterqr.checkedAt}): доповнення до каси Poster POS — QR-меню, оплата за столиком, чайові й відгуки; ${posterqr.priceUah} грн/міс, комісія ${String(posterqr.billCommissionPercent).replace('.', ',')} % з рахунку і ${String(posterqr.tipsCommissionPercent).replace('.', ',')} % з чайових; підключається з тарифу ${posterqr.posPlans.find((p) => p.qrAddon)?.id}; тарифи Poster для кафе й ресторанів: ${posterqr.posPlans.map((p) => `${p.id} ${p.monthlyUah} грн/міс (${p.annualUah} при оплаті за рік)`).join(', ')}; ПРРО — ${posterqr.prroUah} грн/міс за касу; замовлення страв зі столу на сторінці Poster QR не згадано, виклик офіціанта — теж. Джерела: ${posterqr.sources.page}, ${posterqr.sources.pricing}. Різниця з ${PRODUCT.pos.name}: ${SITE_URL}/dovidka/poster-qr-chy-liveshop-dlya-restoranu.`,
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
