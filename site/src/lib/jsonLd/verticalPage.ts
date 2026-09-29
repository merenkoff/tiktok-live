import { ORG, PRODUCT, SITE_URL, availableFeatureLabels, type VerticalFact } from '../productFacts';
import { POS_SOFTWARE_ID } from './softwareApplication';

/**
 * A vertical landing: a WebPage whose subject is the ONE POS product, described
 * for this business. The node carries the product's `@id`, so a crawler that
 * has seen /pos merges the two, and a page read on its own still says what the
 * product is and which of its features this business uses.
 */
export function verticalPageJsonLd(fact: VerticalFact, page: { title: string; description: string; updatedAt: string }) {
  const url = `${SITE_URL}${fact.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#page`,
    url,
    name: page.title,
    description: page.description,
    inLanguage: 'uk',
    dateModified: page.updatedAt,
    publisher: { '@id': `${ORG.url}/#organization` },
    about: {
      '@type': 'SoftwareApplication',
      '@id': POS_SOFTWARE_ID,
      name: PRODUCT.pos.name,
      url: PRODUCT.pos.url,
      applicationCategory: 'BusinessApplication',
      operatingSystem: PRODUCT.pos.operatingSystem,
      audience: { '@type': 'BusinessAudience', audienceType: fact.eyebrow },
      featureList: availableFeatureLabels(fact.featureIds),
    },
  };
}
