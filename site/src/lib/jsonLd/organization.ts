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
