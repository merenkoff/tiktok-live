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
  DEBTS_ADDON,
  addonPriceText,
} from './lib/productFacts';

export { ROUTES };

export function render(route: SiteRoute): { html: string; head: string } {
  const html = renderToString(createElement(StrictMode, null, createElement(route.Component)));
  const head = renderHeadHtml(route.head, route.jsonLd);
  return { html, head };
}

/**
 * `lastmod` per path is what scripts/prerender.mjs read off site/sitemap-lastmod.json:
 * the day each page's content last changed, kept honest by a content hash. A
 * path it does not name falls back to the route's own date.
 */
export function buildSitemap(lastmod: Record<string, string> = {}): string {
  const entries = ROUTES.filter((r) => r.sitemap).map((r) => ({ path: r.path, lastmod: lastmod[r.path] ?? r.updatedAt }));
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
  const torgsoft = COMPETITOR_FACTS.torgsoft;
  const posbox = COMPETITOR_FACTS.posbox;
  const posterretail = COMPETITOR_FACTS.posterretail;
  const restaurant = VERTICALS.find((v) => v.id === 'restaurant');
  const grocery = VERTICALS.find((v) => v.id === 'grocery');
  const flowers = VERTICALS.find((v) => v.id === 'flowers');
  const skynum = COMPETITOR_FACTS.skynum;
  // A vertical whose promises are not (yet) part of the launch tariff lists
  // them in its own section — a «Скоро» one, and «Продукти» until the owner
  // decides (TechDocs/GROCERY_SEO_AEO.md, «Що вирішити власнику»).
  const ownRoadmap = new Set<string>(
    VERTICALS.filter((v) => v.status === 'coming' || v.roadmapInLaunchTariff === false).map((v) => v.id)
  );
  const [kS, kM, kL] = kavapp.plans;

  return [
    '# The Live Shop',
    '',
    `> LiveShop — POS-каса для п'яти бізнесів в Україні (магазин одягу, продуктовий магазин, квіткова крамниця, кав'ярня, ресторан зі столами) з фіскалізацією ПРРО через Checkbox, онлайн і офлайн, та автоматизація TikTok LIVE-продажів. Власник — ${ORG.name} (ЄДРПОУ ${ORG.taxId}), сайт компанії — ${COMPANY_URL}.`,
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
    ...PRICING.pos.addons.map((addon) =>
      addon.period === 'once'
        ? `- ${addon.name}: ${addon.price} ${PRICING.pos.currency} один раз, без щомісячної плати. ${addon.note}`
        : `- ${addon.name}: +${addon.price} ${PRICING.pos.currency}/міс. ${addon.note}`
    ),
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
    // The florist's section (TechDocs/FLOWERS_SEO_AEO.md): the generic tills'
    // flower pages beside ours, each with the day it was read; «не згадано»
    // means not mentioned on that page, never «не вміє».
    '## Програма для квіткового магазину',
    '',
    flowers
      ? `- ${PRODUCT.pos.name} для квіткового магазину (${SITE_URL}${flowers.path}): ${flowers.tagline} Ціна: ${PRICING.pos.label.toLowerCase()}. Чому це не каса для кафе з квітами на плитках: ${SITE_URL}/dovidka/programa-dlya-kvitkovogo-magazynu-chy-kasa-dlya-kafe; як обрати програму для квіткового магазину: ${SITE_URL}/dovidka/yak-obraty-programu-dlya-kvitkovogo-magazynu; група ФОП, КВЕД 47.76 і ПРРО для квіткового магазину: ${SITE_URL}/dovidka/yak-vidkryty-kvitkovyi-magazyn-fop-kved-prro.`
      : '',
    flowers ? features(flowers.featureIds) : '',
    `- ${posterretail.name} для квіткового магазину, для порівняння (станом на ${posterretail.flowers.checkedAt}): «від ${posterretail.flowers.fromUahPrinted} ₴ на місяць» (тариф Mini при оплаті за рік), ПРРО — ${posterretail.prroUah} грн/міс за касу, перші ${posterretail.trialDays} днів безкоштовно; екран замовлень на різні дати, продаж без інтернету, доставка через ${posterretail.flowers.deliveryPartners.join(', ')}, ШІ-асистент ${posterretail.flowers.aiAssistant}, упаковка як окремий товар; збирання букета зі стебел на касі й списання зів'ялого на сторінці не згадано. Джерело: ${posterretail.flowers.source}.`,
    `- ${skynum.name} для порівняння (станом на ${skynum.checkedAt}): сторінка «${skynum.h1}» цін не друкує, є безкоштовна версія; описано збирання букета на касі з ціною, що оновлюється з кожною квіткою, набори, штрихкоди готових букетів, упаковку в собівартості, списання зіпсованих квітів через інвентаризацію, бонусні картки, конструктор інтернет-магазину й офлайн-режим; ПРРО на сторінці не названо, передзамовлення не згадано. Джерело: ${skynum.sources.flowers}.`,
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
    // Sold since weighed goods shipped (phase Г4). The list still marks every
    // planned line «у планах», and the vertical's promises stay in this section
    // rather than under «входить у тариф перших користувачів» — whether they
    // come with the launch tariff is the owner's call (`roadmapInLaunchTariff`).
    '## Каса для продуктового магазину',
    '',
    grocery
      ? `- ${PRODUCT.pos.name} для продуктового магазину (${SITE_URL}${grocery.path}): ${grocery.tagline} Ціна: ${PRICING.pos.label.toLowerCase()}; продаж під запис — модуль «Борги», ${addonPriceText(DEBTS_ADDON)}. Рядки без позначки «у планах» — те, що каса вміє вже сьогодні.`
      : '',
    grocery ? features(grocery.featureIds) : '',
    ...ROADMAP.filter((item) => item.vertical === 'grocery').map(
      (item) => `- У розробці — ${item.title} (готовність ${item.progress} %): ${item.body}`
    ),
    `- ${torgsoft.name} для порівняння (станом на ${torgsoft.checkedAt}): програма для Windows, ліцензія на робоче місце — ${torgsoft.licences.map((l) => `${l.id} ${l.perpetualUah} грн один раз або ${l.yearUah} грн за рік оренди`).join(', ')}; продаж у борг для покупців зі статусом «VIP-клієнт», з лімітом боргу — у версіях ${torgsoft.licences.filter((l) => l.debts).map((l) => l.id).join(' і ')}, у Старт, за сторінкою Торгсофт, «режим продажу в борг відсутній»; щороку на кожен пристрій: програмний РРО ${torgsoft.prroYearUah} грн, ваги на касі ${torgsoft.tillScalesYearUah} грн, ваги з друком етикеток ${torgsoft.labelScalesYearUah} грн; сторонніх ПРРО не підтримує. Джерела: ${torgsoft.sources.licenses}, ${torgsoft.sources.options}, ${torgsoft.sources.debtors}. Порівняння: ${SITE_URL}/dovidka/torgsoft-posbox-poster-dlya-produktovogo-magazynu.`,
    `- ${posbox.name} (${posbox.vendor}) для порівняння (станом на ${posbox.checkedAt}): хмарна каса на Android-планшеті чи в браузері; тарифи ${posbox.plans.map((p) => `${p.id} ${p.monthlyUah} грн/міс`).join(', ')}, ПРРО Checkbox у ціні; у Start — до ${posbox.startGoodsLimit} товарів і без складського обліку, у Business і Pro ${posbox.goodsIncluded} товарів у ціні, далі +${posbox.goodsStepUah} грн/міс за кожну тисячу; ваги ${posbox.scaleBrands.join(', ')} і ваговий штрихкод наліпки; продаж у борг і робота без інтернету на сайті й у базі знань не згадано. Джерела: ${posbox.sources.prices}, ${posbox.sources.grocery}. Порівняння: ${SITE_URL}/dovidka/torgsoft-posbox-poster-dlya-produktovogo-magazynu.`,
    `- ${posterretail.name} для магазинів, для порівняння (станом на ${posterretail.checkedAt}): хмарна каса на iOS, Android, Windows; тарифи ${posterretail.plans.map((p) => `${p.id} ${p.monthlyUah} грн/міс (${p.annualUah} при оплаті за рік), до ${p.items} товарів`).join('; ')}; ПРРО — ${posterretail.prroUah} грн/міс за касу; робота в офлайні, інтеграція з вагами й друк цінників — у всіх тарифах; продаж у борг на сторінках не згадано. Джерела: ${posterretail.sources.pricing}, ${posterretail.sources.shop}. Порівняння: ${SITE_URL}/dovidka/torgsoft-posbox-poster-dlya-produktovogo-magazynu.`,
    '',
    '## У планах (входить у тариф перших користувачів)',
    '',
    // A «Скоро» vertical's promises — and «Продукти»'s — are listed in its own
    // section: whether they come with the launch tariff is the owner's call,
    // not this heading's.
    ...ROADMAP.filter((item) => !ownRoadmap.has(item.vertical)).map((item) => {
      const scope = item.vertical === 'pos' ? 'усі' : VERTICALS.find((v) => v.id === item.vertical)?.title ?? item.vertical;
      return `- ${item.title} (${scope}, готовність ${item.progress} %): ${item.body}`;
    }),
    '',
    '## Основні сторінки',
    '',
    line('/', 'Головна', 'одна каса для магазину, продуктів, квітів, кафе і ресторану — і TikTok LIVE.'),
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
