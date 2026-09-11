import { ORG, SITE_URL } from '../productFacts';
import type { ArticleMeta } from '../../content/dovidka/types';

export function techArticleJsonLd(meta: ArticleMeta) {
  const url = `${SITE_URL}/dovidka/${meta.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline: meta.title,
    description: meta.description,
    url,
    mainEntityOfPage: url,
    inLanguage: 'uk',
    datePublished: meta.publishedAt,
    dateModified: meta.updatedAt,
    author: { '@type': 'Organization', '@id': `${ORG.url}/#organization`, name: ORG.name },
    publisher: { '@type': 'Organization', '@id': `${ORG.url}/#organization`, name: ORG.name },
    image: `${SITE_URL}${meta.ogImage}`,
  };
}
