import { ORG } from '../productFacts';

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${ORG.url}/#organization`,
    name: ORG.name,
    legalName: ORG.legalName,
    alternateName: [...ORG.alternateName],
    url: ORG.url,
    taxID: ORG.taxId,
    areaServed: 'UA',
    sameAs: [...ORG.sameAs],
  };
}

/** /about — the page whose subject is the organisation itself. */
export function aboutPageJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    '@id': `${ORG.url}/about#page`,
    url: `${ORG.url}/about`,
    name: 'Про сервіс — LiveShop',
    inLanguage: 'uk',
    about: { '@id': `${ORG.url}/#organization` },
    mainEntity: { '@id': `${ORG.url}/#organization` },
  };
}
