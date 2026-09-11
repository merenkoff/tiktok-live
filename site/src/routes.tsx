// Server-side route registry for scripts/prerender.mjs. Never import this from
// a client entry — it pulls every page into one bundle.
import type { ComponentType } from 'react';
import { Home } from './pages/Home';
import { LivePage, FAQ_ITEMS as LIVE_FAQ } from './pages/LivePage';
import { PosPage, FAQ_ITEMS as POS_FAQ } from './pages/PosPage';
import { ComparePage, FAQ_ITEMS as COMPARE_FAQ } from './pages/ComparePage';
import { ArticlePage } from './pages/ArticlePage';
import { DovidkaIndexPage } from './pages/DovidkaIndexPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ARTICLES } from './content/dovidka';
import type { PageHead } from './lib/seo';
import { organizationJsonLd } from './lib/jsonLd/organization';
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

/** Pages that are not prerendered here but belong in sitemap.xml / llms.txt. */
export const STATIC_PAGES = [
  {
    path: '/about',
    title: 'Про сервіс — LiveShop',
    description: 'Юридична інформація про власника сервісу — ТОВ «Технології».',
    updatedAt: '2026-09-03',
  },
];

const org = organizationJsonLd();
const DOVIDKA_CRUMB = { name: 'Довідка', path: '/dovidka' };

export const ROUTES: SiteRoute[] = [
  {
    path: '/',
    template: 'index.html',
    out: 'index.html',
    Component: Home,
    jsonLd: [org],
    updatedAt: '2026-09-11',
    sitemap: true,
  },
  {
    path: '/live',
    template: 'live.html',
    out: 'live.html',
    Component: LivePage,
    jsonLd: [org, liveSoftwareJsonLd(), buildFaqJsonLd(LIVE_FAQ)],
    updatedAt: '2026-09-11',
    sitemap: true,
  },
  {
    path: '/pos',
    template: 'pos.html',
    out: 'pos.html',
    Component: PosPage,
    jsonLd: [org, posSoftwareJsonLd(), buildFaqJsonLd(POS_FAQ)],
    updatedAt: '2026-09-11',
    sitemap: true,
  },
  {
    path: '/yaku-kasu-obraty',
    template: 'compare.html',
    out: 'compare.html',
    Component: ComparePage,
    jsonLd: [
      org,
      buildFaqJsonLd(COMPARE_FAQ),
      breadcrumbJsonLd([{ name: 'POS каса', path: '/pos' }, { name: 'Яку касу обрати', path: '/yaku-kasu-obraty' }]),
    ],
    updatedAt: '2026-09-11',
    sitemap: true,
  },
  {
    path: '/dovidka',
    template: 'dovidka.html',
    out: 'dovidka/index.html',
    Component: DovidkaIndexPage,
    head: {
      title: 'Довідка — каса, ПРРО і TikTok LIVE для магазину одягу | The Live Shop',
      description:
        'Короткі відповіді для власників магазинів одягу: фіскалізація ПРРО, офлайн-режим каси, зміни і Z-звіт, продажі в TikTok LIVE.',
      path: '/dovidka',
      ogImage: '/og/pos.png',
    },
    jsonLd: [org, breadcrumbJsonLd([DOVIDKA_CRUMB])],
    updatedAt: ARTICLES[0]?.meta.updatedAt ?? '2026-09-11',
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
