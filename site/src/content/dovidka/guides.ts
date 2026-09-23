import { createElement } from 'react';
import guides from 'virtual:guides';
import type { Article } from './types';

// The text lives in TechDocs/guides/<slug>.md — edit it there, not here. This
// file adds only what Markdown does not carry: the SEO lead, the dates and the
// order. Bump `updatedAt` when a guide changes (it is the sitemap's lastmod).
const GUIDES: Array<{ slug: string; shortTitle: string; title: string; description: string; publishedAt: string; updatedAt: string }> = [
  {
    slug: 'vlasnyk-pochatok',
    shortTitle: 'Власник',
    title: 'Посібник власника: перший запуск каси за 10 кроків',
    description:
      'Від першого входу до першого чека: налаштування магазину, співробітники й PIN-коди, товари, склад, знижки, звіти, принтер чеків, ПРРО і вигляд меню. Однаково для магазину одягу, квіткового, кав\'ярні й ресторану.',
    publishedAt: '2026-09-24',
    updatedAt: '2026-09-24',
  },
  {
    slug: 'kasyr',
    shortTitle: 'Касир',
    title: 'Посібник касира: продаж за стійкою, оплата, повернення',
    description:
      'Усе, що потрібно людині за касою, на десять хвилин читання: вхід за PIN-кодом, пошук товару сканером, чек і знижки, оплата готівкою, карткою і QR, повернення, відкладений чек і робота без інтернету.',
    publishedAt: '2026-09-24',
    updatedAt: '2026-09-24',
  },
  {
    slug: 'restoran-ta-kafe',
    shortTitle: 'Ресторан і кав\'ярня',
    title: 'Посібник ресторану й кав\'ярні: меню, кухня, зал і рахунки',
    description:
      'Для власника — меню з розмірами й модифікаторами, техкарти й фудкост, кухня і бар, зали й столи, матриця меню. Для баристи й офіціанта — дошка кухні, стоп-лист, рахунок столу, передчек і розділення рахунку.',
    publishedAt: '2026-09-24',
    updatedAt: '2026-09-24',
  },
  {
    slug: 'kvitkovyi-magazyn',
    shortTitle: 'Квітковий магазин',
    title: 'Посібник квіткового магазину: стебла, букети, вітрина',
    description:
      'Для власника — стебла і букети в каталозі, плата за збирання, звіти. Для флориста — стіл флориста, бюджет клієнта, букет на вітрину з цінником і фото, рецепти і списання букета, що не продався.',
    publishedAt: '2026-09-24',
    updatedAt: '2026-09-24',
  },
];

export const GUIDE_ARTICLES: Article[] = GUIDES.map((g) => {
  const source = guides[g.slug];
  if (!source) throw new Error(`guides: TechDocs/guides/${g.slug}.md not found`);
  return {
    meta: {
      ...g,
      kind: 'guide',
      eyebrow: 'Посібник',
      ogImage: '/og/pos.png',
      readingMinutes: source.readingMinutes,
      faq: source.faq,
      headings: source.headings,
    },
    Body: () => createElement('div', { dangerouslySetInnerHTML: { __html: source.html } }),
  };
});
