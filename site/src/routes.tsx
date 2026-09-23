// Server-side route registry for scripts/prerender.mjs. Never import this from
// a client entry — it pulls every page into one bundle.
import type { ComponentType } from 'react';
import { Home } from './pages/Home';
import { LivePage, FAQ_ITEMS as LIVE_FAQ } from './pages/LivePage';
import { PosPage, FAQ_ITEMS as POS_FAQ } from './pages/PosPage';
import { ComparePage, FAQ_ITEMS as COMPARE_FAQ } from './pages/ComparePage';
import { ArticlePage } from './pages/ArticlePage';
import { DovidkaIndexPage } from './pages/DovidkaIndexPage';
import { AboutPage } from './pages/AboutPage';
import { VerticalPage } from './pages/VerticalPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ARTICLES } from './content/dovidka';
import { VERTICAL_PAGES } from './content/verticals';
import type { PageHead } from './lib/seo';
import { organizationJsonLd, aboutPageJsonLd } from './lib/jsonLd/organization';
import { posSoftwareJsonLd, liveSoftwareJsonLd } from './lib/jsonLd/softwareApplication';
import { buildFaqJsonLd } from './lib/faqJsonLd';
import { breadcrumbJsonLd } from './lib/jsonLd/breadcrumb';
import { techArticleJsonLd } from './lib/jsonLd/article';

export interface SiteRoute {
  path: string;
  /** Built HTML template in dist/ to inject into. */
  template: string;
  /** Output path relative to dist/. */
  out: string;
  Component: ComponentType;
  /** Undefined for the four templates that carry their own title/meta. */
  head?: PageHead;
  jsonLd: object[];
  updatedAt: string;
  sitemap: boolean;
}

const org = organizationJsonLd();
const DOVIDKA_CRUMB = { name: 'Довідка', path: '/dovidka' };
const POS_CRUMB = { name: 'POS каса', path: '/pos' };

export const ROUTES: SiteRoute[] = [
  {
    path: '/',
    template: 'index.html',
    out: 'index.html',
    Component: Home,
    jsonLd: [org],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  {
    path: '/live',
    template: 'live.html',
    out: 'live.html',
    Component: LivePage,
    jsonLd: [org, liveSoftwareJsonLd(), buildFaqJsonLd(LIVE_FAQ)],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  {
    path: '/pos',
    template: 'pos.html',
    out: 'pos.html',
    Component: PosPage,
    jsonLd: [org, posSoftwareJsonLd(), buildFaqJsonLd(POS_FAQ)],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  // One landing per vertical, prerendered from the shared template the way
  // Довідка is. The SoftwareApplication schema stays on /pos — one product.
  ...VERTICAL_PAGES.map(({ fact, content }): SiteRoute => ({
    path: fact.path,
    template: 'vertical.html',
    out: `pos/${fact.slug}/index.html`,
    Component: () => <VerticalPage page={{ fact, content }} />,
    head: {
      title: content.head.title,
      description: content.head.description,
      path: fact.path,
      ogImage: '/og/pos.png',
    },
    jsonLd: [
      org,
      buildFaqJsonLd(content.faq),
      breadcrumbJsonLd([POS_CRUMB, { name: fact.eyebrow, path: fact.path }]),
    ],
    updatedAt: content.updatedAt,
    sitemap: true,
  })),
  {
    path: '/yaku-kasu-obraty',
    template: 'compare.html',
    out: 'compare.html',
    Component: ComparePage,
    jsonLd: [
      org,
      buildFaqJsonLd(COMPARE_FAQ),
      breadcrumbJsonLd([POS_CRUMB, { name: 'Яку касу обрати', path: '/yaku-kasu-obraty' }]),
    ],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  {
    path: '/dovidka',
    template: 'dovidka.html',
    out: 'dovidka/index.html',
    Component: DovidkaIndexPage,
    head: {
      title: 'Довідка — каса, ПРРО і TikTok LIVE | The Live Shop',
      description:
        'Короткі відповіді для власників магазинів, кав\'ярень і квіткових: фіскалізація ПРРО, офлайн-режим каси, зміни і Z-звіт, продажі в TikTok LIVE.',
      path: '/dovidka',
      ogImage: '/og/pos.png',
    },
    jsonLd: [org, breadcrumbJsonLd([DOVIDKA_CRUMB])],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  {
    path: '/about',
    template: 'dovidka.html',
    out: 'about/index.html',
    Component: AboutPage,
    head: {
      title: 'Про сервіс — LiveShop: каса для магазину, квітів, кафе і ресторану',
      description:
        'Хто робить LiveShop: ТОВ «Технології», код ЄДРПОУ 46288273. Каса з ПРРО для чотирьох бізнесів і бот для продажу в TikTok LIVE — реквізити, умови, зв\'язок.',
      path: '/about',
      ogImage: '/og/home.png',
    },
    jsonLd: [org, aboutPageJsonLd(), breadcrumbJsonLd([{ name: 'Про сервіс', path: '/about' }])],
    updatedAt: '2026-09-23',
    sitemap: true,
  },
  ...ARTICLES.map((article): SiteRoute => {
    const { meta } = article;
    const path = `/dovidka/${meta.slug}`;
    return {
      path,
      template: 'dovidka.html',
      out: `dovidka/${meta.slug}/index.html`,
      Component: () => <ArticlePage article={article} />,
      head: {
        title: `${meta.title} | The Live Shop`,
        description: meta.description,
        path,
        ogImage: meta.ogImage,
        ogType: 'article',
      },
      jsonLd: [
        org,
        techArticleJsonLd(meta),
        buildFaqJsonLd(meta.faq),
        breadcrumbJsonLd([DOVIDKA_CRUMB, { name: meta.title, path }]),
      ],
      updatedAt: meta.updatedAt,
      sitemap: true,
    };
  }),
  {
    path: '/404',
    template: 'dovidka.html',
    out: '404.html',
    Component: NotFoundPage,
    head: {
      title: 'Сторінку не знайдено | The Live Shop',
      description: 'Такої сторінки немає. Перейдіть на головну, до POS каси, TikTok LIVE або довідки.',
      path: '/404',
      ogImage: '/og/home.png',
      noindex: true,
    },
    jsonLd: [],
    updatedAt: '2026-09-11',
    sitemap: false,
  },
];
